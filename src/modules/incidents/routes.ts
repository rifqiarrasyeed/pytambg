import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { PERMISSIONS } from "../../types";
import { linkAttachments } from "../../services/attachment-link-service";
import { writeAudit } from "../../services/audit-service";
import { unprocessable } from "../../utils/api-error";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";

const wasteSchema = z.object({
  event_time: z.string().datetime(),
  item_id: z.string().uuid().optional(),
  batch_id: z.string().uuid().optional(),
  qty: z.number().positive(),
  reason_code: z.string().max(40),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  post_stock_move: z.boolean().default(true),
  attachments: z.array(z.object({ attachment_id: z.string().uuid() })).optional()
});

const incidentSchema = z.object({
  incident_time: z.string().datetime(),
  category: z.string().max(40),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  description: z.string().min(3),
  action_taken: z.string().optional(),
  due_at: z.string().datetime().optional(),
  attachments: z.array(z.object({ attachment_id: z.string().uuid() })).optional()
});

const recallSchema = z.object({
  lot_no: z.string().min(1)
});

export async function incidentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/waste-events",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.INVENTORY_WRITE);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          event_time: "event_time",
          status: "status",
          severity: "severity",
          qty: "qty",
          created_at: "created_at"
        },
        fallback: "event_time DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk waste-events");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM waste_events
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR event_time::date >= $3::date)
            AND ($4::date IS NULL OR event_time::date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const result = await query(
        `
          SELECT id, event_time, item_id, batch_id, qty, reason_code, severity, status, created_at
          FROM waste_events
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR event_time::date >= $3::date)
            AND ($4::date IS NULL OR event_time::date <= $4::date)
          ORDER BY ${order.sql}
          LIMIT $5 OFFSET $6
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null, list.page_size, list.offset]
      );

      return reply.send({
        data: result.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.get(
    "/incident-logs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.DELIVERY_MANAGE);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          incident_time: "incident_time",
          status: "status",
          severity: "severity",
          category: "category",
          created_at: "created_at"
        },
        fallback: "incident_time DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk incident-logs");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM incident_logs
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR incident_time::date >= $3::date)
            AND ($4::date IS NULL OR incident_time::date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const result = await query(
        `
          SELECT id, incident_time, category, severity, description, action_taken, status, due_at, created_at
          FROM incident_logs
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR incident_time::date >= $3::date)
            AND ($4::date IS NULL OR incident_time::date <= $4::date)
          ORDER BY ${order.sql}
          LIMIT $5 OFFSET $6
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null, list.page_size, list.offset]
      );

      return reply.send({
        data: result.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.post(
    "/waste-events",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.INVENTORY_WRITE);
      const sppgId = requireActiveSppg(request);
      const body = wasteSchema.parse(request.body);

      const wasteId = randomUUID();
      await withTransaction(async (client) => {
        await client.query(
          `
            INSERT INTO waste_events (
              id, sppg_id, event_time, item_id, batch_id, qty, reason_code, severity, status,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              $1, $2, $3::timestamptz, $4, $5, $6, $7, $8, 'OPEN',
              now(), $9, now(), $9
            )
          `,
          [
            wasteId,
            sppgId,
            body.event_time,
            body.item_id ?? null,
            body.batch_id ?? null,
            body.qty,
            body.reason_code,
            body.severity,
            request.auth!.user_id
          ]
        );

        if (body.post_stock_move) {
          if (!body.item_id) {
            throw unprocessable("item_id wajib jika post_stock_move=true");
          }
          const moveNoResult = await client.query<{ next_move: string }>(
            "SELECT COALESCE(MAX(move_no), 0) + 1 AS next_move FROM stock_moves WHERE sppg_id = $1",
            [sppgId]
          );
          const moveNo = Number(moveNoResult.rows[0]?.next_move ?? 1);
          await client.query(
            `
              INSERT INTO stock_moves (
                id, sppg_id, move_no, move_type,
                item_id, batch_id, qty, uom_id,
                ref_table, ref_id, reason_code,
                is_void, void_of_move_id,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                gen_random_uuid(), $1, $2, 'WASTE',
                $3, $4, $5, (SELECT unit_id FROM inventory_items WHERE id = $3 AND sppg_id = $1),
                'waste_events', $6, $7,
                false, NULL,
                now(), $8, now(), $8
              )
            `,
            [sppgId, moveNo, body.item_id, body.batch_id ?? null, -Math.abs(body.qty), wasteId, body.reason_code, request.auth!.user_id]
          );

          await client.query(
            "UPDATE waste_events SET status = 'POSTED', updated_at = now(), updated_by = $3 WHERE id = $1 AND sppg_id = $2",
            [wasteId, sppgId, request.auth!.user_id]
          );
        }

        await linkAttachments(client, {
          sppgId,
          entityTable: "waste_events",
          entityId: wasteId,
          attachmentIds: body.attachments?.map((attachment) => attachment.attachment_id) ?? [],
          actorUserId: request.auth!.user_id,
          attachmentRole: "WASTE_EVIDENCE"
        });

        await writeAudit({
          sppgId,
          entityTable: "waste_events",
          entityId: wasteId,
          action: "CREATE",
          newValue: body,
          actorUserId: request.auth!.user_id,
          actorRole: request.auth!.roles.join(","),
          requestId: request.id,
          deviceId: request.deviceId,
          ip: request.ip,
          userAgent: request.headers["user-agent"]?.toString()
        }, client);
      });

      return reply.status(201).send({ id: wasteId, status: body.post_stock_move ? "POSTED" : "OPEN" });
    }
  );

  app.post(
    "/incident-logs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.DELIVERY_MANAGE);
      const sppgId = requireActiveSppg(request);
      const body = incidentSchema.parse(request.body);

      if (["HIGH", "CRITICAL"].includes(body.severity) && !body.action_taken) {
        throw unprocessable("action_taken wajib untuk severity HIGH/CRITICAL");
      }

      const incidentId = randomUUID();
      await withTransaction(async (client) => {
        await client.query(
          `
            INSERT INTO incident_logs (
              id, sppg_id, incident_time, category, severity, description, action_taken, status, due_at,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              $1, $2, $3::timestamptz, $4, $5, $6, $7, 'OPEN', $8::timestamptz,
              now(), $9, now(), $9
            )
          `,
          [
            incidentId,
            sppgId,
            body.incident_time,
            body.category,
            body.severity,
            body.description,
            body.action_taken ?? null,
            body.due_at ?? null,
            request.auth!.user_id
          ]
        );

        await linkAttachments(client, {
          sppgId,
          entityTable: "incident_logs",
          entityId: incidentId,
          attachmentIds: body.attachments?.map((attachment) => attachment.attachment_id) ?? [],
          actorUserId: request.auth!.user_id,
          attachmentRole: "INCIDENT_EVIDENCE"
        });

        await writeAudit({
          sppgId,
          entityTable: "incident_logs",
          entityId: incidentId,
          action: "CREATE",
          newValue: body,
          actorUserId: request.auth!.user_id,
          actorRole: request.auth!.roles.join(","),
          requestId: request.id,
          deviceId: request.deviceId,
          ip: request.ip,
          userAgent: request.headers["user-agent"]?.toString()
        }, client);
      });

      return reply.status(201).send({ id: incidentId, status: "OPEN" });
    }
  );

  app.get(
    "/recall/trace",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.AUDIT_VIEW);
      const sppgId = requireActiveSppg(request);
      const params = recallSchema.parse(request.query);

      const result = await query(
        `
          SELECT
            ib.lot_no,
            ib.expiry_date,
            pr.id AS production_run_id,
            pr.run_date,
            ds.school_id
          FROM inventory_batches ib
          JOIN stock_moves sm ON sm.batch_id = ib.id AND sm.sppg_id = ib.sppg_id
          JOIN production_inputs pi ON pi.stock_move_id = sm.id AND pi.sppg_id = ib.sppg_id
          JOIN production_runs pr ON pr.id = pi.production_run_id AND pr.sppg_id = ib.sppg_id
          LEFT JOIN packing_lines pl ON pl.production_run_id = pr.id AND pl.sppg_id = pr.sppg_id
          LEFT JOIN delivery_items di ON di.packing_line_id = pl.id AND di.sppg_id = pr.sppg_id
          LEFT JOIN delivery_stops ds ON ds.id = di.delivery_stop_id AND ds.sppg_id = pr.sppg_id
          WHERE ib.sppg_id = $1 AND ib.lot_no = $2
          ORDER BY pr.run_date DESC
        `,
        [sppgId, params.lot_no]
      );

      return reply.send({ lot_no: params.lot_no, impacts: result.rows });
    }
  );
}

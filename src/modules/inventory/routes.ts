import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { OPNAME_TRANSITIONS, assertTransition } from "../../policies/state-machines";
import { PERMISSIONS } from "../../types";
import { writeAudit } from "../../services/audit-service";
import { assertPeriodUnlocked } from "../../services/period-lock-service";
import { conflict, notFound, unprocessable } from "../../utils/api-error";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";

const stockMoveSchema = z.object({
  move_type: z.enum(["RECEIVE", "ISSUE_TO_PRODUCTION", "TRANSFER", "ADJUSTMENT", "WASTE", "RETURN_VENDOR", "RETURN"]),
  item_id: z.string().uuid(),
  batch_id: z.string().uuid().optional(),
  qty: z.number().refine((qty) => qty !== 0, "qty tidak boleh 0"),
  ref_table: z.string().max(40).optional(),
  ref_id: z.string().uuid().optional(),
  reason_code: z.string().max(40).optional(),
  move_date: z.string().date()
});

const createOpnameSchema = z.object({
  opname_date: z.string().date(),
  lines: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        batch_id: z.string().uuid().optional(),
        physical_qty: z.number()
      })
    )
    .min(1)
});

const submitOpnameSchema = z.object({ note: z.string().max(500).optional() });
const approveOpnameSchema = z.object({ note: z.string().max(500).optional() });

async function nextMoveNo(sppgId: string): Promise<number> {
  const result = await query<{ next_move: string }>(
    "SELECT COALESCE(MAX(move_no), 0) + 1 AS next_move FROM stock_moves WHERE sppg_id = $1",
    [sppgId]
  );
  return Number(result.rows[0]?.next_move ?? 1);
}

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/stock",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.INVENTORY_WRITE);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          item_name: "ii.name",
          sku: "ii.sku",
          expiry_date: "ib.expiry_date",
          on_hand_qty: "sb.on_hand_qty"
        },
        fallback: "ii.name ASC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk stock");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM stock_balances_mv sb
          JOIN inventory_items ii ON ii.id = sb.item_id AND ii.sppg_id = sb.sppg_id
          LEFT JOIN inventory_batches ib ON ib.id = sb.batch_id AND ib.sppg_id = sb.sppg_id
          WHERE sb.sppg_id = $1
            AND ($2::text IS NULL OR ii.name ILIKE '%' || $2 || '%' OR ii.sku ILIKE '%' || $2 || '%' OR COALESCE(ib.lot_no, '') ILIKE '%' || $2 || '%')
        `,
        [sppgId, list.search ?? null]
      );

      const result = await query<{ id: string; move_no: number }>(
        `
          SELECT
            sb.item_id,
            ii.name AS item_name,
            ii.sku,
            sb.batch_id,
            ib.lot_no,
            ib.expiry_date,
            sb.on_hand_qty
          FROM stock_balances_mv sb
          JOIN inventory_items ii ON ii.id = sb.item_id AND ii.sppg_id = sb.sppg_id
          LEFT JOIN inventory_batches ib ON ib.id = sb.batch_id AND ib.sppg_id = sb.sppg_id
          WHERE sb.sppg_id = $1
            AND ($2::text IS NULL OR ii.name ILIKE '%' || $2 || '%' OR ii.sku ILIKE '%' || $2 || '%' OR COALESCE(ib.lot_no, '') ILIKE '%' || $2 || '%')
          ORDER BY ${order.sql} NULLS LAST
          LIMIT $3 OFFSET $4
        `,
        [sppgId, list.search ?? null, list.page_size, list.offset]
      );
      return reply.send({
        data: result.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.get(
    "/stock-moves",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.INVENTORY_WRITE);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          move_no: "move_no",
          move_type: "move_type",
          created_at: "created_at",
          qty: "qty"
        },
        fallback: "move_no DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk stock-moves");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM stock_moves
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR move_type::text = UPPER($2))
            AND ($3::date IS NULL OR created_at::date >= $3::date)
            AND ($4::date IS NULL OR created_at::date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const result = await query(
        `
          SELECT id, move_no, move_type, item_id, batch_id, qty, ref_table, ref_id, reason_code, is_void, void_of_move_id, created_at
          FROM stock_moves
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR move_type::text = UPPER($2))
            AND ($3::date IS NULL OR created_at::date >= $3::date)
            AND ($4::date IS NULL OR created_at::date <= $4::date)
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
    "/stock-moves",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.INVENTORY_WRITE);
      const sppgId = requireActiveSppg(request);
      const body = stockMoveSchema.parse(request.body);

      await assertPeriodUnlocked(sppgId, body.move_date);
      if (["ADJUSTMENT", "WASTE", "RETURN_VENDOR", "VOID"].includes(body.move_type) && !body.reason_code) {
        throw unprocessable("reason_code wajib untuk move type ini");
      }

      const moveNo = await nextMoveNo(sppgId);
      const result = await query(
        `
          INSERT INTO stock_moves (
            id, sppg_id, move_no, move_type,
            item_id, batch_id, qty, uom_id,
            ref_table, ref_id, reason_code,
            is_void, void_of_move_id,
            created_at, created_by, updated_at, updated_by
          ) VALUES (
            gen_random_uuid(), $1, $2, $3,
            $4, $5, $6, (SELECT unit_id FROM inventory_items WHERE id = $4 AND sppg_id = $1),
            $7, $8, $9,
            false, NULL,
            now(), $10, now(), $10
          )
          RETURNING id, move_no
        `,
        [
          sppgId,
          moveNo,
          body.move_type,
          body.item_id,
          body.batch_id ?? null,
          body.qty,
          body.ref_table ?? null,
          body.ref_id ?? null,
          body.reason_code ?? null,
          request.auth!.user_id
        ]
      );

      const inserted = result.rows[0];
      await writeAudit({
        sppgId,
        entityTable: "stock_moves",
        entityId: inserted.id,
        action: "CREATE",
        newValue: body,
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.status(201).send({ id: inserted.id, move_no: inserted.move_no });
    }
  );

  app.get(
    "/opnames",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.INVENTORY_WRITE);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: { opname_date: "opname_date", status: "status", created_at: "created_at" },
        fallback: "opname_date DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk opnames");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM stock_opnames
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR opname_date >= $3::date)
            AND ($4::date IS NULL OR opname_date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const result = await query(
        `
          SELECT id, opname_date, status, submitted_by, approved_by, created_at
          FROM stock_opnames
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR opname_date >= $3::date)
            AND ($4::date IS NULL OR opname_date <= $4::date)
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
    "/opnames",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.INVENTORY_WRITE);
      const sppgId = requireActiveSppg(request);
      const body = createOpnameSchema.parse(request.body);

      await assertPeriodUnlocked(sppgId, body.opname_date);
      const opnameId = randomUUID();

      await withTransaction(async (client) => {
        await client.query(
          `
            INSERT INTO stock_opnames (
              id, sppg_id, opname_date, status, submitted_by, approved_by,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              $1, $2, $3::date, 'COUNTED', NULL, NULL,
              now(), $4, now(), $4
            )
          `,
          [opnameId, sppgId, body.opname_date, request.auth!.user_id]
        );

        for (const line of body.lines) {
          const bookResult = await client.query<{ on_hand_qty: string }>(
            `
              SELECT COALESCE(SUM(on_hand_qty), 0)::text AS on_hand_qty
              FROM stock_balances_mv
              WHERE sppg_id = $1
                AND item_id = $2
                AND ($3::uuid IS NULL OR batch_id = $3)
            `,
            [sppgId, line.item_id, line.batch_id ?? null]
          );
          const bookQty = Number(bookResult.rows[0]?.on_hand_qty ?? 0);
          const variance = line.physical_qty - bookQty;

          await client.query(
            `
              INSERT INTO stock_opname_lines (
                id, sppg_id, opname_id, item_id, batch_id,
                book_qty, physical_qty, variance_qty, reason,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4,
                $5, $6, $7, NULL,
                now(), $8, now(), $8
              )
            `,
            [sppgId, opnameId, line.item_id, line.batch_id ?? null, bookQty, line.physical_qty, variance, request.auth!.user_id]
          );
        }

        await writeAudit(
          {
            sppgId,
            entityTable: "stock_opnames",
            entityId: opnameId,
            action: "CREATE",
            newValue: body,
            actorUserId: request.auth!.user_id,
            actorRole: request.auth!.roles.join(","),
            requestId: request.id,
            deviceId: request.deviceId,
            ip: request.ip,
            userAgent: request.headers["user-agent"]?.toString()
          },
          client
        );
      });

      return reply.status(201).send({ id: opnameId, status: "COUNTED" });
    }
  );

  app.post(
    "/opnames/:id/submit",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.INVENTORY_WRITE);
      const sppgId = requireActiveSppg(request);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      submitOpnameSchema.parse(request.body);

      const current = await query<{ status: string }>(
        "SELECT status FROM stock_opnames WHERE id = $1 AND sppg_id = $2 LIMIT 1",
        [params.id, sppgId]
      );
      const row = current.rows[0];
      if (!row) {
        throw notFound("Opname tidak ditemukan");
      }

      assertTransition(row.status as keyof typeof OPNAME_TRANSITIONS, "SUBMITTED", OPNAME_TRANSITIONS, "opname");

      await query(
        "UPDATE stock_opnames SET status = 'SUBMITTED', submitted_by = $3, updated_at = now(), updated_by = $3 WHERE id = $1 AND sppg_id = $2",
        [params.id, sppgId, request.auth!.user_id]
      );

      await writeAudit({
        sppgId,
        entityTable: "stock_opnames",
        entityId: params.id,
        action: "SUBMIT",
        oldValue: { status: row.status },
        newValue: { status: "SUBMITTED" },
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.send({ id: params.id, status: "SUBMITTED" });
    }
  );

  app.post(
    "/opnames/:id/approve",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.INVENTORY_APPROVE);
      const sppgId = requireActiveSppg(request);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      approveOpnameSchema.parse(request.body);

      const opname = await query<{ status: string; opname_date: string; submitted_by: string }>(
        "SELECT status, opname_date::text, submitted_by FROM stock_opnames WHERE id = $1 AND sppg_id = $2 LIMIT 1",
        [params.id, sppgId]
      );
      const row = opname.rows[0];
      if (!row) {
        throw notFound("Opname tidak ditemukan");
      }
      if (row.submitted_by === request.auth!.user_id) {
        throw conflict("SELF_APPROVAL_FORBIDDEN", "Submitter tidak boleh approve sendiri");
      }

      assertTransition(row.status as keyof typeof OPNAME_TRANSITIONS, "APPROVED", OPNAME_TRANSITIONS, "opname");
      await assertPeriodUnlocked(sppgId, row.opname_date);

      const summary = await query<{
        total_value: string;
        max_percent_delta: string;
      }>(
        `
          SELECT
            COALESCE(SUM(ABS(sol.variance_qty) * COALESCE(ii.standard_cost, 0)), 0)::text AS total_value,
            COALESCE(MAX(CASE WHEN sol.book_qty = 0 THEN 0 ELSE ABS(sol.variance_qty) / ABS(sol.book_qty) END), 0)::text AS max_percent_delta
          FROM stock_opname_lines sol
          JOIN inventory_items ii ON ii.id = sol.item_id AND ii.sppg_id = sol.sppg_id
          WHERE sol.opname_id = $1 AND sol.sppg_id = $2
        `,
        [params.id, sppgId]
      );
      const totalValue = Number(summary.rows[0]?.total_value ?? 0);
      const maxPercentDelta = Number(summary.rows[0]?.max_percent_delta ?? 0);
      const needsCentral = totalValue > 1_000_000 || maxPercentDelta > 0.05;

      if (needsCentral && !request.auth!.is_super_admin) {
        await query(
          `
            INSERT INTO change_requests (
              id, sppg_id, entity_table, entity_id, request_type, reason, status,
              requested_by, approved_by,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              gen_random_uuid(), $1, 'stock_opnames', $2, 'ADJUSTMENT_APPROVAL', 'Threshold exceeded', 'PENDING_CENTRAL_APPROVAL',
              $3, NULL,
              now(), $3, now(), $3
            )
          `,
          [sppgId, params.id, request.auth!.user_id]
        );

        return reply.status(202).send({
          id: params.id,
          status: "PENDING_CENTRAL_APPROVAL",
          total_value: totalValue,
          max_percent_delta: maxPercentDelta
        });
      }

      await withTransaction(async (client) => {
        await client.query(
          "UPDATE stock_opnames SET status = 'APPROVED', approved_by = $3, updated_at = now(), updated_by = $3 WHERE id = $1 AND sppg_id = $2",
          [params.id, sppgId, request.auth!.user_id]
        );

        const lines = await client.query<{
          item_id: string;
          batch_id: string | null;
          variance_qty: string;
        }>(
          "SELECT item_id, batch_id, variance_qty::text FROM stock_opname_lines WHERE opname_id = $1 AND sppg_id = $2",
          [params.id, sppgId]
        );

        let moveNo = await nextMoveNo(sppgId);
        for (const line of lines.rows) {
          const variance = Number(line.variance_qty);
          if (variance === 0) {
            continue;
          }
          await client.query(
            `
              INSERT INTO stock_moves (
                id, sppg_id, move_no, move_type,
                item_id, batch_id, qty, uom_id,
                ref_table, ref_id, reason_code,
                is_void, void_of_move_id,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                gen_random_uuid(), $1, $2, 'ADJUSTMENT',
                $3, $4, $5, (SELECT unit_id FROM inventory_items WHERE id = $3 AND sppg_id = $1),
                'stock_opnames', $6, 'OPNAME_ADJUSTMENT',
                false, NULL,
                now(), $7, now(), $7
              )
            `,
            [sppgId, moveNo, line.item_id, line.batch_id, variance, params.id, request.auth!.user_id]
          );
          moveNo += 1;
        }

        await client.query(
          "UPDATE stock_opnames SET status = 'POSTED', updated_at = now(), updated_by = $3 WHERE id = $1 AND sppg_id = $2",
          [params.id, sppgId, request.auth!.user_id]
        );

        await writeAudit(
          {
            sppgId,
            entityTable: "stock_opnames",
            entityId: params.id,
            action: "APPROVE_POST",
            oldValue: { status: row.status },
            newValue: { status: "POSTED" },
            actorUserId: request.auth!.user_id,
            actorRole: request.auth!.roles.join(","),
            requestId: request.id,
            deviceId: request.deviceId,
            ip: request.ip,
            userAgent: request.headers["user-agent"]?.toString()
          },
          client
        );
      });

      return reply.send({ id: params.id, status: "POSTED", total_value: totalValue, max_percent_delta: maxPercentDelta });
    }
  );
}

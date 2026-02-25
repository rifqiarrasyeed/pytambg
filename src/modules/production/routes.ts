import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { PRODUCTION_TRANSITIONS, assertTransition } from "../../policies/state-machines";
import { PERMISSIONS } from "../../types";
import { assertAttachmentsOwned, linkAttachments } from "../../services/attachment-link-service";
import { writeAudit } from "../../services/audit-service";
import { assertPeriodUnlocked } from "../../services/period-lock-service";
import { conflict, notFound, unprocessable } from "../../utils/api-error";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";

const createRunSchema = z.object({
  menu_plan_id: z.string().uuid(),
  run_date: z.string().date()
});

const startSchema = z.object({
  note: z.string().max(500).optional()
});

const finalizeSchema = z.object({
  outputs: z
    .array(
      z.object({
        school_id: z.string().uuid(),
        recipe_id: z.string().uuid(),
        output_portions: z.number().int().nonnegative(),
        deviation_reason: z.string().max(500).optional()
      })
    )
    .min(1),
  qc_checks: z
    .array(
      z.object({
        check_type: z.enum(["TEMPERATURE", "PHOTO", "NOTE"]),
        value_text: z.string().max(100).optional(),
        temperature_c: z.number().optional(),
        attachment_id: z.string().uuid().optional(),
        checked_at: z.string().datetime().optional()
      })
    )
    .min(1)
});

async function ensureMenuPlanApproved(sppgId: string, menuPlanId: string): Promise<{ plan_date: string }> {
  const result = await query<{ status: string; plan_date: string }>(
    `SELECT status, plan_date::text FROM menu_plans WHERE id = $1 AND sppg_id = $2 LIMIT 1`,
    [menuPlanId, sppgId]
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound("Menu plan tidak ditemukan");
  }
  if (row.status !== "APPROVED" && row.status !== "PUBLISHED") {
    throw conflict("PRECONDITION_FAILED", "Menu plan harus approved sebelum produksi");
  }
  return { plan_date: row.plan_date };
}

export async function productionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/production-runs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PRODUCTION_WRITE);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          run_date: "run_date",
          status: "status",
          started_at: "started_at",
          finalized_at: "finalized_at",
          created_at: "created_at"
        },
        fallback: "run_date DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk production-runs");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM production_runs
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR run_date >= $3::date)
            AND ($4::date IS NULL OR run_date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const result = await query(
        `
          SELECT id, run_date, menu_plan_id, status, started_at, finalized_at
          FROM production_runs
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR run_date >= $3::date)
            AND ($4::date IS NULL OR run_date <= $4::date)
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
    "/production-runs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PRODUCTION_WRITE);
      const sppgId = requireActiveSppg(request);
      const body = createRunSchema.parse(request.body);

      const plan = await ensureMenuPlanApproved(sppgId, body.menu_plan_id);
      await assertPeriodUnlocked(sppgId, plan.plan_date);

      const runId = randomUUID();
      await query(
        `
          INSERT INTO production_runs (
            id, sppg_id, run_date, menu_plan_id, status, started_at, finalized_at,
            created_at, created_by, updated_at, updated_by
          ) VALUES (
            $1, $2, $3::date, $4, 'PLANNED', NULL, NULL,
            now(), $5, now(), $5
          )
        `,
        [runId, sppgId, body.run_date, body.menu_plan_id, request.auth!.user_id]
      );

      await writeAudit({
        sppgId,
        entityTable: "production_runs",
        entityId: runId,
        action: "CREATE",
        newValue: body,
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.status(201).send({ id: runId, status: "PLANNED" });
    }
  );

  app.post(
    "/production-runs/:id/start",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PRODUCTION_WRITE);
      const sppgId = requireActiveSppg(request);
      startSchema.parse(request.body);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);

      const runResult = await query<{ status: string; menu_plan_id: string; run_date: string }>(
        "SELECT status, menu_plan_id, run_date::text FROM production_runs WHERE id = $1 AND sppg_id = $2 LIMIT 1",
        [params.id, sppgId]
      );
      const run = runResult.rows[0];
      if (!run) {
        throw notFound("Production run tidak ditemukan");
      }

      assertTransition(run.status as keyof typeof PRODUCTION_TRANSITIONS, "IN_PROGRESS", PRODUCTION_TRANSITIONS, "production run");
      await assertPeriodUnlocked(sppgId, run.run_date);

      const stockCheck = await query<{ item_id: string; required_qty: string; on_hand_qty: string }>(
        `
          WITH required AS (
            SELECT ri.item_id, SUM(ri.qty_per_portion * pi.target_portions) AS required_qty
            FROM menu_plans mp
            JOIN plan_items pi ON pi.menu_plan_id = mp.id AND pi.sppg_id = mp.sppg_id
            JOIN recipe_items ri ON ri.recipe_id = pi.recipe_id AND ri.sppg_id = pi.sppg_id
            WHERE mp.id = $1 AND mp.sppg_id = $2
            GROUP BY ri.item_id
          ),
          available AS (
            SELECT item_id, SUM(on_hand_qty) AS on_hand_qty
            FROM stock_balances_mv
            WHERE sppg_id = $2
            GROUP BY item_id
          )
          SELECT r.item_id, r.required_qty::text, COALESCE(a.on_hand_qty, 0)::text AS on_hand_qty
          FROM required r
          LEFT JOIN available a ON a.item_id = r.item_id
          WHERE COALESCE(a.on_hand_qty, 0) < r.required_qty
        `,
        [run.menu_plan_id, sppgId]
      );

      if (stockCheck.rowCount && stockCheck.rowCount > 0) {
        throw conflict("INSUFFICIENT_STOCK", "Stok tidak cukup untuk mulai produksi", {
          shortages: stockCheck.rows
        });
      }

      await query(
        `
          UPDATE production_runs
          SET status = 'IN_PROGRESS', started_at = now(), updated_at = now(), updated_by = $3
          WHERE id = $1 AND sppg_id = $2
        `,
        [params.id, sppgId, request.auth!.user_id]
      );

      await writeAudit({
        sppgId,
        entityTable: "production_runs",
        entityId: params.id,
        action: "START",
        oldValue: { status: run.status },
        newValue: { status: "IN_PROGRESS" },
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.send({ id: params.id, status: "IN_PROGRESS", started_at: new Date().toISOString() });
    }
  );

  app.post(
    "/production-runs/:id/finalize",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PRODUCTION_FINALIZE);
      const sppgId = requireActiveSppg(request);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = finalizeSchema.parse(request.body);
      const qcAttachmentIds = body.qc_checks
        .map((qc) => qc.attachment_id)
        .filter((attachmentId): attachmentId is string => Boolean(attachmentId));

      if (body.outputs.some((output) => output.output_portions < 0)) {
        throw unprocessable("Output porsi tidak boleh negatif");
      }

      const hasMinimumQc = body.qc_checks.some(
        (qc) => qc.check_type === "TEMPERATURE" || (qc.check_type === "PHOTO" && qc.attachment_id)
      );
      if (!hasMinimumQc) {
        throw unprocessable("QC minimum tidak terpenuhi (wajib temperatur atau foto)");
      }

      await withTransaction(async (client) => {
        const runResult = await client.query<{ status: string; run_date: string }>(
          "SELECT status, run_date::text FROM production_runs WHERE id = $1 AND sppg_id = $2 LIMIT 1 FOR UPDATE",
          [params.id, sppgId]
        );
        const run = runResult.rows[0];
        if (!run) {
          throw notFound("Production run tidak ditemukan");
        }

        if (run.status !== "IN_PROGRESS" && run.status !== "QC_PENDING") {
          throw conflict("STATE_TRANSITION_INVALID", "Run tidak bisa difinalisasi dari status saat ini");
        }

        await assertPeriodUnlocked(sppgId, run.run_date);
        await assertAttachmentsOwned(client, {
          sppgId,
          attachmentIds: qcAttachmentIds
        });

        await client.query("DELETE FROM production_outputs WHERE production_run_id = $1 AND sppg_id = $2", [params.id, sppgId]);
        await client.query("DELETE FROM qc_checks WHERE production_run_id = $1 AND sppg_id = $2", [params.id, sppgId]);
        await client.query("DELETE FROM packing_lines WHERE production_run_id = $1 AND sppg_id = $2", [params.id, sppgId]);

        for (const output of body.outputs) {
          await client.query(
            `
              INSERT INTO production_outputs (
                id, sppg_id, production_run_id, school_id, recipe_id, output_portions, deviation_reason,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6,
                now(), $7, now(), $7
              )
            `,
            [
              sppgId,
              params.id,
              output.school_id,
              output.recipe_id,
              output.output_portions,
              output.deviation_reason ?? null,
              request.auth!.user_id
            ]
          );
        }

        for (const qc of body.qc_checks) {
          await client.query(
            `
              INSERT INTO qc_checks (
                id, sppg_id, production_run_id, check_type, value_text, temperature_c, attachment_id, checked_at,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()),
                now(), $8, now(), $8
              )
            `,
            [
              sppgId,
              params.id,
              qc.check_type,
              qc.value_text ?? null,
              qc.temperature_c ?? null,
              qc.attachment_id ?? null,
              qc.checked_at ?? null,
              request.auth!.user_id
            ]
          );
        }

        await linkAttachments(client, {
          sppgId,
          entityTable: "production_runs",
          entityId: params.id,
          attachmentIds: qcAttachmentIds,
          actorUserId: request.auth!.user_id,
          attachmentRole: "QC_EVIDENCE"
        });

        const packing = new Map<string, { school_id: string; portion_count: number; package_count: number }>();
        for (const output of body.outputs) {
          const existing = packing.get(output.school_id);
          if (existing) {
            existing.portion_count += output.output_portions;
            existing.package_count = Math.ceil(existing.portion_count / 10);
          } else {
            packing.set(output.school_id, {
              school_id: output.school_id,
              portion_count: output.output_portions,
              package_count: Math.ceil(output.output_portions / 10)
            });
          }
        }

        for (const line of packing.values()) {
          await client.query(
            `
              INSERT INTO packing_lines (
                id, sppg_id, production_run_id, school_id, package_count, portion_count,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5,
                now(), $6, now(), $6
              )
            `,
            [sppgId, params.id, line.school_id, line.package_count, line.portion_count, request.auth!.user_id]
          );
        }

        await client.query(
          `
            UPDATE production_runs
            SET status = 'FINALIZED', finalized_at = now(), updated_at = now(), updated_by = $3
            WHERE id = $1 AND sppg_id = $2
          `,
          [params.id, sppgId, request.auth!.user_id]
        );

        await writeAudit(
          {
            sppgId,
            entityTable: "production_runs",
            entityId: params.id,
            action: "FINALIZE",
            oldValue: { status: run.status },
            newValue: { status: "FINALIZED", outputs: body.outputs.length, qc_checks: body.qc_checks.length },
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

      const packingLines = await query<{ school_id: string; portion_count: number; package_count: number }>(
        `
          SELECT school_id, portion_count, package_count
          FROM packing_lines
          WHERE production_run_id = $1 AND sppg_id = $2
        `,
        [params.id, sppgId]
      );

      return reply.send({ id: params.id, status: "FINALIZED", packing_lines: packingLines.rows });
    }
  );
}

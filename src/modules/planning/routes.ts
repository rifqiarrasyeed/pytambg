import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { PERMISSIONS } from "../../types";
import { MENU_PLAN_TRANSITIONS, assertTransition } from "../../policies/state-machines";
import { assertPeriodUnlocked } from "../../services/period-lock-service";
import { conflict, notFound, unprocessable } from "../../utils/api-error";
import { writeAudit } from "../../services/audit-service";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";

const createPlanSchema = z.object({
  plan_date: z.string().date(),
  buffer_pct: z.number().min(0).max(100).default(0),
  items: z
    .array(
      z.object({
        school_id: z.string().uuid(),
        recipe_id: z.string().uuid(),
        target_portions: z.number().int().positive()
      })
    )
    .min(1)
});

const submitSchema = z.object({
  note: z.string().max(500).optional()
});

const approveSchema = z.object({
  note: z.string().max(500).optional()
});

export async function planningRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/menu-plans",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PLANNING_WRITE);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: { plan_date: "plan_date", status: "status", created_at: "created_at" },
        fallback: "plan_date DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk menu-plans");
      }

      const count = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM menu_plans
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR plan_date >= $3::date)
            AND ($4::date IS NULL OR plan_date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const plans = await query(
        `
          SELECT id, plan_date, status, buffer_pct, approved_by, approved_at, created_at
          FROM menu_plans
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR plan_date >= $3::date)
            AND ($4::date IS NULL OR plan_date <= $4::date)
          ORDER BY ${order.sql}
          LIMIT $5 OFFSET $6
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null, list.page_size, list.offset]
      );

      return reply.send({
        data: plans.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(count.rows[0]?.total ?? 0))
      });
    }
  );

  app.post(
    "/menu-plans",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PLANNING_WRITE);
      const sppgId = requireActiveSppg(request);
      const body = createPlanSchema.parse(request.body);

      await assertPeriodUnlocked(sppgId, body.plan_date);

      const recipeIds = [...new Set(body.items.map((item) => item.recipe_id))];

      const recipeBomCheck = await query<{ recipe_id: string; bom_count: string }>(
        `
          SELECT r.id AS recipe_id, COUNT(ri.id)::text AS bom_count
          FROM recipes r
          LEFT JOIN recipe_items ri ON ri.recipe_id = r.id AND ri.sppg_id = r.sppg_id
          WHERE r.sppg_id = $1 AND r.id = ANY($2::uuid[])
          GROUP BY r.id
        `,
        [sppgId, recipeIds]
      );

      const missingBom = recipeBomCheck.rows.filter((row) => Number(row.bom_count) === 0).map((row) => row.recipe_id);
      if (missingBom.length > 0 || recipeBomCheck.rowCount !== recipeIds.length) {
        throw unprocessable("Ada recipe tanpa BOM lengkap", { recipe_ids: missingBom });
      }

      const planId = randomUUID();
      try {
        await withTransaction(async (client) => {
          await client.query(
            `
              INSERT INTO menu_plans (
                id, sppg_id, plan_date, status, buffer_pct, approved_by, approved_at,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                $1, $2, $3::date, 'DRAFT', $4, NULL, NULL,
                now(), $5, now(), $5
              )
            `,
            [planId, sppgId, body.plan_date, body.buffer_pct, request.auth!.user_id]
          );

          for (const item of body.items) {
            await client.query(
              `
                INSERT INTO plan_items (
                  id, sppg_id, menu_plan_id, school_id, recipe_id, target_portions,
                  created_at, created_by, updated_at, updated_by
                ) VALUES (
                  gen_random_uuid(), $1, $2, $3, $4, $5,
                  now(), $6, now(), $6
                )
              `,
              [sppgId, planId, item.school_id, item.recipe_id, item.target_portions, request.auth!.user_id]
            );
          }

          await writeAudit(
            {
              sppgId,
              entityTable: "menu_plans",
              entityId: planId,
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
      } catch (error) {
        const maybePg = error as { code?: string };
        if (maybePg.code === "23505") {
          throw conflict("CONFLICT", "Menu plan untuk tanggal tersebut sudah ada");
        }
        throw error;
      }

      const mrp = await query<{
        item_id: string;
        required_qty: string;
      }>(
        `
          SELECT
            ri.item_id,
            SUM(ri.qty_per_portion * pi.target_portions * (1 + $2 / 100.0))::text AS required_qty
          FROM plan_items pi
          JOIN recipe_items ri
            ON ri.recipe_id = pi.recipe_id
           AND ri.sppg_id = pi.sppg_id
          WHERE pi.sppg_id = $1 AND pi.menu_plan_id = $3
          GROUP BY ri.item_id
          ORDER BY ri.item_id
        `,
        [sppgId, body.buffer_pct, planId]
      );

      return reply.status(201).send({
        id: planId,
        status: "DRAFT",
        mrp_summary: mrp.rows.map((row) => ({
          item_id: row.item_id,
          required_qty: Number(row.required_qty)
        }))
      });
    }
  );

  app.post(
    "/menu-plans/:id/submit",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PLANNING_WRITE);
      const sppgId = requireActiveSppg(request);
      submitSchema.parse(request.body);

      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const currentResult = await query<{ status: string; plan_date: string }>(
        `SELECT status, plan_date::text FROM menu_plans WHERE id = $1 AND sppg_id = $2 LIMIT 1`,
        [params.id, sppgId]
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw notFound("Menu plan tidak ditemukan");
      }

      assertTransition(current.status as keyof typeof MENU_PLAN_TRANSITIONS, "SUBMITTED", MENU_PLAN_TRANSITIONS, "menu plan");

      await assertPeriodUnlocked(sppgId, current.plan_date);
      await query(
        `
          UPDATE menu_plans
          SET status = 'SUBMITTED', updated_at = now(), updated_by = $3
          WHERE id = $1 AND sppg_id = $2
        `,
        [params.id, sppgId, request.auth!.user_id]
      );

      await writeAudit({
        sppgId,
        entityTable: "menu_plans",
        entityId: params.id,
        action: "SUBMIT",
        oldValue: { status: current.status },
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
    "/menu-plans/:id/approve",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PLANNING_APPROVE);
      const sppgId = requireActiveSppg(request);
      approveSchema.parse(request.body);

      const params = z.object({ id: z.string().uuid() }).parse(request.params);

      const result = await query<{ status: string; plan_date: string; created_by: string | null }>(
        `SELECT status, plan_date::text, created_by FROM menu_plans WHERE id = $1 AND sppg_id = $2 LIMIT 1`,
        [params.id, sppgId]
      );

      const row = result.rows[0];
      if (!row) {
        throw notFound("Menu plan tidak ditemukan");
      }
      if (!request.auth!.is_super_admin && row.created_by === request.auth!.user_id) {
        throw conflict("SELF_APPROVAL_FORBIDDEN", "Pembuat menu plan tidak boleh approve sendiri");
      }
      assertTransition(row.status as keyof typeof MENU_PLAN_TRANSITIONS, "APPROVED", MENU_PLAN_TRANSITIONS, "menu plan");
      await assertPeriodUnlocked(sppgId, row.plan_date);

      const update = await query(
        `
          UPDATE menu_plans
          SET status = 'APPROVED', approved_by = $3, approved_at = now(), updated_at = now(), updated_by = $3
          WHERE id = $1 AND sppg_id = $2
        `,
        [params.id, sppgId, request.auth!.user_id]
      );

      if ((update.rowCount ?? 0) === 0) {
        throw conflict("CONFLICT", "Gagal approve menu plan");
      }

      await writeAudit({
        sppgId,
        entityTable: "menu_plans",
        entityId: params.id,
        action: "APPROVE",
        oldValue: { status: row.status },
        newValue: { status: "APPROVED" },
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.send({
        id: params.id,
        status: "APPROVED",
        approved_by: request.auth!.user_id,
        approved_at: new Date().toISOString()
      });
    }
  );
}

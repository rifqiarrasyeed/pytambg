import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { PERIOD_LOCK_TRANSITIONS, assertTransition } from "../../policies/state-machines";
import { PERMISSIONS } from "../../types";
import { writeAudit } from "../../services/audit-service";
import { conflict, notFound, unprocessable } from "../../utils/api-error";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";

const dateParamSchema = z.object({
  date: z.string().date()
});

const unlockSchema = z.object({
  reason: z.string().min(3).max(500)
});

export async function periodLockRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/period-locks",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.REPORT_VIEW);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          period_date: "period_date",
          status: "status",
          updated_at: "updated_at",
          created_at: "created_at"
        },
        fallback: "period_date DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk period-locks");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM period_locks
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR period_date >= $3::date)
            AND ($4::date IS NULL OR period_date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const rows = await query(
        `
          SELECT id, period_date, status, locked_by, unlocked_by, unlock_reason, updated_at
          FROM period_locks
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR period_date >= $3::date)
            AND ($4::date IS NULL OR period_date <= $4::date)
          ORDER BY ${order.sql}
          LIMIT $5 OFFSET $6
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null, list.page_size, list.offset]
      );

      return reply.send({
        data: rows.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.post(
    "/period-locks/:date/lock",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PERIOD_LOCK);
      const sppgId = requireActiveSppg(request);
      const { date } = dateParamSchema.parse(request.params);

      const openDisputes = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM disputes
          WHERE sppg_id = $1 AND status IN ('OPEN', 'IN_REVIEW')
        `,
        [sppgId]
      );

      if (Number(openDisputes.rows[0]?.total ?? 0) > 0) {
        throw conflict("STATE_TRANSITION_INVALID", "Tidak dapat lock periode: masih ada dispute terbuka", {
          open_disputes: Number(openDisputes.rows[0]?.total ?? 0)
        });
      }

      const currentResult = await query<{
        id: string;
        status: string;
      }>(
        `
          SELECT id, status
          FROM period_locks
          WHERE sppg_id = $1 AND period_date = $2::date
          LIMIT 1
        `,
        [sppgId, date]
      );

      const current = currentResult.rows[0];
      let lockId = current?.id ?? randomUUID();
      let oldStatus = current?.status ?? "OPEN";
      let newStatus = "LOCKED";

      if (!current) {
        await query(
          `
            INSERT INTO period_locks (
              id, sppg_id, period_date, status, locked_by, unlocked_by, unlock_reason,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              $1, $2, $3::date, 'OPEN', NULL, NULL, NULL,
              now(), $4, now(), $4
            )
          `,
          [lockId, sppgId, date, request.auth!.user_id]
        );
      }

      if (oldStatus === "UNLOCKED") {
        assertTransition(oldStatus, "RELOCKED", PERIOD_LOCK_TRANSITIONS, "period lock");
        newStatus = "RELOCKED";
      } else {
        assertTransition(oldStatus, "LOCKED", PERIOD_LOCK_TRANSITIONS, "period lock");
      }

      await query(
        `
          UPDATE period_locks
          SET status = $3,
              locked_by = $4,
              updated_at = now(),
              updated_by = $4
          WHERE id = $1 AND sppg_id = $2
        `,
        [lockId, sppgId, newStatus, request.auth!.user_id]
      );

      await writeAudit({
        sppgId,
        entityTable: "period_locks",
        entityId: lockId,
        action: "LOCK",
        oldValue: { status: oldStatus, period_date: date },
        newValue: { status: newStatus, period_date: date },
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.send({ id: lockId, period_date: date, status: newStatus });
    }
  );

  app.post(
    "/period-locks/:date/unlock",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PERIOD_UNLOCK);
      const sppgId = requireActiveSppg(request);
      const { date } = dateParamSchema.parse(request.params);
      const body = unlockSchema.parse(request.body);

      const currentResult = await query<{
        id: string;
        status: string;
      }>(
        `
          SELECT id, status
          FROM period_locks
          WHERE sppg_id = $1 AND period_date = $2::date
          LIMIT 1
        `,
        [sppgId, date]
      );

      const current = currentResult.rows[0];
      if (!current) {
        throw notFound("Period lock belum pernah dibuat");
      }

      assertTransition(current.status, "UNLOCK_REQUESTED", PERIOD_LOCK_TRANSITIONS, "period lock");
      assertTransition("UNLOCK_REQUESTED", "UNLOCKED", PERIOD_LOCK_TRANSITIONS, "period lock");

      await query(
        `
          UPDATE period_locks
          SET status = 'UNLOCKED',
              unlocked_by = $3,
              unlock_reason = $4,
              updated_at = now(),
              updated_by = $3
          WHERE id = $1 AND sppg_id = $2
        `,
        [current.id, sppgId, request.auth!.user_id, body.reason]
      );

      await writeAudit({
        sppgId,
        entityTable: "period_locks",
        entityId: current.id,
        action: "UNLOCK",
        oldValue: { status: current.status, period_date: date },
        newValue: { status: "UNLOCKED", period_date: date, reason: body.reason },
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.send({ id: current.id, period_date: date, status: "UNLOCKED", reason: body.reason });
    }
  );
}

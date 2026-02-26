import type { FastifyInstance } from "fastify";
import { query } from "../../db/pool";
import { requirePermission, requireActiveSppg } from "../../policies/guards";
import { PERMISSIONS } from "../../types";
import { unprocessable } from "../../utils/api-error";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";
import { parseAuditLogFilter } from "./audit-log-filter";

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/audit-logs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.AUDIT_VIEW);
      const sppgId = requireActiveSppg(request);
      const queryParams = parseAuditLogFilter(request.query);
      const list = parseListQuery(request.query);
      const pageSize = queryParams.limit ?? list.page_size;
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          occurred_at: "occurred_at",
          entity_table: "entity_table",
          actor_user_id: "actor_user_id",
          action: "action"
        },
        fallback: "occurred_at DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk audit-logs");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM audit_logs
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR entity_table = $2)
            AND ($3::uuid IS NULL OR entity_id = $3)
            AND ($4::text IS NULL OR action = $4)
            AND ($5::uuid IS NULL OR actor_user_id = $5)
            AND ($6::timestamptz IS NULL OR occurred_at >= $6::timestamptz)
            AND ($7::timestamptz IS NULL OR occurred_at <= $7::timestamptz)
        `,
        [
          sppgId,
          queryParams.entity_table ?? null,
          queryParams.entity_id ?? null,
          queryParams.action ?? null,
          queryParams.actor_user_id ?? null,
          queryParams.start_at ?? null,
          queryParams.end_at ?? null
        ]
      );

      const result = await query(
        `
          SELECT
            id,
            entity_table,
            entity_id,
            action,
            old_value,
            new_value,
            actor_user_id,
            actor_role,
            occurred_at,
            request_id,
            device_id,
            ip,
            user_agent
          FROM audit_logs
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR entity_table = $2)
            AND ($3::uuid IS NULL OR entity_id = $3)
            AND ($4::text IS NULL OR action = $4)
            AND ($5::uuid IS NULL OR actor_user_id = $5)
            AND ($6::timestamptz IS NULL OR occurred_at >= $6::timestamptz)
            AND ($7::timestamptz IS NULL OR occurred_at <= $7::timestamptz)
          ORDER BY ${order.sql}
          LIMIT $8 OFFSET $9
        `,
        [
          sppgId,
          queryParams.entity_table ?? null,
          queryParams.entity_id ?? null,
          queryParams.action ?? null,
          queryParams.actor_user_id ?? null,
          queryParams.start_at ?? null,
          queryParams.end_at ?? null,
          pageSize,
          list.offset
        ]
      );

      return reply.send({
        data: result.rows,
        ...buildPagingMeta(list.page, pageSize, Number(total.rows[0]?.total ?? 0))
      });
    }
  );
}

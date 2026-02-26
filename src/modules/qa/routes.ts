import type { FastifyInstance } from "fastify";
import { query } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { PERMISSIONS } from "../../types";
import { badRequest } from "../../utils/api-error";
import { parseHealthIntegrityQuery } from "./health-integrity-query";

const protectedTables = [
  "sppg",
  "sppg_settings",
  "sppg_setting_versions",
  "users",
  "roles",
  "permissions",
  "role_permissions",
  "user_sppg",
  "sessions_tokens",
  "units",
  "schools",
  "school_user_access",
  "routes",
  "route_schools",
  "vendors",
  "inventory_items",
  "recipe_templates",
  "recipes",
  "recipe_items",
  "menu_plans",
  "plan_items",
  "purchases",
  "purchase_items",
  "receipts",
  "receipt_items",
  "vendor_invoices",
  "inventory_batches",
  "stock_moves",
  "stock_opnames",
  "stock_opname_lines",
  "production_runs",
  "production_inputs",
  "production_outputs",
  "qc_checks",
  "packing_lines",
  "deliveries",
  "delivery_stops",
  "delivery_items",
  "attachments",
  "entity_attachments",
  "delivery_proofs",
  "disputes",
  "waste_events",
  "incident_logs",
  "audit_logs",
  "change_requests",
  "period_locks",
  "idempotency_keys",
  "reports_jobs"
] as const;

const requiredTriggers = [
  "trg_prevent_stock_moves_update",
  "trg_prevent_stock_moves_delete",
  "trg_prevent_audit_logs_update",
  "trg_prevent_audit_logs_delete"
] as const;

const forceRlsTables = [
  "audit_logs",
  "stock_moves",
  "attachments",
  "entity_attachments",
  "delivery_proofs",
  "reports_jobs",
  "idempotency_keys"
] as const;

const requiredTenantConstraints = [
  "fk_plan_items_menu_plan_tenant",
  "fk_plan_items_school_tenant",
  "fk_plan_items_recipe_tenant",
  "fk_purchase_items_purchase_tenant",
  "fk_purchase_items_item_tenant",
  "fk_receipts_purchase_tenant",
  "fk_receipt_items_receipt_tenant",
  "fk_receipt_items_purchase_item_tenant",
  "fk_inventory_batches_item_tenant",
  "fk_inventory_batches_receipt_item_tenant",
  "fk_stock_moves_item_tenant",
  "fk_stock_moves_batch_tenant",
  "fk_stock_moves_uom_tenant",
  "fk_stock_opname_lines_opname_tenant",
  "fk_stock_opname_lines_item_tenant",
  "fk_stock_opname_lines_batch_tenant",
  "fk_production_runs_menu_plan_tenant",
  "fk_production_inputs_run_tenant",
  "fk_production_inputs_stock_move_tenant",
  "fk_production_inputs_item_tenant",
  "fk_production_outputs_run_tenant",
  "fk_production_outputs_school_tenant",
  "fk_production_outputs_recipe_tenant",
  "fk_qc_checks_run_tenant",
  "fk_qc_checks_attachment_tenant",
  "fk_packing_lines_run_tenant",
  "fk_packing_lines_school_tenant",
  "fk_deliveries_route_tenant",
  "fk_delivery_stops_delivery_tenant",
  "fk_delivery_stops_school_tenant",
  "fk_delivery_items_stop_tenant",
  "fk_delivery_items_packing_tenant",
  "fk_delivery_proofs_stop_tenant",
  "fk_delivery_proofs_attachment_tenant",
  "fk_disputes_stop_tenant",
  "fk_route_schools_route_tenant",
  "fk_route_schools_school_tenant",
  "fk_school_user_access_school_tenant",
  "fk_recipe_items_recipe_tenant",
  "fk_recipe_items_item_tenant",
  "fk_vendor_invoices_vendor_tenant",
  "fk_entity_attachments_attachment_tenant",
  "fk_waste_events_item_tenant",
  "fk_waste_events_batch_tenant",
  "fk_reports_jobs_attachment_tenant"
] as const;

const authLifecycleActions = ["LOGIN_SUCCESS", "TOKEN_REFRESH", "LOGOUT"] as const;

type GapSampleRow = {
  entity_table: string;
  entity_id: string;
  occurred_at: string;
  reason: string;
};

const criticalEntityCoverageSql = `
  SELECT 'menu_plans'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM menu_plans
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'purchases'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM purchases
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'receipts'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM receipts
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'stock_moves'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM stock_moves
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'stock_opnames'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM stock_opnames
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'production_runs'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM production_runs
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'deliveries'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM deliveries
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'delivery_stops'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM delivery_stops
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'disputes'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM disputes
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'period_locks'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM period_locks
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'reports_jobs'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM reports_jobs
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
  UNION ALL
  SELECT 'attachments'::text AS entity_table, id AS entity_id, created_at, updated_at
  FROM attachments
  WHERE sppg_id = $1
    AND (created_at >= now() - make_interval(hours => $2) OR updated_at >= now() - make_interval(hours => $2))
`;

export async function qaRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/qa/health-integrity",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.AUDIT_VIEW);
      const activeSppgId = requireActiveSppg(request);
      if (!activeSppgId) {
        throw badRequest("ACTIVE_SPPG_REQUIRED", "Pilih active SPPG untuk cek integrity tenant");
      }
      const options = parseHealthIntegrityQuery(request.query);

      const [
        rlsMissing,
        policyMissing,
        leakedGrants,
        triggerMissing,
        forceRlsMissing,
        tenantConstraintMissing,
        auditCreateGap,
        auditUpdateGap,
        auditMissingRequestId,
        auditMissingActorMeta,
        stockDelta,
        attachmentMismatch
      ] = await Promise.all([
        query<{ count: string }>(
          `
            WITH t AS (SELECT unnest($1::text[]) AS table_name)
            SELECT COUNT(*)::text AS count
            FROM t
            LEFT JOIN pg_class c ON c.relname = t.table_name
            LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND (c.relrowsecurity IS DISTINCT FROM true)
          `,
          [protectedTables]
        ),
        query<{ count: string }>(
          `
            WITH t AS (SELECT unnest($1::text[]) AS table_name)
            SELECT COUNT(*)::text AS count
            FROM t
            LEFT JOIN pg_policies p
              ON p.schemaname = 'public'
             AND p.tablename = t.table_name
             AND p.policyname = 'deny_all_clients'
            WHERE p.policyname IS NULL
          `,
          [protectedTables]
        ),
        query<{ count: string }>(
          `
            SELECT COUNT(*)::text AS count
            FROM information_schema.role_table_grants
            WHERE table_schema = 'public'
              AND grantee IN ('anon', 'authenticated')
          `
        ),
        query<{ count: string }>(
          `
            WITH required AS (SELECT unnest($1::text[]) AS tgname)
            SELECT COUNT(*)::text AS count
            FROM required
            LEFT JOIN pg_trigger t ON t.tgname = required.tgname
            WHERE t.tgname IS NULL OR t.tgenabled <> 'O'
          `,
          [requiredTriggers]
        ),
        query<{ count: string }>(
          `
            WITH t AS (SELECT unnest($1::text[]) AS table_name)
            SELECT COUNT(*)::text AS count
            FROM t
            LEFT JOIN pg_class c ON c.relname = t.table_name
            LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND (c.relforcerowsecurity IS DISTINCT FROM true)
          `,
          [forceRlsTables]
        ),
        query<{ count: string }>(
          `
            WITH required_constraints AS (
              SELECT unnest($1::text[]) AS conname
            )
            SELECT COUNT(*)::text AS count
            FROM required_constraints rc
            LEFT JOIN pg_constraint c ON c.conname = rc.conname
            WHERE c.conname IS NULL OR c.convalidated IS DISTINCT FROM true
          `,
          [requiredTenantConstraints]
        ),
        query<{ count: string }>(
          `
            WITH critical_entities AS (
              ${criticalEntityCoverageSql}
            )
            SELECT COUNT(*)::text AS count
            FROM critical_entities ce
            WHERE ce.created_at >= now() - make_interval(hours => $2)
              AND NOT EXISTS (
                SELECT 1
                FROM audit_logs al
                WHERE al.sppg_id = $1
                  AND al.entity_table = ce.entity_table
                  AND al.entity_id = ce.entity_id
                  AND al.occurred_at BETWEEN ce.created_at - interval '10 minute' AND ce.created_at + interval '10 minute'
              )
          `,
          [activeSppgId, options.audit_window_hours]
        ),
        query<{ count: string }>(
          `
            WITH critical_entities AS (
              ${criticalEntityCoverageSql}
            )
            SELECT COUNT(*)::text AS count
            FROM critical_entities ce
            WHERE ce.updated_at > ce.created_at
              AND ce.updated_at >= now() - make_interval(hours => $2)
              AND NOT EXISTS (
                SELECT 1
                FROM audit_logs al
                WHERE al.sppg_id = $1
                  AND al.entity_table = ce.entity_table
                  AND al.entity_id = ce.entity_id
                  AND al.occurred_at BETWEEN ce.updated_at - interval '10 minute' AND ce.updated_at + interval '10 minute'
              )
          `,
          [activeSppgId, options.audit_window_hours]
        ),
        query<{ count: string }>(
          `
            SELECT COUNT(*)::text AS count
            FROM audit_logs
            WHERE sppg_id = $1
              AND occurred_at >= now() - make_interval(hours => $2)
              AND action <> ALL($3::text[])
              AND (request_id IS NULL OR btrim(request_id) = '')
          `,
          [activeSppgId, options.audit_window_hours, authLifecycleActions]
        ),
        query<{ count: string }>(
          `
            SELECT COUNT(*)::text AS count
            FROM audit_logs
            WHERE sppg_id = $1
              AND occurred_at >= now() - make_interval(hours => $2)
              AND (
                actor_user_id IS NULL
                OR actor_role IS NULL
                OR btrim(actor_role) = ''
              )
          `,
          [activeSppgId, options.audit_window_hours]
        ),
        query<{ count: string }>(
          `
            WITH ledger AS (
              SELECT
                sppg_id,
                item_id,
                batch_id,
                SUM(CASE WHEN is_void THEN 0 ELSE qty END) AS ledger_qty
              FROM stock_moves
              WHERE sppg_id = $1
              GROUP BY sppg_id, item_id, batch_id
            )
            SELECT COUNT(*)::text AS count
            FROM stock_balances_mv mv
            FULL OUTER JOIN ledger
              ON ledger.sppg_id = mv.sppg_id
             AND ledger.item_id = mv.item_id
             AND ((ledger.batch_id IS NULL AND mv.batch_id IS NULL) OR ledger.batch_id = mv.batch_id)
            WHERE COALESCE(mv.on_hand_qty, 0) <> COALESCE(ledger.ledger_qty, 0)
              AND COALESCE(mv.sppg_id, ledger.sppg_id) = $1
          `,
          [activeSppgId]
        ),
        query<{ count: string }>(
          `
            SELECT COUNT(*)::text AS count
            FROM entity_attachments ea
            JOIN attachments a ON a.id = ea.attachment_id
            WHERE ea.sppg_id <> a.sppg_id
              AND ea.sppg_id = $1
          `,
          [activeSppgId]
        )
      ]);

      const report = {
        rls_missing_count: Number(rlsMissing.rows[0]?.count ?? 0),
        deny_policy_missing_count: Number(policyMissing.rows[0]?.count ?? 0),
        leaked_grants_count: Number(leakedGrants.rows[0]?.count ?? 0),
        required_trigger_missing_count: Number(triggerMissing.rows[0]?.count ?? 0),
        force_rls_missing_count: Number(forceRlsMissing.rows[0]?.count ?? 0),
        tenant_constraint_missing_count: Number(tenantConstraintMissing.rows[0]?.count ?? 0),
        audit_create_gap_count: Number(auditCreateGap.rows[0]?.count ?? 0),
        audit_update_gap_count: Number(auditUpdateGap.rows[0]?.count ?? 0),
        audit_missing_request_id_count: Number(auditMissingRequestId.rows[0]?.count ?? 0),
        audit_missing_actor_meta_count: Number(auditMissingActorMeta.rows[0]?.count ?? 0),
        stock_mv_mismatch_count: Number(stockDelta.rows[0]?.count ?? 0),
        attachment_tenant_mismatch_count: Number(attachmentMismatch.rows[0]?.count ?? 0)
      };
      const ok = Object.values(report).every((value) => value === 0);

      let samples:
        | {
            audit_create_gap: GapSampleRow[];
            audit_update_gap: GapSampleRow[];
            audit_missing_request_id: GapSampleRow[];
            audit_missing_actor_meta: GapSampleRow[];
          }
        | undefined;

      if (options.include_samples) {
        const [createGapSamples, updateGapSamples, missingRequestIdSamples, missingActorMetaSamples] = await Promise.all([
          query<GapSampleRow>(
            `
              WITH critical_entities AS (
                ${criticalEntityCoverageSql}
              )
              SELECT
                ce.entity_table,
                ce.entity_id::text AS entity_id,
                ce.created_at::text AS occurred_at,
                'MISSING_CREATE_AUDIT'::text AS reason
              FROM critical_entities ce
              WHERE ce.created_at >= now() - make_interval(hours => $2)
                AND NOT EXISTS (
                  SELECT 1
                  FROM audit_logs al
                  WHERE al.sppg_id = $1
                    AND al.entity_table = ce.entity_table
                    AND al.entity_id = ce.entity_id
                    AND al.occurred_at BETWEEN ce.created_at - interval '10 minute' AND ce.created_at + interval '10 minute'
                )
              ORDER BY ce.created_at DESC
              LIMIT $3
            `,
            [activeSppgId, options.audit_window_hours, options.sample_limit]
          ),
          query<GapSampleRow>(
            `
              WITH critical_entities AS (
                ${criticalEntityCoverageSql}
              )
              SELECT
                ce.entity_table,
                ce.entity_id::text AS entity_id,
                ce.updated_at::text AS occurred_at,
                'MISSING_UPDATE_AUDIT'::text AS reason
              FROM critical_entities ce
              WHERE ce.updated_at > ce.created_at
                AND ce.updated_at >= now() - make_interval(hours => $2)
                AND NOT EXISTS (
                  SELECT 1
                  FROM audit_logs al
                  WHERE al.sppg_id = $1
                    AND al.entity_table = ce.entity_table
                    AND al.entity_id = ce.entity_id
                    AND al.occurred_at BETWEEN ce.updated_at - interval '10 minute' AND ce.updated_at + interval '10 minute'
                )
              ORDER BY ce.updated_at DESC
              LIMIT $3
            `,
            [activeSppgId, options.audit_window_hours, options.sample_limit]
          ),
          query<GapSampleRow>(
            `
              SELECT
                entity_table,
                entity_id::text AS entity_id,
                occurred_at::text AS occurred_at,
                'MISSING_REQUEST_ID'::text AS reason
              FROM audit_logs
              WHERE sppg_id = $1
                AND occurred_at >= now() - make_interval(hours => $2)
                AND action <> ALL($3::text[])
                AND (request_id IS NULL OR btrim(request_id) = '')
              ORDER BY occurred_at DESC
              LIMIT $4
            `,
            [activeSppgId, options.audit_window_hours, authLifecycleActions, options.sample_limit]
          ),
          query<GapSampleRow>(
            `
              SELECT
                entity_table,
                entity_id::text AS entity_id,
                occurred_at::text AS occurred_at,
                'MISSING_ACTOR_META'::text AS reason
              FROM audit_logs
              WHERE sppg_id = $1
                AND occurred_at >= now() - make_interval(hours => $2)
                AND (
                  actor_user_id IS NULL
                  OR actor_role IS NULL
                  OR btrim(actor_role) = ''
                )
              ORDER BY occurred_at DESC
              LIMIT $3
            `,
            [activeSppgId, options.audit_window_hours, options.sample_limit]
          )
        ]);

        samples = {
          audit_create_gap: createGapSamples.rows,
          audit_update_gap: updateGapSamples.rows,
          audit_missing_request_id: missingRequestIdSamples.rows,
          audit_missing_actor_meta: missingActorMetaSamples.rows
        };
      }

      return reply.send({
        ok,
        scope_sppg_id: activeSppgId,
        audit_window_hours: options.audit_window_hours,
        checks: report,
        checked_at: new Date().toISOString(),
        ...(samples ? { samples } : {})
      });
    }
  );
}

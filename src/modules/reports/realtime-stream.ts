import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { query } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { PERMISSIONS } from "../../types";
import { badRequest } from "../../utils/api-error";
import { parseWorkspaceStreamQuery, type RealtimeTopic } from "./realtime-stream-query";

type StreamOptions = {
  topics: RealtimeTopic[];
  deliveryId?: string;
  intervalSeconds: number;
};

type DailyKpiRow = {
  planned: string;
  produced: string;
  delivered: string;
  verified: string;
  waste_qty: string;
};

type WorkspaceSummaryRow = {
  planning_pending: string;
  po_pending: string;
  production_active: string;
  delivery_active: string;
  verification_pending: string;
  disputes_open: string;
};

type WorkspaceAlertRow = {
  kind: string;
  severity: string;
  title: string;
  count: string;
};

type IntegrityCountRow = {
  count: string;
};

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

function writeSse(reply: FastifyReply, eventId: number, event: string, payload: unknown): void {
  if (reply.raw.writableEnded || reply.raw.destroyed) {
    return;
  }
  reply.raw.write(`id: ${eventId}\n`);
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function getKpiSnapshot(sppgId: string, reportDate: string) {
  const kpi = await query<DailyKpiRow>(
    `
      WITH planned AS (
        SELECT COALESCE(SUM(target_portions), 0) AS qty
        FROM menu_plans mp
        JOIN plan_items pi ON pi.menu_plan_id = mp.id AND pi.sppg_id = mp.sppg_id
        WHERE mp.sppg_id = $1 AND mp.plan_date = $2::date
      ),
      produced AS (
        SELECT COALESCE(SUM(output_portions), 0) AS qty
        FROM production_runs pr
        JOIN production_outputs po ON po.production_run_id = pr.id AND po.sppg_id = pr.sppg_id
        WHERE pr.sppg_id = $1 AND pr.run_date = $2::date
      ),
      delivered AS (
        SELECT COALESCE(SUM(delivered_portions), 0) AS qty
        FROM deliveries d
        JOIN delivery_stops ds ON ds.delivery_id = d.id AND ds.sppg_id = d.sppg_id
        JOIN delivery_items di ON di.delivery_stop_id = ds.id AND di.sppg_id = d.sppg_id
        WHERE d.sppg_id = $1 AND DATE(d.planned_departure) = $2::date
      ),
      verified AS (
        SELECT COALESCE(SUM(di.delivered_portions), 0) AS qty
        FROM deliveries d
        JOIN delivery_stops ds ON ds.delivery_id = d.id AND ds.sppg_id = d.sppg_id
        JOIN delivery_items di ON di.delivery_stop_id = ds.id AND di.sppg_id = d.sppg_id
        WHERE d.sppg_id = $1 AND DATE(d.planned_departure) = $2::date AND ds.status IN ('VERIFIED','LOCKED')
      ),
      waste AS (
        SELECT COALESCE(SUM(ABS(qty)), 0) AS qty
        FROM waste_events
        WHERE sppg_id = $1 AND DATE(event_time) = $2::date
      )
      SELECT
        planned.qty::text AS planned,
        produced.qty::text AS produced,
        delivered.qty::text AS delivered,
        verified.qty::text AS verified,
        waste.qty::text AS waste_qty
      FROM planned, produced, delivered, verified, waste
    `,
    [sppgId, reportDate]
  );

  const row = kpi.rows[0] ?? { planned: "0", produced: "0", delivered: "0", verified: "0", waste_qty: "0" };
  const planned = Number(row.planned);
  const produced = Number(row.produced);
  const delivered = Number(row.delivered);
  const verified = Number(row.verified);
  const wasteQty = Number(row.waste_qty);

  return {
    date: reportDate,
    planned,
    produced,
    delivered,
    verified,
    delivered_rate: planned > 0 ? delivered / planned : 0,
    verified_rate: planned > 0 ? verified / planned : 0,
    waste_rate: produced > 0 ? wasteQty / produced : 0
  };
}

async function getSummarySnapshot(sppgId: string, today: string) {
  const summary = await query<WorkspaceSummaryRow>(
    `
      WITH planning AS (
        SELECT COUNT(*)::text AS qty
        FROM menu_plans
        WHERE sppg_id = $1
          AND plan_date = $2::date
          AND status IN ('DRAFT','SUBMITTED')
      ),
      po AS (
        SELECT COUNT(*)::text AS qty
        FROM purchases
        WHERE sppg_id = $1
          AND status IN ('DRAFT','SUBMITTED')
      ),
      production AS (
        SELECT COUNT(*)::text AS qty
        FROM production_runs
        WHERE sppg_id = $1
          AND run_date = $2::date
          AND status IN ('PLANNED','IN_PROGRESS','QC_PENDING')
      ),
      delivery AS (
        SELECT COUNT(*)::text AS qty
        FROM deliveries
        WHERE sppg_id = $1
          AND planned_departure::date = $2::date
          AND status IN ('PLANNED','LOADED','IN_TRANSIT','DELIVERED')
      ),
      verification AS (
        SELECT COUNT(*)::text AS qty
        FROM delivery_stops ds
        JOIN deliveries d ON d.id = ds.delivery_id AND d.sppg_id = ds.sppg_id
        WHERE ds.sppg_id = $1
          AND d.planned_departure::date = $2::date
          AND ds.status IN ('DELIVERED')
      ),
      disputes AS (
        SELECT COUNT(*)::text AS qty
        FROM disputes
        WHERE sppg_id = $1
          AND status IN ('OPEN','IN_REVIEW')
      )
      SELECT
        planning.qty AS planning_pending,
        po.qty AS po_pending,
        production.qty AS production_active,
        delivery.qty AS delivery_active,
        verification.qty AS verification_pending,
        disputes.qty AS disputes_open
      FROM planning, po, production, delivery, verification, disputes
    `,
    [sppgId, today]
  );

  const row = summary.rows[0] ?? {
    planning_pending: "0",
    po_pending: "0",
    production_active: "0",
    delivery_active: "0",
    verification_pending: "0",
    disputes_open: "0"
  };

  return {
    date: today,
    counters: {
      planning_pending: Number(row.planning_pending),
      po_pending: Number(row.po_pending),
      production_active: Number(row.production_active),
      delivery_active: Number(row.delivery_active),
      verification_pending: Number(row.verification_pending),
      disputes_open: Number(row.disputes_open)
    }
  };
}

async function getAlertsSnapshot(sppgId: string) {
  const alerts = await query<WorkspaceAlertRow>(
    `
      WITH delivered_no_proof AS (
        SELECT COUNT(*) AS qty
        FROM delivery_stops ds
        WHERE ds.sppg_id = $1
          AND ds.status = 'DELIVERED'
          AND NOT EXISTS (
            SELECT 1
            FROM delivery_proofs dp
            WHERE dp.sppg_id = ds.sppg_id
              AND dp.delivery_stop_id = ds.id
          )
      ),
      disputes_open AS (
        SELECT COUNT(*) AS qty
        FROM disputes
        WHERE sppg_id = $1
          AND status IN ('OPEN','IN_REVIEW')
      ),
      expiring_batch AS (
        SELECT COUNT(*) AS qty
        FROM inventory_batches ib
        JOIN stock_balances_mv sb ON sb.sppg_id = ib.sppg_id AND sb.batch_id = ib.id
        WHERE ib.sppg_id = $1
          AND sb.on_hand_qty > 0
          AND ib.expiry_date IS NOT NULL
          AND ib.expiry_date <= CURRENT_DATE + INTERVAL '14 day'
      )
      SELECT * FROM (
        SELECT
          'MISSING_PROOF'::text AS kind,
          'HIGH'::text AS severity,
          'Stop delivered tanpa proof'::text AS title,
          delivered_no_proof.qty::text AS count
        FROM delivered_no_proof
        UNION ALL
        SELECT
          'OPEN_DISPUTE'::text AS kind,
          'MEDIUM'::text AS severity,
          'Dispute belum selesai'::text AS title,
          disputes_open.qty::text AS count
        FROM disputes_open
        UNION ALL
        SELECT
          'NEAR_EXPIRY'::text AS kind,
          'MEDIUM'::text AS severity,
          'Batch mendekati expiry (<=14 hari)'::text AS title,
          expiring_batch.qty::text AS count
        FROM expiring_batch
      ) s
      WHERE s.count::int > 0
      ORDER BY s.count::int DESC, s.kind ASC
    `,
    [sppgId]
  );

  return alerts.rows.map((row) => ({
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    count: Number(row.count)
  }));
}

async function getIntegritySnapshot(sppgId: string) {
  const [rlsMissing, policyMissing, leakedGrants, triggerMissing, stockDelta, attachmentMismatch] = await Promise.all([
    query<IntegrityCountRow>(
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
    query<IntegrityCountRow>(
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
    query<IntegrityCountRow>(
      `
        SELECT COUNT(*)::text AS count
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee IN ('anon', 'authenticated')
      `
    ),
    query<IntegrityCountRow>(
      `
        WITH required AS (SELECT unnest($1::text[]) AS tgname)
        SELECT COUNT(*)::text AS count
        FROM required
        LEFT JOIN pg_trigger t ON t.tgname = required.tgname
        WHERE t.tgname IS NULL OR t.tgenabled <> 'O'
      `,
      [requiredTriggers]
    ),
    query<IntegrityCountRow>(
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
      [sppgId]
    ),
    query<IntegrityCountRow>(
      `
        SELECT COUNT(*)::text AS count
        FROM entity_attachments ea
        JOIN attachments a ON a.id = ea.attachment_id
        WHERE ea.sppg_id <> a.sppg_id
          AND ea.sppg_id = $1
      `,
      [sppgId]
    )
  ]);

  const checks = {
    rls_missing_count: Number(rlsMissing.rows[0]?.count ?? 0),
    deny_policy_missing_count: Number(policyMissing.rows[0]?.count ?? 0),
    leaked_grants_count: Number(leakedGrants.rows[0]?.count ?? 0),
    required_trigger_missing_count: Number(triggerMissing.rows[0]?.count ?? 0),
    stock_mv_mismatch_count: Number(stockDelta.rows[0]?.count ?? 0),
    attachment_tenant_mismatch_count: Number(attachmentMismatch.rows[0]?.count ?? 0)
  };

  return {
    ok: Object.values(checks).every((value) => value === 0),
    scope_sppg_id: sppgId,
    checks,
    checked_at: new Date().toISOString()
  };
}

async function getReportsSnapshot(sppgId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [kpi, summary, alerts, integrity] = await Promise.all([
    getKpiSnapshot(sppgId, today),
    getSummarySnapshot(sppgId, today),
    getAlertsSnapshot(sppgId),
    getIntegritySnapshot(sppgId)
  ]);
  return {
    generated_at: new Date().toISOString(),
    kpi,
    summary,
    alerts,
    integrity
  };
}

type DeliveryRow = {
  id: string;
  manifest_no: string;
  route_id: string;
  driver_user_id: string;
  status: string;
  planned_departure: string;
  updated_at: string;
};

type DeliveryStopRow = {
  id: string;
  delivery_id: string;
  school_id: string;
  stop_order: number;
  status: string;
  updated_at: string;
  planned_portions: string;
  delivered_portions: string;
};

async function getDeliverySnapshot(sppgId: string, deliveryId?: string) {
  const deliveries = await query<DeliveryRow>(
    `
      SELECT id, manifest_no, route_id, driver_user_id, status, planned_departure::text, updated_at::text
      FROM deliveries
      WHERE sppg_id = $1
        AND ($2::uuid IS NULL OR id = $2::uuid)
      ORDER BY updated_at DESC
      LIMIT 25
    `,
    [sppgId, deliveryId ?? null]
  );

  const scopedDeliveryIds = deliveries.rows.map((row) => row.id);
  if (scopedDeliveryIds.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      delivery_id: deliveryId ?? null,
      deliveries: [],
      stops: []
    };
  }

  const stops = await query<DeliveryStopRow>(
    `
      SELECT
        ds.id,
        ds.delivery_id,
        ds.school_id,
        ds.stop_order,
        ds.status,
        ds.updated_at::text,
        COALESCE(SUM(di.planned_portions), 0)::text AS planned_portions,
        COALESCE(SUM(di.delivered_portions), 0)::text AS delivered_portions
      FROM delivery_stops ds
      LEFT JOIN delivery_items di
        ON di.sppg_id = ds.sppg_id
        AND di.delivery_stop_id = ds.id
      WHERE ds.sppg_id = $1
        AND ds.delivery_id = ANY($2::uuid[])
      GROUP BY ds.id, ds.delivery_id, ds.school_id, ds.stop_order, ds.status, ds.updated_at
      ORDER BY ds.delivery_id ASC, ds.stop_order ASC
      LIMIT 200
    `,
    [sppgId, scopedDeliveryIds]
  );

  return {
    generated_at: new Date().toISOString(),
    delivery_id: deliveryId ?? null,
    deliveries: deliveries.rows,
    stops: stops.rows.map((row) => ({
      ...row,
      planned_portions: Number(row.planned_portions),
      delivered_portions: Number(row.delivered_portions)
    }))
  };
}

function registerStreamCloseHandlers(request: FastifyRequest, reply: FastifyReply, onClose: () => void): void {
  request.raw.on("close", onClose);
  request.raw.on("aborted", onClose);
  reply.raw.on("close", onClose);
  reply.raw.on("error", onClose);
}

export function registerWorkspaceStreamRoute(app: FastifyInstance): void {
  app.get(
    "/workspace/stream",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.REPORT_VIEW);
      const sppgId = requireActiveSppg(request);
      if (!sppgId) {
        throw badRequest("ACTIVE_SPPG_REQUIRED", "Active SPPG wajib dipilih untuk menggunakan workspace stream");
      }
      const parsed = parseWorkspaceStreamQuery(request.query);
      const options: StreamOptions = {
        topics: parsed.topics,
        deliveryId: parsed.delivery_id,
        intervalSeconds: parsed.interval_seconds
      };

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });

      let closed = false;
      let eventId = 1;
      let sending = false;
      let snapshotTimer: NodeJS.Timeout | undefined;
      let heartbeatTimer: NodeJS.Timeout | undefined;

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        if (snapshotTimer) {
          clearInterval(snapshotTimer);
        }
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
        }
        if (!reply.raw.writableEnded && !reply.raw.destroyed) {
          reply.raw.end();
        }
      };

      registerStreamCloseHandlers(request, reply, close);

      const pushSnapshot = async () => {
        if (closed || sending) {
          return;
        }
        sending = true;
        try {
          if (options.topics.includes("reports")) {
            const reports = await getReportsSnapshot(sppgId);
            writeSse(reply, eventId++, "reports.snapshot", reports);
          }
          if (options.topics.includes("delivery")) {
            const delivery = await getDeliverySnapshot(sppgId, options.deliveryId);
            writeSse(reply, eventId++, "delivery.snapshot", delivery);
          }
        } catch (error) {
          writeSse(reply, eventId++, "error", {
            message: error instanceof Error ? error.message : "STREAM_SNAPSHOT_FAILED",
            timestamp: new Date().toISOString()
          });
        } finally {
          sending = false;
        }
      };

      writeSse(reply, eventId++, "hello", {
        stream: "workspace",
        topics: options.topics,
        interval_seconds: options.intervalSeconds,
        delivery_id: options.deliveryId ?? null,
        connected_at: new Date().toISOString()
      });
      await pushSnapshot();

      snapshotTimer = setInterval(() => {
        void pushSnapshot();
      }, options.intervalSeconds * 1000);

      heartbeatTimer = setInterval(() => {
        writeSse(reply, eventId++, "heartbeat", { timestamp: new Date().toISOString() });
      }, 15_000);
    }
  );
}

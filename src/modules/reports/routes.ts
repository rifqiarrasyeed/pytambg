import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { PERMISSIONS } from "../../types";
import { notFound, unprocessable } from "../../utils/api-error";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";
import { resolveKpiTrendRange } from "./kpi-trend";
import { writeAudit } from "../../services/audit-service";

const kpiSchema = z.object({
  date: z.string().date().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional()
});

const exportSchema = z.object({
  report_type: z.enum(["KPI_DAILY", "AUDIT_PACK", "STOCK_LEDGER"]),
  date_from: z.string().date(),
  date_to: z.string().date(),
  format: z.enum(["PDF", "XLSX", "CSV"]).default("CSV")
});

type DailyKpiRow = {
  planned: string;
  produced: string;
  delivered: string;
  verified: string;
  waste_qty: string;
};

async function computeDailyKpi(args: { sppgId: string; reportDate: string }) {
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
    [args.sppgId, args.reportDate]
  );

  const row = kpi.rows[0] ?? { planned: "0", produced: "0", delivered: "0", verified: "0", waste_qty: "0" };
  const planned = Number(row.planned);
  const produced = Number(row.produced);
  const delivered = Number(row.delivered);
  const verified = Number(row.verified);
  const wasteQty = Number(row.waste_qty);

  return {
    date: args.reportDate,
    planned,
    produced,
    delivered,
    verified,
    delivered_rate: planned > 0 ? delivered / planned : 0,
    verified_rate: planned > 0 ? verified / planned : 0,
    waste_rate: produced > 0 ? wasteQty / produced : 0
  };
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/reports/kpi",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.REPORT_VIEW);
      const sppgId = requireActiveSppg(request);
      const params = kpiSchema.parse(request.query);
      const reportDate = params.date ?? new Date().toISOString().slice(0, 10);
      const daily = await computeDailyKpi({ sppgId, reportDate });
      return reply.send(daily);
    }
  );

  app.get(
    "/workspace/kpi",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.REPORT_VIEW);
      const sppgId = requireActiveSppg(request);
      const reportDate = new Date().toISOString().slice(0, 10);
      const daily = await computeDailyKpi({ sppgId, reportDate });
      return reply.send(daily);
    }
  );

  app.get(
    "/workspace/summary",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.REPORT_VIEW);
      const sppgId = requireActiveSppg(request);
      const today = new Date().toISOString().slice(0, 10);

      const summary = await query<{
        planning_pending: string;
        po_pending: string;
        production_active: string;
        delivery_active: string;
        verification_pending: string;
        disputes_open: string;
      }>(
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

      return reply.send({
        date: today,
        counters: {
          planning_pending: Number(row.planning_pending),
          po_pending: Number(row.po_pending),
          production_active: Number(row.production_active),
          delivery_active: Number(row.delivery_active),
          verification_pending: Number(row.verification_pending),
          disputes_open: Number(row.disputes_open)
        }
      });
    }
  );

  app.get(
    "/workspace/alerts",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.REPORT_VIEW);
      const sppgId = requireActiveSppg(request);

      const alerts = await query<{
        kind: string;
        severity: string;
        title: string;
        count: string;
      }>(
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

      return reply.send({
        data: alerts.rows.map((row) => ({
          kind: row.kind,
          severity: row.severity,
          title: row.title,
          count: Number(row.count)
        }))
      });
    }
  );

  app.get(
    "/reports/kpi-trend",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.REPORT_VIEW);
      const sppgId = requireActiveSppg(request);
      const params = resolveKpiTrendRange(request.query);

      const trend = await query<{
        date: string;
        planned: string;
        produced: string;
        delivered: string;
        verified: string;
        waste_rate: string;
      }>(
        `
          WITH days AS (
            SELECT generate_series($2::date, $3::date, '1 day'::interval)::date AS date
          ),
          planned AS (
            SELECT mp.plan_date::date AS date, COALESCE(SUM(pi.target_portions), 0) AS qty
            FROM menu_plans mp
            JOIN plan_items pi ON pi.menu_plan_id = mp.id AND pi.sppg_id = mp.sppg_id
            WHERE mp.sppg_id = $1
              AND mp.plan_date BETWEEN $2::date AND $3::date
            GROUP BY mp.plan_date
          ),
          produced AS (
            SELECT pr.run_date::date AS date, COALESCE(SUM(po.output_portions), 0) AS qty
            FROM production_runs pr
            JOIN production_outputs po ON po.production_run_id = pr.id AND po.sppg_id = pr.sppg_id
            WHERE pr.sppg_id = $1
              AND pr.run_date BETWEEN $2::date AND $3::date
            GROUP BY pr.run_date
          ),
          delivered AS (
            SELECT d.planned_departure::date AS date, COALESCE(SUM(di.delivered_portions), 0) AS qty
            FROM deliveries d
            JOIN delivery_stops ds ON ds.delivery_id = d.id AND ds.sppg_id = d.sppg_id
            JOIN delivery_items di ON di.delivery_stop_id = ds.id AND di.sppg_id = d.sppg_id
            WHERE d.sppg_id = $1
              AND d.planned_departure::date BETWEEN $2::date AND $3::date
            GROUP BY d.planned_departure::date
          ),
          verified AS (
            SELECT d.planned_departure::date AS date, COALESCE(SUM(di.delivered_portions), 0) AS qty
            FROM deliveries d
            JOIN delivery_stops ds ON ds.delivery_id = d.id AND ds.sppg_id = d.sppg_id
            JOIN delivery_items di ON di.delivery_stop_id = ds.id AND di.sppg_id = d.sppg_id
            WHERE d.sppg_id = $1
              AND d.planned_departure::date BETWEEN $2::date AND $3::date
              AND ds.status IN ('VERIFIED','LOCKED')
            GROUP BY d.planned_departure::date
          ),
          waste AS (
            SELECT event_time::date AS date, COALESCE(SUM(ABS(qty)), 0) AS qty
            FROM waste_events
            WHERE sppg_id = $1
              AND event_time::date BETWEEN $2::date AND $3::date
            GROUP BY event_time::date
          )
          SELECT
            d.date::text AS date,
            COALESCE(p.qty, 0)::text AS planned,
            COALESCE(pr.qty, 0)::text AS produced,
            COALESCE(dl.qty, 0)::text AS delivered,
            COALESCE(v.qty, 0)::text AS verified,
            CASE WHEN COALESCE(pr.qty, 0) > 0
              THEN (COALESCE(w.qty, 0)::numeric / pr.qty::numeric)
              ELSE 0::numeric
            END::text AS waste_rate
          FROM days d
          LEFT JOIN planned p ON p.date = d.date
          LEFT JOIN produced pr ON pr.date = d.date
          LEFT JOIN delivered dl ON dl.date = d.date
          LEFT JOIN verified v ON v.date = d.date
          LEFT JOIN waste w ON w.date = d.date
          ORDER BY d.date ASC
        `,
        [sppgId, params.dateFrom, params.dateTo]
      );

      return reply.send({
        date_from: params.dateFrom,
        date_to: params.dateTo,
        granularity: params.granularity,
        series: trend.rows.map((row) => ({
          date: row.date,
          planned: Number(row.planned),
          produced: Number(row.produced),
          delivered: Number(row.delivered),
          verified: Number(row.verified),
          waste_rate: Number(row.waste_rate)
        }))
      });
    }
  );

  app.post(
    "/reports/export",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.REPORT_EXPORT);
      const sppgId = requireActiveSppg(request);
      const body = exportSchema.parse(request.body);

      const jobId = randomUUID();
      await query(
        `
          INSERT INTO reports_jobs (
            id, sppg_id, report_type, format, payload, status,
            created_at, created_by, updated_at, updated_by
          ) VALUES (
            $1, $2, $3, $4, $5::jsonb, 'QUEUED',
            now(), $6, now(), $6
          )
        `,
        [jobId, sppgId, body.report_type, body.format, JSON.stringify(body), request.auth!.user_id]
      );

      await writeAudit({
        sppgId,
        entityTable: "reports_jobs",
        entityId: jobId,
        action: "CREATE",
        newValue: body,
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.status(202).send({
        job_id: jobId,
        status: "QUEUED",
        message: "Export dijadwalkan di background worker"
      });
    }
  );

  app.get(
    "/reports/jobs",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.REPORT_VIEW);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          created_at: "created_at",
          status: "status",
          report_type: "report_type",
          format: "format"
        },
        fallback: "created_at DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk reports/jobs");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM reports_jobs
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR created_at::date >= $3::date)
            AND ($4::date IS NULL OR created_at::date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const rows = await query<{
        id: string;
        report_type: string;
        format: string;
        status: string;
        result_attachment_id: string | null;
        error_message: string | null;
        created_at: string;
      }>(
        `
          SELECT id, report_type, format, status, result_attachment_id, error_message, created_at
          FROM reports_jobs
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR created_at::date >= $3::date)
            AND ($4::date IS NULL OR created_at::date <= $4::date)
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

  app.get(
    "/reports/jobs/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.REPORT_VIEW);
      const sppgId = requireActiveSppg(request);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);

      const row = await query<{
        id: string;
        report_type: string;
        format: string;
        status: string;
        payload: Record<string, unknown>;
        result_attachment_id: string | null;
        error_message: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            id, report_type, format, status, payload, result_attachment_id,
            error_message, created_at, updated_at
          FROM reports_jobs
          WHERE id = $1 AND sppg_id = $2
          LIMIT 1
        `,
        [params.id, sppgId]
      );

      if (row.rowCount === 0) {
        throw notFound("Report job tidak ditemukan");
      }

      return reply.send(row.rows[0]);
    }
  );
}

import { createHash, randomUUID } from "node:crypto";
import { config } from "../config";
import { pool, query } from "../db/pool";
import { resolveBucket, uploadTextObject } from "../services/supabase-storage";

type ReportJob = {
  id: string;
  sppg_id: string;
  report_type: "KPI_DAILY" | "AUDIT_PACK" | "STOCK_LEDGER";
  format: "PDF" | "XLSX" | "CSV";
  payload: {
    date_from: string;
    date_to: string;
    report_type: string;
    format: string;
  };
  created_by: string | null;
};

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return "no_data\n";
  }

  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    const raw = value === null || value === undefined ? "" : String(value);
    if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
      return `"${raw.replaceAll("\"", "\"\"")}"`;
    }
    return raw;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((key) => escape(row[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function claimNextJob(): Promise<ReportJob | null> {
  const claimed = await query<ReportJob>(
    `
      WITH next_job AS (
        SELECT id
        FROM reports_jobs
        WHERE status = 'QUEUED'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE reports_jobs rj
      SET status = 'RUNNING',
          error_message = NULL,
          updated_at = now()
      FROM next_job
      WHERE rj.id = next_job.id
      RETURNING rj.id, rj.sppg_id, rj.report_type, rj.format, rj.payload, rj.created_by
    `
  );

  return claimed.rows[0] ?? null;
}

async function buildReportCsv(job: ReportJob): Promise<{ fileName: string; content: string }> {
  const { sppg_id: sppgId } = job;
  const dateFrom = job.payload.date_from;
  const dateTo = job.payload.date_to;

  if (job.report_type === "KPI_DAILY") {
    const result = await query<Record<string, unknown>>(
      `
        WITH planned AS (
          SELECT mp.plan_date::text AS day, SUM(pi.target_portions)::numeric AS planned
          FROM menu_plans mp
          JOIN plan_items pi ON pi.menu_plan_id = mp.id AND pi.sppg_id = mp.sppg_id
          WHERE mp.sppg_id = $1 AND mp.plan_date BETWEEN $2::date AND $3::date
          GROUP BY mp.plan_date
        ),
        produced AS (
          SELECT pr.run_date::text AS day, SUM(po.output_portions)::numeric AS produced
          FROM production_runs pr
          JOIN production_outputs po ON po.production_run_id = pr.id AND po.sppg_id = pr.sppg_id
          WHERE pr.sppg_id = $1 AND pr.run_date BETWEEN $2::date AND $3::date
          GROUP BY pr.run_date
        ),
        delivered AS (
          SELECT DATE(d.planned_departure)::text AS day, SUM(di.delivered_portions)::numeric AS delivered
          FROM deliveries d
          JOIN delivery_stops ds ON ds.delivery_id = d.id AND ds.sppg_id = d.sppg_id
          JOIN delivery_items di ON di.delivery_stop_id = ds.id AND di.sppg_id = d.sppg_id
          WHERE d.sppg_id = $1 AND DATE(d.planned_departure) BETWEEN $2::date AND $3::date
          GROUP BY DATE(d.planned_departure)
        ),
        verified AS (
          SELECT DATE(d.planned_departure)::text AS day, SUM(di.delivered_portions)::numeric AS verified
          FROM deliveries d
          JOIN delivery_stops ds ON ds.delivery_id = d.id AND ds.sppg_id = d.sppg_id
          JOIN delivery_items di ON di.delivery_stop_id = ds.id AND di.sppg_id = d.sppg_id
          WHERE d.sppg_id = $1
            AND DATE(d.planned_departure) BETWEEN $2::date AND $3::date
            AND ds.status IN ('VERIFIED', 'LOCKED')
          GROUP BY DATE(d.planned_departure)
        )
        SELECT
          COALESCE(p.day, pr.day, d.day, v.day) AS day,
          COALESCE(p.planned, 0) AS planned,
          COALESCE(pr.produced, 0) AS produced,
          COALESCE(d.delivered, 0) AS delivered,
          COALESCE(v.verified, 0) AS verified
        FROM planned p
        FULL OUTER JOIN produced pr ON pr.day = p.day
        FULL OUTER JOIN delivered d ON d.day = COALESCE(p.day, pr.day)
        FULL OUTER JOIN verified v ON v.day = COALESCE(p.day, pr.day, d.day)
        ORDER BY day ASC
      `,
      [sppgId, dateFrom, dateTo]
    );
    return {
      fileName: `kpi-daily-${dateFrom}-${dateTo}.csv`,
      content: toCsv(result.rows)
    };
  }

  if (job.report_type === "STOCK_LEDGER") {
    const result = await query<Record<string, unknown>>(
      `
        SELECT
          created_at,
          move_no,
          move_type,
          item_id,
          batch_id,
          qty,
          reason_code,
          ref_table,
          ref_id,
          is_void
        FROM stock_moves
        WHERE sppg_id = $1
          AND DATE(created_at) BETWEEN $2::date AND $3::date
        ORDER BY created_at ASC, move_no ASC
      `,
      [sppgId, dateFrom, dateTo]
    );
    return {
      fileName: `stock-ledger-${dateFrom}-${dateTo}.csv`,
      content: toCsv(result.rows)
    };
  }

  const result = await query<Record<string, unknown>>(
    `
      SELECT
        a.occurred_at,
        a.actor_user_id,
        a.actor_role,
        a.entity_table,
        a.entity_id,
        a.action
      FROM audit_logs a
      WHERE a.sppg_id = $1
        AND DATE(a.occurred_at) BETWEEN $2::date AND $3::date
      ORDER BY a.occurred_at DESC
    `,
    [sppgId, dateFrom, dateTo]
  );
  return {
    fileName: `audit-pack-${dateFrom}-${dateTo}.csv`,
    content: toCsv(result.rows)
  };
}

async function markFailed(jobId: string, message: string): Promise<void> {
  await query(
    `
      UPDATE reports_jobs
      SET status = 'FAILED',
          error_message = $2,
          updated_at = now()
      WHERE id = $1
    `,
    [jobId, message.slice(0, 2000)]
  );
}

async function markSucceeded(job: ReportJob, fileName: string, objectKey: string, content: string): Promise<void> {
  const bucket = resolveBucket("export");
  const checksum = createHash("sha256").update(content, "utf8").digest("hex");
  const sizeBytes = Buffer.byteLength(content, "utf8");
  const attachmentId = randomUUID();

  await query(
    `
      INSERT INTO attachments (
        id, sppg_id, bucket_name, object_key, file_name, mime_type, size_bytes,
        checksum_sha256, uploaded_by, uploaded_at, captured_at, captured_by,
        created_at, created_by, updated_at, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, 'text/csv', $6,
        $7, $8, now(), NULL, $8,
        now(), $8, now(), $8
      )
    `,
    [attachmentId, job.sppg_id, bucket, objectKey, fileName, sizeBytes, checksum, job.created_by]
  );

  await query(
    `
      UPDATE reports_jobs
      SET status = 'SUCCEEDED',
          result_attachment_id = $2,
          updated_at = now()
      WHERE id = $1
    `,
    [job.id, attachmentId]
  );
}

async function processOneJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) {
    return false;
  }

  try {
    const report = await buildReportCsv(job);
    const bucket = resolveBucket("export");
    const now = new Date();
    const yyyy = now.getUTCFullYear().toString();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const objectKey = `${job.sppg_id}/export/${yyyy}/${mm}/${job.id}/${report.fileName}`;

    await uploadTextObject({
      bucket,
      objectKey,
      content: report.content,
      contentType: "text/csv"
    });

    await markSucceeded(job, report.fileName, objectKey, report.content);
    // eslint-disable-next-line no-console
    console.info(`[report-worker] Job ${job.id} selesai (${job.report_type})`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await markFailed(job.id, message);
    // eslint-disable-next-line no-console
    console.error(`[report-worker] Job ${job.id} gagal: ${message}`);
    return true;
  }
}

async function run(): Promise<void> {
  const once = process.argv.includes("--once");

  if (once) {
    await processOneJob();
    await pool.end();
    return;
  }

  const intervalMs = Number.parseInt(process.env.REPORT_WORKER_INTERVAL_MS ?? "5000", 10);
  // eslint-disable-next-line no-console
  console.info(`[report-worker] started interval=${intervalMs}ms on ${config.host}:${config.port}`);

  const timer = setInterval(async () => {
    try {
      await processOneJob();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[report-worker] loop error", error);
    }
  }, intervalMs);

  const stop = async () => {
    clearInterval(timer);
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("[report-worker] fatal", error);
  await pool.end();
  process.exit(1);
});

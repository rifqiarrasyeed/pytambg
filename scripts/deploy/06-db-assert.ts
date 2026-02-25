import { Client } from "pg";
import "./_env";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

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
  ];

const forceRlsTables = ["audit_logs", "stock_moves", "attachments", "entity_attachments", "delivery_proofs"];

const criticalTenancyTables = [
  "menu_plans",
  "plan_items",
  "purchases",
  "purchase_items",
  "receipts",
  "receipt_items",
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
  "delivery_proofs",
  "disputes",
  "waste_events",
  "incident_logs",
  "attachments",
  "audit_logs",
  "period_locks"
];

function assertEmpty(rows: unknown[], message: string): void {
  if (rows.length > 0) {
    const preview = JSON.stringify(rows.slice(0, 10));
    throw new Error(`${message}. Sample: ${preview}`);
  }
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: required("DATABASE_URL") });
  await client.connect();

  try {
    const missingRls = await client.query<{ table_name: string }>(
      `
        WITH t AS (SELECT unnest($1::text[]) AS table_name)
        SELECT t.table_name
        FROM t
        LEFT JOIN pg_class c ON c.relname = t.table_name
        LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND (c.relrowsecurity IS DISTINCT FROM true)
      `,
      [protectedTables]
    );
    assertEmpty(missingRls.rows, "RLS belum aktif di tabel protected");

    const missingPolicy = await client.query<{ table_name: string }>(
      `
        WITH t AS (SELECT unnest($1::text[]) AS table_name)
        SELECT t.table_name
        FROM t
        LEFT JOIN pg_policies p
          ON p.schemaname = 'public'
         AND p.tablename = t.table_name
         AND p.policyname = 'deny_all_clients'
        WHERE p.policyname IS NULL
      `,
      [protectedTables]
    );
    assertEmpty(missingPolicy.rows, "Policy deny_all_clients belum ada");

    const missingForceRls = await client.query<{ table_name: string }>(
      `
        WITH t AS (SELECT unnest($1::text[]) AS table_name)
        SELECT t.table_name
        FROM t
        LEFT JOIN pg_class c ON c.relname = t.table_name
        LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND (c.relforcerowsecurity IS DISTINCT FROM true)
      `,
      [forceRlsTables]
    );
    assertEmpty(missingForceRls.rows, "FORCE RLS belum aktif di tabel sensitif");

    const leakedGrants = await client.query<{ grantee: string; table_name: string; privilege_type: string }>(
      `
        SELECT grantee, table_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee IN ('anon', 'authenticated')
      `
    );
    assertEmpty(leakedGrants.rows, "Masih ada grant table-level ke anon/authenticated");

    const requiredTriggers = [
      "trg_prevent_stock_moves_update",
      "trg_prevent_stock_moves_delete",
      "trg_prevent_audit_logs_update",
      "trg_prevent_audit_logs_delete"
    ];
    const triggerRows = await client.query<{ tgname: string; tgenabled: string }>(
      `
        SELECT tgname, tgenabled
        FROM pg_trigger
        WHERE tgname = ANY($1::text[])
      `,
      [requiredTriggers]
    );
    const triggerMap = new Map(triggerRows.rows.map((row) => [row.tgname, row.tgenabled]));
    for (const name of requiredTriggers) {
      const enabled = triggerMap.get(name);
      if (enabled !== "O") {
        throw new Error(`Trigger integritas tidak aktif: ${name} (state=${enabled ?? "missing"})`);
      }
    }

    const nullableSppg = await client.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
          AND column_name = 'sppg_id'
          AND is_nullable = 'YES'
      `,
      [criticalTenancyTables]
    );
    assertEmpty(nullableSppg.rows, "Masih ada tabel transaksi dengan sppg_id nullable");

    const missingSppgColumn = await client.query<{ table_name: string }>(
      `
        WITH t AS (SELECT unnest($1::text[]) AS table_name)
        SELECT t.table_name
        FROM t
        LEFT JOIN information_schema.columns c
          ON c.table_schema = 'public'
         AND c.table_name = t.table_name
         AND c.column_name = 'sppg_id'
        WHERE c.column_name IS NULL
      `,
      [criticalTenancyTables]
    );
    assertEmpty(missingSppgColumn.rows, "Masih ada tabel transaksi tanpa kolom sppg_id");

    const mismatchedAttachmentLinks = await client.query(
      `
        SELECT ea.id
        FROM entity_attachments ea
        JOIN attachments a ON a.id = ea.attachment_id
        WHERE ea.sppg_id <> a.sppg_id
      `
    );
    assertEmpty(mismatchedAttachmentLinks.rows, "Ditemukan entity_attachments lintas tenant");

    // Pastikan MV terbarui sebelum validasi konsistensi ledger.
    await client.query("REFRESH MATERIALIZED VIEW stock_balances_mv");

    const stockDelta = await client.query(
      `
        WITH ledger AS (
          SELECT
            sppg_id,
            item_id,
            batch_id,
            SUM(CASE WHEN is_void THEN 0 ELSE qty END) AS ledger_qty
          FROM stock_moves
          GROUP BY sppg_id, item_id, batch_id
        )
        SELECT 1
        FROM stock_balances_mv mv
        FULL OUTER JOIN ledger
          ON ledger.sppg_id = mv.sppg_id
         AND ledger.item_id = mv.item_id
         AND (
            (ledger.batch_id IS NULL AND mv.batch_id IS NULL)
            OR ledger.batch_id = mv.batch_id
         )
        WHERE COALESCE(mv.on_hand_qty, 0) <> COALESCE(ledger.ledger_qty, 0)
      `
    );
    assertEmpty(stockDelta.rows, "stock_balances_mv tidak konsisten dengan ledger");

    // eslint-disable-next-line no-console
    console.info("[db-assert] all checks passed");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[db-assert] failed", error);
  process.exit(1);
});

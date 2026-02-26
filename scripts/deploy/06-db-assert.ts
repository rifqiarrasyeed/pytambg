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

const forceRlsTables = [
  "audit_logs",
  "stock_moves",
  "attachments",
  "entity_attachments",
  "delivery_proofs",
  "reports_jobs",
  "idempotency_keys"
];

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
    const existingTables = await client.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      `
    );
    const existingSet = new Set(existingTables.rows.map((row) => row.table_name));

    const staleProtected = protectedTables.filter((tableName) => !existingSet.has(tableName));
    assertEmpty(staleProtected.map((table_name) => ({ table_name })), "Ada protected table di checker yang tidak ada di schema");

    const tenantTables = await client.query<{ table_name: string }>(
      `
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'sppg_id'
          AND table_name <> 'stock_balances_mv'
      `
    );
    const protectedSet = new Set(protectedTables);
    const missingProtected = tenantTables.rows
      .map((row) => row.table_name)
      .filter((tableName) => !protectedSet.has(tableName));
    assertEmpty(
      missingProtected.map((table_name) => ({ table_name })),
      "Ada tabel tenancy (punya sppg_id) yang belum masuk protected checker"
    );

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

    const constraintRows = await client.query<{ conname: string; convalidated: boolean }>(
      `
        SELECT conname, convalidated
        FROM pg_constraint
        WHERE conname = ANY($1::text[])
      `,
      [requiredTenantConstraints]
    );
    const constraintMap = new Map(constraintRows.rows.map((row) => [row.conname, row.convalidated]));
    for (const constraint of requiredTenantConstraints) {
      if (!constraintMap.has(constraint)) {
        throw new Error(`Constraint tenant wajib belum ada: ${constraint}`);
      }
      if (constraintMap.get(constraint) !== true) {
        throw new Error(`Constraint tenant wajib belum validated: ${constraint}`);
      }
    }

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

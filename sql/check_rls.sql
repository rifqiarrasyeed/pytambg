-- Verifikasi RLS deny-all untuk role client (anon/authenticated).
-- Output ideal:
-- 1) Semua tabel protected memiliki relrowsecurity = true.
-- 2) Semua tabel protected memiliki policy deny_all_clients.
-- 3) Tidak ada privilege table langsung untuk anon/authenticated.

WITH protected_tables AS (
  SELECT unnest(
    ARRAY[
      'sppg','sppg_settings','sppg_setting_versions',
      'users','roles','permissions','role_permissions','user_sppg','sessions_tokens',
      'units','schools','school_user_access','routes','route_schools','vendors','inventory_items',
      'recipe_templates','recipes','recipe_items',
      'menu_plans','plan_items',
      'purchases','purchase_items','receipts','receipt_items','vendor_invoices',
      'inventory_batches','stock_moves','stock_opnames','stock_opname_lines',
      'production_runs','production_inputs','production_outputs','qc_checks','packing_lines',
      'deliveries','delivery_stops','delivery_items','attachments','entity_attachments','delivery_proofs','disputes',
      'waste_events','incident_logs',
      'audit_logs','change_requests','period_locks','idempotency_keys','reports_jobs'
    ]
  ) AS table_name
)
SELECT
  p.table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM protected_tables p
LEFT JOIN pg_class c ON c.relname = p.table_name
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY p.table_name;

-- Tabel sensitif yang wajib FORCE RLS (defense-in-depth).
SELECT relname AS table_name, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname IN (
  'audit_logs',
  'stock_moves',
  'attachments',
  'entity_attachments',
  'delivery_proofs',
  'reports_jobs',
  'idempotency_keys'
)
ORDER BY relname;

WITH protected_tables AS (
  SELECT unnest(
    ARRAY[
      'sppg','sppg_settings','sppg_setting_versions',
      'users','roles','permissions','role_permissions','user_sppg','sessions_tokens',
      'units','schools','school_user_access','routes','route_schools','vendors','inventory_items',
      'recipe_templates','recipes','recipe_items',
      'menu_plans','plan_items',
      'purchases','purchase_items','receipts','receipt_items','vendor_invoices',
      'inventory_batches','stock_moves','stock_opnames','stock_opname_lines',
      'production_runs','production_inputs','production_outputs','qc_checks','packing_lines',
      'deliveries','delivery_stops','delivery_items','attachments','entity_attachments','delivery_proofs','disputes',
      'waste_events','incident_logs',
      'audit_logs','change_requests','period_locks','idempotency_keys','reports_jobs'
    ]
  ) AS table_name
)
SELECT
  p.table_name,
  pol.policyname,
  pol.permissive,
  pol.roles,
  pol.cmd
FROM protected_tables p
LEFT JOIN pg_policies pol
  ON pol.schemaname = 'public'
 AND pol.tablename = p.table_name
 AND pol.policyname = 'deny_all_clients'
ORDER BY p.table_name;

-- Harus kosong (jika masih ada artinya anon/authenticated masih punya hak table-level).
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, table_name, privilege_type;

-- Sinkronisasi daftar protected table vs tabel tenancy (berbasis kolom sppg_id).
WITH protected_tables AS (
  SELECT unnest(
    ARRAY[
      'sppg','sppg_settings','sppg_setting_versions',
      'users','roles','permissions','role_permissions','user_sppg','sessions_tokens',
      'units','schools','school_user_access','routes','route_schools','vendors','inventory_items',
      'recipe_templates','recipes','recipe_items',
      'menu_plans','plan_items',
      'purchases','purchase_items','receipts','receipt_items','vendor_invoices',
      'inventory_batches','stock_moves','stock_opnames','stock_opname_lines',
      'production_runs','production_inputs','production_outputs','qc_checks','packing_lines',
      'deliveries','delivery_stops','delivery_items','attachments','entity_attachments','delivery_proofs','disputes',
      'waste_events','incident_logs',
      'audit_logs','change_requests','period_locks','idempotency_keys','reports_jobs'
    ]
  ) AS table_name
),
tenant_tables AS (
  SELECT DISTINCT table_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'sppg_id'
    AND table_name <> 'stock_balances_mv'
)
SELECT 'MISSING_IN_PROTECTED' AS issue, tt.table_name
FROM tenant_tables tt
LEFT JOIN protected_tables pt ON pt.table_name = tt.table_name
WHERE pt.table_name IS NULL
UNION ALL
SELECT 'PROTECTED_BUT_NO_SPPG_COLUMN' AS issue, pt.table_name
FROM protected_tables pt
LEFT JOIN tenant_tables tt ON tt.table_name = pt.table_name
WHERE tt.table_name IS NULL
ORDER BY issue, table_name;

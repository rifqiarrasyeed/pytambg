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
WHERE relname IN ('audit_logs', 'stock_moves', 'attachments', 'entity_attachments', 'delivery_proofs')
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

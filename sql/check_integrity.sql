-- 1) Semua tabel transaksi kritikal wajib punya sppg_id not null.
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'menu_plans','plan_items',
    'purchases','purchase_items','receipts','receipt_items',
    'inventory_batches','stock_moves','stock_opnames','stock_opname_lines',
    'production_runs','production_inputs','production_outputs','qc_checks','packing_lines',
    'deliveries','delivery_stops','delivery_items','delivery_proofs','disputes',
    'waste_events','incident_logs','attachments','audit_logs','period_locks'
  )
  AND column_name = 'sppg_id';

-- 2) Ledger stok append-only check.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname IN (
  'trg_prevent_stock_moves_update',
  'trg_prevent_stock_moves_delete'
);

-- 3) Audit log write-once check.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname IN (
  'trg_prevent_audit_logs_update',
  'trg_prevent_audit_logs_delete'
);

-- 3b) Attachment link tenancy consistency check.
SELECT ea.id, ea.sppg_id AS link_sppg_id, a.sppg_id AS attachment_sppg_id, ea.entity_table, ea.entity_id, ea.attachment_id
FROM entity_attachments ea
JOIN attachments a ON a.id = ea.attachment_id
WHERE ea.sppg_id <> a.sppg_id;

-- 4) Konsistensi saldo stok vs agregasi stock_moves.
WITH ledger AS (
  SELECT
    sppg_id,
    item_id,
    batch_id,
    SUM(CASE WHEN is_void THEN 0 ELSE qty END) AS ledger_qty
  FROM stock_moves
  GROUP BY sppg_id, item_id, batch_id
)
SELECT
  COALESCE(mv.sppg_id, ledger.sppg_id) AS sppg_id,
  COALESCE(mv.item_id, ledger.item_id) AS item_id,
  COALESCE(mv.batch_id, ledger.batch_id) AS batch_id,
  COALESCE(mv.on_hand_qty, 0) AS mv_qty,
  COALESCE(ledger.ledger_qty, 0) AS ledger_qty,
  COALESCE(mv.on_hand_qty, 0) - COALESCE(ledger.ledger_qty, 0) AS delta
FROM stock_balances_mv mv
FULL OUTER JOIN ledger
  ON ledger.sppg_id = mv.sppg_id
 AND ledger.item_id = mv.item_id
 AND (
   (ledger.batch_id IS NULL AND mv.batch_id IS NULL)
   OR ledger.batch_id = mv.batch_id
 )
WHERE COALESCE(mv.on_hand_qty, 0) <> COALESCE(ledger.ledger_qty, 0);

-- 5) Verifikasi constraint tenant composite FK utama (missing / belum validated).
WITH required_constraints AS (
  SELECT unnest(
    ARRAY[
      'fk_plan_items_menu_plan_tenant',
      'fk_plan_items_school_tenant',
      'fk_plan_items_recipe_tenant',
      'fk_purchase_items_purchase_tenant',
      'fk_purchase_items_item_tenant',
      'fk_receipts_purchase_tenant',
      'fk_receipt_items_receipt_tenant',
      'fk_receipt_items_purchase_item_tenant',
      'fk_inventory_batches_item_tenant',
      'fk_inventory_batches_receipt_item_tenant',
      'fk_stock_moves_item_tenant',
      'fk_stock_moves_batch_tenant',
      'fk_stock_moves_uom_tenant',
      'fk_stock_opname_lines_opname_tenant',
      'fk_stock_opname_lines_item_tenant',
      'fk_stock_opname_lines_batch_tenant',
      'fk_production_runs_menu_plan_tenant',
      'fk_production_inputs_run_tenant',
      'fk_production_inputs_stock_move_tenant',
      'fk_production_inputs_item_tenant',
      'fk_production_outputs_run_tenant',
      'fk_production_outputs_school_tenant',
      'fk_production_outputs_recipe_tenant',
      'fk_qc_checks_run_tenant',
      'fk_qc_checks_attachment_tenant',
      'fk_packing_lines_run_tenant',
      'fk_packing_lines_school_tenant',
      'fk_deliveries_route_tenant',
      'fk_delivery_stops_delivery_tenant',
      'fk_delivery_stops_school_tenant',
      'fk_delivery_items_stop_tenant',
      'fk_delivery_items_packing_tenant',
      'fk_delivery_proofs_stop_tenant',
      'fk_delivery_proofs_attachment_tenant',
      'fk_disputes_stop_tenant',
      'fk_route_schools_route_tenant',
      'fk_route_schools_school_tenant',
      'fk_school_user_access_school_tenant',
      'fk_recipe_items_recipe_tenant',
      'fk_recipe_items_item_tenant',
      'fk_vendor_invoices_vendor_tenant',
      'fk_entity_attachments_attachment_tenant',
      'fk_waste_events_item_tenant',
      'fk_waste_events_batch_tenant',
      'fk_reports_jobs_attachment_tenant'
    ]
  ) AS conname
)
SELECT
  rc.conname,
  c.convalidated
FROM required_constraints rc
LEFT JOIN pg_constraint c ON c.conname = rc.conname
WHERE c.conname IS NULL OR c.convalidated IS DISTINCT FROM true
ORDER BY rc.conname;

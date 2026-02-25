-- Big-bang hardening: tenant composite FK, checks, indexes, dan util integrity.
-- Aman dijalankan berulang (idempotent).

-- 1) Composite unique index parent tables untuk referensi (id, sppg_id)
CREATE UNIQUE INDEX IF NOT EXISTS ux_menu_plans_id_sppg ON menu_plans (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_schools_id_sppg ON schools (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_recipes_id_sppg ON recipes (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_routes_id_sppg ON routes (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vendors_id_sppg ON vendors (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_items_id_sppg ON inventory_items (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchases_id_sppg ON purchases (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_items_id_sppg ON purchase_items (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_receipts_id_sppg ON receipts (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_batches_id_sppg ON inventory_batches (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_moves_id_sppg ON stock_moves (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_opnames_id_sppg ON stock_opnames (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_production_runs_id_sppg ON production_runs (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_packing_lines_id_sppg ON packing_lines (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_deliveries_id_sppg ON deliveries (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_delivery_stops_id_sppg ON delivery_stops (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_attachments_id_sppg ON attachments (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_disputes_id_sppg ON disputes (id, sppg_id);

-- 2) Composite FK critical anti cross-tenant reference
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plan_items_menu_plan_tenant') THEN
    ALTER TABLE plan_items
      ADD CONSTRAINT fk_plan_items_menu_plan_tenant
      FOREIGN KEY (menu_plan_id, sppg_id) REFERENCES menu_plans (id, sppg_id) NOT VALID;
    ALTER TABLE plan_items VALIDATE CONSTRAINT fk_plan_items_menu_plan_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plan_items_school_tenant') THEN
    ALTER TABLE plan_items
      ADD CONSTRAINT fk_plan_items_school_tenant
      FOREIGN KEY (school_id, sppg_id) REFERENCES schools (id, sppg_id) NOT VALID;
    ALTER TABLE plan_items VALIDATE CONSTRAINT fk_plan_items_school_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plan_items_recipe_tenant') THEN
    ALTER TABLE plan_items
      ADD CONSTRAINT fk_plan_items_recipe_tenant
      FOREIGN KEY (recipe_id, sppg_id) REFERENCES recipes (id, sppg_id) NOT VALID;
    ALTER TABLE plan_items VALIDATE CONSTRAINT fk_plan_items_recipe_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_purchase_items_purchase_tenant') THEN
    ALTER TABLE purchase_items
      ADD CONSTRAINT fk_purchase_items_purchase_tenant
      FOREIGN KEY (purchase_id, sppg_id) REFERENCES purchases (id, sppg_id) NOT VALID;
    ALTER TABLE purchase_items VALIDATE CONSTRAINT fk_purchase_items_purchase_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_purchase_items_item_tenant') THEN
    ALTER TABLE purchase_items
      ADD CONSTRAINT fk_purchase_items_item_tenant
      FOREIGN KEY (item_id, sppg_id) REFERENCES inventory_items (id, sppg_id) NOT VALID;
    ALTER TABLE purchase_items VALIDATE CONSTRAINT fk_purchase_items_item_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_purchase_tenant') THEN
    ALTER TABLE receipts
      ADD CONSTRAINT fk_receipts_purchase_tenant
      FOREIGN KEY (purchase_id, sppg_id) REFERENCES purchases (id, sppg_id) NOT VALID;
    ALTER TABLE receipts VALIDATE CONSTRAINT fk_receipts_purchase_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipt_items_receipt_tenant') THEN
    ALTER TABLE receipt_items
      ADD CONSTRAINT fk_receipt_items_receipt_tenant
      FOREIGN KEY (receipt_id, sppg_id) REFERENCES receipts (id, sppg_id) NOT VALID;
    ALTER TABLE receipt_items VALIDATE CONSTRAINT fk_receipt_items_receipt_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipt_items_purchase_item_tenant') THEN
    ALTER TABLE receipt_items
      ADD CONSTRAINT fk_receipt_items_purchase_item_tenant
      FOREIGN KEY (purchase_item_id, sppg_id) REFERENCES purchase_items (id, sppg_id) NOT VALID;
    ALTER TABLE receipt_items VALIDATE CONSTRAINT fk_receipt_items_purchase_item_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_batches_item_tenant') THEN
    ALTER TABLE inventory_batches
      ADD CONSTRAINT fk_inventory_batches_item_tenant
      FOREIGN KEY (item_id, sppg_id) REFERENCES inventory_items (id, sppg_id) NOT VALID;
    ALTER TABLE inventory_batches VALIDATE CONSTRAINT fk_inventory_batches_item_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_moves_item_tenant') THEN
    ALTER TABLE stock_moves
      ADD CONSTRAINT fk_stock_moves_item_tenant
      FOREIGN KEY (item_id, sppg_id) REFERENCES inventory_items (id, sppg_id) NOT VALID;
    ALTER TABLE stock_moves VALIDATE CONSTRAINT fk_stock_moves_item_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_moves_batch_tenant') THEN
    ALTER TABLE stock_moves
      ADD CONSTRAINT fk_stock_moves_batch_tenant
      FOREIGN KEY (batch_id, sppg_id) REFERENCES inventory_batches (id, sppg_id) NOT VALID;
    ALTER TABLE stock_moves VALIDATE CONSTRAINT fk_stock_moves_batch_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_opname_lines_opname_tenant') THEN
    ALTER TABLE stock_opname_lines
      ADD CONSTRAINT fk_stock_opname_lines_opname_tenant
      FOREIGN KEY (opname_id, sppg_id) REFERENCES stock_opnames (id, sppg_id) NOT VALID;
    ALTER TABLE stock_opname_lines VALIDATE CONSTRAINT fk_stock_opname_lines_opname_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_production_inputs_run_tenant') THEN
    ALTER TABLE production_inputs
      ADD CONSTRAINT fk_production_inputs_run_tenant
      FOREIGN KEY (production_run_id, sppg_id) REFERENCES production_runs (id, sppg_id) NOT VALID;
    ALTER TABLE production_inputs VALIDATE CONSTRAINT fk_production_inputs_run_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_production_inputs_stock_move_tenant') THEN
    ALTER TABLE production_inputs
      ADD CONSTRAINT fk_production_inputs_stock_move_tenant
      FOREIGN KEY (stock_move_id, sppg_id) REFERENCES stock_moves (id, sppg_id) NOT VALID;
    ALTER TABLE production_inputs VALIDATE CONSTRAINT fk_production_inputs_stock_move_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_production_outputs_run_tenant') THEN
    ALTER TABLE production_outputs
      ADD CONSTRAINT fk_production_outputs_run_tenant
      FOREIGN KEY (production_run_id, sppg_id) REFERENCES production_runs (id, sppg_id) NOT VALID;
    ALTER TABLE production_outputs VALIDATE CONSTRAINT fk_production_outputs_run_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_production_outputs_school_tenant') THEN
    ALTER TABLE production_outputs
      ADD CONSTRAINT fk_production_outputs_school_tenant
      FOREIGN KEY (school_id, sppg_id) REFERENCES schools (id, sppg_id) NOT VALID;
    ALTER TABLE production_outputs VALIDATE CONSTRAINT fk_production_outputs_school_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_production_outputs_recipe_tenant') THEN
    ALTER TABLE production_outputs
      ADD CONSTRAINT fk_production_outputs_recipe_tenant
      FOREIGN KEY (recipe_id, sppg_id) REFERENCES recipes (id, sppg_id) NOT VALID;
    ALTER TABLE production_outputs VALIDATE CONSTRAINT fk_production_outputs_recipe_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_qc_checks_run_tenant') THEN
    ALTER TABLE qc_checks
      ADD CONSTRAINT fk_qc_checks_run_tenant
      FOREIGN KEY (production_run_id, sppg_id) REFERENCES production_runs (id, sppg_id) NOT VALID;
    ALTER TABLE qc_checks VALIDATE CONSTRAINT fk_qc_checks_run_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_packing_lines_run_tenant') THEN
    ALTER TABLE packing_lines
      ADD CONSTRAINT fk_packing_lines_run_tenant
      FOREIGN KEY (production_run_id, sppg_id) REFERENCES production_runs (id, sppg_id) NOT VALID;
    ALTER TABLE packing_lines VALIDATE CONSTRAINT fk_packing_lines_run_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_packing_lines_school_tenant') THEN
    ALTER TABLE packing_lines
      ADD CONSTRAINT fk_packing_lines_school_tenant
      FOREIGN KEY (school_id, sppg_id) REFERENCES schools (id, sppg_id) NOT VALID;
    ALTER TABLE packing_lines VALIDATE CONSTRAINT fk_packing_lines_school_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_deliveries_route_tenant') THEN
    ALTER TABLE deliveries
      ADD CONSTRAINT fk_deliveries_route_tenant
      FOREIGN KEY (route_id, sppg_id) REFERENCES routes (id, sppg_id) NOT VALID;
    ALTER TABLE deliveries VALIDATE CONSTRAINT fk_deliveries_route_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_stops_delivery_tenant') THEN
    ALTER TABLE delivery_stops
      ADD CONSTRAINT fk_delivery_stops_delivery_tenant
      FOREIGN KEY (delivery_id, sppg_id) REFERENCES deliveries (id, sppg_id) NOT VALID;
    ALTER TABLE delivery_stops VALIDATE CONSTRAINT fk_delivery_stops_delivery_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_stops_school_tenant') THEN
    ALTER TABLE delivery_stops
      ADD CONSTRAINT fk_delivery_stops_school_tenant
      FOREIGN KEY (school_id, sppg_id) REFERENCES schools (id, sppg_id) NOT VALID;
    ALTER TABLE delivery_stops VALIDATE CONSTRAINT fk_delivery_stops_school_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_items_stop_tenant') THEN
    ALTER TABLE delivery_items
      ADD CONSTRAINT fk_delivery_items_stop_tenant
      FOREIGN KEY (delivery_stop_id, sppg_id) REFERENCES delivery_stops (id, sppg_id) NOT VALID;
    ALTER TABLE delivery_items VALIDATE CONSTRAINT fk_delivery_items_stop_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_items_packing_tenant') THEN
    ALTER TABLE delivery_items
      ADD CONSTRAINT fk_delivery_items_packing_tenant
      FOREIGN KEY (packing_line_id, sppg_id) REFERENCES packing_lines (id, sppg_id) NOT VALID;
    ALTER TABLE delivery_items VALIDATE CONSTRAINT fk_delivery_items_packing_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_proofs_stop_tenant') THEN
    ALTER TABLE delivery_proofs
      ADD CONSTRAINT fk_delivery_proofs_stop_tenant
      FOREIGN KEY (delivery_stop_id, sppg_id) REFERENCES delivery_stops (id, sppg_id) NOT VALID;
    ALTER TABLE delivery_proofs VALIDATE CONSTRAINT fk_delivery_proofs_stop_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_proofs_attachment_tenant') THEN
    ALTER TABLE delivery_proofs
      ADD CONSTRAINT fk_delivery_proofs_attachment_tenant
      FOREIGN KEY (attachment_id, sppg_id) REFERENCES attachments (id, sppg_id) NOT VALID;
    ALTER TABLE delivery_proofs VALIDATE CONSTRAINT fk_delivery_proofs_attachment_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_disputes_stop_tenant') THEN
    ALTER TABLE disputes
      ADD CONSTRAINT fk_disputes_stop_tenant
      FOREIGN KEY (delivery_stop_id, sppg_id) REFERENCES delivery_stops (id, sppg_id) NOT VALID;
    ALTER TABLE disputes VALIDATE CONSTRAINT fk_disputes_stop_tenant;
  END IF;
END $$;

-- 3) Check constraints data kritikal
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_disputes_delta_nonzero') THEN
    ALTER TABLE disputes
      ADD CONSTRAINT chk_disputes_delta_nonzero CHECK (delta_portions <> 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_items_delivered_le_planned') THEN
    ALTER TABLE delivery_items
      ADD CONSTRAINT chk_delivery_items_delivered_le_planned CHECK (delivered_portions <= planned_portions);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_items_returned_le_delivered') THEN
    ALTER TABLE delivery_items
      ADD CONSTRAINT chk_delivery_items_returned_le_delivered CHECK (returned_portions <= delivered_portions);
  END IF;
END $$;

-- 4) Index tuning list/filter/sort
CREATE INDEX IF NOT EXISTS idx_menu_plans_sppg_status_date ON menu_plans (sppg_id, status, plan_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_sppg_eta_status ON purchases (sppg_id, eta_date DESC, status);
CREATE INDEX IF NOT EXISTS idx_receipts_sppg_received_status ON receipts (sppg_id, received_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_sppg_departure_status ON deliveries (sppg_id, planned_departure DESC, status);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_sppg_status_order ON delivery_stops (sppg_id, status, stop_order);
CREATE INDEX IF NOT EXISTS idx_disputes_sppg_status_created ON disputes (sppg_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_sppg_occurred_desc ON audit_logs (sppg_id, occurred_at DESC);

-- 5) Utility function untuk refresh MV + ringkasan integrity
CREATE OR REPLACE FUNCTION refresh_stock_balances_mv_safe()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW stock_balances_mv;
END;
$$;

CREATE OR REPLACE FUNCTION qa_integrity_summary()
RETURNS jsonb
LANGUAGE sql
AS $$
  WITH ledger_delta AS (
    SELECT COUNT(*)::int AS mismatch_count
    FROM (
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
       AND ((ledger.batch_id IS NULL AND mv.batch_id IS NULL) OR ledger.batch_id = mv.batch_id)
      WHERE COALESCE(mv.on_hand_qty, 0) <> COALESCE(ledger.ledger_qty, 0)
    ) t
  ),
  attachment_tenant_mismatch AS (
    SELECT COUNT(*)::int AS mismatch_count
    FROM entity_attachments ea
    JOIN attachments a ON a.id = ea.attachment_id
    WHERE ea.sppg_id <> a.sppg_id
  ),
  trigger_health AS (
    SELECT COUNT(*)::int AS missing_count
    FROM (
      SELECT unnest(ARRAY[
        'trg_prevent_stock_moves_update',
        'trg_prevent_stock_moves_delete',
        'trg_prevent_audit_logs_update',
        'trg_prevent_audit_logs_delete'
      ]) AS tgname
    ) required
    LEFT JOIN pg_trigger t ON t.tgname = required.tgname
    WHERE t.tgname IS NULL OR t.tgenabled <> 'O'
  )
  SELECT jsonb_build_object(
    'stock_mv_mismatch_count', (SELECT mismatch_count FROM ledger_delta),
    'attachment_tenant_mismatch_count', (SELECT mismatch_count FROM attachment_tenant_mismatch),
    'trigger_missing_count', (SELECT missing_count FROM trigger_health),
    'checked_at', now()
  );
$$;

-- 6) Force RLS pada tabel sensitif (defense-in-depth)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs', 'stock_moves', 'attachments', 'entity_attachments', 'delivery_proofs'] LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

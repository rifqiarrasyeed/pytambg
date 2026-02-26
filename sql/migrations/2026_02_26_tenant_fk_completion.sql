-- Completion hardening: tenant composite FK coverage, constraint tightening, dan index sinkronisasi.
-- Idempotent dan aman dijalankan berulang.

-- Parent composite uniqueness yang dibutuhkan oleh FK tenant.
CREATE UNIQUE INDEX IF NOT EXISTS ux_units_id_sppg ON units (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_route_schools_id_sppg ON route_schools (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_school_user_access_id_sppg ON school_user_access (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_recipe_items_id_sppg ON recipe_items (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vendor_invoices_id_sppg ON vendor_invoices (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_receipt_items_id_sppg ON receipt_items (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_opname_lines_id_sppg ON stock_opname_lines (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_qc_checks_id_sppg ON qc_checks (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_entity_attachments_id_sppg ON entity_attachments (id, sppg_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_reports_jobs_id_sppg ON reports_jobs (id, sppg_id);

DO $$
BEGIN
  -- route_schools -> routes/schools (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_route_schools_route_tenant') THEN
    ALTER TABLE route_schools
      ADD CONSTRAINT fk_route_schools_route_tenant
      FOREIGN KEY (route_id, sppg_id) REFERENCES routes (id, sppg_id) NOT VALID;
    ALTER TABLE route_schools VALIDATE CONSTRAINT fk_route_schools_route_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_route_schools_school_tenant') THEN
    ALTER TABLE route_schools
      ADD CONSTRAINT fk_route_schools_school_tenant
      FOREIGN KEY (school_id, sppg_id) REFERENCES schools (id, sppg_id) NOT VALID;
    ALTER TABLE route_schools VALIDATE CONSTRAINT fk_route_schools_school_tenant;
  END IF;

  -- school_user_access -> schools (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_school_user_access_school_tenant') THEN
    ALTER TABLE school_user_access
      ADD CONSTRAINT fk_school_user_access_school_tenant
      FOREIGN KEY (school_id, sppg_id) REFERENCES schools (id, sppg_id) NOT VALID;
    ALTER TABLE school_user_access VALIDATE CONSTRAINT fk_school_user_access_school_tenant;
  END IF;

  -- recipe_items -> recipes/items (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_recipe_items_recipe_tenant') THEN
    ALTER TABLE recipe_items
      ADD CONSTRAINT fk_recipe_items_recipe_tenant
      FOREIGN KEY (recipe_id, sppg_id) REFERENCES recipes (id, sppg_id) NOT VALID;
    ALTER TABLE recipe_items VALIDATE CONSTRAINT fk_recipe_items_recipe_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_recipe_items_item_tenant') THEN
    ALTER TABLE recipe_items
      ADD CONSTRAINT fk_recipe_items_item_tenant
      FOREIGN KEY (item_id, sppg_id) REFERENCES inventory_items (id, sppg_id) NOT VALID;
    ALTER TABLE recipe_items VALIDATE CONSTRAINT fk_recipe_items_item_tenant;
  END IF;

  -- vendor_invoices -> vendors (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendor_invoices_vendor_tenant') THEN
    ALTER TABLE vendor_invoices
      ADD CONSTRAINT fk_vendor_invoices_vendor_tenant
      FOREIGN KEY (vendor_id, sppg_id) REFERENCES vendors (id, sppg_id) NOT VALID;
    ALTER TABLE vendor_invoices VALIDATE CONSTRAINT fk_vendor_invoices_vendor_tenant;
  END IF;

  -- inventory_batches -> receipt_items (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_batches_receipt_item_tenant') THEN
    ALTER TABLE inventory_batches
      ADD CONSTRAINT fk_inventory_batches_receipt_item_tenant
      FOREIGN KEY (received_receipt_item_id, sppg_id) REFERENCES receipt_items (id, sppg_id) NOT VALID;
    ALTER TABLE inventory_batches VALIDATE CONSTRAINT fk_inventory_batches_receipt_item_tenant;
  END IF;

  -- stock_moves -> units (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_moves_uom_tenant') THEN
    ALTER TABLE stock_moves
      ADD CONSTRAINT fk_stock_moves_uom_tenant
      FOREIGN KEY (uom_id, sppg_id) REFERENCES units (id, sppg_id) NOT VALID;
    ALTER TABLE stock_moves VALIDATE CONSTRAINT fk_stock_moves_uom_tenant;
  END IF;

  -- stock_opname_lines -> items/batches (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_opname_lines_item_tenant') THEN
    ALTER TABLE stock_opname_lines
      ADD CONSTRAINT fk_stock_opname_lines_item_tenant
      FOREIGN KEY (item_id, sppg_id) REFERENCES inventory_items (id, sppg_id) NOT VALID;
    ALTER TABLE stock_opname_lines VALIDATE CONSTRAINT fk_stock_opname_lines_item_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_opname_lines_batch_tenant') THEN
    ALTER TABLE stock_opname_lines
      ADD CONSTRAINT fk_stock_opname_lines_batch_tenant
      FOREIGN KEY (batch_id, sppg_id) REFERENCES inventory_batches (id, sppg_id) NOT VALID;
    ALTER TABLE stock_opname_lines VALIDATE CONSTRAINT fk_stock_opname_lines_batch_tenant;
  END IF;

  -- production_runs -> menu_plans (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_production_runs_menu_plan_tenant') THEN
    ALTER TABLE production_runs
      ADD CONSTRAINT fk_production_runs_menu_plan_tenant
      FOREIGN KEY (menu_plan_id, sppg_id) REFERENCES menu_plans (id, sppg_id) NOT VALID;
    ALTER TABLE production_runs VALIDATE CONSTRAINT fk_production_runs_menu_plan_tenant;
  END IF;

  -- production_inputs -> inventory_items (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_production_inputs_item_tenant') THEN
    ALTER TABLE production_inputs
      ADD CONSTRAINT fk_production_inputs_item_tenant
      FOREIGN KEY (item_id, sppg_id) REFERENCES inventory_items (id, sppg_id) NOT VALID;
    ALTER TABLE production_inputs VALIDATE CONSTRAINT fk_production_inputs_item_tenant;
  END IF;

  -- qc_checks -> attachments (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_qc_checks_attachment_tenant') THEN
    ALTER TABLE qc_checks
      ADD CONSTRAINT fk_qc_checks_attachment_tenant
      FOREIGN KEY (attachment_id, sppg_id) REFERENCES attachments (id, sppg_id) NOT VALID;
    ALTER TABLE qc_checks VALIDATE CONSTRAINT fk_qc_checks_attachment_tenant;
  END IF;

  -- entity_attachments -> attachments (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_entity_attachments_attachment_tenant') THEN
    ALTER TABLE entity_attachments
      ADD CONSTRAINT fk_entity_attachments_attachment_tenant
      FOREIGN KEY (attachment_id, sppg_id) REFERENCES attachments (id, sppg_id) NOT VALID;
    ALTER TABLE entity_attachments VALIDATE CONSTRAINT fk_entity_attachments_attachment_tenant;
  END IF;

  -- waste_events -> item/batch (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waste_events_item_tenant') THEN
    ALTER TABLE waste_events
      ADD CONSTRAINT fk_waste_events_item_tenant
      FOREIGN KEY (item_id, sppg_id) REFERENCES inventory_items (id, sppg_id) NOT VALID;
    ALTER TABLE waste_events VALIDATE CONSTRAINT fk_waste_events_item_tenant;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waste_events_batch_tenant') THEN
    ALTER TABLE waste_events
      ADD CONSTRAINT fk_waste_events_batch_tenant
      FOREIGN KEY (batch_id, sppg_id) REFERENCES inventory_batches (id, sppg_id) NOT VALID;
    ALTER TABLE waste_events VALIDATE CONSTRAINT fk_waste_events_batch_tenant;
  END IF;

  -- reports_jobs -> attachments (tenant-bound)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reports_jobs_attachment_tenant') THEN
    ALTER TABLE reports_jobs
      ADD CONSTRAINT fk_reports_jobs_attachment_tenant
      FOREIGN KEY (result_attachment_id, sppg_id) REFERENCES attachments (id, sppg_id) NOT VALID;
    ALTER TABLE reports_jobs VALIDATE CONSTRAINT fk_reports_jobs_attachment_tenant;
  END IF;
END $$;

-- Constraint tightening untuk data kritikal.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_route_schools_stop_order_positive') THEN
    ALTER TABLE route_schools
      ADD CONSTRAINT chk_route_schools_stop_order_positive CHECK (stop_order > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vendor_invoices_amount_nonnegative') THEN
    ALTER TABLE vendor_invoices
      ADD CONSTRAINT chk_vendor_invoices_amount_nonnegative CHECK (amount >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_production_inputs_qty_used_positive') THEN
    ALTER TABLE production_inputs
      ADD CONSTRAINT chk_production_inputs_qty_used_positive CHECK (qty_used > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_waste_events_qty_nonzero') THEN
    ALTER TABLE waste_events
      ADD CONSTRAINT chk_waste_events_qty_nonzero CHECK (qty <> 0);
  END IF;
END $$;

-- Index tuning untuk query list/filter/sort actual.
CREATE INDEX IF NOT EXISTS idx_route_schools_sppg_route_order ON route_schools (sppg_id, route_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_school_user_access_sppg_school_user ON school_user_access (sppg_id, school_id, user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_sppg_recipe_item ON recipe_items (sppg_id, recipe_id, item_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_sppg_status_date ON vendor_invoices (sppg_id, status, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_opname_lines_sppg_opname_item ON stock_opname_lines (sppg_id, opname_id, item_id);
CREATE INDEX IF NOT EXISTS idx_qc_checks_sppg_run_checked ON qc_checks (sppg_id, production_run_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_attachments_sppg_attachment ON entity_attachments (sppg_id, attachment_id);
CREATE INDEX IF NOT EXISTS idx_reports_jobs_sppg_status_created ON reports_jobs (sppg_id, status, created_at DESC);

-- Defense-in-depth FORCE RLS untuk tabel sensitif tambahan.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_logs',
    'stock_moves',
    'attachments',
    'entity_attachments',
    'delivery_proofs',
    'reports_jobs',
    'idempotency_keys'
  ] LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

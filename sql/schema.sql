CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='sppg_status') THEN CREATE TYPE sppg_status AS ENUM ('PENDING_SETUP','ACTIVE','SUSPENDED','ARCHIVED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='user_status') THEN CREATE TYPE user_status AS ENUM ('ACTIVE','INACTIVE','LOCKED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='assignment_status') THEN CREATE TYPE assignment_status AS ENUM ('ACTIVE','INACTIVE'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='route_status') THEN CREATE TYPE route_status AS ENUM ('ACTIVE','INACTIVE'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='vendor_status') THEN CREATE TYPE vendor_status AS ENUM ('ACTIVE','INACTIVE'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='template_status') THEN CREATE TYPE template_status AS ENUM ('DRAFT','APPROVED','ARCHIVED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='recipe_status') THEN CREATE TYPE recipe_status AS ENUM ('DRAFT','APPROVED','ARCHIVED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='plan_status') THEN CREATE TYPE plan_status AS ENUM ('DRAFT','SUBMITTED','APPROVED','PUBLISHED','LOCKED','REJECTED','REVISED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='po_status') THEN CREATE TYPE po_status AS ENUM ('DRAFT','SUBMITTED','APPROVED','ISSUED','PARTIALLY_RECEIVED','RECEIVED_COMPLETE','CLOSED','REJECTED','CANCELLED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='grn_status') THEN CREATE TYPE grn_status AS ENUM ('DRAFT','POSTED','VOIDED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='invoice_status') THEN CREATE TYPE invoice_status AS ENUM ('DRAFT','MATCHED','PAID','VOIDED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='batch_status') THEN CREATE TYPE batch_status AS ENUM ('ACTIVE','EXPIRED','RECALLED','CONSUMED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='stock_move_type') THEN CREATE TYPE stock_move_type AS ENUM ('RECEIVE','ISSUE_TO_PRODUCTION','TRANSFER','ADJUSTMENT','WASTE','RETURN_VENDOR','RETURN'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='opname_status') THEN CREATE TYPE opname_status AS ENUM ('DRAFT','COUNTED','SUBMITTED','APPROVED','POSTED','REJECTED','CANCELLED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='production_status') THEN CREATE TYPE production_status AS ENUM ('PLANNED','IN_PROGRESS','QC_PENDING','FINALIZED','CLOSED','CANCELLED','REOPEN_REQUESTED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='delivery_status') THEN CREATE TYPE delivery_status AS ENUM ('PLANNED','LOADED','IN_TRANSIT','DELIVERED','DISPUTED','RESOLVED','VERIFIED','CLOSED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='stop_status') THEN CREATE TYPE stop_status AS ENUM ('PLANNED','LOADED','IN_TRANSIT','DELIVERED','DISPUTED','RESOLVED','VERIFIED','LOCKED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='proof_type') THEN CREATE TYPE proof_type AS ENUM ('PHOTO','SIGNATURE','QR'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='dispute_status') THEN CREATE TYPE dispute_status AS ENUM ('OPEN','IN_REVIEW','RESOLVED','REJECTED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='severity_level') THEN CREATE TYPE severity_level AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='waste_status') THEN CREATE TYPE waste_status AS ENUM ('OPEN','APPROVED','POSTED','CLOSED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='incident_status') THEN CREATE TYPE incident_status AS ENUM ('OPEN','IN_REVIEW','MITIGATED','CLOSED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='change_req_status') THEN CREATE TYPE change_req_status AS ENUM ('OPEN','PENDING_APPROVAL','PENDING_CENTRAL_APPROVAL','APPROVED','REJECTED','EXECUTED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='lock_status') THEN CREATE TYPE lock_status AS ENUM ('OPEN','LOCKED','UNLOCK_REQUESTED','UNLOCKED','RELOCKED'); END IF;
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='report_job_status') THEN CREATE TYPE report_job_status AS ENUM ('QUEUED','RUNNING','SUCCEEDED','FAILED'); END IF;
END$$;

CREATE TABLE IF NOT EXISTS sppg (id uuid PRIMARY KEY, code varchar(30) UNIQUE NOT NULL, name varchar(150) NOT NULL, status sppg_status NOT NULL DEFAULT 'PENDING_SETUP', timezone varchar(50) NOT NULL DEFAULT 'Asia/Jakarta', created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS sppg_settings (id uuid PRIMARY KEY, sppg_id uuid NOT NULL UNIQUE REFERENCES sppg(id) ON DELETE CASCADE, config jsonb NOT NULL, config_version integer NOT NULL DEFAULT 1, effective_from date NOT NULL, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS sppg_setting_versions (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, version integer NOT NULL, config jsonb NOT NULL, changed_by uuid, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,version));

CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, email citext UNIQUE NOT NULL, full_name varchar(120) NOT NULL, password_hash text NOT NULL, status user_status NOT NULL DEFAULT 'ACTIVE', is_super_admin boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS roles (id uuid PRIMARY KEY, code varchar(50) UNIQUE NOT NULL, name varchar(100) NOT NULL, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS permissions (id uuid PRIMARY KEY, code varchar(80) UNIQUE NOT NULL, module varchar(50) NOT NULL, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS role_permissions (role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE, permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid, PRIMARY KEY (role_id,permission_id));
CREATE TABLE IF NOT EXISTS user_sppg (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, role_scope jsonb NOT NULL, is_default boolean NOT NULL DEFAULT false, status assignment_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(user_id,sppg_id), CONSTRAINT role_scope_array CHECK (jsonb_typeof(role_scope)='array' AND jsonb_array_length(role_scope)>0));
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sppg_default_active ON user_sppg (user_id) WHERE is_default=true AND status='ACTIVE';
CREATE TABLE IF NOT EXISTS sessions_tokens (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, refresh_token_hash text NOT NULL, active_sppg_id uuid REFERENCES sppg(id) ON DELETE SET NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);

CREATE TABLE IF NOT EXISTS units (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, code varchar(20) NOT NULL, name varchar(60) NOT NULL, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(sppg_id,code));
CREATE TABLE IF NOT EXISTS schools (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, code varchar(30) NOT NULL, name varchar(150) NOT NULL, address text, sla_minutes integer NOT NULL DEFAULT 60, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(sppg_id,code));
CREATE TABLE IF NOT EXISTS school_user_access (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,school_id,user_id));
CREATE TABLE IF NOT EXISTS routes (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, code varchar(30) NOT NULL, name varchar(120) NOT NULL, status route_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(sppg_id,code));
CREATE TABLE IF NOT EXISTS route_schools (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE, school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE, stop_order integer NOT NULL, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(route_id,school_id));
CREATE TABLE IF NOT EXISTS vendors (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, code varchar(30) NOT NULL, name varchar(150) NOT NULL, status vendor_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(sppg_id,code));
CREATE TABLE IF NOT EXISTS inventory_items (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, sku varchar(40) NOT NULL, name varchar(150) NOT NULL, unit_id uuid NOT NULL REFERENCES units(id), track_expiry boolean NOT NULL DEFAULT false, standard_cost numeric(14,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(sppg_id,sku));

CREATE TABLE IF NOT EXISTS recipe_templates (id uuid PRIMARY KEY, code varchar(40) UNIQUE NOT NULL, name varchar(150) NOT NULL, status template_status NOT NULL DEFAULT 'DRAFT', is_global boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS recipes (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, template_id uuid REFERENCES recipe_templates(id), code varchar(40) NOT NULL, name varchar(150) NOT NULL, yield_portions integer NOT NULL, status recipe_status NOT NULL DEFAULT 'DRAFT', created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(sppg_id,code));
CREATE TABLE IF NOT EXISTS recipe_items (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, item_id uuid NOT NULL REFERENCES inventory_items(id), qty_per_portion numeric(14,4) NOT NULL, loss_factor numeric(5,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(recipe_id,item_id));

CREATE TABLE IF NOT EXISTS menu_plans (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, plan_date date NOT NULL, status plan_status NOT NULL DEFAULT 'DRAFT', buffer_pct numeric(5,2) NOT NULL DEFAULT 0, approved_by uuid, approved_at timestamptz, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,plan_date));
CREATE TABLE IF NOT EXISTS plan_items (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, menu_plan_id uuid NOT NULL REFERENCES menu_plans(id) ON DELETE CASCADE, school_id uuid NOT NULL REFERENCES schools(id), recipe_id uuid NOT NULL REFERENCES recipes(id), target_portions integer NOT NULL CHECK (target_portions > 0), created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(menu_plan_id,school_id,recipe_id));

CREATE TABLE IF NOT EXISTS purchases (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, po_no varchar(40) NOT NULL, vendor_id uuid NOT NULL REFERENCES vendors(id), eta_date date NOT NULL, status po_status NOT NULL DEFAULT 'DRAFT', approved_by uuid, approved_at timestamptz, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,po_no));
CREATE TABLE IF NOT EXISTS purchase_items (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE, item_id uuid NOT NULL REFERENCES inventory_items(id), ordered_qty numeric(14,3) NOT NULL CHECK (ordered_qty >= 0), unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0), created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(purchase_id,item_id));
CREATE TABLE IF NOT EXISTS receipts (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, grn_no varchar(40) NOT NULL, purchase_id uuid NOT NULL REFERENCES purchases(id), received_at timestamptz NOT NULL, status grn_status NOT NULL DEFAULT 'DRAFT', idempotency_key varchar(80), created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,grn_no), UNIQUE (sppg_id,idempotency_key));
CREATE TABLE IF NOT EXISTS receipt_items (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE, purchase_item_id uuid NOT NULL REFERENCES purchase_items(id), received_qty numeric(14,3) NOT NULL CHECK (received_qty >= 0), lot_no varchar(60), expiry_date date, price numeric(14,2) CHECK (price >= 0), variance_reason text, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS vendor_invoices (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, vendor_id uuid NOT NULL REFERENCES vendors(id), invoice_no varchar(50) NOT NULL, invoice_date date NOT NULL, amount numeric(14,2) NOT NULL, status invoice_status NOT NULL DEFAULT 'DRAFT', created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,vendor_id,invoice_no));
CREATE TABLE IF NOT EXISTS inventory_batches (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, item_id uuid NOT NULL REFERENCES inventory_items(id), lot_no varchar(60) NOT NULL, expiry_date date, received_receipt_item_id uuid REFERENCES receipt_items(id), status batch_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,item_id,lot_no,expiry_date));

CREATE TABLE IF NOT EXISTS stock_moves (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, move_no bigint NOT NULL, move_type stock_move_type NOT NULL, item_id uuid NOT NULL REFERENCES inventory_items(id), batch_id uuid REFERENCES inventory_batches(id), qty numeric(14,3) NOT NULL CHECK (qty <> 0), uom_id uuid REFERENCES units(id), ref_table varchar(40), ref_id uuid, reason_code varchar(40), is_void boolean NOT NULL DEFAULT false, void_of_move_id uuid REFERENCES stock_moves(id), created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,move_no), CONSTRAINT stock_moves_reason_check CHECK (CASE WHEN move_type IN ('ADJUSTMENT','WASTE','RETURN_VENDOR') THEN reason_code IS NOT NULL ELSE true END));

CREATE TABLE IF NOT EXISTS stock_opnames (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, opname_date date NOT NULL, status opname_status NOT NULL DEFAULT 'DRAFT', submitted_by uuid, approved_by uuid, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,opname_date));
CREATE TABLE IF NOT EXISTS stock_opname_lines (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, opname_id uuid NOT NULL REFERENCES stock_opnames(id) ON DELETE CASCADE, item_id uuid NOT NULL REFERENCES inventory_items(id), batch_id uuid REFERENCES inventory_batches(id), book_qty numeric(14,3) NOT NULL, physical_qty numeric(14,3) NOT NULL, variance_qty numeric(14,3) NOT NULL, reason text, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(opname_id,item_id,batch_id));

CREATE TABLE IF NOT EXISTS production_runs (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, run_date date NOT NULL, menu_plan_id uuid NOT NULL REFERENCES menu_plans(id), status production_status NOT NULL DEFAULT 'PLANNED', started_at timestamptz, finalized_at timestamptz, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,run_date,menu_plan_id));
CREATE TABLE IF NOT EXISTS production_inputs (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, production_run_id uuid NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE, stock_move_id uuid NOT NULL REFERENCES stock_moves(id), item_id uuid NOT NULL REFERENCES inventory_items(id), qty_used numeric(14,3) NOT NULL, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (production_run_id,stock_move_id));
CREATE TABLE IF NOT EXISTS production_outputs (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, production_run_id uuid NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE, school_id uuid NOT NULL REFERENCES schools(id), recipe_id uuid NOT NULL REFERENCES recipes(id), output_portions integer NOT NULL CHECK (output_portions >= 0), deviation_reason text, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS qc_checks (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, production_run_id uuid NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE, check_type varchar(40) NOT NULL, value_text varchar(100), temperature_c numeric(5,2), attachment_id uuid, checked_at timestamptz NOT NULL, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS packing_lines (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, production_run_id uuid NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE, school_id uuid NOT NULL REFERENCES schools(id), package_count integer NOT NULL CHECK (package_count >= 0), portion_count integer NOT NULL CHECK (portion_count >= 0), created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS deliveries (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, manifest_no varchar(40) NOT NULL, route_id uuid NOT NULL REFERENCES routes(id), driver_user_id uuid NOT NULL REFERENCES users(id), vehicle_no varchar(30), status delivery_status NOT NULL DEFAULT 'PLANNED', planned_departure timestamptz NOT NULL, closed_at timestamptz, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,manifest_no));
CREATE TABLE IF NOT EXISTS delivery_stops (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE, school_id uuid NOT NULL REFERENCES schools(id), stop_order integer NOT NULL, status stop_status NOT NULL DEFAULT 'PLANNED', arrived_at timestamptz, verified_at timestamptz, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE(delivery_id,school_id));
CREATE TABLE IF NOT EXISTS delivery_items (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, delivery_stop_id uuid NOT NULL REFERENCES delivery_stops(id) ON DELETE CASCADE, packing_line_id uuid REFERENCES packing_lines(id), planned_portions integer NOT NULL CHECK (planned_portions >= 0), delivered_portions integer NOT NULL CHECK (delivered_portions >= 0), returned_portions integer NOT NULL CHECK (returned_portions >= 0), created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);

CREATE TABLE IF NOT EXISTS attachments (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, bucket_name varchar(80) NOT NULL DEFAULT 'delivery-proofs', object_key text NOT NULL, file_name text NOT NULL, mime_type varchar(100) NOT NULL, size_bytes bigint NOT NULL, checksum_sha256 char(64) NOT NULL, uploaded_by uuid, uploaded_at timestamptz NOT NULL, captured_at timestamptz, captured_by uuid, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS bucket_name varchar(80) NOT NULL DEFAULT 'delivery-proofs';
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS captured_at timestamptz;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS captured_by uuid;
CREATE TABLE IF NOT EXISTS entity_attachments (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, entity_table varchar(60) NOT NULL, entity_id uuid NOT NULL, attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE, attachment_role varchar(40) NOT NULL DEFAULT 'EVIDENCE', created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id, entity_table, entity_id, attachment_id));
CREATE TABLE IF NOT EXISTS delivery_proofs (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, delivery_stop_id uuid NOT NULL REFERENCES delivery_stops(id) ON DELETE CASCADE, proof_type proof_type NOT NULL, attachment_id uuid NOT NULL REFERENCES attachments(id), captured_at timestamptz NOT NULL, geo_lat numeric(10,7), geo_lng numeric(10,7), idempotency_key varchar(80), created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,idempotency_key));
CREATE TABLE IF NOT EXISTS disputes (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, delivery_stop_id uuid NOT NULL REFERENCES delivery_stops(id) ON DELETE CASCADE, reported_by uuid NOT NULL, dispute_type varchar(40) NOT NULL, delta_portions integer NOT NULL, reason text, status dispute_status NOT NULL DEFAULT 'OPEN', resolved_by uuid, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);

CREATE TABLE IF NOT EXISTS waste_events (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, event_time timestamptz NOT NULL, item_id uuid REFERENCES inventory_items(id), batch_id uuid REFERENCES inventory_batches(id), qty numeric(14,3) NOT NULL, reason_code varchar(40) NOT NULL, severity severity_level NOT NULL, status waste_status NOT NULL DEFAULT 'OPEN', created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS incident_logs (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, incident_time timestamptz NOT NULL, category varchar(40) NOT NULL, severity severity_level NOT NULL, description text NOT NULL, action_taken text, status incident_status NOT NULL DEFAULT 'OPEN', due_at timestamptz, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, CONSTRAINT incident_action_required CHECK (CASE WHEN severity IN ('HIGH','CRITICAL') THEN action_taken IS NOT NULL ELSE true END));

CREATE TABLE IF NOT EXISTS audit_logs (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, entity_table varchar(60) NOT NULL, entity_id uuid NOT NULL, action varchar(40) NOT NULL, old_value jsonb NOT NULL DEFAULT '{}'::jsonb, new_value jsonb NOT NULL DEFAULT '{}'::jsonb, actor_user_id uuid NOT NULL, actor_role varchar(200) NOT NULL, occurred_at timestamptz NOT NULL, request_id varchar(80), device_id varchar(80), ip inet, user_agent text, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS change_requests (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, entity_table varchar(60) NOT NULL, entity_id uuid NOT NULL, request_type varchar(40) NOT NULL, reason text, status change_req_status NOT NULL DEFAULT 'OPEN', requested_by uuid NOT NULL, approved_by uuid, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE TABLE IF NOT EXISTS period_locks (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, period_date date NOT NULL, status lock_status NOT NULL DEFAULT 'OPEN', locked_by uuid, unlocked_by uuid, unlock_reason text, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,period_date));
CREATE TABLE IF NOT EXISTS idempotency_keys (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, key varchar(80) NOT NULL, endpoint varchar(120) NOT NULL, request_hash char(64) NOT NULL, response_code integer, response_body jsonb, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid, UNIQUE (sppg_id,endpoint,key));
CREATE TABLE IF NOT EXISTS reports_jobs (id uuid PRIMARY KEY, sppg_id uuid NOT NULL REFERENCES sppg(id) ON DELETE CASCADE, report_type varchar(40) NOT NULL, format varchar(20) NOT NULL, payload jsonb NOT NULL, status report_job_status NOT NULL DEFAULT 'QUEUED', result_attachment_id uuid REFERENCES attachments(id), error_message text, created_at timestamptz NOT NULL, created_by uuid, updated_at timestamptz NOT NULL, updated_by uuid);
CREATE INDEX IF NOT EXISTS idx_user_sppg_user ON user_sppg (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sppg_sppg ON user_sppg (sppg_id);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions (module);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions (permission_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_schools_sppg ON schools (sppg_id);
CREATE INDEX IF NOT EXISTS idx_routes_sppg ON routes (sppg_id);
CREATE INDEX IF NOT EXISTS idx_vendors_sppg ON vendors (sppg_id);
CREATE INDEX IF NOT EXISTS idx_items_sppg ON inventory_items (sppg_id);
CREATE INDEX IF NOT EXISTS idx_recipes_sppg ON recipes (sppg_id,status);
CREATE INDEX IF NOT EXISTS idx_menu_plans_sppg_date ON menu_plans (sppg_id,plan_date);
CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON plan_items (menu_plan_id);
CREATE INDEX IF NOT EXISTS idx_purchases_sppg_status ON purchases (sppg_id,status);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts (sppg_id,status);
CREATE INDEX IF NOT EXISTS idx_batches_item_expiry ON inventory_batches (item_id,expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_moves_item_time ON stock_moves (sppg_id,item_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_moves_ref ON stock_moves (sppg_id,ref_table,ref_id);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_status ON stock_opnames (sppg_id,status);
CREATE INDEX IF NOT EXISTS idx_prod_runs_status_date ON production_runs (sppg_id,status,run_date);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries (sppg_id,status,planned_departure DESC);
CREATE INDEX IF NOT EXISTS idx_stops_delivery ON delivery_stops (delivery_id,status);
CREATE INDEX IF NOT EXISTS idx_proofs_stop ON delivery_proofs (delivery_stop_id,captured_at);
CREATE INDEX IF NOT EXISTS idx_entity_attachments_entity ON entity_attachments (sppg_id,entity_table,entity_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (sppg_id,status);
CREATE INDEX IF NOT EXISTS idx_waste_time ON waste_events (sppg_id,event_time DESC);
CREATE INDEX IF NOT EXISTS idx_incident_status ON incident_logs (sppg_id,status,severity);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (sppg_id,entity_table,entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_user_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_requests ON change_requests (sppg_id,status,entity_table,entity_id);
CREATE INDEX IF NOT EXISTS idx_period_locks ON period_locks (sppg_id,period_date,status);
CREATE INDEX IF NOT EXISTS idx_idempo_exp ON idempotency_keys (expires_at);

CREATE MATERIALIZED VIEW IF NOT EXISTS stock_balances_mv AS
SELECT sppg_id,item_id,batch_id,SUM(CASE WHEN is_void THEN 0 ELSE qty END) AS on_hand_qty
FROM stock_moves
GROUP BY sppg_id,item_id,batch_id
WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_balances_mv_key ON stock_balances_mv (sppg_id,item_id,batch_id);

CREATE OR REPLACE FUNCTION prevent_update_delete_stock_moves() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_moves bersifat immutable (append-only). Gunakan void & recreate.';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_prevent_stock_moves_update ON stock_moves;
DROP TRIGGER IF EXISTS trg_prevent_stock_moves_delete ON stock_moves;
CREATE TRIGGER trg_prevent_stock_moves_update BEFORE UPDATE ON stock_moves FOR EACH ROW EXECUTE FUNCTION prevent_update_delete_stock_moves();
CREATE TRIGGER trg_prevent_stock_moves_delete BEFORE DELETE ON stock_moves FOR EACH ROW EXECUTE FUNCTION prevent_update_delete_stock_moves();

CREATE OR REPLACE FUNCTION prevent_update_delete_audit_logs() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs bersifat write-once';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_prevent_audit_logs_update ON audit_logs;
DROP TRIGGER IF EXISTS trg_prevent_audit_logs_delete ON audit_logs;
CREATE TRIGGER trg_prevent_audit_logs_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_update_delete_audit_logs();
CREATE TRIGGER trg_prevent_audit_logs_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_update_delete_audit_logs();

-- RLS hardening (defense-in-depth):
-- Backend tetap menggunakan service_role, sementara role client (anon/authenticated)
-- ditutup total untuk seluruh tabel operasional.
DO $$
DECLARE
  role_targets text[] := ARRAY[]::text[];
  role_sql text;
  table_name text;
  protected_tables text[] := ARRAY[
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
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    role_targets := array_append(role_targets, 'anon');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    role_targets := array_append(role_targets, 'authenticated');
  END IF;

  IF array_length(role_targets, 1) IS NULL THEN
    RAISE NOTICE 'Role anon/authenticated tidak ditemukan, skip RLS deny-all policy.';
    RETURN;
  END IF;

  SELECT string_agg(format('%I', role_name), ', ')
  INTO role_sql
  FROM unnest(role_targets) AS role_name;

  FOREACH table_name IN ARRAY protected_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS deny_all_clients ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY deny_all_clients ON %I FOR ALL TO %s USING (false) WITH CHECK (false)',
      table_name,
      role_sql
    );
  END LOOP;

  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %s', role_sql);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %s', role_sql);
END;
$$;

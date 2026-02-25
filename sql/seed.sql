-- Seed operasional lokal MBG Ops
-- Password default semua akun seed: Passw0rd!
-- Jalankan setelah schema.sql

INSERT INTO roles (id, code, name, created_at, created_by, updated_at, updated_by)
VALUES
  (gen_random_uuid(), 'SUPER_ADMIN', 'Super Admin Pusat', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'ADMIN_SPPG', 'Admin SPPG', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'NUTRITIONIST', 'Nutritionist', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'INVENTORY', 'Inventory', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'KITCHEN_PRODUCTION', 'Kitchen Production', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'DRIVER', 'Driver', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'SCHOOL_VERIFIER', 'School Verifier', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'AUDITOR_VIEWER', 'Auditor Viewer', now(), NULL, now(), NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (id, code, module, created_at, created_by, updated_at, updated_by)
VALUES
  (gen_random_uuid(), 'sppg.manage', 'sppg', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'assignment.manage', 'sppg', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'master.read', 'master', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'master.write', 'master', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'planning.write', 'planning', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'planning.approve', 'planning', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'procurement.write', 'procurement', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'procurement.approve', 'procurement', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'receipt.post', 'procurement', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'inventory.write', 'inventory', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'inventory.approve', 'inventory', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'production.write', 'production', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'production.finalize', 'production', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'delivery.manage', 'delivery', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'delivery.update_status', 'delivery', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'delivery.upload_proof', 'delivery', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'delivery.verify', 'delivery', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'dispute.manage', 'delivery', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'report.view', 'report', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'report.export', 'report', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'audit.view', 'audit', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'period.lock', 'period', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'period.unlock', 'period', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'attachment.read', 'attachment', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'attachment.write', 'attachment', now(), NULL, now(), NULL)
ON CONFLICT (code) DO NOTHING;

WITH mapping(role_code, permission_code) AS (
  VALUES
    ('ADMIN_SPPG', 'master.read'),
    ('ADMIN_SPPG', 'master.write'),
    ('ADMIN_SPPG', 'planning.write'),
    ('ADMIN_SPPG', 'planning.approve'),
    ('ADMIN_SPPG', 'procurement.write'),
    ('ADMIN_SPPG', 'procurement.approve'),
    ('ADMIN_SPPG', 'receipt.post'),
    ('ADMIN_SPPG', 'inventory.write'),
    ('ADMIN_SPPG', 'inventory.approve'),
    ('ADMIN_SPPG', 'production.write'),
    ('ADMIN_SPPG', 'delivery.manage'),
    ('ADMIN_SPPG', 'dispute.manage'),
    ('ADMIN_SPPG', 'report.view'),
    ('ADMIN_SPPG', 'report.export'),
    ('ADMIN_SPPG', 'audit.view'),
    ('ADMIN_SPPG', 'period.lock'),
    ('ADMIN_SPPG', 'attachment.read'),
    ('ADMIN_SPPG', 'attachment.write'),
    ('NUTRITIONIST', 'master.read'),
    ('NUTRITIONIST', 'master.write'),
    ('NUTRITIONIST', 'planning.write'),
    ('NUTRITIONIST', 'report.view'),
    ('INVENTORY', 'master.read'),
    ('INVENTORY', 'master.write'),
    ('INVENTORY', 'procurement.write'),
    ('INVENTORY', 'receipt.post'),
    ('INVENTORY', 'inventory.write'),
    ('INVENTORY', 'report.view'),
    ('INVENTORY', 'attachment.read'),
    ('INVENTORY', 'attachment.write'),
    ('KITCHEN_PRODUCTION', 'master.read'),
    ('KITCHEN_PRODUCTION', 'production.write'),
    ('KITCHEN_PRODUCTION', 'production.finalize'),
    ('KITCHEN_PRODUCTION', 'report.view'),
    ('KITCHEN_PRODUCTION', 'attachment.read'),
    ('KITCHEN_PRODUCTION', 'attachment.write'),
    ('DRIVER', 'delivery.update_status'),
    ('DRIVER', 'delivery.upload_proof'),
    ('DRIVER', 'report.view'),
    ('DRIVER', 'attachment.read'),
    ('DRIVER', 'attachment.write'),
    ('SCHOOL_VERIFIER', 'delivery.verify'),
    ('SCHOOL_VERIFIER', 'dispute.manage'),
    ('SCHOOL_VERIFIER', 'report.view'),
    ('SCHOOL_VERIFIER', 'attachment.read'),
    ('SCHOOL_VERIFIER', 'attachment.write'),
    ('AUDITOR_VIEWER', 'report.view'),
    ('AUDITOR_VIEWER', 'report.export'),
    ('AUDITOR_VIEWER', 'audit.view'),
    ('AUDITOR_VIEWER', 'period.unlock'),
    ('AUDITOR_VIEWER', 'attachment.read')
)
INSERT INTO role_permissions (role_id, permission_id, created_at, created_by, updated_at, updated_by)
SELECT r.id, p.id, now(), NULL, now(), NULL
FROM mapping m
JOIN roles r ON r.code = m.role_code
JOIN permissions p ON p.code = m.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO users (id, email, full_name, password_hash, status, is_super_admin, created_at, created_by, updated_at, updated_by)
VALUES
  (gen_random_uuid(), 'superadmin@mbg.local', 'Super Admin MBG', '$2b$10$xDh7vbnoKfBu/AmmN103cuQguvJIjStLTQuHk2ngcNa3trTzA/Xbm', 'ACTIVE', true, now(), NULL, now(), NULL),
  (gen_random_uuid(), 'admin.sppga@mbg.local', 'Admin SPPG A', '$2b$10$xDh7vbnoKfBu/AmmN103cuQguvJIjStLTQuHk2ngcNa3trTzA/Xbm', 'ACTIVE', false, now(), NULL, now(), NULL),
  (gen_random_uuid(), 'nutritionist.sppga@mbg.local', 'Nutritionist SPPG A', '$2b$10$xDh7vbnoKfBu/AmmN103cuQguvJIjStLTQuHk2ngcNa3trTzA/Xbm', 'ACTIVE', false, now(), NULL, now(), NULL),
  (gen_random_uuid(), 'inventory.sppga@mbg.local', 'Inventory SPPG A', '$2b$10$xDh7vbnoKfBu/AmmN103cuQguvJIjStLTQuHk2ngcNa3trTzA/Xbm', 'ACTIVE', false, now(), NULL, now(), NULL),
  (gen_random_uuid(), 'kitchen.sppga@mbg.local', 'Kitchen Production A', '$2b$10$xDh7vbnoKfBu/AmmN103cuQguvJIjStLTQuHk2ngcNa3trTzA/Xbm', 'ACTIVE', false, now(), NULL, now(), NULL),
  (gen_random_uuid(), 'driver.sppga@mbg.local', 'Driver SPPG A', '$2b$10$xDh7vbnoKfBu/AmmN103cuQguvJIjStLTQuHk2ngcNa3trTzA/Xbm', 'ACTIVE', false, now(), NULL, now(), NULL),
  (gen_random_uuid(), 'verifier.sppga@mbg.local', 'Verifier Sekolah A', '$2b$10$xDh7vbnoKfBu/AmmN103cuQguvJIjStLTQuHk2ngcNa3trTzA/Xbm', 'ACTIVE', false, now(), NULL, now(), NULL),
  (gen_random_uuid(), 'auditor@mbg.local', 'Auditor MBG', '$2b$10$xDh7vbnoKfBu/AmmN103cuQguvJIjStLTQuHk2ngcNa3trTzA/Xbm', 'ACTIVE', false, now(), NULL, now(), NULL),
  (gen_random_uuid(), 'admin.sppgb@mbg.local', 'Admin SPPG B', '$2b$10$xDh7vbnoKfBu/AmmN103cuQguvJIjStLTQuHk2ngcNa3trTzA/Xbm', 'ACTIVE', false, now(), NULL, now(), NULL)
ON CONFLICT (email) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  password_hash = EXCLUDED.password_hash,
  status = EXCLUDED.status,
  is_super_admin = EXCLUDED.is_super_admin,
  updated_at = now();

INSERT INTO sppg (id, code, name, status, timezone, created_at, created_by, updated_at, updated_by)
VALUES
  (gen_random_uuid(), 'SPPG-A', 'SPPG A Jakarta', 'ACTIVE', 'Asia/Jakarta', now(), NULL, now(), NULL),
  (gen_random_uuid(), 'SPPG-B', 'SPPG B Bekasi', 'ACTIVE', 'Asia/Jakarta', now(), NULL, now(), NULL)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  timezone = EXCLUDED.timezone,
  updated_at = now();

WITH sppg_rows AS (
  SELECT id, code
  FROM sppg
  WHERE code IN ('SPPG-A', 'SPPG-B')
)
INSERT INTO sppg_settings (id, sppg_id, config, config_version, effective_from, created_at, created_by, updated_at, updated_by)
SELECT
  gen_random_uuid(),
  s.id,
  jsonb_build_object(
    'operational_hours', jsonb_build_object('start', '05:00', 'end', '18:00'),
    'waste_tolerance_pct', 5,
    'distribution_sla_minutes', 60,
    'report_template', 'DEFAULT_MBGA'
  ),
  1,
  CURRENT_DATE,
  now(),
  NULL,
  now(),
  NULL
FROM sppg_rows s
ON CONFLICT (sppg_id) DO UPDATE
SET
  config = EXCLUDED.config,
  updated_at = now();

INSERT INTO sppg_setting_versions (id, sppg_id, version, config, changed_by, created_at, created_by, updated_at, updated_by)
SELECT
  gen_random_uuid(),
  s.id,
  1,
  ss.config,
  NULL,
  now(),
  NULL,
  now(),
  NULL
FROM sppg s
JOIN sppg_settings ss ON ss.sppg_id = s.id
WHERE s.code IN ('SPPG-A', 'SPPG-B')
ON CONFLICT (sppg_id, version) DO NOTHING;

WITH sppg_a AS (
  SELECT id
  FROM sppg
  WHERE code = 'SPPG-A'
),
sppg_b AS (
  SELECT id
  FROM sppg
  WHERE code = 'SPPG-B'
)
INSERT INTO units (id, sppg_id, code, name, created_at, created_by, updated_at, updated_by)
SELECT gen_random_uuid(), a.id, v.code, v.name, now(), NULL, now(), NULL
FROM sppg_a a
CROSS JOIN (VALUES ('KG', 'Kilogram'), ('PCS', 'Pieces'), ('GR', 'Gram')) v(code, name)
ON CONFLICT (sppg_id, code) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

WITH sppg_b AS (
  SELECT id
  FROM sppg
  WHERE code = 'SPPG-B'
)
INSERT INTO units (id, sppg_id, code, name, created_at, created_by, updated_at, updated_by)
SELECT gen_random_uuid(), b.id, v.code, v.name, now(), NULL, now(), NULL
FROM sppg_b b
CROSS JOIN (VALUES ('KG', 'Kilogram'), ('PCS', 'Pieces')) v(code, name)
ON CONFLICT (sppg_id, code) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

WITH sppg_a AS (
  SELECT id
  FROM sppg
  WHERE code = 'SPPG-A'
)
INSERT INTO schools (id, sppg_id, code, name, address, sla_minutes, created_at, created_by, updated_at, updated_by)
SELECT gen_random_uuid(), a.id, v.code, v.name, v.address, v.sla_minutes, now(), NULL, now(), NULL
FROM sppg_a a
CROSS JOIN (
  VALUES
    ('SCH-A-01', 'SDN 01 Kembangan', 'Kembangan Selatan, Jakarta Barat', 60),
    ('SCH-A-02', 'SMPN 05 Kembangan', 'Kembangan Utara, Jakarta Barat', 75)
) v(code, name, address, sla_minutes)
ON CONFLICT (sppg_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  sla_minutes = EXCLUDED.sla_minutes,
  updated_at = now();

WITH sppg_a AS (
  SELECT id
  FROM sppg
  WHERE code = 'SPPG-A'
)
INSERT INTO routes (id, sppg_id, code, name, status, created_at, created_by, updated_at, updated_by)
SELECT gen_random_uuid(), a.id, 'RUTE-A-01', 'Rute Barat Pagi', 'ACTIVE', now(), NULL, now(), NULL
FROM sppg_a a
ON CONFLICT (sppg_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  updated_at = now();

WITH sppg_a AS (
  SELECT id
  FROM sppg
  WHERE code = 'SPPG-A'
),
route_row AS (
  SELECT r.id AS route_id, r.sppg_id
  FROM routes r
  JOIN sppg_a a ON a.id = r.sppg_id
  WHERE r.code = 'RUTE-A-01'
),
school_rows AS (
  SELECT s.id, s.code, s.sppg_id
  FROM schools s
  JOIN sppg_a a ON a.id = s.sppg_id
  WHERE s.code IN ('SCH-A-01', 'SCH-A-02')
)
INSERT INTO route_schools (id, sppg_id, route_id, school_id, stop_order, created_at, created_by, updated_at, updated_by)
SELECT
  gen_random_uuid(),
  rr.sppg_id,
  rr.route_id,
  sr.id,
  CASE WHEN sr.code = 'SCH-A-01' THEN 1 ELSE 2 END AS stop_order,
  now(),
  NULL,
  now(),
  NULL
FROM route_row rr
JOIN school_rows sr ON sr.sppg_id = rr.sppg_id
ON CONFLICT (route_id, school_id) DO UPDATE
SET
  stop_order = EXCLUDED.stop_order,
  updated_at = now();

WITH sppg_a AS (
  SELECT id
  FROM sppg
  WHERE code = 'SPPG-A'
)
INSERT INTO vendors (id, sppg_id, code, name, status, created_at, created_by, updated_at, updated_by)
SELECT gen_random_uuid(), a.id, 'VEN-A-01', 'PT Pangan Nusantara', 'ACTIVE', now(), NULL, now(), NULL
FROM sppg_a a
ON CONFLICT (sppg_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  updated_at = now();

WITH sppg_a AS (
  SELECT id
  FROM sppg
  WHERE code = 'SPPG-A'
),
units_a AS (
  SELECT id, code
  FROM units
  WHERE sppg_id = (SELECT id FROM sppg_a)
)
INSERT INTO inventory_items (id, sppg_id, sku, name, unit_id, track_expiry, standard_cost, created_at, created_by, updated_at, updated_by)
SELECT
  gen_random_uuid(),
  a.id,
  v.sku,
  v.name,
  u.id,
  v.track_expiry,
  v.standard_cost,
  now(),
  NULL,
  now(),
  NULL
FROM sppg_a a
JOIN (
  VALUES
    ('ITM-BERAS', 'Beras Premium', 'KG', true, 14500::numeric),
    ('ITM-TELUR', 'Telur Ayam', 'PCS', true, 1900::numeric),
    ('ITM-SAYUR', 'Sayur Campur', 'KG', false, 8000::numeric),
    ('ITM-AYAM', 'Daging Ayam', 'KG', true, 36000::numeric)
) v(sku, name, unit_code, track_expiry, standard_cost) ON true
JOIN units_a u ON u.code = v.unit_code
ON CONFLICT (sppg_id, sku) DO UPDATE
SET
  name = EXCLUDED.name,
  unit_id = EXCLUDED.unit_id,
  track_expiry = EXCLUDED.track_expiry,
  standard_cost = EXCLUDED.standard_cost,
  updated_at = now();

WITH sppg_a AS (
  SELECT id
  FROM sppg
  WHERE code = 'SPPG-A'
)
INSERT INTO recipes (id, sppg_id, template_id, code, name, yield_portions, status, created_at, created_by, updated_at, updated_by)
SELECT gen_random_uuid(), a.id, NULL, v.code, v.name, v.yield_portions, 'APPROVED', now(), NULL, now(), NULL
FROM sppg_a a
JOIN (
  VALUES
    ('RCP-A-AYAM', 'Nasi Ayam Sayur', 100),
    ('RCP-A-TELUR', 'Nasi Telur Sayur', 100)
) v(code, name, yield_portions) ON true
ON CONFLICT (sppg_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  yield_portions = EXCLUDED.yield_portions,
  status = EXCLUDED.status,
  updated_at = now();

WITH recipe_ctx AS (
  SELECT r.id AS recipe_id, r.sppg_id, r.code
  FROM recipes r
  JOIN sppg s ON s.id = r.sppg_id
  WHERE s.code = 'SPPG-A'
    AND r.code IN ('RCP-A-AYAM', 'RCP-A-TELUR')
),
item_ctx AS (
  SELECT i.id AS item_id, i.sppg_id, i.sku
  FROM inventory_items i
  JOIN sppg s ON s.id = i.sppg_id
  WHERE s.code = 'SPPG-A'
)
INSERT INTO recipe_items (id, sppg_id, recipe_id, item_id, qty_per_portion, loss_factor, created_at, created_by, updated_at, updated_by)
SELECT
  gen_random_uuid(),
  rc.sppg_id,
  rc.recipe_id,
  ic.item_id,
  m.qty_per_portion,
  m.loss_factor,
  now(),
  NULL,
  now(),
  NULL
FROM (
  VALUES
    ('RCP-A-AYAM', 'ITM-BERAS', 0.10::numeric, 0.03::numeric),
    ('RCP-A-AYAM', 'ITM-AYAM', 0.07::numeric, 0.05::numeric),
    ('RCP-A-AYAM', 'ITM-SAYUR', 0.05::numeric, 0.04::numeric),
    ('RCP-A-TELUR', 'ITM-BERAS', 0.10::numeric, 0.03::numeric),
    ('RCP-A-TELUR', 'ITM-TELUR', 1.00::numeric, 0.02::numeric),
    ('RCP-A-TELUR', 'ITM-SAYUR', 0.05::numeric, 0.04::numeric)
) m(recipe_code, item_sku, qty_per_portion, loss_factor)
JOIN recipe_ctx rc ON rc.code = m.recipe_code
JOIN item_ctx ic ON ic.sku = m.item_sku AND ic.sppg_id = rc.sppg_id
ON CONFLICT (recipe_id, item_id) DO UPDATE
SET
  qty_per_portion = EXCLUDED.qty_per_portion,
  loss_factor = EXCLUDED.loss_factor,
  updated_at = now();

WITH user_rows AS (
  SELECT id, email
  FROM users
  WHERE email IN (
    'superadmin@mbg.local',
    'admin.sppga@mbg.local',
    'nutritionist.sppga@mbg.local',
    'inventory.sppga@mbg.local',
    'kitchen.sppga@mbg.local',
    'driver.sppga@mbg.local',
    'verifier.sppga@mbg.local',
    'auditor@mbg.local',
    'admin.sppgb@mbg.local'
  )
),
sppg_rows AS (
  SELECT id, code
  FROM sppg
  WHERE code IN ('SPPG-A', 'SPPG-B')
),
assignments AS (
  SELECT
    u.id AS user_id,
    s.id AS sppg_id,
    a.role_scope::jsonb AS role_scope,
    a.is_default::boolean AS is_default
  FROM (
    VALUES
      ('superadmin@mbg.local', 'SPPG-A', '["SUPER_ADMIN"]', true),
      ('superadmin@mbg.local', 'SPPG-B', '["SUPER_ADMIN"]', false),
      ('admin.sppga@mbg.local', 'SPPG-A', '["ADMIN_SPPG"]', true),
      ('nutritionist.sppga@mbg.local', 'SPPG-A', '["NUTRITIONIST"]', true),
      ('inventory.sppga@mbg.local', 'SPPG-A', '["INVENTORY"]', true),
      ('kitchen.sppga@mbg.local', 'SPPG-A', '["KITCHEN_PRODUCTION"]', true),
      ('driver.sppga@mbg.local', 'SPPG-A', '["DRIVER"]', true),
      ('verifier.sppga@mbg.local', 'SPPG-A', '["SCHOOL_VERIFIER"]', true),
      ('auditor@mbg.local', 'SPPG-A', '["AUDITOR_VIEWER"]', true),
      ('admin.sppgb@mbg.local', 'SPPG-B', '["ADMIN_SPPG"]', true)
  ) a(email, sppg_code, role_scope, is_default)
  JOIN user_rows u ON u.email = a.email
  JOIN sppg_rows s ON s.code = a.sppg_code
)
INSERT INTO user_sppg (id, user_id, sppg_id, role_scope, is_default, status, created_at, created_by, updated_at, updated_by)
SELECT gen_random_uuid(), a.user_id, a.sppg_id, a.role_scope, a.is_default, 'ACTIVE', now(), NULL, now(), NULL
FROM assignments a
ON CONFLICT (user_id, sppg_id) DO UPDATE
SET
  role_scope = EXCLUDED.role_scope,
  is_default = EXCLUDED.is_default,
  status = EXCLUDED.status,
  updated_at = now();

WITH verifier AS (
  SELECT id AS user_id
  FROM users
  WHERE email = 'verifier.sppga@mbg.local'
),
sppg_a AS (
  SELECT id
  FROM sppg
  WHERE code = 'SPPG-A'
),
school_rows AS (
  SELECT s.id, s.sppg_id
  FROM schools s
  JOIN sppg_a a ON a.id = s.sppg_id
)
INSERT INTO school_user_access (id, sppg_id, school_id, user_id, created_at, created_by, updated_at, updated_by)
SELECT gen_random_uuid(), sr.sppg_id, sr.id, v.user_id, now(), NULL, now(), NULL
FROM school_rows sr
CROSS JOIN verifier v
ON CONFLICT (sppg_id, school_id, user_id) DO NOTHING;

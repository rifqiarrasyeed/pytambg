-- RC local hardening: index support untuk investigasi audit coverage.

CREATE INDEX IF NOT EXISTS idx_audit_entity_occurred
  ON audit_logs (sppg_id, entity_table, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_action_occurred
  ON audit_logs (sppg_id, action, occurred_at DESC);

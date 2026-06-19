ALTER TABLE rastreo_cajas
  ADD COLUMN IF NOT EXISTS box_type TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_rastreo_cajas_box_type
  ON rastreo_cajas (tenant_id, box_type);

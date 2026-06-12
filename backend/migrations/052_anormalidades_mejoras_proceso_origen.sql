ALTER TABLE anormalidades_mejoras
  ADD COLUMN IF NOT EXISTS proceso VARCHAR(100),
  ADD COLUMN IF NOT EXISTS origen VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_anorm_mejoras_tenant_proceso
  ON anormalidades_mejoras (tenant_id, proceso);

CREATE INDEX IF NOT EXISTS idx_anorm_mejoras_tenant_origen
  ON anormalidades_mejoras (tenant_id, origen);

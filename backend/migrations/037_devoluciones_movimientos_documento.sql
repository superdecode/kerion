BEGIN;

ALTER TABLE dev_movimientos
  ADD COLUMN IF NOT EXISTS documento TEXT;

CREATE INDEX IF NOT EXISTS idx_dev_movimientos_tenant_documento
  ON dev_movimientos(tenant_id, documento)
  WHERE documento IS NOT NULL;

COMMIT;

-- Migration 045: Add composite tenant_id indexes on hot-path tables.
--
-- Background: many tables have a single-column (tenant_id) index. Most query patterns
-- also filter on a second column (estado, created_at, etc.), which requires a composite
-- index for index-only scans and efficient range queries on large tenants.

-- tarimas — common filter: estado + created_at (dashboard, historial)
CREATE INDEX IF NOT EXISTS idx_tarimas_tenant_estado_created
  ON tarimas(tenant_id, estado, created_at DESC);

-- sesiones_escaneo — common filter: created_at (historial, reportes)
CREATE INDEX IF NOT EXISTS idx_sesiones_escaneo_tenant_created
  ON sesiones_escaneo(tenant_id, created_at DESC);

-- audit_log — common filter: created_at DESC (admin audit trail)
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
  ON audit_log(tenant_id, created_at DESC);

-- folios_entrega — common filter: estado + created_at (FEP dashboard)
CREATE INDEX IF NOT EXISTS idx_folios_entrega_tenant_created
  ON folios_entrega(tenant_id, created_at DESC);

-- inventory_sessions — common filter: estado (active sessions query)
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_tenant_estado
  ON inventory_sessions(tenant_id, estado);

-- dev_item_fotos — add tenant_id index for tenant-level photo cleanup/reporting
CREATE INDEX IF NOT EXISTS idx_dev_item_fotos_tenant
  ON dev_item_fotos(tenant_id);

-- dev_salida_items — add tenant_id index for tenant-level reporting
CREATE INDEX IF NOT EXISTS idx_dev_salida_items_tenant
  ON dev_salida_items(tenant_id);

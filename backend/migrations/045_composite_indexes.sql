-- Migration 045: Add composite tenant_id indexes on hot-path tables.
--
-- Background: many tables have a single-column (tenant_id) index. Most query patterns
-- also filter on a second column (estado, created_at, etc.), requiring a composite
-- index for index-only scans and efficient range queries on large tenants.
--
-- Defensive: inventory_sessions was created by server.js inline migration without
-- tenant_id. Migration 021 adds it via ALTER TABLE, but if 021 ran only through
-- server.js (not the file runner), this column may be absent here. We add it
-- defensively so this migration is self-contained.
-- inventory_sessions also uses column "status" (not "estado") per its original DDL.

-- Ensure inventory_sessions.tenant_id exists before indexing it
ALTER TABLE inventory_sessions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- tarimas — common filter: estado + created_at (dashboard, historial)
CREATE INDEX IF NOT EXISTS idx_tarimas_tenant_estado_created
  ON tarimas(tenant_id, estado, created_at DESC);

-- sesiones_escaneo — common filter: created_at (historial, reportes)
CREATE INDEX IF NOT EXISTS idx_sesiones_escaneo_tenant_created
  ON sesiones_escaneo(tenant_id, created_at DESC);

-- audit_log — common filter: created_at DESC (admin audit trail)
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
  ON audit_log(tenant_id, created_at DESC);

-- folios_entrega — common filter: created_at (FEP dashboard)
CREATE INDEX IF NOT EXISTS idx_folios_entrega_tenant_created
  ON folios_entrega(tenant_id, created_at DESC);

-- inventory_sessions — uses column "status" (not "estado"); filter: active sessions
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_tenant_status
  ON inventory_sessions(tenant_id, status);

-- dev_item_fotos — add tenant_id index for tenant-level photo cleanup/reporting
CREATE INDEX IF NOT EXISTS idx_dev_item_fotos_tenant
  ON dev_item_fotos(tenant_id);

-- dev_salida_items — add tenant_id index for tenant-level reporting
CREATE INDEX IF NOT EXISTS idx_dev_salida_items_tenant
  ON dev_salida_items(tenant_id);

-- Migration 083: Row Level Security for dispatch, inbound, and legacy inventory tables
-- These tables were created after migration 022 ran, so their RLS was never applied.
-- Pattern mirrors migration 022: tenant_isolation policy using app.tenant_id session var.
-- The second arg (true) to current_setting returns NULL (not error) when setting is absent,
-- which allows super_admin queries that don't set a tenant context to bypass the policy.

-- dispatch module
ALTER TABLE dispatch_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_conductores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dispatch_conductores;
CREATE POLICY tenant_isolation ON dispatch_conductores
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dispatch_folio_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_folio_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dispatch_folio_orders;
CREATE POLICY tenant_isolation ON dispatch_folio_orders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dispatch_folios ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_folios FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dispatch_folios;
CREATE POLICY tenant_isolation ON dispatch_folios
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dispatch_order_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_order_scans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dispatch_order_scans;
CREATE POLICY tenant_isolation ON dispatch_order_scans
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dispatch_unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_unidades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dispatch_unidades;
CREATE POLICY tenant_isolation ON dispatch_unidades
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- inbound / recepcion module
ALTER TABLE inbound_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inbound_lines;
CREATE POLICY tenant_isolation ON inbound_lines
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE inbound_novedad_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_novedad_tipos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inbound_novedad_tipos;
CREATE POLICY tenant_isolation ON inbound_novedad_tipos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE inbound_novedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_novedades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inbound_novedades;
CREATE POLICY tenant_isolation ON inbound_novedades
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE inbound_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inbound_orders;
CREATE POLICY tenant_isolation ON inbound_orders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE inbound_scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_scan_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inbound_scan_events;
CREATE POLICY tenant_isolation ON inbound_scan_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE inbound_validation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_validation_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inbound_validation_sessions;
CREATE POLICY tenant_isolation ON inbound_validation_sessions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- legacy inventory tables (created after migration 022 ran)
ALTER TABLE inventory_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inventory_sessions;
CREATE POLICY tenant_isolation ON inventory_sessions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE inventory_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_scans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inventory_scans;
-- inventory_scans has no tenant_id column; join via session_id instead
CREATE POLICY tenant_isolation ON inventory_scans
  USING (
    session_id IN (
      SELECT id FROM inventory_sessions
      WHERE tenant_id = current_setting('app.tenant_id', true)::uuid
    )
  );

ALTER TABLE pick_box_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE pick_box_status FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pick_box_status;
CREATE POLICY tenant_isolation ON pick_box_status
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

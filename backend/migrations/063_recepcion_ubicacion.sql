-- Migration 063: Recepción — ubicacion support ───────────────────────────

-- Scan events: store which location/slot each scan was destined for
ALTER TABLE inbound_scan_events ADD COLUMN IF NOT EXISTS ubicacion TEXT;

-- Sessions: store the last active ubicacion when the session was closed
ALTER TABLE inbound_validation_sessions ADD COLUMN IF NOT EXISTS ubicacion_nota TEXT;

-- Index to allow grouping/filtering events by ubicacion
CREATE INDEX IF NOT EXISTS idx_inbound_scan_events_ubicacion
  ON inbound_scan_events(tenant_id, order_id, ubicacion)
  WHERE ubicacion IS NOT NULL;

INSERT INTO schema_migrations (version, description)
VALUES ('063', 'recepcion_ubicacion')
ON CONFLICT (version) DO NOTHING;

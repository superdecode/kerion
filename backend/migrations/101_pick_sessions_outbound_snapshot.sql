-- Registros detail (DetailModal) currently joins destino/fecha_entrega/tracking live
-- against the Google Sheets WMS cache by outbound_order_no on every view — if that
-- sheet row later changes or disappears, historical records silently show wrong or
-- missing data. Persist a snapshot on pick_sessions at creation time instead, mirroring
-- the same pattern used for rastreo_ordenes (receiver_name/logistics_track_no/
-- logistics_channel/outbound_delivery_at). third_order_no (referencia) already exists
-- and is already populated at creation — no change needed there.
ALTER TABLE pick_sessions
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS logistics_track_no TEXT,
  ADD COLUMN IF NOT EXISTS logistics_channel TEXT,
  ADD COLUMN IF NOT EXISTS outbound_delivery_at TEXT;

INSERT INTO schema_migrations (version, description)
VALUES ('101', 'pick_sessions_outbound_snapshot')
ON CONFLICT (version) DO NOTHING;

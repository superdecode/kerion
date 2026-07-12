-- Migration 089: Persist outbound order snapshot on rastreo_ordenes
ALTER TABLE rastreo_ordenes
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS logistics_track_no TEXT,
  ADD COLUMN IF NOT EXISTS third_order_no TEXT,
  ADD COLUMN IF NOT EXISTS logistics_channel TEXT,
  ADD COLUMN IF NOT EXISTS outbound_delivery_at TEXT;

CREATE INDEX IF NOT EXISTS idx_rastreo_ordenes_tenant_delivery
  ON rastreo_ordenes (tenant_id, outbound_delivery_at);

INSERT INTO schema_migrations (version, description)
VALUES ('089', 'rastreo_outbound_snapshot')
ON CONFLICT (version) DO NOTHING;

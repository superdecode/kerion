-- Persist basic outbound metadata locally on pick_order_tracking so order detail and
-- historical validation views do not depend on a live Google Sheets read after the
-- order has already been touched in the system.
ALTER TABLE pick_order_tracking
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS logistics_track_no TEXT,
  ADD COLUMN IF NOT EXISTS logistics_channel TEXT,
  ADD COLUMN IF NOT EXISTS outbound_delivery_at TEXT,
  ADD COLUMN IF NOT EXISTS outbound_box_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_pick_order_tracking_delivery_at
  ON pick_order_tracking (tenant_id, outbound_delivery_at);

INSERT INTO schema_migrations (version, description)
VALUES ('105', 'pick_order_tracking_outbound_snapshot')
ON CONFLICT (version) DO NOTHING;

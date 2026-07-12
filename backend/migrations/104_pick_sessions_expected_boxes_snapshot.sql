-- Immutable order-scoped allow-list used by the backend to validate scans.
-- Each entry is { canonical: text, codes: text[] }; combining the owning
-- pick_session/outbound_order_no with a code prevents accepting a box merely
-- because the same code exists on another outbound order.
ALTER TABLE pick_sessions
  ADD COLUMN IF NOT EXISTS expected_boxes JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pick_sessions_expected_boxes_gin
  ON pick_sessions USING GIN (expected_boxes);

INSERT INTO schema_migrations (version, description)
VALUES ('104', 'pick_sessions_expected_boxes_snapshot')
ON CONFLICT (version) DO NOTHING;

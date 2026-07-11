-- pick_events has no per-scan operator attribution — only pick_sessions.operator_id,
-- one per session, and duplicate sessions for the same order get merged (migrations
-- 094/098), which can silently lose a second operator's identity. This adds a
-- per-event operator so multi-user validation start/end times can be computed
-- reliably regardless of session consolidation (used by the Surtido order logs).
ALTER TABLE pick_events
  ADD COLUMN IF NOT EXISTS operator_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pick_events_operator ON pick_events(operator_id);

INSERT INTO schema_migrations (version, description)
VALUES ('100', 'pick_events_operator_id')
ON CONFLICT (version) DO NOTHING;

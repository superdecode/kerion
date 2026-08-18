-- Migration 107: allow appending boxes to an inventory session (tarima) that already
-- exists for the same ubicación on the same day, instead of forcing a second tarima.
--
-- Why the extra columns instead of deriving everything from inv_scans:
--   A merged tarima is worked in two (or more) separate stretches, often by different
--   operators. Deriving its duration from MIN/MAX(scanned_at) — which is what the
--   Registros detail did — would charge the idle gap between those stretches to the
--   tarima and wreck the productivity numbers. inv_sessions.active_seconds stores the
--   sum of each stretch's own span, and completed_at is kept consistent with it
--   (started_at + active_seconds) so every existing consumer of that pair stays correct
--   without knowing merges exist.
--
--   The real wall-clock instants are NOT lost: they live per stretch in
--   inv_session_contributions and per box in inv_scans.scanned_at.

-- ── inv_sessions.active_seconds ───────────────────────────────────────────────
ALTER TABLE inv_sessions ADD COLUMN IF NOT EXISTS active_seconds INTEGER;

-- Backfill: for a never-merged session the stretch IS the whole session, so the two
-- definitions coincide and existing rows keep reporting exactly what they report today.
UPDATE inv_sessions
   SET active_seconds = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (completed_at - started_at)))::integer)
 WHERE active_seconds IS NULL
   AND started_at IS NOT NULL
   AND completed_at IS NOT NULL;

-- ── inv_scans.operator_id ─────────────────────────────────────────────────────
-- Who physically scanned each box. Until now this was only knowable at session level,
-- which stops being true the moment a second operator appends to someone else's tarima.
ALTER TABLE inv_scans ADD COLUMN IF NOT EXISTS operator_id INTEGER REFERENCES usuarios(id);

UPDATE inv_scans sc
   SET operator_id = s.operator_id
  FROM inv_sessions s
 WHERE s.id = sc.session_id
   AND sc.operator_id IS NULL
   AND s.operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_scans_operator ON inv_scans(operator_id);

-- ── inv_session_contributions ─────────────────────────────────────────────────
-- One row per stretch of work on a tarima: who worked it, when it really started and
-- ended, how many boxes it added, and how many seconds of that stretch count toward the
-- tarima's active time. This is the audit trail behind active_seconds.
CREATE TABLE IF NOT EXISTS inv_session_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  session_id UUID NOT NULL REFERENCES inv_sessions(id) ON DELETE CASCADE,
  operator_id INTEGER REFERENCES usuarios(id),
  sequence INTEGER NOT NULL DEFAULT 1,
  scans_added INTEGER NOT NULL DEFAULT 0,
  first_scan_at TIMESTAMPTZ,
  last_scan_at TIMESTAMPTZ,
  active_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_contrib_session ON inv_session_contributions(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_inv_contrib_tenant ON inv_session_contributions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_contrib_operator ON inv_session_contributions(operator_id);

-- Backfill one contribution per existing saved session so the log is complete from day
-- one and the UI never has to special-case "sessions older than this migration".
INSERT INTO inv_session_contributions
  (tenant_id, session_id, operator_id, sequence, scans_added, first_scan_at, last_scan_at, active_seconds, created_at)
SELECT s.tenant_id, s.id, s.operator_id, 1,
       COALESCE(s.total_scans, 0), s.started_at, s.completed_at,
       COALESCE(s.active_seconds, 0), COALESCE(s.created_at, now())
  FROM inv_sessions s
 WHERE NOT EXISTS (
   SELECT 1 FROM inv_session_contributions c WHERE c.session_id = s.id
 );

-- ── Lookup index for the "¿esta ubicación ya tiene tarima hoy?" check ─────────
CREATE INDEX IF NOT EXISTS idx_inv_sessions_ubicacion_day
  ON inv_sessions(tenant_id, ubicacion_id, started_at DESC)
  WHERE ubicacion_id IS NOT NULL;

-- ── RLS (same uniform policy as migration 103) ────────────────────────────────
ALTER TABLE inv_session_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_session_contributions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inv_session_contributions;
CREATE POLICY tenant_isolation ON inv_session_contributions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

INSERT INTO schema_migrations (version, description)
VALUES ('107', 'inv_session_merge: active_seconds, scan operator_id, contributions log')
ON CONFLICT (version) DO NOTHING;

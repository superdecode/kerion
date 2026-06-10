-- Migration 041: Add tenant_id to pick_events and inv_scans
-- Both tables previously relied solely on session_id FK for tenant isolation.
-- This adds an explicit tenant_id column + index + NOT NULL constraint on each,
-- backfilling from the parent session table.

-- ── pick_events ──────────────────────────────────────────────────────────────

ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Backfill from parent pick_sessions
UPDATE pick_events pe
SET tenant_id = ps.tenant_id
FROM pick_sessions ps
WHERE pe.session_id = ps.id
  AND pe.tenant_id IS NULL;

-- Enforce going forward
ALTER TABLE pick_events ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pick_events_tenant
  ON pick_events(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pick_events_tenant_session
  ON pick_events(tenant_id, session_id);

-- ── inv_scans ─────────────────────────────────────────────────────────────────

ALTER TABLE inv_scans ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Backfill from parent inv_sessions
UPDATE inv_scans s
SET tenant_id = ss.tenant_id
FROM inv_sessions ss
WHERE s.session_id = ss.id
  AND s.tenant_id IS NULL;

ALTER TABLE inv_scans ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_scans_tenant
  ON inv_scans(tenant_id);

CREATE INDEX IF NOT EXISTS idx_inv_scans_tenant_session
  ON inv_scans(tenant_id, session_id);

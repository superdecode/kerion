-- Migration 042: Explicit RLS tenant_isolation policies for tables created after migration 022.
--
-- Background: server.js runMigrations() enables RLS on every public table via a sweep
-- (server.js:810-818), but does NOT create policies. Migration 022 only covered the 16
-- tables that existed at that time. All tables created after 022 (pick_*, inv_*, wms_config,
-- pick_manual_reasons, pick_events, inv_scans) have RLS enabled but no policy, which means
-- non-BYPASSRLS roles get deny-all (safe but unintentional). This migration adds explicit
-- tenant_isolation policies to match the pattern used in 022.
--
-- The backend connects as the postgres superuser (BYPASSRLS) so these policies have no
-- operational effect today, but they provide defense-in-depth if the DB role ever changes
-- (e.g., Supabase service role, read-replica role, future non-superuser connection).

-- Helper function used in policy expressions:
-- current_setting('app.tenant_id', true) is set by tenantDB middleware per request.

-- ── pick_sessions ─────────────────────────────────────────────────────────────
ALTER TABLE pick_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pick_sessions;
CREATE POLICY tenant_isolation ON pick_sessions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── pick_events ───────────────────────────────────────────────────────────────
ALTER TABLE pick_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pick_events;
CREATE POLICY tenant_isolation ON pick_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── inv_sessions ──────────────────────────────────────────────────────────────
ALTER TABLE inv_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inv_sessions;
CREATE POLICY tenant_isolation ON inv_sessions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── inv_scans ─────────────────────────────────────────────────────────────────
ALTER TABLE inv_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inv_scans;
CREATE POLICY tenant_isolation ON inv_scans
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── pick_surtidores ───────────────────────────────────────────────────────────
ALTER TABLE pick_surtidores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pick_surtidores;
CREATE POLICY tenant_isolation ON pick_surtidores
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── pick_order_tracking ───────────────────────────────────────────────────────
ALTER TABLE pick_order_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pick_order_tracking;
CREATE POLICY tenant_isolation ON pick_order_tracking
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── pick_manual_reasons ───────────────────────────────────────────────────────
ALTER TABLE pick_manual_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pick_manual_reasons;
CREATE POLICY tenant_isolation ON pick_manual_reasons
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── wms_config ────────────────────────────────────────────────────────────────
ALTER TABLE wms_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wms_config;
CREATE POLICY tenant_isolation ON wms_config
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

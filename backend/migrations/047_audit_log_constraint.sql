-- Migration 047: Add CHECK constraint to audit_log to prevent tenant-less app-level events.
--
-- Background: audit_log.tenant_id is nullable by design to support system-level
-- events (e.g. super_admin actions, cron jobs). However, any event triggered by a
-- regular user (user_id IS NOT NULL) must always have a tenant_id. Without this
-- constraint it is possible to accidentally INSERT an audit row for a user action
-- without tenant context, which makes per-tenant audit reports incomplete.

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_tenant_or_system
  CHECK (
    tenant_id IS NOT NULL
    OR user_id IS NULL   -- system/super_admin events have no user_id
  );

-- Also insert migration 047 into schema_migrations if the table exists
INSERT INTO schema_migrations (version, description)
VALUES ('047', 'audit_log tenant_or_system constraint')
ON CONFLICT (version) DO NOTHING;

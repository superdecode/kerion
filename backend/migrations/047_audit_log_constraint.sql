-- Migration 047: Add CHECK constraint to audit_log to prevent tenant-less app-level events.
--
-- First backfill tenant_id from usuarios for any existing rows that have a user_id
-- but are missing tenant_id (created before multi-tenant was enforced).

UPDATE audit_log al
SET tenant_id = u.tenant_id
FROM usuarios u
WHERE al.user_id = u.id
  AND al.tenant_id IS NULL
  AND u.tenant_id IS NOT NULL;

-- Any remaining rows with user_id but still no resolvable tenant: null out user_id
-- so they are treated as system events (rather than dropping them).
UPDATE audit_log
SET user_id = NULL
WHERE tenant_id IS NULL
  AND user_id IS NOT NULL;

-- Now safe to add the constraint:
-- user-triggered events must have a tenant_id; system events have user_id = NULL.
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_tenant_or_system;

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_tenant_or_system
  CHECK (
    tenant_id IS NOT NULL
    OR user_id IS NULL
  );

INSERT INTO schema_migrations (version, description)
VALUES ('047', 'audit_log tenant_or_system constraint')
ON CONFLICT (version) DO NOTHING;

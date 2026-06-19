-- Migration 077: Superseded by 078.
-- Left in place as a no-op to preserve schema_migrations version history.

INSERT INTO schema_migrations (version, description)
VALUES ('077', 'recepcion_role_perms_backfill_fix')
ON CONFLICT (version) DO NOTHING;

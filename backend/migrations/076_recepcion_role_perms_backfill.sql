-- Migration 076: Backfill recepcion.recibir for non-Administrador roles
-- Migration 061 only added recepcion.recibir: 'eliminar' to Administrador roles.
-- This migration is superseded by 078 which has the correct implementation.
-- Left in place as a no-op to preserve schema_migrations version history.

INSERT INTO schema_migrations (version, description)
VALUES ('076', 'recepcion_role_perms_backfill')
ON CONFLICT (version) DO NOTHING;

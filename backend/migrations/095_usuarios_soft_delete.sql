-- Adds a proper "permanently deleted" state for usuarios, distinct from estado='INACTIVO'.
-- Hard-deleting the row isn't viable: dozens of tables FK to usuarios.id (some ON DELETE
-- RESTRICT, e.g. guias, alertas_duplicados), so any user with real activity would block a
-- physical DELETE. Instead, deleted_at marks the row as a tombstone (excluded from the
-- users list) while the row itself — and every historical FK pointing at it — stays intact.
-- The email column is freed up (mangled) on delete so the original address can be reused
-- by a newly created user.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_deleted_at ON usuarios(deleted_at);

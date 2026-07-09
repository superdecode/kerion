-- Supports long-lived sessions (JWT now valid up to 30 days) while still forcing
-- re-login exactly when it matters: the user's own password changed, or their
-- role's permissions changed. Both are dedicated, narrowly-scoped timestamps —
-- NOT the generic updated_at columns, which get bumped by unrelated edits
-- (ultimo_acceso, tour_completado, nombre/descripcion) and would cause
-- unwanted forced logouts if reused for this purpose.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NULL;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS permisos_changed_at TIMESTAMPTZ NULL;

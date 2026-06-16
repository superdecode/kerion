-- Migration 064: Backfill recepcion.validacion permission ─────────────────────
-- The validacion sub-module was added after initial recepcion provisioning.
-- Existing roles only have recepcion.recibir; this adds recepcion.validacion
-- at the same level as recibir so existing users can access the scan endpoints.

UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{recepcion,validacion}',
  to_jsonb(permisos->'recepcion'->>'recibir')  -- inherit same level as recibir
)
WHERE permisos ? 'recepcion'
  AND (permisos->'recepcion') ? 'recibir'
  AND NOT (permisos->'recepcion') ? 'validacion';

INSERT INTO schema_migrations (version, description)
VALUES ('064', 'recepcion_validacion_perms')
ON CONFLICT (version) DO NOTHING;

-- Migration 061: Security audit role permission backfill

-- Backfill anormalidades.configuracion for legacy roles created before the
-- sub-permission was introduced.
UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{anormalidades,configuracion}',
  '"eliminar"'::jsonb,
  true
)
WHERE nombre = 'Administrador'
  AND permisos ? 'anormalidades'
  AND NOT ((permisos->'anormalidades') ? 'configuracion');

UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{anormalidades,configuracion}',
  '"ver"'::jsonb,
  true
)
WHERE nombre IN ('Jefe', 'Supervisor')
  AND permisos ? 'anormalidades'
  AND NOT ((permisos->'anormalidades') ? 'configuracion');

INSERT INTO schema_migrations (version, description)
VALUES ('061', 'security_audit_role_permission_backfill')
ON CONFLICT (version) DO NOTHING;

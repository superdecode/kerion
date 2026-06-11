-- Migration 052: Normalize role permisos keys
-- Renames legacy 'inventory' key to 'inventario' and backfills anormalidades + sistema
-- for all existing Administrador, Jefe, Operador, Usuario roles.

-- ── 1. Rename inventory → inventario for all roles that still use the old key ──
UPDATE roles
SET permisos = (permisos - 'inventory') || jsonb_build_object(
  'inventario', jsonb_build_object(
    'escaneo',   COALESCE(permisos->'inventory'->>'escaneo',   'sin_acceso'),
    'registros', COALESCE(permisos->'inventory'->>'tarimas',   'sin_acceso')
  )
)
WHERE permisos ? 'inventory';

-- ── 2. Add anormalidades key to Administrador roles missing it ───────────────
UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{anormalidades}',
  '{"registro":"eliminar","dashboard":"eliminar","mejoras":"eliminar","configuracion":"eliminar"}'::jsonb
)
WHERE nombre = 'Administrador'
  AND NOT (permisos ? 'anormalidades');

-- ── 3. Ensure all Administrador roles have sistema key ─────────────────────
UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{sistema}',
  '{"wms":"eliminar"}'::jsonb
)
WHERE nombre = 'Administrador'
  AND NOT (permisos ? 'sistema');

-- ── 7. Track migration ────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description)
VALUES ('052', 'normalize_role_permisos_keys')
ON CONFLICT (version) DO NOTHING;

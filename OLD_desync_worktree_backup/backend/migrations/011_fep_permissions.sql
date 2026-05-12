-- Migration 011: backfill FEP permissions for existing roles
--
-- New levels: sin_acceso, ver, crear, actualizar, eliminar
-- and `total` = eliminar for `fep.folios`.

UPDATE roles
SET permisos = jsonb_set(permisos, '{fep}', '{"folios":"eliminar"}'::jsonb, true)
WHERE nombre = 'Administrador';

UPDATE roles
SET permisos = jsonb_set(permisos, '{fep}', '{"folios":"actualizar"}'::jsonb, true)
WHERE nombre IN ('Jefe', 'Supervisor');

UPDATE roles
SET permisos = jsonb_set(permisos, '{fep}', '{"folios":"crear"}'::jsonb, true)
WHERE nombre = 'Operador';

UPDATE roles
SET permisos = jsonb_set(permisos, '{fep}', '{"folios":"ver"}'::jsonb, true)
WHERE nombre = 'Usuario';

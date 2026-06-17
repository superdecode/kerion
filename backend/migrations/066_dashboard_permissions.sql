-- Migration 066: Add dashboard permission to all modules that have dashboards ───
-- Modules: devoluciones, recepcion, inventario, surtido, despacho
-- Strategy: set dashboard='eliminar' on any role that already has access in
-- that module namespace, preserving backward compatibility (dashboards were
-- previously accessible to anyone with any module permission).

UPDATE roles SET permisos = jsonb_set(permisos, '{devoluciones,dashboard}', '"eliminar"', true)
WHERE permisos ? 'devoluciones'
  AND NOT (permisos->'devoluciones') ? 'dashboard';

UPDATE roles SET permisos = jsonb_set(permisos, '{recepcion,dashboard}', '"eliminar"', true)
WHERE permisos ? 'recepcion'
  AND NOT (permisos->'recepcion') ? 'dashboard';

UPDATE roles SET permisos = jsonb_set(permisos, '{inventario,dashboard}', '"eliminar"', true)
WHERE permisos ? 'inventario'
  AND NOT (permisos->'inventario') ? 'dashboard';

UPDATE roles SET permisos = jsonb_set(permisos, '{surtido,dashboard}', '"eliminar"', true)
WHERE permisos ? 'surtido'
  AND NOT (permisos->'surtido') ? 'dashboard';

UPDATE roles SET permisos = jsonb_set(permisos, '{despacho,dashboard}', '"eliminar"', true)
WHERE permisos ? 'despacho'
  AND NOT (permisos->'despacho') ? 'dashboard';

INSERT INTO schema_migrations (version, description)
VALUES ('066', 'dashboard_permissions')
ON CONFLICT (version) DO NOTHING;

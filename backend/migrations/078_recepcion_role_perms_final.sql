-- Migration 078: Correct backfill of recepcion permissions for all non-Administrador roles
-- Migration 061 only added recepcion.recibir to Administrador. This migration sets
-- recepcion.recibir on all other roles based on their highest access level across
-- core operational modules (dropscan.escaneo, inventario.escaneo, despacho.folios).
--
-- Implementation notes:
-- 1. roles table has FORCE ROW LEVEL SECURITY — must set app.tenant_id per tenant
-- 2. jsonb_set does NOT create intermediate path keys — use || merge operator instead
-- 3. Existing recepcion.recibir values are preserved (only updates roles missing the key)

DO $$
DECLARE
  t UUID;
BEGIN
  FOR t IN SELECT DISTINCT tenant_id FROM roles WHERE nombre != 'Administrador' LOOP
    PERFORM set_config('app.tenant_id', t::text, true);

    UPDATE roles
    SET permisos = COALESCE(permisos, '{}'::jsonb) || jsonb_build_object(
      'recepcion', jsonb_build_object(
        'recibir', CASE
          WHEN permisos->'inventario'->>'escaneo' = 'eliminar'
            OR permisos->'inventario'->>'registros' = 'eliminar'
            OR permisos->'dropscan'->>'escaneo' = 'eliminar'
            OR permisos->'despacho'->>'folios' = 'eliminar' THEN 'eliminar'
          WHEN permisos->'inventario'->>'escaneo' = 'actualizar'
            OR permisos->'dropscan'->>'escaneo' = 'actualizar'
            OR permisos->'despacho'->>'folios' = 'actualizar' THEN 'actualizar'
          WHEN permisos->'inventario'->>'escaneo' = 'crear'
            OR permisos->'dropscan'->>'escaneo' = 'crear' THEN 'crear'
          WHEN permisos->'inventario'->>'escaneo' = 'ver'
            OR permisos->'dropscan'->>'escaneo' = 'ver' THEN 'ver'
          ELSE 'sin_acceso'
        END,
        'validacion', CASE
          WHEN permisos->'inventario'->>'escaneo' = 'eliminar'
            OR permisos->'inventario'->>'registros' = 'eliminar'
            OR permisos->'dropscan'->>'escaneo' = 'eliminar'
            OR permisos->'despacho'->>'folios' = 'eliminar' THEN 'eliminar'
          WHEN permisos->'inventario'->>'escaneo' = 'actualizar'
            OR permisos->'dropscan'->>'escaneo' = 'actualizar'
            OR permisos->'despacho'->>'folios' = 'actualizar' THEN 'actualizar'
          WHEN permisos->'inventario'->>'escaneo' = 'crear'
            OR permisos->'dropscan'->>'escaneo' = 'crear' THEN 'crear'
          WHEN permisos->'inventario'->>'escaneo' = 'ver'
            OR permisos->'dropscan'->>'escaneo' = 'ver' THEN 'ver'
          ELSE 'sin_acceso'
        END
      )
    ),
    updated_at = now()
    WHERE tenant_id = t
      AND nombre != 'Administrador'
      AND NOT (COALESCE(permisos, '{}'::jsonb) ? 'recepcion');
  END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('078', 'recepcion_role_perms_final')
ON CONFLICT (version) DO NOTHING;

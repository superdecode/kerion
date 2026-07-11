-- Migration 103: FORCE Row Level Security + tenant_isolation policies for every
-- tenant-owned table that still lacked them.
--
-- Background: the backend connects today as a BYPASSRLS role, so RLS is inert and
-- tenant isolation is enforced purely by explicit `WHERE tenant_id = $` filters in
-- application code. This migration makes RLS a real backstop the moment the app is
-- pointed at a restricted (non-BYPASSRLS) role — no code change required then.
--
-- What it does, defensively, via a DO block:
--   * Only touches tables that (a) exist and (b) actually have a `tenant_id` column.
--     Child tables without their own tenant_id (some dev_* / anormalidades_* detail
--     tables) are skipped automatically; they inherit isolation through their
--     tenant-scoped parent in every query path.
--   * ENABLE + FORCE ROW LEVEL SECURITY (FORCE so even the table owner is subject to
--     the policy — the plain ENABLE from migration 042 was bypassed by the owner).
--   * (Re)creates a uniform `tenant_isolation` policy:
--       USING/WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
--     current_setting(..., true) returns NULL (not an error) when unset, so
--     super-admin/global queries that never SET app.tenant_id simply match no rows,
--     which is the safe default.
--
-- Intentionally NOT forced here (kept global, like audit_log): bug_reports,
-- system_error_events, landing_events. These carry a nullable tenant_id AND are read
-- cross-tenant by super-admin routes that run WITHOUT tenant context; forcing RLS on
-- them would hide all rows from the super-admin dashboards once on a restricted role.
-- If those tables ever move behind tenant context, add them to the list below.

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    -- migration 042 tables that had ENABLE but no FORCE
    'pick_sessions', 'pick_events', 'inv_sessions', 'inv_scans',
    'pick_surtidores', 'pick_order_tracking', 'pick_manual_reasons', 'wms_config',
    'pick_box_status',
    -- tables created after 022/042/083 with no policy at all
    'rastreo_ordenes', 'rastreo_cajas', 'rastreo_historial', 'rastreo_causa_tipos',
    'anormalidades', 'anormalidades_codigos', 'anormalidades_config',
    'anormalidades_historial', 'anormalidades_mejoras', 'anormalidades_mejoras_vinculos',
    'dev_sesiones', 'dev_items', 'dev_item_skus', 'dev_item_fotos', 'dev_movimientos',
    'dev_inventario', 'dev_ubicaciones', 'dev_ajustes', 'dev_salidas', 'dev_salida_items',
    'tenant_modules', 'tenant_notes'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    -- Skip tables that don't exist or don't have a tenant_id column.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      RAISE NOTICE 'skip % (no tenant_id column or table absent)', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I '
      'USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
    RAISE NOTICE 'RLS forced + policy set on %', t;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('103', 'rls_force_and_policies')
ON CONFLICT (version) DO NOTHING;

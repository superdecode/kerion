-- Migration 046: Create schema_migrations tracking table.
--
-- Background: there is no table recording which migration files have been applied.
-- Combined with the inline migrations in server.js, it is impossible to know the
-- exact schema state of any environment from code alone. This table provides the
-- foundation for a proper migration runner in a subsequent session.
--
-- This migration backfills all known migrations (001..045) as already applied.
-- The run-migration.js script is NOT modified here; that update is a separate task.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum    TEXT,
  description TEXT
);

-- Backfill all known applied migrations
INSERT INTO schema_migrations (version, description) VALUES
  ('001', 'create dropscan config tables'),
  ('002', 'token blacklist and audit log'),
  ('003', 'usuarios internos'),
  ('004', 'forzado cierre'),
  ('005', 'user timezone'),
  ('006', 'guias usuario interno id'),
  ('007', 'wms inventory supabase'),
  ('010', 'create fep tables'),
  ('011', 'fep permissions'),
  ('020', 'multitenant base'),
  ('021', 'tenant scope existing tables'),
  ('022', 'rls policies'),
  ('023', 'tenant notes'),
  ('024', 'landing events'),
  ('025', 'folios entrega tenant'),
  ('026', 'plans extend'),
  ('027', 'tenant timezone'),
  ('028', 'audit and protection'),
  ('030', 'tenant_id audit fixes'),
  ('031', 'subscriptions history and inventory tarimas'),
  ('032', 'monthly trial'),
  ('033', 'audit log entity_id text'),
  ('034', 'devoluciones'),
  ('035', 'devoluciones v2'),
  ('036', 'guias peso kg'),
  ('037', 'devoluciones movimientos documento'),
  ('038', 'devoluciones movimientos descripcion'),
  ('039', 'wms sheet config'),
  ('040', 'pick_sessions ubicacion_nota'),
  ('041', 'pick_events inv_scans tenant_id'),
  ('042', 'rls policies extended'),
  ('043', 'tenant_modules'),
  ('044', 'wms_cache pk fix'),
  ('045', 'composite indexes'),
  ('046', 'schema_migrations table')
ON CONFLICT (version) DO NOTHING;

-- Migration 054: Add 'anormalidades' to the tenant_modules.module_code CHECK constraint
-- and backfill all existing tenants.
--
-- Background: migration 043 defined the allowed module codes as
-- ('dropscan', 'surtido', 'inventario', 'devoluciones', 'fep').
-- Migration 051 introduced the anormalidades module and tried to insert
-- module_code = 'anormalidades', which violates the constraint.
-- This migration drops the old constraint and recreates it with anormalidades included.

-- Drop the existing constraint
ALTER TABLE tenant_modules
  DROP CONSTRAINT IF EXISTS tenant_modules_module_code_check;

-- Recreate with anormalidades added
ALTER TABLE tenant_modules
  ADD CONSTRAINT tenant_modules_module_code_check
  CHECK (module_code IN ('dropscan', 'surtido', 'inventario', 'devoluciones', 'fep', 'anormalidades'));

-- Backfill: all existing tenants get anormalidades enabled.
-- ON CONFLICT DO NOTHING so re-running is safe.
INSERT INTO tenant_modules (tenant_id, module_code, enabled, enabled_at, enabled_by, notes)
SELECT
  t.id,
  'anormalidades',
  TRUE,
  NOW(),
  'system',
  'migration 054: anormalidades enabled by default for existing tenants'
FROM tenants t
ON CONFLICT (tenant_id, module_code) DO NOTHING;

INSERT INTO schema_migrations (version, description)
VALUES ('054', 'tenant_modules_add_anormalidades')
ON CONFLICT (version) DO NOTHING;

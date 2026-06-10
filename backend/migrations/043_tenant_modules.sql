-- Migration 043: Create tenant_modules table for per-tenant module entitlement.
--
-- Background: module access was previously derived solely from plans.modules JSONB,
-- meaning enabling/disabling a module for one tenant required modifying a shared plan
-- (affecting all tenants on that plan). This table allows per-tenant module overrides
-- with an audit trail (who enabled/disabled, when, notes).
--
-- This migration creates the table and backfills ALL existing tenants with all four
-- modules enabled (no regressions for tenants already using the product).
--
-- Integration note: moduleGuard.js is NOT modified in this migration. The application
-- layer wiring (reading tenant_modules instead of plans.modules) is done in a subsequent
-- session to keep this change scope-limited to schema only.

CREATE TABLE IF NOT EXISTS tenant_modules (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_code   TEXT        NOT NULL CHECK (module_code IN ('dropscan', 'surtido', 'inventario', 'devoluciones', 'fep')),
  enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
  enabled_at    TIMESTAMPTZ,
  enabled_by    TEXT,        -- super_admin email or 'system'
  disabled_at   TIMESTAMPTZ,
  disabled_by   TEXT,        -- super_admin email or 'system'
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, module_code)
);

CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant
  ON tenant_modules(tenant_id);

-- Partial index for fast "what modules are enabled for tenant X" lookups
CREATE INDEX IF NOT EXISTS idx_tenant_modules_enabled
  ON tenant_modules(tenant_id, module_code) WHERE enabled = TRUE;

-- RLS: tenant-scoped so a tenant's own API calls only see their modules.
-- Super Admin endpoints use BYPASSRLS postgres role so they see all rows.
ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_modules;
CREATE POLICY tenant_isolation ON tenant_modules
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Backfill: all existing tenants get all 4 core modules enabled.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.
INSERT INTO tenant_modules (tenant_id, module_code, enabled, enabled_at, enabled_by, notes)
SELECT
  t.id,
  m.code,
  TRUE,
  NOW(),
  'system',
  'backfill: all modules enabled for existing tenants at migration 043'
FROM tenants t
CROSS JOIN (
  VALUES ('dropscan'), ('surtido'), ('inventario'), ('devoluciones')
) AS m(code)
ON CONFLICT (tenant_id, module_code) DO NOTHING;

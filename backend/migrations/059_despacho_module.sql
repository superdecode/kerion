-- Migration 059: Embarques y Despacho module ─────────────────────────────────

-- Drivers catalog
CREATE TABLE IF NOT EXISTS dispatch_conductores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id) NOT NULL,
  nombre     TEXT NOT NULL,
  licencia   TEXT,
  telefono   TEXT,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_conductores_tenant
  ON dispatch_conductores(tenant_id, activo);

-- Transport units catalog
CREATE TABLE IF NOT EXISTS dispatch_unidades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) NOT NULL,
  placa         TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'camion'
    CHECK (tipo IN ('camion','furgon','camioneta','trailer','moto')),
  capacidad_kg  NUMERIC,
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_unidades_tenant
  ON dispatch_unidades(tenant_id, activo);

-- Dispatch folios (embarques)
CREATE TABLE IF NOT EXISTS dispatch_folios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) NOT NULL,
  folio_numero  TEXT NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','en_proceso','cerrado','cancelado')),
  conductor_id  UUID REFERENCES dispatch_conductores(id),
  unidad_id     UUID REFERENCES dispatch_unidades(id),
  operador_id   INTEGER REFERENCES usuarios(id),
  fecha_salida  TIMESTAMPTZ,
  notas         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_folios_numero
  ON dispatch_folios(tenant_id, folio_numero);
CREATE INDEX IF NOT EXISTS idx_dispatch_folios_tenant
  ON dispatch_folios(tenant_id, estado, created_at DESC);

-- Orders assigned to dispatch folios
CREATE TABLE IF NOT EXISTS dispatch_folio_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id) NOT NULL,
  folio_id          UUID REFERENCES dispatch_folios(id) ON DELETE CASCADE,
  outbound_order_no TEXT NOT NULL,
  cliente           TEXT,
  bultos            INT NOT NULL DEFAULT 1,
  peso_kg           NUMERIC,
  estado            TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','cargado','entregado','devolucion')),
  notas             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_folio_orders_unique
  ON dispatch_folio_orders(tenant_id, folio_id, outbound_order_no);
CREATE INDEX IF NOT EXISTS idx_dispatch_folio_orders_folio
  ON dispatch_folio_orders(tenant_id, folio_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_folio_orders_order_no
  ON dispatch_folio_orders(tenant_id, outbound_order_no);

-- ── Add despacho permisos to existing Administrador roles ────────────────────
UPDATE roles
SET permisos = permisos || '{"despacho": {"ordenes": "eliminar", "folios": "eliminar"}}'::jsonb,
    updated_at = now()
WHERE nombre = 'Administrador'
  AND (permisos -> 'despacho') IS NULL;

-- ── Extend tenant_modules CHECK constraint to include despacho ───────────────
ALTER TABLE tenant_modules DROP CONSTRAINT IF EXISTS tenant_modules_module_code_check;
ALTER TABLE tenant_modules ADD CONSTRAINT tenant_modules_module_code_check
  CHECK (module_code = ANY (ARRAY['dropscan','surtido','inventario','devoluciones','fep','anormalidades','despacho']));

-- ── Seed despacho module for all tenants that have surtido enabled ───────────
INSERT INTO tenant_modules (tenant_id, module_code, enabled, enabled_at, enabled_by, notes)
SELECT tenant_id, 'despacho', true, now(), 'system', 'auto-provisioned with migration 059'
FROM tenant_modules
WHERE module_code = 'surtido' AND enabled = true
ON CONFLICT (tenant_id, module_code) DO NOTHING;

INSERT INTO schema_migrations (version, description)
VALUES ('059', 'despacho_module')
ON CONFLICT (version) DO NOTHING;

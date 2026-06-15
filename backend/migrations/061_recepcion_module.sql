-- Migration 061: Recepción module ────────────────────────────────────────────

-- Extend tenant_modules CHECK constraint to include recepcion
ALTER TABLE tenant_modules DROP CONSTRAINT IF EXISTS tenant_modules_module_code_check;
ALTER TABLE tenant_modules ADD CONSTRAINT tenant_modules_module_code_check
  CHECK (module_code = ANY (ARRAY['dropscan','surtido','inventario','devoluciones','fep','anormalidades','despacho','recepcion']));

-- Inbound orders (one per WMS import)
CREATE TABLE IF NOT EXISTS inbound_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  folio            TEXT NOT NULL,
  cliente          TEXT,
  inbound_order_no TEXT,
  tracking_no      TEXT,
  reference_no     TEXT,
  estado           TEXT NOT NULL DEFAULT 'pendiente_validacion'
    CHECK (estado IN ('pendiente_validacion','en_validacion','completo','parcial','cancelado')),
  total_cajas      INT NOT NULL DEFAULT 0,
  cajas_validadas  INT NOT NULL DEFAULT 0,
  responsable_id   INT REFERENCES usuarios(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, folio)
);
CREATE INDEX IF NOT EXISTS idx_inbound_orders_tenant
  ON inbound_orders(tenant_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_orders_tracking
  ON inbound_orders(tenant_id, tracking_no);
CREATE INDEX IF NOT EXISTS idx_inbound_orders_cliente
  ON inbound_orders(tenant_id, cliente);

-- Inbound lines (one per box imported from Excel)
CREATE TABLE IF NOT EXISTS inbound_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  order_id            UUID NOT NULL REFERENCES inbound_orders(id) ON DELETE CASCADE,
  box_type            TEXT,
  custom_box_barcode  TEXT,
  sku                 TEXT,
  qty_per_box         INT,
  length_oms          NUMERIC(10,3),
  width_oms           NUMERIC(10,3),
  height_oms          NUMERIC(10,3),
  dimension_unit      TEXT,
  weight_oms          NUMERIC(10,3),
  weight_unit         TEXT,
  estado_validacion   TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado_validacion IN ('pendiente','validada','faltante')),
  validated_by        INT REFERENCES usuarios(id),
  validated_at        TIMESTAMPTZ,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inbound_lines_order
  ON inbound_lines(tenant_id, order_id, estado_validacion);
CREATE INDEX IF NOT EXISTS idx_inbound_lines_barcode
  ON inbound_lines(tenant_id, order_id, custom_box_barcode);
CREATE INDEX IF NOT EXISTS idx_inbound_lines_box_type
  ON inbound_lines(tenant_id, order_id, box_type);

-- Scan events log
CREATE TABLE IF NOT EXISTS inbound_scan_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  order_id         UUID NOT NULL REFERENCES inbound_orders(id) ON DELETE CASCADE,
  line_id          UUID REFERENCES inbound_lines(id),
  codigo_escaneado TEXT NOT NULL,
  match_field      TEXT,
  sku_asociado     TEXT,
  resultado        TEXT NOT NULL
    CHECK (resultado IN ('correcto','duplicado','no_encontrado')),
  scanned_by       INT REFERENCES usuarios(id),
  scanned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inbound_scan_events_order
  ON inbound_scan_events(tenant_id, order_id, scanned_at DESC);

-- Validation sessions
CREATE TABLE IF NOT EXISTS inbound_validation_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  order_id         UUID NOT NULL REFERENCES inbound_orders(id) ON DELETE CASCADE,
  user_id          INT REFERENCES usuarios(id),
  inicio_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  fin_at           TIMESTAMPTZ,
  total_escaneado  INT NOT NULL DEFAULT 0,
  tarimas_enabled  BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inbound_validation_sessions_order
  ON inbound_validation_sessions(tenant_id, order_id);

-- Enable recepcion module for all existing tenants
INSERT INTO tenant_modules (tenant_id, module_code, enabled, enabled_at, enabled_by, notes)
SELECT id, 'recepcion', true, now(), 'system', 'migration 061 backfill'
FROM tenants
ON CONFLICT (tenant_id, module_code) DO NOTHING;

-- Add recepcion permissions to all Administrador roles
UPDATE roles
SET permisos = permisos || '{"recepcion": {"recibir": "eliminar"}}'::jsonb,
    updated_at = now()
WHERE nombre = 'Administrador'
  AND (permisos -> 'recepcion') IS NULL;

INSERT INTO schema_migrations (version, description)
VALUES ('061', 'recepcion_module')
ON CONFLICT (version) DO NOTHING;

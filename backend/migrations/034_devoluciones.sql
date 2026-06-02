BEGIN;

CREATE TABLE IF NOT EXISTS dev_ubicaciones (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(codigo, tenant_id)
);

CREATE TABLE IF NOT EXISTS dev_sesiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','en_proceso','confirmado','cancelado')),
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  ubicacion_id INTEGER REFERENCES dev_ubicaciones(id),
  notas TEXT,
  confirmado_at TIMESTAMPTZ,
  cancelado_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(codigo, tenant_id)
);

CREATE TABLE IF NOT EXISTS dev_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id UUID NOT NULL REFERENCES dev_sesiones(id) ON DELETE CASCADE,
  codigo_trazabilidad TEXT NOT NULL,
  embalaje1 TEXT,
  embalaje2 TEXT,
  descripcion TEXT,
  peso NUMERIC(10,3),
  largo NUMERIC(10,2),
  ancho NUMERIC(10,2),
  alto NUMERIC(10,2),
  multicaja BOOLEAN DEFAULT false,
  es_danado BOOLEAN DEFAULT false,
  notas TEXT,
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  ubicacion_id INTEGER REFERENCES dev_ubicaciones(id),
  en_inventario BOOLEAN DEFAULT false,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(codigo_trazabilidad, tenant_id)
);

CREATE TABLE IF NOT EXISTS dev_item_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES dev_items(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  sku2 TEXT,
  descripcion TEXT,
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dev_item_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES dev_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  nombre_original TEXT,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dev_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES dev_items(id),
  sesion_id UUID NOT NULL REFERENCES dev_sesiones(id),
  sku TEXT NOT NULL,
  sku2 TEXT,
  descripcion TEXT,
  embalaje1 TEXT,
  embalaje2 TEXT,
  codigo_trazabilidad TEXT NOT NULL,
  cantidad_disponible INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_disponible >= 0),
  cantidad_original INTEGER NOT NULL CHECK (cantidad_original >= 0),
  ubicacion_id INTEGER REFERENCES dev_ubicaciones(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dev_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste','traslado')),
  inventario_id UUID REFERENCES dev_inventario(id),
  item_id UUID REFERENCES dev_items(id),
  cantidad_anterior INTEGER,
  cantidad_nueva INTEGER,
  ubicacion_anterior_id INTEGER REFERENCES dev_ubicaciones(id),
  ubicacion_nueva_id INTEGER REFERENCES dev_ubicaciones(id),
  referencia_id UUID,
  referencia_tipo TEXT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  motivo TEXT,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dev_ajustes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('ajuste','movimiento')),
  estado TEXT NOT NULL DEFAULT 'confirmado'
    CHECK (estado IN ('borrador','confirmado','cancelado')),
  descripcion TEXT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dev_salidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','pendiente','en_proceso','completado','cancelado')),
  notas TEXT,
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  completado_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(codigo, tenant_id)
);

CREATE TABLE IF NOT EXISTS dev_salida_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salida_id UUID NOT NULL REFERENCES dev_salidas(id) ON DELETE CASCADE,
  inventario_id UUID NOT NULL REFERENCES dev_inventario(id),
  sku TEXT NOT NULL,
  descripcion TEXT,
  codigo_trazabilidad TEXT,
  ubicacion_id INTEGER REFERENCES dev_ubicaciones(id),
  cantidad_solicitada INTEGER NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_surtida INTEGER CHECK (cantidad_surtida IS NULL OR cantidad_surtida >= 0),
  surtido BOOLEAN DEFAULT false,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_sesiones_tenant_estado ON dev_sesiones(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_dev_sesiones_tenant_created ON dev_sesiones(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_sesiones_codigo ON dev_sesiones(tenant_id, codigo);
CREATE INDEX IF NOT EXISTS idx_dev_items_sesion ON dev_items(sesion_id);
CREATE INDEX IF NOT EXISTS idx_dev_items_tenant_trazabilidad ON dev_items(tenant_id, codigo_trazabilidad);
CREATE INDEX IF NOT EXISTS idx_dev_items_tenant_embalaje1 ON dev_items(tenant_id, embalaje1);
CREATE INDEX IF NOT EXISTS idx_dev_items_tenant_embalaje2 ON dev_items(tenant_id, embalaje2);
CREATE INDEX IF NOT EXISTS idx_dev_item_skus_item ON dev_item_skus(item_id);
CREATE INDEX IF NOT EXISTS idx_dev_item_skus_tenant_sku ON dev_item_skus(tenant_id, sku);
CREATE INDEX IF NOT EXISTS idx_dev_item_fotos_item ON dev_item_fotos(item_id);
CREATE INDEX IF NOT EXISTS idx_dev_inventario_tenant_sku ON dev_inventario(tenant_id, sku);
CREATE INDEX IF NOT EXISTS idx_dev_inventario_tenant_traz ON dev_inventario(tenant_id, codigo_trazabilidad);
CREATE INDEX IF NOT EXISTS idx_dev_inventario_ubicacion ON dev_inventario(ubicacion_id) WHERE cantidad_disponible > 0;
CREATE INDEX IF NOT EXISTS idx_dev_inventario_item ON dev_inventario(item_id);
CREATE INDEX IF NOT EXISTS idx_dev_movimientos_tenant_created ON dev_movimientos(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_movimientos_inventario ON dev_movimientos(inventario_id);
CREATE INDEX IF NOT EXISTS idx_dev_movimientos_item ON dev_movimientos(item_id);
CREATE INDEX IF NOT EXISTS idx_dev_ajustes_tenant_created ON dev_ajustes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_salidas_tenant_estado ON dev_salidas(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_dev_salidas_tenant_created ON dev_salidas(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_salidas_codigo ON dev_salidas(tenant_id, codigo);
CREATE INDEX IF NOT EXISTS idx_dev_salida_items_salida ON dev_salida_items(salida_id);
CREATE INDEX IF NOT EXISTS idx_dev_salida_items_inventario ON dev_salida_items(inventario_id);
CREATE INDEX IF NOT EXISTS idx_dev_ubicaciones_tenant_activo ON dev_ubicaciones(tenant_id, activo);

ALTER TABLE dev_ubicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_ubicaciones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dev_ubicaciones;
CREATE POLICY tenant_isolation ON dev_ubicaciones
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dev_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_sesiones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dev_sesiones;
CREATE POLICY tenant_isolation ON dev_sesiones
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dev_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dev_items;
CREATE POLICY tenant_isolation ON dev_items
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dev_item_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_item_skus FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dev_item_skus;
CREATE POLICY tenant_isolation ON dev_item_skus
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dev_item_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_item_fotos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dev_item_fotos;
CREATE POLICY tenant_isolation ON dev_item_fotos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dev_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_inventario FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dev_inventario;
CREATE POLICY tenant_isolation ON dev_inventario
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dev_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_movimientos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dev_movimientos;
CREATE POLICY tenant_isolation ON dev_movimientos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dev_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_ajustes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dev_ajustes;
CREATE POLICY tenant_isolation ON dev_ajustes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dev_salidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_salidas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dev_salidas;
CREATE POLICY tenant_isolation ON dev_salidas
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE dev_salida_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_salida_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dev_salida_items;
CREATE POLICY tenant_isolation ON dev_salida_items
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{devoluciones}',
  '{"entradas":"eliminar","inventario":"eliminar","salidas":"eliminar"}'::jsonb,
  true
)
WHERE nombre = 'Administrador' AND NOT (permisos ? 'devoluciones');

UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{devoluciones}',
  '{"entradas":"actualizar","inventario":"actualizar","salidas":"actualizar"}'::jsonb,
  true
)
WHERE nombre IN ('Jefe', 'Supervisor') AND NOT (permisos ? 'devoluciones');

UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{devoluciones}',
  '{"entradas":"crear","inventario":"ver","salidas":"crear"}'::jsonb,
  true
)
WHERE nombre = 'Operador' AND NOT (permisos ? 'devoluciones');

UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{devoluciones}',
  '{"entradas":"ver","inventario":"ver","salidas":"ver"}'::jsonb,
  true
)
WHERE nombre = 'Usuario' AND NOT (permisos ? 'devoluciones');

UPDATE plans
SET modules = modules || '["devoluciones"]'::jsonb
WHERE is_active = true
  AND NOT (modules @> '["devoluciones"]'::jsonb);

COMMIT;

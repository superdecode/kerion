-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 051 — Módulo Anormalidades
-- Tablas, índices, RLS, seed de 31 códigos base, permisos y tenant_modules
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Catálogo de códigos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anormalidades_codigos (
  id             SERIAL PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo         VARCHAR(20) NOT NULL,
  nombre_es      VARCHAR(200) NOT NULL,
  nombre_zh      VARCHAR(200) NOT NULL DEFAULT '',
  proceso        VARCHAR(50) NOT NULL,
  nivel_sugerido VARCHAR(5) NOT NULL DEFAULT 'L2'
                 CHECK (nivel_sugerido IN ('L1','L2','L3')),
  descripcion    TEXT,
  activo         BOOLEAN NOT NULL DEFAULT true,
  es_default     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_anorm_codigos_tenant
  ON anormalidades_codigos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_anorm_codigos_tenant_proceso
  ON anormalidades_codigos (tenant_id, proceso);

ALTER TABLE anormalidades_codigos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON anormalidades_codigos;
CREATE POLICY tenant_isolation ON anormalidades_codigos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── 2. Configuración por tenant ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anormalidades_config (
  id            SERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  horas_limite_l1 INTEGER NOT NULL DEFAULT 48,
  horas_limite_l2 INTEGER NOT NULL DEFAULT 24,
  horas_limite_l3 INTEGER NOT NULL DEFAULT 4,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE anormalidades_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON anormalidades_config;
CREATE POLICY tenant_isolation ON anormalidades_config
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── 3. Tabla principal de anormalidades ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS anormalidades (
  id                      SERIAL PRIMARY KEY,
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  folio                   VARCHAR(30) NOT NULL,
  fecha_ocurrencia        TIMESTAMPTZ NOT NULL DEFAULT now(),
  proceso                 VARCHAR(50) NOT NULL,
  codigo_id               INTEGER REFERENCES anormalidades_codigos(id),
  codigo                  VARCHAR(20) NOT NULL,
  nombre                  VARCHAR(200) NOT NULL,
  nivel                   VARCHAR(5) NOT NULL CHECK (nivel IN ('L1','L2','L3')),
  estado                  VARCHAR(20) NOT NULL DEFAULT 'nuevo'
                          CHECK (estado IN ('nuevo','en_proceso','cerrado','vencido')),
  cliente                 VARCHAR(200),
  almacen                 VARCHAR(200),
  contenedor_orden        VARCHAR(100),
  sku                     VARCHAR(100),
  ubicacion               VARCHAR(200),
  cantidad_afectada       INTEGER,
  monto_impacto           NUMERIC(14,2),
  descripcion             TEXT,
  evidencia               JSONB DEFAULT '[]'::jsonb,
  detectado_por_id        INTEGER REFERENCES usuarios(id),
  detectado_por_nombre    VARCHAR(200),
  origen_responsabilidad  VARCHAR(50)
                          CHECK (origen_responsabilidad IN ('Operativo','Cliente','Sistema','Proceso','Transporte','Proveedor')),
  responsable_id          INTEGER REFERENCES usuarios(id),
  accion_inmediata        TEXT,
  causa_raiz              TEXT,
  accion_preventiva       TEXT,
  fecha_cierre            TIMESTAMPTZ,
  fecha_limite            TIMESTAMPTZ,
  created_by              INTEGER REFERENCES usuarios(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, folio)
);

CREATE INDEX IF NOT EXISTS idx_anorm_tenant
  ON anormalidades (tenant_id);
CREATE INDEX IF NOT EXISTS idx_anorm_tenant_estado
  ON anormalidades (tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_anorm_tenant_nivel
  ON anormalidades (tenant_id, nivel);
CREATE INDEX IF NOT EXISTS idx_anorm_tenant_proceso
  ON anormalidades (tenant_id, proceso);
CREATE INDEX IF NOT EXISTS idx_anorm_tenant_fecha
  ON anormalidades (tenant_id, fecha_ocurrencia DESC);
CREATE INDEX IF NOT EXISTS idx_anorm_tenant_responsable
  ON anormalidades (tenant_id, responsable_id);
CREATE INDEX IF NOT EXISTS idx_anorm_tenant_estado_fecha
  ON anormalidades (tenant_id, estado, fecha_ocurrencia DESC);

ALTER TABLE anormalidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON anormalidades;
CREATE POLICY tenant_isolation ON anormalidades
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── 4. Historial de cambios de estado ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anormalidades_historial (
  id                SERIAL PRIMARY KEY,
  anormalidad_id    INTEGER NOT NULL REFERENCES anormalidades(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id        INTEGER REFERENCES usuarios(id),
  usuario_nombre    VARCHAR(200),
  estado_anterior   VARCHAR(20),
  estado_nuevo      VARCHAR(20) NOT NULL,
  nota              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anorm_hist_anormalidad
  ON anormalidades_historial (anormalidad_id);
CREATE INDEX IF NOT EXISTS idx_anorm_hist_tenant
  ON anormalidades_historial (tenant_id);

ALTER TABLE anormalidades_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON anormalidades_historial;
CREATE POLICY tenant_isolation ON anormalidades_historial
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── 5. Mejoras de mejora continua ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anormalidades_mejoras (
  id                   SERIAL PRIMARY KEY,
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  descripcion_problema TEXT NOT NULL,
  ocurrencias          INTEGER NOT NULL DEFAULT 1,
  causa_raiz_principal TEXT,
  accion_mejora        TEXT NOT NULL,
  responsable_id       INTEGER REFERENCES usuarios(id),
  fecha_limite         DATE,
  estado               VARCHAR(20) NOT NULL DEFAULT 'nuevo'
                       CHECK (estado IN ('nuevo','en_proceso','cerrado')),
  resultado_revision   TEXT,
  created_by           INTEGER REFERENCES usuarios(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anorm_mejoras_tenant
  ON anormalidades_mejoras (tenant_id);
CREATE INDEX IF NOT EXISTS idx_anorm_mejoras_tenant_estado
  ON anormalidades_mejoras (tenant_id, estado);

ALTER TABLE anormalidades_mejoras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON anormalidades_mejoras;
CREATE POLICY tenant_isolation ON anormalidades_mejoras
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── 6. Vinculos N:M entre mejoras y anormalidades ────────────────────────────
CREATE TABLE IF NOT EXISTS anormalidades_mejoras_vinculos (
  mejora_id       INTEGER NOT NULL REFERENCES anormalidades_mejoras(id) ON DELETE CASCADE,
  anormalidad_id  INTEGER NOT NULL REFERENCES anormalidades(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mejora_id, anormalidad_id)
);

CREATE INDEX IF NOT EXISTS idx_anorm_vinculos_anorm
  ON anormalidades_mejoras_vinculos (anormalidad_id);
CREATE INDEX IF NOT EXISTS idx_anorm_vinculos_tenant
  ON anormalidades_mejoras_vinculos (tenant_id);

ALTER TABLE anormalidades_mejoras_vinculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON anormalidades_mejoras_vinculos;
CREATE POLICY tenant_isolation ON anormalidades_mejoras_vinculos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── 7. Seed catálogo base en todos los tenants existentes ────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM tenants LOOP

    -- Configuración default
    INSERT INTO anormalidades_config (tenant_id)
    VALUES (r.id)
    ON CONFLICT (tenant_id) DO NOTHING;

    -- 31 códigos base
    INSERT INTO anormalidades_codigos
      (tenant_id, codigo, nombre_es, nombre_zh, proceso, nivel_sugerido, descripcion, es_default)
    VALUES
      -- Recibo
      (r.id,'IN-01','Recibo incorrecto','收货错误','Recibo','L2','Mercancía recibida no corresponde al pedido',true),
      (r.id,'IN-02','Daño en recibo','收货损坏','Recibo','L2','Mercancía recibida con daño físico',true),
      (r.id,'IN-03','Faltante en recibo','收货短缺','Recibo','L2','Cantidad recibida menor a la documentada',true),
      (r.id,'IN-04','Sobrante en recibo','收货多余','Recibo','L1','Cantidad recibida mayor a la documentada',true),
      (r.id,'IN-05','Error de documentación en recibo','收货文件错误','Recibo','L2','Documentos de recibo incorrectos o incompletos',true),
      (r.id,'IN-06','Recibo fuera de horario','超时收货','Recibo','L1','Mercancía recibida fuera del horario acordado',true),
      -- Inventario
      (r.id,'INV-01','Diferencia de inventario','库存差异','Inventario','L2','Inventario físico no coincide con el sistema',true),
      (r.id,'INV-02','Producto mal ubicado','货物错位','Inventario','L2','Producto encontrado en ubicación incorrecta',true),
      (r.id,'INV-03','Producto sin etiqueta','货物无标签','Inventario','L1','Producto sin identificación o etiqueta ilegible',true),
      (r.id,'INV-04','Producto caducado','过期货物','Inventario','L3','Producto encontrado fuera de fecha de vencimiento',true),
      (r.id,'INV-05','Daño en almacén','仓储损坏','Inventario','L2','Producto dañado durante almacenamiento',true),
      (r.id,'INV-06','Faltante de inventario','库存短缺','Inventario','L3','Producto que debería estar no se encuentra',true),
      -- Picking
      (r.id,'PICK-01','Error de picking','拣货错误','Picking','L2','Se tomó un producto incorrecto durante el picking',true),
      (r.id,'PICK-02','Producto incorrecto en pedido','货物错误','Picking','L2','Producto seleccionado no corresponde al pedido',true),
      (r.id,'PICK-03','Cantidad incorrecta en pedido','数量错误','Picking','L2','Cantidad pickeada no coincide con la solicitada',true),
      (r.id,'PICK-04','Ubicación incorrecta de picking','位置错误','Picking','L2','Se tomó producto de ubicación incorrecta',true),
      (r.id,'PICK-05','Retraso en picking','拣货延误','Picking','L1','Tiempo de picking excede el estándar',true),
      -- Salida
      (r.id,'OUT-01','Error en packing','打包错误','Salida','L2','Error en el empaque o embalaje del pedido',true),
      (r.id,'OUT-02','Documentación de salida incorrecta','出库文件错误','Salida','L2','Documentos de salida incorrectos o incompletos',true),
      (r.id,'OUT-03','Ruta de entrega incorrecta','路线错误','Salida','L2','Pedido asignado a ruta de entrega equivocada',true),
      (r.id,'OUT-04','Faltante en envío','发货短缺','Salida','L3','Cantidad enviada menor a la documentada',true),
      (r.id,'OUT-05','Daño en envío','发货损坏','Salida','L2','Mercancía dañada al momento del despacho',true),
      (r.id,'OUT-06','Retraso en salida','出库延误','Salida','L1','Salida del almacén después del horario comprometido',true),
      -- POD
      (r.id,'POD-01','Rechazo del cliente','客户拒收','POD','L3','Cliente rechaza la mercancía en destino',true),
      (r.id,'POD-02','Entrega parcial','部分交付','POD','L2','Se entregó cantidad menor a la documentada en destino',true),
      (r.id,'POD-03','Entrega a dirección incorrecta','错误地址交付','POD','L3','Pedido entregado en dirección equivocada',true),
      (r.id,'POD-04','Firma no válida','签名无效','POD','L2','Entrega sin firma válida del receptor',true),
      (r.id,'POD-05','Retraso en entrega','交货延误','POD','L1','Entrega fuera del tiempo prometido al cliente',true),
      -- Sistema
      (r.id,'SYS-01','Error del sistema','系统错误','Sistema','L3','Falla en el sistema que afecta operaciones',true),
      (r.id,'SYS-02','Error de integración','集成错误','Sistema','L2','Falla en integración con sistema externo',true)
    ON CONFLICT (tenant_id, codigo) DO NOTHING;

  END LOOP;
END $$;

-- ── 8. Agregar anormalidades a tenant_modules para todos los tenants ──────────
-- First expand the CHECK constraint to include anormalidades (added in 043 without it).
ALTER TABLE tenant_modules DROP CONSTRAINT IF EXISTS tenant_modules_module_code_check;
ALTER TABLE tenant_modules ADD CONSTRAINT tenant_modules_module_code_check
  CHECK (module_code IN ('dropscan', 'surtido', 'inventario', 'devoluciones', 'fep', 'anormalidades'));

INSERT INTO tenant_modules (tenant_id, module_code, enabled, enabled_at, enabled_by, notes)
SELECT id, 'anormalidades', true, now(), 'system', 'migration 051: enabled by default'
FROM tenants
ON CONFLICT (tenant_id, module_code) DO NOTHING;

-- ── 9. Actualizar permisos del rol Administrador en tenants existentes ────────
UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{anormalidades}',
  '{"registro":"eliminar","dashboard":"eliminar","mejoras":"eliminar","configuracion":"eliminar"}'::jsonb
)
WHERE nombre = 'Administrador'
  AND (permisos->>'anormalidades') IS NULL;

-- También actualizar roles Jefe/Supervisor si existen con acceso a otros módulos
UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{anormalidades}',
  '{"registro":"actualizar","dashboard":"actualizar","mejoras":"actualizar","configuracion":"ver"}'::jsonb
)
WHERE nombre IN ('Jefe', 'Supervisor')
  AND (permisos->>'anormalidades') IS NULL;

-- ── 10. Track migration ───────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description)
VALUES ('051', 'anormalidades_module')
ON CONFLICT (version) DO NOTHING;

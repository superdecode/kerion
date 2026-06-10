-- Migration 048: Extract server.js inline migrations to versioned file.
--
-- These steps were previously run at every server startup from runMigrations()
-- inside server.js. They are all idempotent (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- etc.) so running them again is a no-op on any existing deployment.
--
-- On a fresh database, run this file FIRST (before 041-047) since 041-047 assume
-- the tables created here already exist.
--
-- ── usuarios_internos ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usuarios_internos (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  nombre VARCHAR(50) NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  activo BOOLEAN DEFAULT true,
  eliminado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES usuarios(id),
  updated_by INTEGER REFERENCES usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_internos_nombre_tenant
  ON usuarios_internos(tenant_id, nombre) WHERE eliminado = false;
CREATE INDEX IF NOT EXISTS idx_usuarios_internos_activo ON usuarios_internos(activo) WHERE eliminado = false;
CREATE INDEX IF NOT EXISTS idx_usuarios_internos_tenant ON usuarios_internos(tenant_id);

CREATE TABLE IF NOT EXISTS logs_usuarios_internos (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  evento VARCHAR(50) NOT NULL,
  usuario_interno_id INTEGER REFERENCES usuarios_internos(id) ON DELETE SET NULL,
  usuario_interno_nombre VARCHAR(50),
  usuario_sistema_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_sistema_email VARCHAR(100),
  detalles JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_ui_evento ON logs_usuarios_internos(evento);
CREATE INDEX IF NOT EXISTS idx_logs_ui_usuario ON logs_usuarios_internos(usuario_interno_id);
CREATE INDEX IF NOT EXISTS idx_logs_ui_created ON logs_usuarios_internos(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_ui_tenant ON logs_usuarios_internos(tenant_id);

ALTER TABLE sesiones_escaneo ADD COLUMN IF NOT EXISTS usuario_operador VARCHAR(100);
ALTER TABLE sesiones_escaneo ADD COLUMN IF NOT EXISTS usuario_interno_id INTEGER REFERENCES usuarios_internos(id);
ALTER TABLE sesiones_escaneo ADD COLUMN IF NOT EXISTS nivel_usuario VARCHAR(30);
ALTER TABLE guias ADD COLUMN IF NOT EXISTS usuario_operador VARCHAR(100);
ALTER TABLE guias ADD COLUMN IF NOT EXISTS nivel_usuario VARCHAR(30);
ALTER TABLE guias ADD COLUMN IF NOT EXISTS usuario_interno_id INTEGER REFERENCES usuarios_internos(id);
CREATE INDEX IF NOT EXISTS idx_guias_usuario_interno ON guias(usuario_interno_id);

-- ── WMS credentials ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wms_credentials (
  id SERIAL PRIMARY KEY,
  app_key TEXT NOT NULL,
  app_secret_encrypted TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT 'https://api.xlwms.com/openapi/v1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── WMS cache ─────────────────────────────────────────────────────────────────
-- Note: migration 044 changes the PK to (tenant_id, key). The CREATE TABLE here
-- uses the original single-column PK; 044 alters it.

CREATE TABLE IF NOT EXISTS wms_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wms_cache_expires ON wms_cache(expires_at);

-- ── Inventory sessions (legacy — pre-inv_sessions) ────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
  origin_location TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','closed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_user ON inventory_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_status ON inventory_sessions(status);

CREATE TABLE IF NOT EXISTS inventory_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES inventory_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
  barcode TEXT NOT NULL,
  sku TEXT,
  product_name TEXT,
  cell_no TEXT,
  available_stock INTEGER,
  status TEXT NOT NULL CHECK (status IN ('OK','Bloqueado','NoWMS')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_scans_session ON inventory_scans(session_id);
CREATE INDEX IF NOT EXISTS idx_inv_scans_user ON inventory_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_scans_barcode ON inventory_scans(barcode);
CREATE INDEX IF NOT EXISTS idx_inv_scans_created ON inventory_scans(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_scans_status ON inventory_scans(status);

-- ── Backfill existing roles with inventory + wms permissions ──────────────────

UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"eliminar"', true)
  WHERE nombre = 'Administrador' AND NOT (permisos -> 'global' ? 'wms');
UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"ver"', true)
  WHERE nombre = 'Jefe' AND NOT (permisos -> 'global' ? 'wms');
UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"sin_acceso"', true)
  WHERE nombre NOT IN ('Administrador','Jefe') AND NOT (permisos -> 'global' ? 'wms');
UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
  '{"escaneo":"eliminar","tarimas":"eliminar","reportes":"eliminar"}'::jsonb, true)
  WHERE nombre = 'Administrador' AND NOT (permisos ? 'inventory');
UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
  '{"escaneo":"actualizar","tarimas":"actualizar","reportes":"crear"}'::jsonb, true)
  WHERE nombre = 'Jefe' AND NOT (permisos ? 'inventory');
UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
  '{"escaneo":"crear","tarimas":"ver","reportes":"sin_acceso"}'::jsonb, true)
  WHERE nombre = 'Operador' AND NOT (permisos ? 'inventory');
UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
  '{"escaneo":"sin_acceso","tarimas":"ver","reportes":"ver"}'::jsonb, true)
  WHERE nombre = 'Usuario' AND NOT (permisos ? 'inventory');

-- ── FEP — Folios de Entrega Paqueteria ────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS fep_folio_seq START 1;

CREATE TABLE IF NOT EXISTS folios_entrega (
  id SERIAL PRIMARY KEY,
  folio_numero VARCHAR(20) NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL REFERENCES configuraciones(id),
  canales INTEGER[],
  fecha_tarimas_desde DATE NOT NULL,
  fecha_tarimas_hasta DATE NOT NULL,
  estatus_tarima_filtro VARCHAR(20) DEFAULT 'FINALIZADA',
  estado VARCHAR(20) DEFAULT 'ACTIVO',
  motivo_cancelacion TEXT,
  hora_inicio TIMESTAMPTZ DEFAULT now(),
  hora_fin TIMESTAMPTZ,
  total_tarimas INTEGER DEFAULT 0,
  total_guias INTEGER DEFAULT 0,
  creado_por INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fep_estado ON folios_entrega(estado);
CREATE INDEX IF NOT EXISTS idx_fep_empresa ON folios_entrega(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fep_created ON folios_entrega(created_at);

CREATE TABLE IF NOT EXISTS folios_entrega_tarimas (
  id SERIAL PRIMARY KEY,
  folio_id INTEGER REFERENCES folios_entrega(id) ON DELETE CASCADE,
  tarima_id INTEGER REFERENCES tarimas(id) ON DELETE RESTRICT,
  agregado_en TIMESTAMPTZ DEFAULT now(),
  agregado_por INTEGER REFERENCES usuarios(id),
  eliminado_en TIMESTAMPTZ,
  eliminado_por INTEGER REFERENCES usuarios(id),
  UNIQUE (folio_id, tarima_id)
);
CREATE INDEX IF NOT EXISTS idx_fet_folio ON folios_entrega_tarimas(folio_id);
CREATE INDEX IF NOT EXISTS idx_fet_tarima ON folios_entrega_tarimas(tarima_id);

CREATE TABLE IF NOT EXISTS folios_entrega_log (
  id SERIAL PRIMARY KEY,
  folio_id INTEGER REFERENCES folios_entrega(id) ON DELETE CASCADE,
  accion VARCHAR(30) NOT NULL,
  detalle JSONB,
  usuario_id INTEGER REFERENCES usuarios(id),
  timestamp TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fel_folio ON folios_entrega_log(folio_id);

UPDATE roles SET permisos = jsonb_set(permisos, '{dropscan,folios}', '"eliminar"', true)
  WHERE nombre = 'Administrador' AND NOT (permisos -> 'dropscan' ? 'folios');
UPDATE roles SET permisos = jsonb_set(permisos, '{dropscan,folios}', '"actualizar"', true)
  WHERE nombre IN ('Jefe', 'Supervisor') AND NOT (permisos -> 'dropscan' ? 'folios');
UPDATE roles SET permisos = jsonb_set(permisos, '{dropscan,folios}', '"crear"', true)
  WHERE nombre = 'Operador' AND NOT (permisos -> 'dropscan' ? 'folios');
UPDATE roles SET permisos = jsonb_set(permisos, '{dropscan,folios}', '"ver"', true)
  WHERE nombre = 'Usuario' AND NOT (permisos -> 'dropscan' ? 'folios');

ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_nombre_key;
DROP INDEX IF EXISTS roles_nombre_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_tenant_nombre ON roles(tenant_id, nombre);
ALTER TABLE folios_entrega_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE folios_entrega ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE folios_entrega_tarimas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_admin_tenant BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE tarimas DROP CONSTRAINT IF EXISTS tarimas_codigo_key;
ALTER TABLE tarimas ADD CONSTRAINT IF NOT EXISTS tarimas_tenant_codigo_unique UNIQUE (tenant_id, codigo);
ALTER TABLE folios_entrega DROP CONSTRAINT IF EXISTS folios_entrega_folio_numero_key;
ALTER TABLE folios_entrega ADD CONSTRAINT IF NOT EXISTS fep_tenant_numero_unique UNIQUE (tenant_id, folio_numero);

-- ── token_blacklist ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS token_blacklist (
  id SERIAL PRIMARY KEY,
  token_jti VARCHAR(64) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(token_jti);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);

-- ── audit_log ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  user_email VARCHAR(100),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id TEXT,
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- ── devoluciones v2 ───────────────────────────────────────────────────────────

ALTER TABLE dev_item_skus ADD COLUMN IF NOT EXISTS peso NUMERIC(10,3);
ALTER TABLE dev_item_skus ADD COLUMN IF NOT EXISTS largo NUMERIC(10,2);
ALTER TABLE dev_item_skus ADD COLUMN IF NOT EXISTS ancho NUMERIC(10,2);
ALTER TABLE dev_item_skus ADD COLUMN IF NOT EXISTS alto NUMERIC(10,2);
ALTER TABLE dev_items ADD COLUMN IF NOT EXISTS codigo_multicaja TEXT;
CREATE INDEX IF NOT EXISTS idx_dev_items_multicaja ON dev_items(tenant_id, codigo_multicaja) WHERE codigo_multicaja IS NOT NULL;
ALTER TABLE dev_inventario ADD COLUMN IF NOT EXISTS codigo_multicaja TEXT;
CREATE INDEX IF NOT EXISTS idx_dev_inventario_multicaja ON dev_inventario(tenant_id, codigo_multicaja) WHERE codigo_multicaja IS NOT NULL;
ALTER TABLE dev_salidas ADD COLUMN IF NOT EXISTS referencia TEXT;
CREATE INDEX IF NOT EXISTS idx_dev_salidas_referencia ON dev_salidas(tenant_id, referencia) WHERE referencia IS NOT NULL;
ALTER TABLE dev_inventario ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE dev_inventario ALTER COLUMN sesion_id DROP NOT NULL;
ALTER TABLE dev_inventario ALTER COLUMN codigo_trazabilidad DROP NOT NULL;
ALTER TABLE dev_movimientos ADD COLUMN IF NOT EXISTS observacion TEXT;
ALTER TABLE dev_ajustes ADD COLUMN IF NOT EXISTS codigo TEXT;
CREATE INDEX IF NOT EXISTS idx_dev_ajustes_codigo ON dev_ajustes(tenant_id, codigo) WHERE codigo IS NOT NULL;

-- ── peso por guia ─────────────────────────────────────────────────────────────

ALTER TABLE guias ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(10,3);
CREATE INDEX IF NOT EXISTS idx_guias_peso_kg ON guias(tenant_id, tarima_id) WHERE peso_kg IS NOT NULL;

-- ── Rename upapex_* tables to domain-neutral names ───────────────────────────

ALTER TABLE IF EXISTS upapex_config RENAME TO wms_config;
ALTER TABLE IF EXISTS upapex_scan_sessions RENAME TO pick_sessions;
ALTER TABLE IF EXISTS upapex_scan_events RENAME TO pick_events;
ALTER TABLE IF EXISTS upapex_inventory_sessions RENAME TO inv_sessions;
ALTER TABLE IF EXISTS upapex_inventory_scans RENAME TO inv_scans;
ALTER TABLE IF EXISTS upapex_surtidores RENAME TO pick_surtidores;
ALTER TABLE IF EXISTS upapex_order_tracking RENAME TO pick_order_tracking;

-- ── wms_config ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wms_config (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  app_key TEXT,
  base_url TEXT DEFAULT 'https://api.xlwms.com/openapi',
  is_active BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS app_key TEXT;
ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS base_url TEXT DEFAULT 'https://api.xlwms.com/openapi';
ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS app_secret_encrypted TEXT;
ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS sheet_inventory_url TEXT;
ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS sheet_outbound_url TEXT;
ALTER TABLE wms_config ALTER COLUMN app_key DROP NOT NULL;
ALTER TABLE wms_config ALTER COLUMN base_url DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wms_config_tenant ON wms_config(tenant_id);

-- ── pick_sessions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pick_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  outbound_order_no TEXT NOT NULL,
  third_order_no TEXT,
  operator_id INTEGER REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','complete','with_discrepancies')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_expected INTEGER DEFAULT 0,
  total_scanned INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pick_sessions_tenant ON pick_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pick_sessions_status ON pick_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pick_sessions_operator ON pick_sessions(operator_id);
CREATE INDEX IF NOT EXISTS idx_pick_sessions_order ON pick_sessions(tenant_id, outbound_order_no);

-- ── pick_events ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pick_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES pick_sessions(id) ON DELETE CASCADE NOT NULL,
  scanned_code TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  matched_sku TEXT,
  matched_box_type TEXT,
  scan_result TEXT NOT NULL CHECK (scan_result IN ('ok','unexpected','duplicate','not_found')),
  quantity INTEGER DEFAULT 1,
  scanned_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pick_events_session ON pick_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pick_events_result ON pick_events(session_id, scan_result);
ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS input_method TEXT NOT NULL DEFAULT 'scanner';
ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS manual_reason_id INTEGER;
ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS manual_reason_label TEXT;
ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS manual_notes TEXT;
ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS edited_by INTEGER REFERENCES usuarios(id);

-- ── upapex permissions backfill ───────────────────────────────────────────────

UPDATE roles SET permisos = jsonb_set(permisos, '{upapex}',
  '{"hub":"eliminar","inventario":"eliminar","surtido":"eliminar"}'::jsonb, true)
  WHERE nombre = 'Administrador' AND NOT (permisos ? 'upapex');
UPDATE roles SET permisos = jsonb_set(permisos, '{upapex}',
  '{"hub":"ver","inventario":"actualizar","surtido":"actualizar"}'::jsonb, true)
  WHERE nombre = 'Jefe' AND NOT (permisos ? 'upapex');
UPDATE roles SET permisos = jsonb_set(permisos, '{upapex}',
  '{"hub":"ver","inventario":"ver","surtido":"crear"}'::jsonb, true)
  WHERE nombre = 'Operador' AND NOT (permisos ? 'upapex');
UPDATE roles SET permisos = jsonb_set(permisos, '{upapex}',
  '{"hub":"sin_acceso","inventario":"ver","surtido":"ver"}'::jsonb, true)
  WHERE nombre NOT IN ('Administrador','Jefe','Operador') AND NOT (permisos ? 'upapex');

-- ── inv_sessions ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  operator_id INTEGER REFERENCES usuarios(id),
  scan_type TEXT NOT NULL DEFAULT 'unificado' CHECK (scan_type IN ('unificado','clasificacion')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','saved')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  total_scans INTEGER DEFAULT 0,
  total_ok INTEGER DEFAULT 0,
  total_blocked INTEGER DEFAULT 0,
  total_nowms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_tenant ON inv_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_status ON inv_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_operator ON inv_sessions(operator_id);

-- ── inv_scans ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES inv_sessions(id) ON DELETE CASCADE NOT NULL,
  scanned_code TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  code2 TEXT,
  was_swapped BOOLEAN DEFAULT false,
  scan_status TEXT NOT NULL CHECK (scan_status IN ('ok','blocked','nowms')),
  sku TEXT,
  product_name TEXT,
  cell_no TEXT,
  group_assignment TEXT DEFAULT 'auto',
  scanned_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_scans_session ON inv_scans(session_id);
CREATE INDEX IF NOT EXISTS idx_inv_scans_status ON inv_scans(session_id, scan_status);
ALTER TABLE inv_scans ADD COLUMN IF NOT EXISTS input_method TEXT NOT NULL DEFAULT 'scanner';
ALTER TABLE inv_scans ADD COLUMN IF NOT EXISTS manual_notes TEXT;
ALTER TABLE inv_scans ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE inv_scans ADD COLUMN IF NOT EXISTS edited_by INTEGER REFERENCES usuarios(id);

-- ── pick_surtidores ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pick_surtidores (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  nombre TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pick_surtidores_tenant_nombre
  ON pick_surtidores(tenant_id, nombre) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_pick_surtidores_tenant ON pick_surtidores(tenant_id);

-- ── pick_order_tracking ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pick_order_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  outbound_order_no TEXT NOT NULL,
  third_order_no TEXT,
  surtidor_id INTEGER REFERENCES pick_surtidores(id) ON DELETE SET NULL,
  surtidor_nombre TEXT,
  status TEXT NOT NULL DEFAULT 'pending_assignment' CHECK (status IN (
    'pending_assignment','assigned','sorting','pending_validation',
    'validating','complete','partial','cancelled'
  )),
  notes TEXT,
  assigned_at TIMESTAMPTZ,
  assigned_by TEXT,
  sorting_started_at TIMESTAMPTZ,
  sorting_completed_at TIMESTAMPTZ,
  validation_started_at TIMESTAMPTZ,
  validation_completed_at TIMESTAMPTZ,
  validated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pick_order_tracking_unique
  ON pick_order_tracking(tenant_id, outbound_order_no);
CREATE INDEX IF NOT EXISTS idx_pick_order_tracking_tenant ON pick_order_tracking(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pick_order_tracking_status ON pick_order_tracking(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pick_order_tracking_updated ON pick_order_tracking(updated_at DESC);
ALTER TABLE pick_order_tracking ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE pick_order_tracking ADD COLUMN IF NOT EXISTS assigned_by TEXT;
ALTER TABLE pick_order_tracking ADD COLUMN IF NOT EXISTS sorting_started_at TIMESTAMPTZ;
ALTER TABLE pick_order_tracking ADD COLUMN IF NOT EXISTS sorting_completed_at TIMESTAMPTZ;
ALTER TABLE pick_order_tracking ADD COLUMN IF NOT EXISTS validation_started_at TIMESTAMPTZ;
ALTER TABLE pick_order_tracking ADD COLUMN IF NOT EXISTS validation_completed_at TIMESTAMPTZ;
ALTER TABLE pick_order_tracking ADD COLUMN IF NOT EXISTS validated_by TEXT;

-- ── pick_manual_reasons ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pick_manual_reasons (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  nombre TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pick_manual_reasons_unique
  ON pick_manual_reasons(tenant_id, nombre) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_pick_manual_reasons_tenant ON pick_manual_reasons(tenant_id);

-- ── Permission migration: upapex → inventario/surtido/sistema ─────────────────

UPDATE roles
  SET permisos = permisos
    || jsonb_build_object('inventario', jsonb_build_object(
         'escaneo',   COALESCE(permisos->'upapex'->>'inventario', 'sin_acceso'),
         'registros', COALESCE(permisos->'upapex'->>'inventario', 'sin_acceso'),
         'admin',     CASE WHEN COALESCE(permisos->'upapex'->>'inventario','') = 'eliminar'
                          THEN 'eliminar' ELSE 'sin_acceso' END
       ))
  WHERE permisos ? 'upapex' AND NOT (permisos ? 'inventario');

UPDATE roles
  SET permisos = permisos
    || jsonb_build_object('surtido', jsonb_build_object(
         'ordenes',    COALESCE(permisos->'upapex'->>'surtido', 'sin_acceso'),
         'validacion', COALESCE(permisos->'upapex'->>'surtido', 'sin_acceso'),
         'registros',  COALESCE(permisos->'upapex'->>'surtido', 'sin_acceso'),
         'assign',     CASE WHEN COALESCE(permisos->'upapex'->>'surtido','')
                                 IN ('actualizar','eliminar')
                            THEN COALESCE(permisos->'upapex'->>'surtido', 'sin_acceso')
                            ELSE 'sin_acceso' END,
         'admin',      CASE WHEN COALESCE(permisos->'upapex'->>'surtido','') = 'eliminar'
                            THEN 'eliminar' ELSE 'sin_acceso' END
       ))
  WHERE permisos ? 'upapex' AND NOT (permisos ? 'surtido');

UPDATE roles
  SET permisos = permisos
    || jsonb_build_object('sistema', jsonb_build_object(
         'wms', COALESCE(
           NULLIF(COALESCE(permisos->'upapex'->>'hub',''), 'sin_acceso'),
           NULLIF(COALESCE(permisos->'global'->>'wms',''), 'sin_acceso'),
           'sin_acceso'
         )
       ))
  WHERE NOT (permisos ? 'sistema');

UPDATE roles
  SET permisos = permisos
    || '{"inventario":{"escaneo":"sin_acceso","registros":"sin_acceso","admin":"sin_acceso"}}'::jsonb
  WHERE NOT (permisos ? 'inventario');
UPDATE roles
  SET permisos = permisos
    || '{"surtido":{"ordenes":"sin_acceso","validacion":"sin_acceso","registros":"sin_acceso","assign":"sin_acceso","admin":"sin_acceso"}}'::jsonb
  WHERE NOT (permisos ? 'surtido');
UPDATE roles
  SET permisos = permisos || '{"sistema":{"wms":"sin_acceso"}}'::jsonb
  WHERE NOT (permisos ? 'sistema');

UPDATE roles SET permisos = jsonb_set(permisos, '{inventario}',
  '{"escaneo":"eliminar","registros":"eliminar","admin":"eliminar"}'::jsonb, true)
  WHERE nombre = 'Administrador';
UPDATE roles SET permisos = jsonb_set(permisos, '{surtido}',
  '{"ordenes":"eliminar","validacion":"eliminar","registros":"eliminar","assign":"eliminar","admin":"eliminar"}'::jsonb, true)
  WHERE nombre = 'Administrador';
UPDATE roles SET permisos = jsonb_set(permisos, '{sistema}',
  '{"wms":"eliminar"}'::jsonb, true)
  WHERE nombre = 'Administrador';

UPDATE roles SET permisos = jsonb_set(permisos, '{inventario}',
  '{"escaneo":"actualizar","registros":"actualizar","admin":"sin_acceso"}'::jsonb, true)
  WHERE nombre = 'Jefe'
    AND (permisos->'inventario'->>'escaneo' = 'sin_acceso'
         OR NOT (permisos->'inventario' ? 'escaneo'));
UPDATE roles SET permisos = jsonb_set(permisos, '{surtido}',
  '{"ordenes":"actualizar","validacion":"actualizar","registros":"actualizar","assign":"actualizar","admin":"sin_acceso"}'::jsonb, true)
  WHERE nombre = 'Jefe'
    AND (permisos->'surtido'->>'ordenes' = 'sin_acceso'
         OR NOT (permisos->'surtido' ? 'ordenes'));
UPDATE roles SET permisos = jsonb_set(permisos, '{sistema,wms}', '"ver"', true)
  WHERE nombre = 'Jefe' AND permisos->'sistema'->>'wms' = 'sin_acceso';

UPDATE roles SET permisos = jsonb_set(permisos, '{inventario}',
  '{"escaneo":"crear","registros":"ver","admin":"sin_acceso"}'::jsonb, true)
  WHERE nombre = 'Operador'
    AND (permisos->'inventario'->>'escaneo' = 'sin_acceso'
         OR NOT (permisos->'inventario' ? 'escaneo'));
UPDATE roles SET permisos = jsonb_set(permisos, '{surtido}',
  '{"ordenes":"ver","validacion":"crear","registros":"ver","assign":"sin_acceso","admin":"sin_acceso"}'::jsonb, true)
  WHERE nombre = 'Operador'
    AND (permisos->'surtido'->>'ordenes' = 'sin_acceso'
         OR NOT (permisos->'surtido' ? 'ordenes'));

-- ── Rename surtido.escaneo → surtido.validacion ───────────────────────────────

UPDATE roles
  SET permisos = jsonb_set(
    permisos #- '{surtido,escaneo}',
    '{surtido,validacion}',
    COALESCE(permisos->'surtido'->'escaneo', '"sin_acceso"'::jsonb)
  )
  WHERE permisos->'surtido' ? 'escaneo';

-- ── Canonical devoluciones + surtido permissions ──────────────────────────────

UPDATE roles
  SET permisos = jsonb_set(
    permisos,
    '{devoluciones}',
    COALESCE(permisos->'devoluciones', '{}'::jsonb)
      || '{"entradas":"sin_acceso","inventario":"sin_acceso","salidas":"sin_acceso"}'::jsonb,
    true
  )
  WHERE NOT (permisos ? 'devoluciones');

UPDATE roles
  SET permisos = jsonb_set(
    permisos,
    '{surtido}',
    jsonb_build_object(
      'ordenes',    COALESCE(permisos->'surtido'->>'ordenes', 'sin_acceso'),
      'validacion', COALESCE(permisos->'surtido'->>'validacion', 'sin_acceso'),
      'registros',  COALESCE(permisos->'surtido'->>'registros', 'sin_acceso')
    ),
    true
  )
  WHERE permisos ? 'surtido'
    AND (
      NOT (permisos->'surtido' ? 'ordenes')
      OR NOT (permisos->'surtido' ? 'validacion')
      OR NOT (permisos->'surtido' ? 'registros')
      OR permisos->'surtido' ? 'assign'
      OR permisos->'surtido' ? 'admin'
    );

UPDATE roles
  SET permisos = permisos
    || '{"devoluciones":{"entradas":"eliminar","inventario":"eliminar","salidas":"eliminar"},"surtido":{"ordenes":"eliminar","validacion":"eliminar","registros":"eliminar"}}'::jsonb
  WHERE nombre = 'Administrador';

-- ── modulo_uso on dev_ubicaciones ─────────────────────────────────────────────

ALTER TABLE dev_ubicaciones ADD COLUMN IF NOT EXISTS modulo_uso TEXT[] DEFAULT ARRAY['todos'];

-- ── ubicacion_id on inv_sessions and pick_sessions ────────────────────────────

DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'inv_sessions' AND column_name = 'ubicacion_id';
  IF col_type IS NULL THEN
    EXECUTE 'ALTER TABLE inv_sessions ADD COLUMN ubicacion_id INTEGER';
  END IF;
  BEGIN
    EXECUTE 'ALTER TABLE inv_sessions ADD CONSTRAINT inv_sessions_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES dev_ubicaciones(id)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pick_sessions' AND column_name = 'ubicacion_id';
  IF col_type IS NULL THEN
    EXECUTE 'ALTER TABLE pick_sessions ADD COLUMN ubicacion_id INTEGER';
  END IF;
  BEGIN
    EXECUTE 'ALTER TABLE pick_sessions ADD CONSTRAINT pick_sessions_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES dev_ubicaciones(id)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ── tarima_code on inv_sessions ───────────────────────────────────────────────

ALTER TABLE inv_sessions ADD COLUMN IF NOT EXISTS tarima_code TEXT;

-- ── origin_location on inv_sessions ──────────────────────────────────────────

ALTER TABLE inv_sessions ADD COLUMN IF NOT EXISTS origin_location TEXT;

-- ── Enable RLS on all public tables (deny-by-default via Supabase anon) ───────
-- The backend connects as the postgres superuser (BYPASSRLS) — unaffected.

DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.tablename);
  END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('048', 'server_inline_extract')
ON CONFLICT (version) DO NOTHING;

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import env from './config/env.js'
import { query, tenantDB } from './config/database.js'

// Core routes
import authRoutes from './core/routes/auth.routes.js'
import usersRoutes from './core/routes/users.routes.js'
import rolesRoutes from './core/routes/roles.routes.js'
import configRoutes from './core/routes/config.routes.js'
import setupRoutes from './core/routes/setup.routes.js'
import wmsRoutes from './core/routes/wms.routes.js'
import adminRoutes from './core/routes/admin.routes.js'
import publicRoutes from './core/routes/public.routes.js'
import cronRoutes from './core/routes/cron.routes.js'

// Multi-tenant middleware
import { tenantContext } from './modules/middleware/tenantContext.js'
import { moduleGuard } from './modules/middleware/moduleGuard.js'

// Module routes
import scanRoutes from './modules/dropscan/routes/scan.routes.js'
import tarimasRoutes from './modules/dropscan/routes/tarimas.routes.js'
import dashboardRoutes from './modules/dropscan/routes/dashboard.routes.js'
import dropscanConfigRoutes from './modules/dropscan/routes/config.routes.js'
import operadoresRoutes from './modules/dropscan/routes/operadores.routes.js'

// Inventory module routes
import invScanRoutes from './modules/inventory/routes/scan.routes.js'
import invTarimasRoutes from './modules/inventory/routes/tarimas.routes.js'

// FEP module routes
import fepFoliosRoutes from './modules/fep/routes/folios.routes.js'

// Devoluciones module routes
import devEntradasRoutes from './modules/devoluciones/routes/entradas.routes.js'
import devInventarioRoutes from './modules/devoluciones/routes/inventario.routes.js'
import devSalidasRoutes from './modules/devoluciones/routes/salidas.routes.js'
import devUtilsRoutes from './modules/devoluciones/routes/utils.routes.js'

// Upapex module routes
import upapexRoutes from './modules/upapex/routes/upapex.routes.js'

const app = express()

function isAllowedDevOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function isAllowedOrigin(origin) {
  if (!origin) return true

  // Explicit allowlist from env (comma-separated)
  const allowedOrigins = new Set(
    String(env.CORS_ORIGIN || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  )
  if (allowedOrigins.has(origin)) return true

  // Dev: allow localhost
  if (env.NODE_ENV !== 'production' && isAllowedDevOrigin(origin)) return true

  // Allow any subdomain of TENANT_BASE_DOMAIN (wildcard tenant subdomains)
  try {
    const { hostname, protocol } = new URL(origin)
    const baseDomain = env.TENANT_BASE_DOMAIN
    if (
      protocol === 'https:' &&
      (hostname === baseDomain || hostname.endsWith(`.${baseDomain}`))
    ) return true
  } catch {}

  return false
}

// Security
app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true)
    console.warn(`[CORS] blocked origin: ${origin}`)
    return callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
}))

// Rate limiting — global (all /api routes)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' }
})
app.use('/api', generalLimiter)

// Rate limiting — stricter for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, intenta más tarde' }
})

// Body parsing — evidence uploads travel as base64 JSON, so allow enough headroom for 2 MB files.
app.use(express.json({ limit: '5mb' }))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' })
})

// Public routes (no auth, no tenant context)
app.use('/api/public', publicRoutes)

// Admin routes (super_admin auth, no tenant context)
app.use('/api/admin/auth/login', loginLimiter)
app.use('/api/admin', adminRoutes)

// Cron routes (CRON_SECRET auth, no tenant context)
app.use('/api/cron', cronRoutes)

// Auth routes (tenant resolved inline from Host header)
app.use('/api/auth/login', loginLimiter)
app.use('/api/auth', authRoutes)

// All tenant-scoped routes — apply tenantContext first
app.use('/api/users', tenantContext, tenantDB, usersRoutes)
app.use('/api/roles', tenantContext, tenantDB, rolesRoutes)
app.use('/api/config', tenantContext, tenantDB, configRoutes)
app.use('/api/setup', tenantContext, tenantDB, setupRoutes)
app.use('/api/wms', tenantContext, tenantDB, wmsRoutes)

// DropScan — require dropscan module access
app.use('/api/dropscan', tenantContext, tenantDB, moduleGuard('dropscan'), scanRoutes)
app.use('/api/dropscan/tarimas', tenantContext, tenantDB, moduleGuard('dropscan'), tarimasRoutes)
app.use('/api/dropscan/historial', tenantContext, tenantDB, moduleGuard('dropscan'), tarimasRoutes)
app.use('/api/dropscan/dashboard', tenantContext, tenantDB, moduleGuard('dropscan'), dashboardRoutes)
app.use('/api/dropscan/config', tenantContext, tenantDB, moduleGuard('dropscan'), dropscanConfigRoutes)
app.use('/api/dropscan/operadores', tenantContext, tenantDB, moduleGuard('dropscan'), operadoresRoutes)

// Inventory — require inventory module (not in MVP plans, returns 403 for trial/basic)
app.use('/api/inventory', tenantContext, tenantDB, moduleGuard('inventory'), invScanRoutes)
app.use('/api/inventory/tarimas', tenantContext, tenantDB, moduleGuard('inventory'), invTarimasRoutes)
app.use('/api/inventory/historial', tenantContext, tenantDB, moduleGuard('inventory'), invTarimasRoutes)

// FEP — require dropscan module (FEP is part of dropscan)
app.use('/api/fep/folios', tenantContext, tenantDB, moduleGuard('dropscan'), fepFoliosRoutes)

// Devoluciones module
app.use('/api/devoluciones/entradas', tenantContext, tenantDB, devEntradasRoutes)
app.use('/api/devoluciones/inventario', tenantContext, tenantDB, devInventarioRoutes)
app.use('/api/devoluciones/salidas', tenantContext, tenantDB, devSalidasRoutes)
app.use('/api/devoluciones', tenantContext, tenantDB, devUtilsRoutes)

// Upapex module
app.use('/api/upapex', tenantContext, tenantDB, upapexRoutes)

// Auto-apply pending migrations (idempotent — each step is independent)
async function runMigrations() {
  const steps = [
    `CREATE TABLE IF NOT EXISTS usuarios_internos (
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
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_internos_nombre_tenant
       ON usuarios_internos(tenant_id, nombre) WHERE eliminado = false`,
    `CREATE INDEX IF NOT EXISTS idx_usuarios_internos_activo ON usuarios_internos(activo) WHERE eliminado = false`,
    `CREATE INDEX IF NOT EXISTS idx_usuarios_internos_tenant ON usuarios_internos(tenant_id)`,
    `CREATE TABLE IF NOT EXISTS logs_usuarios_internos (
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
     )`,
    `CREATE INDEX IF NOT EXISTS idx_logs_ui_evento ON logs_usuarios_internos(evento)`,
    `CREATE INDEX IF NOT EXISTS idx_logs_ui_usuario ON logs_usuarios_internos(usuario_interno_id)`,
    `CREATE INDEX IF NOT EXISTS idx_logs_ui_created ON logs_usuarios_internos(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_logs_ui_tenant ON logs_usuarios_internos(tenant_id)`,
    `ALTER TABLE sesiones_escaneo ADD COLUMN IF NOT EXISTS usuario_operador VARCHAR(100)`,
    `ALTER TABLE sesiones_escaneo ADD COLUMN IF NOT EXISTS usuario_interno_id INTEGER REFERENCES usuarios_internos(id)`,
    `ALTER TABLE sesiones_escaneo ADD COLUMN IF NOT EXISTS nivel_usuario VARCHAR(30)`,
    `ALTER TABLE guias ADD COLUMN IF NOT EXISTS usuario_operador VARCHAR(100)`,
    `ALTER TABLE guias ADD COLUMN IF NOT EXISTS nivel_usuario VARCHAR(30)`,
    `ALTER TABLE guias ADD COLUMN IF NOT EXISTS usuario_interno_id INTEGER REFERENCES usuarios_internos(id)`,
    `CREATE INDEX IF NOT EXISTS idx_guias_usuario_interno ON guias(usuario_interno_id)`,

    // ── WMS credentials ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wms_credentials (
       id SERIAL PRIMARY KEY,
       app_key TEXT NOT NULL,
       app_secret_encrypted TEXT NOT NULL,
       base_url TEXT NOT NULL DEFAULT 'https://api.xlwms.com/openapi/v1',
       is_active BOOLEAN DEFAULT true,
       created_at TIMESTAMPTZ DEFAULT now(),
       updated_at TIMESTAMPTZ DEFAULT now()
     )`,

    // ── WMS cache ──────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wms_cache (
       key TEXT PRIMARY KEY,
       data JSONB NOT NULL,
       expires_at TIMESTAMPTZ NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_wms_cache_expires ON wms_cache(expires_at)`,

    // ── Inventory sessions ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS inventory_sessions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
       origin_location TEXT,
       status TEXT DEFAULT 'active' CHECK (status IN ('active','closed')),
       started_at TIMESTAMPTZ DEFAULT now(),
       ended_at TIMESTAMPTZ
     )`,
    `CREATE INDEX IF NOT EXISTS idx_inv_sessions_user ON inventory_sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inv_sessions_status ON inventory_sessions(status)`,

    // ── Inventory scans ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS inventory_scans (
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
     )`,
    `CREATE INDEX IF NOT EXISTS idx_inv_scans_session ON inventory_scans(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inv_scans_user ON inventory_scans(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inv_scans_barcode ON inventory_scans(barcode)`,
    `CREATE INDEX IF NOT EXISTS idx_inv_scans_created ON inventory_scans(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_inv_scans_status ON inventory_scans(status)`,

    // ── Backfill existing roles with inventory + wms permissions ──────────
    `UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"eliminar"', true)
     WHERE nombre = 'Administrador' AND NOT (permisos -> 'global' ? 'wms')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"ver"', true)
     WHERE nombre = 'Jefe' AND NOT (permisos -> 'global' ? 'wms')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"sin_acceso"', true)
     WHERE nombre NOT IN ('Administrador','Jefe') AND NOT (permisos -> 'global' ? 'wms')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
       '{"escaneo":"eliminar","tarimas":"eliminar","reportes":"eliminar"}'::jsonb, true)
     WHERE nombre = 'Administrador' AND NOT (permisos ? 'inventory')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
       '{"escaneo":"actualizar","tarimas":"actualizar","reportes":"crear"}'::jsonb, true)
     WHERE nombre = 'Jefe' AND NOT (permisos ? 'inventory')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
       '{"escaneo":"crear","tarimas":"ver","reportes":"sin_acceso"}'::jsonb, true)
     WHERE nombre = 'Operador' AND NOT (permisos ? 'inventory')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
       '{"escaneo":"sin_acceso","tarimas":"ver","reportes":"ver"}'::jsonb, true)
     WHERE nombre = 'Usuario' AND NOT (permisos ? 'inventory')`,

    // ── FEP — Folios de Entrega Paqueteria ────────────────────────────────
    `CREATE SEQUENCE IF NOT EXISTS fep_folio_seq START 1`,
    `CREATE TABLE IF NOT EXISTS folios_entrega (
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
     )`,
    `CREATE INDEX IF NOT EXISTS idx_fep_estado ON folios_entrega(estado)`,
    `CREATE INDEX IF NOT EXISTS idx_fep_empresa ON folios_entrega(empresa_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fep_created ON folios_entrega(created_at)`,
    `CREATE TABLE IF NOT EXISTS folios_entrega_tarimas (
       id SERIAL PRIMARY KEY,
       folio_id INTEGER REFERENCES folios_entrega(id) ON DELETE CASCADE,
       tarima_id INTEGER REFERENCES tarimas(id) ON DELETE RESTRICT,
       agregado_en TIMESTAMPTZ DEFAULT now(),
       agregado_por INTEGER REFERENCES usuarios(id),
       eliminado_en TIMESTAMPTZ,
       eliminado_por INTEGER REFERENCES usuarios(id),
       UNIQUE (folio_id, tarima_id)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_fet_folio ON folios_entrega_tarimas(folio_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fet_tarima ON folios_entrega_tarimas(tarima_id)`,
    `CREATE TABLE IF NOT EXISTS folios_entrega_log (
       id SERIAL PRIMARY KEY,
       folio_id INTEGER REFERENCES folios_entrega(id) ON DELETE CASCADE,
       accion VARCHAR(30) NOT NULL,
       detalle JSONB,
       usuario_id INTEGER REFERENCES usuarios(id),
       timestamp TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_fel_folio ON folios_entrega_log(folio_id)`,
    // FEP folios is part of dropscan module — add folios permission to dropscan
    `UPDATE roles SET permisos = jsonb_set(permisos, '{dropscan,folios}', '"eliminar"', true) WHERE nombre = 'Administrador' AND NOT (permisos -> 'dropscan' ? 'folios')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{dropscan,folios}', '"actualizar"', true) WHERE nombre IN ('Jefe', 'Supervisor') AND NOT (permisos -> 'dropscan' ? 'folios')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{dropscan,folios}', '"crear"', true) WHERE nombre = 'Operador' AND NOT (permisos -> 'dropscan' ? 'folios')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{dropscan,folios}', '"ver"', true) WHERE nombre = 'Usuario' AND NOT (permisos -> 'dropscan' ? 'folios')`,
    // is_default columns required by provisioning service and users query
    `ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false`,
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false`,
    // force_password_change alias for must_change_password (reset-password endpoint)
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false`,
    // Fix roles unique constraint: must be per-tenant not global
    `ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_nombre_key`,
    `DROP INDEX IF EXISTS roles_nombre_key`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_tenant_nombre ON roles(tenant_id, nombre)`,
    // tenant_id column on folios_entrega_log (required for RLS and audit)
    `ALTER TABLE folios_entrega_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)`,
    // tenant_id on folios tables for full RLS coverage
    `ALTER TABLE folios_entrega ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)`,
    `ALTER TABLE folios_entrega_tarimas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)`,
    // es_admin_tenant: marks the default admin user created during tenant provisioning
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_admin_tenant BOOLEAN DEFAULT false`,
    // must_change_password: flag used during direct tenant creation
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false`,
    // Tenant-scoped unique codes: tarima codes and folio numbers must be unique per tenant,
    // not globally — two different tenants may share the same code without conflict.
    `ALTER TABLE tarimas DROP CONSTRAINT IF EXISTS tarimas_codigo_key`,
    `ALTER TABLE tarimas ADD CONSTRAINT tarimas_tenant_codigo_unique UNIQUE (tenant_id, codigo)`,
    `ALTER TABLE folios_entrega DROP CONSTRAINT IF EXISTS folios_entrega_folio_numero_key`,
    `ALTER TABLE folios_entrega ADD CONSTRAINT fep_tenant_numero_unique UNIQUE (tenant_id, folio_numero)`,
    // token_blacklist: required for JWT invalidation on logout
    `CREATE TABLE IF NOT EXISTS token_blacklist (
       id SERIAL PRIMARY KEY,
       token_jti VARCHAR(64) UNIQUE NOT NULL,
       user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
       expires_at TIMESTAMP NOT NULL,
       tenant_id UUID REFERENCES tenants(id),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(token_jti)`,
    `CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at)`,
    // audit_log: required for tarima operation history and sensitive action logging
    `CREATE TABLE IF NOT EXISTS audit_log (
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
     )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`,

    // ── devoluciones v2 — per-SKU dimensions + multicaja + salida ref ─────
    `ALTER TABLE dev_item_skus ADD COLUMN IF NOT EXISTS peso NUMERIC(10,3)`,
    `ALTER TABLE dev_item_skus ADD COLUMN IF NOT EXISTS largo NUMERIC(10,2)`,
    `ALTER TABLE dev_item_skus ADD COLUMN IF NOT EXISTS ancho NUMERIC(10,2)`,
    `ALTER TABLE dev_item_skus ADD COLUMN IF NOT EXISTS alto NUMERIC(10,2)`,
    `ALTER TABLE dev_items ADD COLUMN IF NOT EXISTS codigo_multicaja TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_dev_items_multicaja ON dev_items(tenant_id, codigo_multicaja) WHERE codigo_multicaja IS NOT NULL`,
    `ALTER TABLE dev_inventario ADD COLUMN IF NOT EXISTS codigo_multicaja TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_dev_inventario_multicaja ON dev_inventario(tenant_id, codigo_multicaja) WHERE codigo_multicaja IS NOT NULL`,
    `ALTER TABLE dev_salidas ADD COLUMN IF NOT EXISTS referencia TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_dev_salidas_referencia ON dev_salidas(tenant_id, referencia) WHERE referencia IS NOT NULL`,
    `ALTER TABLE dev_inventario ALTER COLUMN item_id DROP NOT NULL`,
    `ALTER TABLE dev_inventario ALTER COLUMN sesion_id DROP NOT NULL`,
    `ALTER TABLE dev_inventario ALTER COLUMN codigo_trazabilidad DROP NOT NULL`,
    `ALTER TABLE dev_movimientos ADD COLUMN IF NOT EXISTS observacion TEXT`,
    // ── Fix 2: prefix codes AJU- for ajustes, KOT- for salidas ────────────
    `ALTER TABLE dev_ajustes ADD COLUMN IF NOT EXISTS codigo TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_dev_ajustes_codigo ON dev_ajustes(tenant_id, codigo) WHERE codigo IS NOT NULL`,
    // ── 036: peso por guía en dropscan ────────────────────────────────────
    `ALTER TABLE guias ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(10,3)`,
    `CREATE INDEX IF NOT EXISTS idx_guias_peso_kg ON guias (tenant_id, tarima_id) WHERE peso_kg IS NOT NULL`,

    // ── 039: Rename upapex_* tables to domain-neutral identifiers ────────
    `ALTER TABLE IF EXISTS upapex_config RENAME TO wms_config`,
    `ALTER TABLE IF EXISTS upapex_scan_sessions RENAME TO pick_sessions`,
    `ALTER TABLE IF EXISTS upapex_scan_events RENAME TO pick_events`,
    `ALTER TABLE IF EXISTS upapex_inventory_sessions RENAME TO inv_sessions`,
    `ALTER TABLE IF EXISTS upapex_inventory_scans RENAME TO inv_scans`,
    `ALTER TABLE IF EXISTS upapex_surtidores RENAME TO pick_surtidores`,
    `ALTER TABLE IF EXISTS upapex_order_tracking RENAME TO pick_order_tracking`,

    // ── 037: WMS Hub config ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wms_config (
       id SERIAL PRIMARY KEY,
       tenant_id UUID REFERENCES tenants(id) NOT NULL,
       app_key TEXT NOT NULL,
       base_url TEXT NOT NULL DEFAULT 'https://api.xlwms.com/openapi',
       is_active BOOLEAN DEFAULT true,
       last_verified_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ DEFAULT now(),
       updated_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_wms_config_tenant ON wms_config(tenant_id)`,

    // ── 037: Picking scan sessions ────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS pick_sessions (
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
     )`,
    `CREATE INDEX IF NOT EXISTS idx_pick_sessions_tenant ON pick_sessions(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pick_sessions_status ON pick_sessions(tenant_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_pick_sessions_operator ON pick_sessions(operator_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pick_sessions_order ON pick_sessions(tenant_id, outbound_order_no)`,

    // ── 037: Picking scan events ──────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS pick_events (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       session_id UUID REFERENCES pick_sessions(id) ON DELETE CASCADE NOT NULL,
       scanned_code TEXT NOT NULL,
       normalized_code TEXT NOT NULL,
       matched_sku TEXT,
       matched_box_type TEXT,
       scan_result TEXT NOT NULL CHECK (scan_result IN ('ok','unexpected','duplicate','not_found')),
       quantity INTEGER DEFAULT 1,
       scanned_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_pick_events_session ON pick_events(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pick_events_result ON pick_events(session_id, scan_result)`,

    // ── 037: Upapex permissions on existing roles ─────────────────────────
    `UPDATE roles SET permisos = jsonb_set(permisos, '{upapex}',
       '{"hub":"eliminar","inventario":"eliminar","surtido":"eliminar"}'::jsonb, true)
     WHERE nombre = 'Administrador' AND NOT (permisos ? 'upapex')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{upapex}',
       '{"hub":"ver","inventario":"actualizar","surtido":"actualizar"}'::jsonb, true)
     WHERE nombre = 'Jefe' AND NOT (permisos ? 'upapex')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{upapex}',
       '{"hub":"ver","inventario":"ver","surtido":"crear"}'::jsonb, true)
     WHERE nombre = 'Operador' AND NOT (permisos ? 'upapex')`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{upapex}',
       '{"hub":"sin_acceso","inventario":"ver","surtido":"ver"}'::jsonb, true)
     WHERE nombre NOT IN ('Administrador','Jefe','Operador') AND NOT (permisos ? 'upapex')`,

    // ── 038: Inventario WMS sessions ──────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS inv_sessions (
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
     )`,
    `CREATE INDEX IF NOT EXISTS idx_inv_sessions_tenant ON inv_sessions(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inv_sessions_status ON inv_sessions(tenant_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_inv_sessions_operator ON inv_sessions(operator_id)`,

    // ── 038: Inventario WMS scans ─────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS inv_scans (
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
     )`,
    `CREATE INDEX IF NOT EXISTS idx_inv_scans_session ON inv_scans(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inv_scans_status ON inv_scans(session_id, scan_status)`,

    // ── 038: Pickers list ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS pick_surtidores (
       id SERIAL PRIMARY KEY,
       tenant_id UUID REFERENCES tenants(id) NOT NULL,
       nombre TEXT NOT NULL,
       activo BOOLEAN DEFAULT true,
       created_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pick_surtidores_tenant_nombre ON pick_surtidores(tenant_id, nombre) WHERE activo = true`,
    `CREATE INDEX IF NOT EXISTS idx_pick_surtidores_tenant ON pick_surtidores(tenant_id)`,

    // ── 038: Order tracking (local status pipeline for WMS outbound orders)
    `CREATE TABLE IF NOT EXISTS pick_order_tracking (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id UUID REFERENCES tenants(id) NOT NULL,
       outbound_order_no TEXT NOT NULL,
       third_order_no TEXT,
       surtidor_id INTEGER REFERENCES pick_surtidores(id) ON DELETE SET NULL,
       surtidor_nombre TEXT,
       status TEXT NOT NULL DEFAULT 'pending_assignment' CHECK (status IN ('pending_assignment','assigned','sorting','pending_validation','validating','complete')),
       notes TEXT,
       created_at TIMESTAMPTZ DEFAULT now(),
       updated_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pick_order_tracking_unique ON pick_order_tracking(tenant_id, outbound_order_no)`,
    `CREATE INDEX IF NOT EXISTS idx_pick_order_tracking_tenant ON pick_order_tracking(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pick_order_tracking_status ON pick_order_tracking(tenant_id, status)`,

    // ── 041: Migrate upapex.* permissions to domain-specific permission sets ─
    // Inventario module: escaneo, registros, admin
    `UPDATE roles
     SET permisos = permisos
       || jsonb_build_object('inventario', jsonb_build_object(
            'escaneo',   COALESCE(permisos->'upapex'->>'inventario', 'sin_acceso'),
            'registros', COALESCE(permisos->'upapex'->>'inventario', 'sin_acceso'),
            'admin',     CASE WHEN COALESCE(permisos->'upapex'->>'inventario','') = 'eliminar' THEN 'eliminar' ELSE 'sin_acceso' END
          ))
     WHERE permisos ? 'upapex' AND NOT (permisos ? 'inventario')`,

    // Surtido module: ordenes, escaneo, registros, assign, admin
    `UPDATE roles
     SET permisos = permisos
       || jsonb_build_object('surtido', jsonb_build_object(
            'ordenes',    COALESCE(permisos->'upapex'->>'surtido', 'sin_acceso'),
            'validacion', COALESCE(permisos->'upapex'->>'surtido', 'sin_acceso'),
            'registros',  COALESCE(permisos->'upapex'->>'surtido', 'sin_acceso'),
            'assign',     CASE WHEN COALESCE(permisos->'upapex'->>'surtido','') IN ('actualizar','eliminar')
                               THEN COALESCE(permisos->'upapex'->>'surtido', 'sin_acceso')
                               ELSE 'sin_acceso' END,
            'admin',      CASE WHEN COALESCE(permisos->'upapex'->>'surtido','') = 'eliminar' THEN 'eliminar' ELSE 'sin_acceso' END
          ))
     WHERE permisos ? 'upapex' AND NOT (permisos ? 'surtido')`,

    // Sistema module: wms (takes best of upapex.hub and global.wms)
    `UPDATE roles
     SET permisos = permisos
       || jsonb_build_object('sistema', jsonb_build_object(
            'wms', COALESCE(
              NULLIF(COALESCE(permisos->'upapex'->>'hub',''), 'sin_acceso'),
              NULLIF(COALESCE(permisos->'global'->>'wms',''), 'sin_acceso'),
              'sin_acceso'
            )
          ))
     WHERE NOT (permisos ? 'sistema')`,

    // Ensure existing roles without upapex still get inventario/surtido/sistema defaults
    `UPDATE roles
     SET permisos = permisos
       || jsonb_build_object('inventario', jsonb_build_object(
            'escaneo','sin_acceso','registros','sin_acceso','admin','sin_acceso'))
     WHERE NOT (permisos ? 'inventario')`,
    `UPDATE roles
     SET permisos = permisos
       || jsonb_build_object('surtido', jsonb_build_object(
            'ordenes','sin_acceso','validacion','sin_acceso','registros','sin_acceso',
            'assign','sin_acceso','admin','sin_acceso'))
     WHERE NOT (permisos ? 'surtido')`,
    `UPDATE roles
     SET permisos = permisos
       || jsonb_build_object('sistema', jsonb_build_object('wms','sin_acceso'))
     WHERE NOT (permisos ? 'sistema')`,

    // Backfill Administrador and Jefe with full inventario/surtido/sistema.wms access
    `UPDATE roles SET permisos = jsonb_set(permisos, '{inventario}',
       '{"escaneo":"eliminar","registros":"eliminar","admin":"eliminar"}'::jsonb, true)
     WHERE nombre = 'Administrador'`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{surtido}',
       '{"ordenes":"eliminar","validacion":"eliminar","registros":"eliminar","assign":"eliminar","admin":"eliminar"}'::jsonb, true)
     WHERE nombre = 'Administrador'`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{sistema}',
       '{"wms":"eliminar"}'::jsonb, true)
     WHERE nombre = 'Administrador'`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{inventario}',
       '{"escaneo":"actualizar","registros":"actualizar","admin":"sin_acceso"}'::jsonb, true)
     WHERE nombre = 'Jefe' AND (permisos->'inventario'->>'escaneo' = 'sin_acceso' OR NOT (permisos->'inventario' ? 'escaneo'))`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{surtido}',
       '{"ordenes":"actualizar","validacion":"actualizar","registros":"actualizar","assign":"actualizar","admin":"sin_acceso"}'::jsonb, true)
     WHERE nombre = 'Jefe' AND (permisos->'surtido'->>'ordenes' = 'sin_acceso' OR NOT (permisos->'surtido' ? 'ordenes'))`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{sistema,wms}', '"ver"', true)
     WHERE nombre = 'Jefe' AND permisos->'sistema'->>'wms' = 'sin_acceso'`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{inventario}',
       '{"escaneo":"crear","registros":"ver","admin":"sin_acceso"}'::jsonb, true)
     WHERE nombre = 'Operador' AND (permisos->'inventario'->>'escaneo' = 'sin_acceso' OR NOT (permisos->'inventario' ? 'escaneo'))`,
    `UPDATE roles SET permisos = jsonb_set(permisos, '{surtido}',
       '{"ordenes":"ver","validacion":"crear","registros":"ver","assign":"sin_acceso","admin":"sin_acceso"}'::jsonb, true)
     WHERE nombre = 'Operador' AND (permisos->'surtido'->>'ordenes' = 'sin_acceso' OR NOT (permisos->'surtido' ? 'ordenes'))`,

    // ── 042: Add app_secret_encrypted to wms_config ──────────────────────
    `ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS app_secret_encrypted TEXT`,

    // ── 045: Rename surtido.escaneo → surtido.validacion in roles.permisos ─
    `UPDATE roles
     SET permisos = jsonb_set(
       permisos #- '{surtido,escaneo}',
       '{surtido,validacion}',
       COALESCE(permisos->'surtido'->'escaneo', '"sin_acceso"'::jsonb)
     )
     WHERE permisos->'surtido' ? 'escaneo'`,

    // ── 043: modulo_uso filter on ubicaciones ─────────────────────────────
    `ALTER TABLE dev_ubicaciones ADD COLUMN IF NOT EXISTS modulo_uso TEXT[] DEFAULT ARRAY['todos']`,

    // ── 044: ubicacion_id on inventory and pick sessions ──────────────────
    `ALTER TABLE inv_sessions  ADD COLUMN IF NOT EXISTS ubicacion_id UUID REFERENCES dev_ubicaciones(id)`,
    `ALTER TABLE pick_sessions ADD COLUMN IF NOT EXISTS ubicacion_id UUID REFERENCES dev_ubicaciones(id)`,

    // ── 046: Google Sheets URLs on wms_config ────────────────────────────
    `ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS sheet_inventory_url TEXT`,
    `ALTER TABLE wms_config ADD COLUMN IF NOT EXISTS sheet_outbound_url  TEXT`,
    `ALTER TABLE wms_config ALTER COLUMN app_key DROP NOT NULL`,
    `ALTER TABLE wms_config ALTER COLUMN base_url DROP NOT NULL`,

    // ── 040: Enable RLS on every public-schema table ──────────────────────
    // Blocks all access through Supabase REST/anon key (deny-by-default: no
    // policies = no access for anon/authenticated roles).
    // The backend connects as the postgres superuser which has BYPASSRLS and
    // is completely unaffected. Idempotent: re-enabling already-enabled RLS
    // is a no-op.
    `DO $$
     DECLARE rec RECORD;
     BEGIN
       FOR rec IN
         SELECT tablename FROM pg_tables WHERE schemaname = 'public'
       LOOP
         EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.tablename);
       END LOOP;
     END $$`,
  ]
  for (const sql of steps) {
    try {
      await query(sql)
    } catch (err) {
      console.error('Migration step warning (non-fatal):', err.message.slice(0, 120))
    }
  }
}
await runMigrations()

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
})

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Error interno del servidor' })
})

if (!process.env.VERCEL) {
  app.listen(env.PORT, () => {
    console.log(`
  🏭 WMS Backend v1.0.0
  📡 Server running on http://localhost:${env.PORT}
  🔗 API: http://localhost:${env.PORT}/api
  🌍 Environment: ${env.NODE_ENV}
  `)
  })
}

export default app

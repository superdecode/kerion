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
import usageRoutes from './core/routes/usage.routes.js'
import supportRoutes from './core/routes/support.routes.js'

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
import rastreoRoutes from './modules/inventory/routes/rastreo.routes.js'

// FEP module routes
import fepFoliosRoutes from './modules/fep/routes/folios.routes.js'

// Devoluciones module routes
import devEntradasRoutes from './modules/devoluciones/routes/entradas.routes.js'
import devInventarioRoutes from './modules/devoluciones/routes/inventario.routes.js'
import devSalidasRoutes from './modules/devoluciones/routes/salidas.routes.js'
import devUtilsRoutes from './modules/devoluciones/routes/utils.routes.js'

// WMS Hub module routes
import wmsHubRoutes from './modules/wms/routes/wms.routes.js'

// Anormalidades module routes
import anormRegistroRoutes from './modules/anormalidades/routes/registro.routes.js'
import anormDashboardRoutes from './modules/anormalidades/routes/dashboard.routes.js'
import anormMejorasRoutes from './modules/anormalidades/routes/mejoras.routes.js'
import anormConfigRoutes from './modules/anormalidades/routes/config.routes.js'

// Despacho module
import despachoFoliosRoutes from './modules/despacho/routes/folios.routes.js'
import despachoCatalogsRoutes from './modules/despacho/routes/catalogs.routes.js'
import despachoDashboardRoutes from './modules/despacho/routes/dashboard.routes.js'

// Recepcion module
import recepcionRoutes from './modules/recepcion/routes/recepcion.routes.js'
import recepcionValidacionRoutes from './modules/recepcion/routes/validacion.routes.js'
import recepcionReporteRoutes from './modules/recepcion/routes/reporte.routes.js'

// Dashboard sub-routes (new per-module endpoints)
import devDashboardRoutes from './modules/devoluciones/routes/dashboard.routes.js'
import invDashboardRoutes from './modules/inventory/routes/dashboard.routes.js'
import surtidoDashboardRoutes from './modules/wms/routes/surtido.dashboard.routes.js'

const app = express()
app.set('trust proxy', 1)

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
  max: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' }
})
app.use('/api', generalLimiter)

// Rate limiting — stricter for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, intenta más tarde' }
})

// 25 mb supports up to ~50k-row CSV imports; override via JSON_BODY_LIMIT env var.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '25mb' }))

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

// Inventory — require inventario module (specific routes before catch-all)
app.use('/api/inventory/dashboard', tenantContext, tenantDB, moduleGuard('inventario'), invDashboardRoutes)
app.use('/api/inventory/tarimas', tenantContext, tenantDB, moduleGuard('inventario'), invTarimasRoutes)
app.use('/api/inventory/historial', tenantContext, tenantDB, moduleGuard('inventario'), invTarimasRoutes)
app.use('/api/inventory', tenantContext, tenantDB, moduleGuard('inventario'), invScanRoutes)

// Rastreo (submodule of inventario)
app.use('/api/rastreo', tenantContext, tenantDB, moduleGuard('inventario'), rastreoRoutes)

// FEP — require dropscan module (FEP is part of dropscan)
app.use('/api/fep/folios', tenantContext, tenantDB, moduleGuard('dropscan'), fepFoliosRoutes)

// Devoluciones module (specific routes before catch-all)
app.use('/api/devoluciones/dashboard', tenantContext, tenantDB, moduleGuard('devoluciones'), devDashboardRoutes)
app.use('/api/devoluciones/entradas', tenantContext, tenantDB, moduleGuard('devoluciones'), devEntradasRoutes)
app.use('/api/devoluciones/inventario', tenantContext, tenantDB, moduleGuard('devoluciones'), devInventarioRoutes)
app.use('/api/devoluciones/salidas', tenantContext, tenantDB, moduleGuard('devoluciones'), devSalidasRoutes)
app.use('/api/devoluciones', tenantContext, tenantDB, moduleGuard('devoluciones'), devUtilsRoutes)

// WMS Hub module (Surtido) — specific routes before catch-all
app.use('/api/wmshub/dashboard', tenantContext, tenantDB, moduleGuard('surtido'), surtidoDashboardRoutes)
app.use('/api/wmshub', tenantContext, tenantDB, moduleGuard('surtido'), wmsHubRoutes)

// Anormalidades module
app.use('/api/anormalidades/dashboard', tenantContext, tenantDB, moduleGuard('anormalidades'), anormDashboardRoutes)
app.use('/api/anormalidades/mejoras', tenantContext, tenantDB, moduleGuard('anormalidades'), anormMejorasRoutes)
app.use('/api/anormalidades/config', tenantContext, tenantDB, moduleGuard('anormalidades'), anormConfigRoutes)
app.use('/api/anormalidades', tenantContext, tenantDB, moduleGuard('anormalidades'), anormRegistroRoutes)

// Despacho module
app.use('/api/despacho/catalogs', tenantContext, tenantDB, moduleGuard('despacho'), despachoCatalogsRoutes)
app.use('/api/despacho/folios', tenantContext, tenantDB, moduleGuard('despacho'), despachoFoliosRoutes)
app.use('/api/despacho/dashboard', tenantContext, tenantDB, moduleGuard('despacho'), despachoDashboardRoutes)

// Recepcion module
app.use('/api/recepcion', tenantContext, tenantDB, moduleGuard('recepcion'), recepcionRoutes)
app.use('/api/recepcion', tenantContext, tenantDB, moduleGuard('recepcion'), recepcionValidacionRoutes)
app.use('/api/recepcion', tenantContext, tenantDB, moduleGuard('recepcion'), recepcionReporteRoutes)

// Usage summary — available to all authenticated tenants
app.use('/api/usage', tenantContext, tenantDB, usageRoutes)

// Support — bug reports from tenant users
app.use('/api/support', tenantContext, tenantDB, supportRoutes)


// Inline migrations extracted to backend/migrations/048_server_inline_extract.sql
// Run `npm run db:migrate` to apply.
async function runMigrations() {} // no-op stub
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

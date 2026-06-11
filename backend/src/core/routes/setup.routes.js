import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../../config/database.js'
import env from '../../config/env.js'

const router = Router()

const DEFAULT_ROLES = [
  {
    nombre: 'Administrador',
    descripcion: 'Acceso total al sistema',
    permisos: {
      global: { inicio: 'eliminar', administracion: 'eliminar', wms: 'eliminar' },
      dropscan: { dashboard: 'eliminar', escaneo: 'eliminar', tarimas: 'eliminar', reportes: 'eliminar', configuracion: 'eliminar', folios: 'eliminar' },
      fep: { folios: 'eliminar' },
      inventario: { escaneo: 'eliminar', registros: 'eliminar' },
      devoluciones: { entradas: 'eliminar', inventario: 'eliminar', salidas: 'eliminar' },
      surtido: { ordenes: 'eliminar', validacion: 'eliminar', registros: 'eliminar' },
      anormalidades: { registro: 'eliminar', dashboard: 'eliminar', mejoras: 'eliminar', configuracion: 'eliminar' },
      sistema: { wms: 'eliminar' },
    }
  },
]

// POST /api/setup — seeds DB with roles, admin user, and default configs
// Only runs if DB is empty (no roles). Safe to call multiple times.
router.post('/', async (_req, res) => {
  try {
    const existing = await query('SELECT COUNT(*) FROM roles')
    if (parseInt(existing.rows[0].count) > 0) {
      return res.status(409).json({
        error: 'El sistema ya está inicializado.',
        hint: 'Si olvidaste tus credenciales, contacta al administrador de base de datos.'
      })
    }

    const tenantId = env.LEGACY_TENANT_ID
    if (!tenantId) {
      return res.status(500).json({ error: 'LEGACY_TENANT_ID no configurado para setup inicial' })
    }

    // Create roles
    const roleIds = {}
    for (const role of DEFAULT_ROLES) {
      const r = await query(
        `INSERT INTO roles (tenant_id, nombre, descripcion, permisos, is_default) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tenantId, role.nombre, role.descripcion, JSON.stringify(role.permisos), role.nombre === 'Administrador']
      )
      roleIds[role.nombre] = r.rows[0].id
    }

    // Create admin user
    const adminPassword = 'Admin2024!'
    const passwordHash = await bcrypt.hash(adminPassword, 10)
    await query(
      `INSERT INTO usuarios (tenant_id, codigo, nombre_completo, email, password_hash, rol_id, estado, es_admin_tenant, is_default, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO', true, true, false)`,
      [tenantId, 'ADM001', 'Administrador', 'admin@kirion.com', passwordHash, roleIds['Administrador']]
    )

    // Default DropScan configs
    const configs = [
      { tipo: 'empresa', codigo: 'DHL', nombre: 'DHL Express' },
      { tipo: 'empresa', codigo: 'FEDEX', nombre: 'FedEx' },
      { tipo: 'empresa', codigo: 'ESTAFETA', nombre: 'Estafeta' },
      { tipo: 'canal', codigo: 'CANAL-1', nombre: 'Canal 1', es_default: true },
      { tipo: 'canal', codigo: 'CANAL-2', nombre: 'Canal 2' },
    ]
    for (const cfg of configs) {
      const configJson = cfg.tipo === 'canal'
        ? { es_default: cfg.es_default || false, empresa_ids: [] }
        : null
      await query(
        `INSERT INTO configuraciones (tenant_id, modulo, tipo, codigo, nombre, config_json)
         VALUES ($1, 'dropscan', $2, $3, $4, $5)
         ON CONFLICT (tenant_id, modulo, tipo, codigo) DO NOTHING`,
        [tenantId, cfg.tipo, cfg.codigo, cfg.nombre, configJson ? JSON.stringify(configJson) : null]
      )
    }

    res.json({
      success: true,
      message: 'Sistema inicializado correctamente.',
      credentials: {
        email: 'admin@kirion.com',
        password: adminPassword,
        nota: 'Cambia esta contraseña inmediatamente después de iniciar sesión.'
      }
    })
  } catch (error) {
    console.error('Setup error:', error)
    res.status(500).json({ error: 'Error inicializando el sistema: ' + error.message })
  }
})

// GET /api/setup/status — check if DB has been initialized
router.get('/status', async (_req, res) => {
  try {
    const r = await query('SELECT COUNT(*) FROM roles')
    const initialized = parseInt(r.rows[0].count) > 0
    res.json({ initialized, roles: parseInt(r.rows[0].count) })
  } catch (error) {
    res.status(500).json({ error: 'Error verificando estado: ' + error.message })
  }
})

export default router

import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import env from '../../config/env.js'
import { query } from '../../config/database.js'
import { authenticateToken, auditLog } from '../../shared/middleware/auth.js'
import { normalizeLevel } from '../../shared/middleware/permissions.js'


// Deep-normalize all permission level values in a permissions object
function normalizePermisos(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = {}
  for (const [key, val] of Object.entries(obj)) {
    result[key] = typeof val === 'string' ? normalizeLevel(val) : normalizePermisos(val)
  }
  return result
}

const router = Router()

async function resolveTenantIdFromRequest(req) {
  // x-forwarded-host takes priority (Vercel sets this to the public hostname)
  const rawHost = req.headers['x-forwarded-host'] || req.headers['host'] || ''
  const host = rawHost.split(',')[0].trim()
  const baseDomain = env.TENANT_BASE_DOMAIN
  const withoutPort = host.split(':')[0]

  let slug = null
  if (withoutPort.endsWith(`.${baseDomain}`)) {
    slug = withoutPort.slice(0, -(baseDomain.length + 1))
  } else if (env.NODE_ENV !== 'production' && req.headers['x-tenant-slug']) {
    slug = req.headers['x-tenant-slug']
  }

  console.log('[auth/login] host=' + host + ' baseDomain=' + baseDomain + ' slug=' + (slug || '(none)'))

  if (slug) {
    const res = await query(
      'SELECT id, slug, status FROM tenants WHERE slug = $1 LIMIT 1',
      [slug]
    )
    console.log(`[auth/login] tenant query rows=${res.rows.length}`)
    if (res.rows.length === 0) return null
    const tenant = res.rows[0]
    if (['suspended', 'rejected', 'pending'].includes(tenant.status)) return { blocked: true, status: tenant.status }
    return { id: tenant.id, slug: tenant.slug, status: tenant.status }
  }

  // Fallback: no subdomain — use legacy tenant (single-tenant production or local dev)
  if (env.LEGACY_TENANT_ID) {
    const res = await query(
      'SELECT id, slug, status FROM tenants WHERE id = $1 LIMIT 1',
      [env.LEGACY_TENANT_ID]
    )
    if (res.rows.length === 0) return null
    const tenant = res.rows[0]
    if (['suspended', 'rejected', 'pending'].includes(tenant.status)) return { blocked: true, status: tenant.status }
    return { id: tenant.id, slug: tenant.slug, status: tenant.status }
  }

  return null
}

// POST /api/auth/login
// Resolves tenant from subdomain (Host header). Users are scoped to their tenant.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' })
    }

    const tenant = await resolveTenantIdFromRequest(req)
    if (!tenant) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }
    if (tenant.blocked) {
      return res.status(403).json({ error: 'Cuenta no disponible. Contacta a soporte.' })
    }

    const result = await query(
      `SELECT u.*, r.nombre as rol_nombre, r.permisos as rol_permisos
       FROM usuarios u
       LEFT JOIN roles r ON u.rol_id = r.id
       WHERE u.email = $1 AND u.tenant_id = $2`,
      [email.toLowerCase().trim(), tenant.id]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const user = result.rows[0]

    if (user.estado !== 'ACTIVO') {
      return res.status(403).json({ error: 'Usuario inactivo o suspendido' })
    }

    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    await query('UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1', [user.id])

    const permisos = normalizePermisos(user.permisos_override || user.rol_permisos || {})

    const [subRes, tenantRes, modulesRes] = await Promise.all([
      query(
        `SELECT p.modules FROM subscriptions s
         JOIN plans p ON s.plan_id = p.id
         WHERE s.tenant_id = $1 AND s.status = 'active'
         ORDER BY s.started_at DESC LIMIT 1`,
        [tenant.id]
      ),
      query(
        `SELECT status, trial_expires_at, subscription_expires_at, legal_name, contact_email, contact_phone, current_plan_id, zona_horaria
         FROM tenants WHERE id = $1`,
        [tenant.id]
      ),
      query(
        'SELECT module_code FROM tenant_modules WHERE tenant_id = $1 AND enabled = true',
        [tenant.id]
      ),
    ])
    const modules = subRes.rows.length > 0 ? subRes.rows[0].modules : ['dropscan']
    const tenantInfo = tenantRes.rows[0] || {}
    const enabledModules = modulesRes.rows.map(r => r.module_code)

    const jti = crypto.randomBytes(16).toString('hex')
    const payload = {
      id: user.id,
      codigo: user.codigo,
      email: user.email,
      rol_id: user.rol_id,
      rol_nombre: user.rol_nombre,
      es_admin_tenant: user.es_admin_tenant === true,
      tenant_id: tenant.id,
      slug: tenant.slug,
      tenant_status: tenantInfo.status || tenant.status,
      must_change_password: user.must_change_password || false,
      modules,
      jti,
    }

    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN })

    auditLog(req, 'LOGIN', 'usuario', user.id, { email: user.email, rol: user.rol_nombre, tenant_id: tenant.id })

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        codigo: user.codigo,
        nombre_completo: user.nombre_completo,
        email: user.email,
        rol_id: user.rol_id,
        rol_nombre: user.rol_nombre,
        es_admin_tenant: user.es_admin_tenant === true,
        permisos,
        avatar_url: user.avatar_url,
        zona_horaria: user.zona_horaria || tenantInfo.zona_horaria || 'America/Mexico_City',
        must_change_password: user.must_change_password || false,
        modules,
        slug: tenant.slug,
        tenant_status: tenantInfo.status || tenant.status,
        tenant_name: tenantInfo.legal_name || '',
        tenant_contact_email: tenantInfo.contact_email || user.email,
        subscription_expires_at: tenantInfo.subscription_expires_at || null,
        trial_expires_at: tenantInfo.trial_expires_at || null,
        enabledModules,
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [result, tenantRes, modulesRes] = await Promise.all([
      query(
        `SELECT u.id, u.codigo, u.nombre_completo, u.email, u.rol_id, u.estado,
                u.avatar_url, u.permisos_override, u.ultimo_acceso, u.zona_horaria,
                u.es_admin_tenant,
                r.nombre as rol_nombre, r.permisos as rol_permisos
         FROM usuarios u
         LEFT JOIN roles r ON u.rol_id = r.id
         WHERE u.id = $1`,
        [req.user.id]
      ),
      req.user.tenant_id
        ? query(`SELECT status, trial_expires_at, subscription_expires_at, legal_name, contact_email, zona_horaria FROM tenants WHERE id = $1`, [req.user.tenant_id])
        : Promise.resolve({ rows: [] }),
      req.user.tenant_id
        ? query('SELECT module_code FROM tenant_modules WHERE tenant_id = $1 AND enabled = true', [req.user.tenant_id])
        : Promise.resolve({ rows: [] }),
    ])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const user = result.rows[0]
    const tenantInfo = tenantRes.rows[0] || {}
    const permisos = normalizePermisos(user.permisos_override || user.rol_permisos || {})
    const enabledModules = modulesRes.rows.map(r => r.module_code)

    res.json({
      id: user.id,
      codigo: user.codigo,
      nombre_completo: user.nombre_completo,
      email: user.email,
      rol_id: user.rol_id,
      rol_nombre: user.rol_nombre,
      es_admin_tenant: user.es_admin_tenant === true,
      permisos,
      avatar_url: user.avatar_url,
      estado: user.estado,
      ultimo_acceso: user.ultimo_acceso,
      zona_horaria: user.zona_horaria || tenantInfo.zona_horaria || 'America/Mexico_City',
      tenant_status: tenantInfo.status || req.user.tenant_status,
      tenant_name: tenantInfo.legal_name || '',
      tenant_contact_email: tenantInfo.contact_email || user.email,
      subscription_expires_at: tenantInfo.subscription_expires_at || null,
      trial_expires_at: tenantInfo.trial_expires_at || null,
      enabledModules,
    })
  } catch (error) {
    console.error('Auth/me error:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' })
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' })
    }

    const userRes = await query('SELECT password_hash FROM usuarios WHERE id = $1', [req.user.id])
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const valid = await bcrypt.compare(current_password, userRes.rows[0].password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' })
    }

    const newHash = await bcrypt.hash(new_password, 12)
    await query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [newHash, req.user.id])
    auditLog(req, 'CHANGE_PASSWORD', 'usuario', req.user.id, null)
    res.json({ success: true })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(500).json({ error: 'Error al cambiar contraseña' })
  }
})

// PUT /api/auth/preferences
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const { zona_horaria } = req.body
    if (!zona_horaria || typeof zona_horaria !== 'string') {
      return res.status(400).json({ error: 'zona_horaria es requerida' })
    }
    // Validate timezone by trying to format with it
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: zona_horaria }).format(new Date())
    } catch {
      return res.status(400).json({ error: 'Zona horaria inválida' })
    }
    await query(
      'UPDATE usuarios SET zona_horaria = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [zona_horaria, req.user.id]
    )
    res.json({ success: true, zona_horaria })
  } catch (error) {
    console.error('Preferences error:', error)
    res.status(500).json({ error: 'Error actualizando preferencias' })
  }
})

// PUT /api/auth/profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { nombre, apellido } = req.body
    const safeNombre = String(nombre || '').trim()
    const safeApellido = String(apellido || '').trim()
    const nombreCompleto = [safeNombre, safeApellido].filter(Boolean).join(' ').trim()

    if (!safeNombre || !safeApellido) {
      return res.status(400).json({ error: 'Nombre y apellido son requeridos' })
    }

    const result = await query(
      `UPDATE usuarios
       SET nombre_completo = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, codigo, nombre_completo, email, rol_id, estado, avatar_url, zona_horaria`,
      [nombreCompleto, req.user.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    auditLog(req, 'UPDATE_PROFILE', 'usuario', req.user.id, { nombre_completo: nombreCompleto })
    res.json({ success: true, user: result.rows[0] })
  } catch (error) {
    console.error('Profile update error:', error)
    res.status(500).json({ error: 'Error actualizando perfil' })
  }
})

// GET /api/auth/plan-info — plan details + guide usage for current tenant
router.get('/plan-info', authenticateToken, async (req, res) => {
  if (!req.user.tenant_id) return res.status(400).json({ error: 'Sin tenant' })
  try {
    const [subRes, guideRes, tenantRes] = await Promise.all([
      query(
        `SELECT p.name, p.code, p.guide_limit, s.expires_at, s.started_at
         FROM subscriptions s JOIN plans p ON s.plan_id = p.id
         WHERE s.tenant_id = $1 AND s.status = 'active'
         ORDER BY s.started_at DESC LIMIT 1`,
        [req.user.tenant_id]
      ),
      query(
        `SELECT COUNT(*)::int AS count FROM guias
         WHERE tenant_id = $1
           AND timestamp_escaneo >= date_trunc('month', CURRENT_DATE)`,
        [req.user.tenant_id]
      ),
      query(
        `SELECT status, trial_expires_at, subscription_expires_at FROM tenants WHERE id = $1`,
        [req.user.tenant_id]
      ),
    ])
    const plan = subRes.rows[0] || null
    const guidesThisMonth = guideRes.rows[0]?.count ?? 0
    const tenant = tenantRes.rows[0] || {}
    res.json({
      plan_name: plan?.name || null,
      plan_code: plan?.code || null,
      guide_limit: plan?.guide_limit || null,
      guides_this_month: guidesThisMonth,
      expires_at: plan?.expires_at || tenant.subscription_expires_at || null,
      trial_expires_at: tenant.trial_expires_at || req.user.trial_expires_at || null,
      tenant_status: tenant.status || req.user.tenant_status,
    })
  } catch (error) {
    console.error('Plan info error:', error)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Blacklist the token if it has a JTI
    if (req.user.jti) {
      const expiresAt = new Date(req.user.exp * 1000)
      await query(
        'INSERT INTO token_blacklist (token_jti, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token_jti) DO NOTHING',
        [req.user.jti, req.user.id, expiresAt]
      )
    }
    // Cleanup expired tokens opportunistically (1 in 10 chance)
    if (Math.random() < 0.1) {
      query('DELETE FROM token_blacklist WHERE expires_at < CURRENT_TIMESTAMP').catch(() => {})
    }
    auditLog(req, 'LOGOUT', 'usuario', req.user.id, null)
    res.json({ success: true, message: 'Sesión cerrada' })
  } catch (error) {
    console.error('Logout error:', error)
    res.json({ success: true, message: 'Sesión cerrada' })
  }
})

export default router

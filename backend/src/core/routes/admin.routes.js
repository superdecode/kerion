import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import env from '../../config/env.js'
import { query, getClient } from '../../config/database.js'
import { provisionTenant } from '../../services/provisioningService.js'
import { endOfDayInTimezone } from '../../shared/utils/timezone.js'

const router = Router()

// ── Super Admin Auth ───────────────────────────────────────────────────────────

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Token requerido' })

  try {
    const decoded = jwt.verify(token, env.JWT_ADMIN_SECRET)
    req.admin = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Token invalido' })
  }
}

async function adminAudit(adminId, action, entityType, entityId, details) {
  try {
    await query(
      `INSERT INTO system_audit_log (actor_type, actor_id, action, entity_type, entity_id, details)
       VALUES ('super_admin',$1,$2,$3,$4,$5)`,
      [adminId, action, entityType, entityId ? String(entityId) : null, details ? JSON.stringify(details) : null]
    )
  } catch (_) { /* non-blocking */ }
}

function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildSubscriptionTypeAndPrice(plan, subscriptionType) {
  const type = subscriptionType === 'annual' ? 'annual' : 'monthly'
  const price_amount = type === 'annual'
    ? (plan.price_annual ?? (plan.price_amount != null ? Number(plan.price_amount) * 12 : null))
    : (plan.price_amount ?? null)
  return {
    subscription_type: type,
    price_amount,
    price_currency: plan.price_currency || 'USD',
  }
}

// POST /api/admin/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' })

    const result = await query(
      'SELECT * FROM super_admins WHERE email = $1 AND is_active = true LIMIT 1',
      [email.toLowerCase().trim()]
    )
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciales invalidas' })

    const admin = result.rows[0]
    const valid = await bcrypt.compare(password, admin.password_hash)
    if (!valid) return res.status(401).json({ error: 'Credenciales invalidas' })

    await query('UPDATE super_admins SET last_login_at = now() WHERE id = $1', [admin.id])

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name, role: 'super_admin' },
      env.JWT_ADMIN_SECRET,
      { expiresIn: '12h' }
    )

    res.json({ success: true, token, admin: { id: admin.id, email: admin.email, name: admin.name } })
  } catch (err) {
    console.error('[admin/auth/login]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/admin/auth/change-password
router.post('/auth/change-password', authenticateAdmin, async (req, res) => {
  try {
    const { current_password, new_password } = req.body
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password y new_password son requeridos' })
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    }
    const result = await query('SELECT * FROM super_admins WHERE id = $1 AND is_active = true LIMIT 1', [req.admin.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Admin no encontrado' })
    const admin = result.rows[0]
    const valid = await bcrypt.compare(current_password, admin.password_hash)
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' })
    const newHash = await bcrypt.hash(new_password, 12)
    await query('UPDATE super_admins SET password_hash = $1 WHERE id = $2', [newHash, req.admin.id])
    res.json({ success: true })
  } catch (err) {
    console.error('[admin/auth/change-password]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/admin/seed — DEV ONLY: upsert super_admin (creates or updates password)
router.post('/seed', async (req, res) => {
  if (env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' })
  }
  try {
    const { email, password, name } = req.body
    if (!email || !password) return res.status(400).json({ error: 'email y password requeridos' })

    const hash = await bcrypt.hash(password, 12)
    const result = await query(
      `INSERT INTO super_admins (email, password_hash, name, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, is_active = true
       RETURNING id, email, name, is_active`,
      [email.toLowerCase().trim(), hash, name || 'Super Admin']
    )
    res.json({ success: true, admin: result.rows[0] })
  } catch (err) {
    console.error('[admin/seed]', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/admin/debug — DEV ONLY: list super_admin records for diagnosis
router.get('/debug', async (req, res) => {
  if (env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' })
  }
  try {
    const result = await query(
      `SELECT id, email, name, is_active, last_login_at,
              left(password_hash, 7) AS hash_prefix,
              length(password_hash) AS hash_len
       FROM super_admins ORDER BY created_at DESC`
    )
    res.json({ success: true, admins: result.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Signup Requests ────────────────────────────────────────────────────────────

// GET /api/admin/signup-requests?status=pending|approved|rejected (omit for all)
router.get('/signup-requests', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.query
    const result = status
      ? await query(`SELECT * FROM tenant_signup_requests WHERE status = $1 ORDER BY created_at DESC`, [status])
      : await query(`SELECT * FROM tenant_signup_requests ORDER BY created_at DESC`)
    res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[admin/signup-requests]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/admin/signup-requests/:id/approve
router.post('/signup-requests/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const result = await provisionTenant(id, req.admin.id)
    adminAudit(req.admin.id, 'APPROVE_SIGNUP', 'tenant_signup_request', id, { tenant_id: result.tenantId })
    res.json({ success: true, tenant_id: result.tenantId, admin_email: result.adminEmail })
  } catch (err) {
    console.error('[admin/approve]', err)
    res.status(500).json({ error: err.message || 'Error en provisioning' })
  }
})

// POST /api/admin/signup-requests/:id/reject
router.post('/signup-requests/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    if (!reason) return res.status(400).json({ error: 'Motivo de rechazo requerido' })

    const reqRes = await query('SELECT * FROM tenant_signup_requests WHERE id = $1 LIMIT 1', [id])
    if (reqRes.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' })
    const request = reqRes.rows[0]
    if (request.status !== 'pending') return res.status(409).json({ error: 'Solicitud ya procesada' })

    await query(
      `UPDATE tenant_signup_requests SET status='rejected', reviewed_by=$1, reviewed_at=now(), rejected_reason=$2
       WHERE id = $3`,
      [req.admin.id, reason, id]
    )

    await query(
      `INSERT INTO notifications_outbox (recipient_email, template_code, payload)
       VALUES ($1,'request_rejected',$2)`,
      [request.contact_email, JSON.stringify({
        contact_name: request.contact_name,
        organization_name: request.organization_name,
        reason,
      })]
    )

    adminAudit(req.admin.id, 'REJECT_SIGNUP', 'tenant_signup_request', id, { reason })
    res.json({ success: true })
  } catch (err) {
    console.error('[admin/reject]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PATCH /api/admin/signup-requests/:id/status — manual status override for renewals/corrections
router.patch('/signup-requests/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { status, reason } = req.body
    const allowed = ['pending', 'approved', 'rejected']
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Estado invalido. Valores permitidos: ' + allowed.join(', ') })

    const reqRes = await query('SELECT * FROM tenant_signup_requests WHERE id = $1 LIMIT 1', [id])
    if (reqRes.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' })
    const request = reqRes.rows[0]

    if (request.status === status) return res.status(409).json({ error: 'La solicitud ya tiene ese estado' })
    if (status === 'rejected' && !reason) return res.status(400).json({ error: 'Motivo requerido para rechazar' })

    await query(
      `UPDATE tenant_signup_requests
       SET status=$1, reviewed_by=$2, reviewed_at=now(), rejected_reason=COALESCE($3, rejected_reason)
       WHERE id = $4`,
      [status, req.admin.id, reason || null, id]
    )

    adminAudit(req.admin.id, 'UPDATE_SIGNUP_STATUS', 'tenant_signup_request', id, { from: request.status, to: status })
    res.json({ success: true, status })
  } catch (err) {
    console.error('[admin/signup-requests PATCH status]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ── Tenants ────────────────────────────────────────────────────────────────────

// GET /api/admin/tenants?status=trial
router.get('/tenants', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.query
    const base = `
      SELECT t.*, p.name as plan_name,
             (SELECT COUNT(*) FROM usuarios u WHERE u.tenant_id = t.id) as user_count,
             (SELECT MAX(u.ultimo_acceso) FROM usuarios u WHERE u.tenant_id = t.id) as last_access,
             (SELECT COUNT(*) FROM guias g WHERE g.tenant_id = t.id) as guias_count,
             (SELECT COUNT(*) FROM guias g
              WHERE g.tenant_id = t.id
                AND DATE_TRUNC('month', g.created_at) = DATE_TRUNC('month', CURRENT_DATE)) as guias_this_month,
             (SELECT s2.expires_at FROM subscriptions s2
              WHERE s2.tenant_id = t.id AND s2.status = 'active'
                AND (s2.expires_at IS NULL OR s2.expires_at >= now())
              ORDER BY s2.expires_at DESC LIMIT 1) as active_sub_expires_at,
             (SELECT p2.name FROM subscriptions s2
              JOIN plans p2 ON p2.id = s2.plan_id
              WHERE s2.tenant_id = t.id AND s2.status = 'active'
                AND (s2.expires_at IS NULL OR s2.expires_at >= now())
              ORDER BY s2.expires_at DESC LIMIT 1) as active_plan_name,
             (SELECT p2.guide_limit FROM subscriptions s2
              JOIN plans p2 ON p2.id = s2.plan_id
              WHERE s2.tenant_id = t.id AND s2.status = 'active'
                AND (s2.expires_at IS NULL OR s2.expires_at >= now())
              ORDER BY s2.expires_at DESC LIMIT 1) as active_plan_guide_limit
      FROM tenants t
      LEFT JOIN plans p ON t.current_plan_id = p.id
    `
    const result = status
      ? await query(`${base} WHERE t.status = $1 ORDER BY t.created_at DESC`, [status])
      : await query(`${base} ORDER BY t.created_at DESC`)

    res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[admin/tenants]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/admin/tenants/:id/stats — MUST come before /:id (more specific route first)
router.get('/tenants/:id/stats', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Simple queries without tenant filter first to test connectivity
    const [totalGuias, guias30d, tarimas, folios, scanners, users] = await Promise.all([
      query(`SELECT COUNT(*) AS total FROM guias WHERE tenant_id = $1`, [id]).catch(err => { console.error('[guias query]', err.message); return { rows: [{ total: 0 }] } }),
      query(`SELECT COUNT(*) AS total FROM guias WHERE tenant_id = $1 AND created_at >= now() - INTERVAL '30 days'`, [id]).catch(err => { console.error('[guias 30d]', err.message); return { rows: [{ total: 0 }] } }),
      query(`SELECT COUNT(*) AS total FROM tarimas WHERE tenant_id = $1`, [id]).catch(err => { console.error('[tarimas]', err.message); return { rows: [{ total: 0 }] } }),
      query(`SELECT COUNT(*) AS total FROM folios_entrega WHERE tenant_id = $1`, [id]).catch(err => { console.error('[folios_entrega]', err.message); return { rows: [{ total: 0 }] } }),
      query(`SELECT COUNT(*) AS total FROM usuarios_internos WHERE tenant_id = $1 AND activo = true`, [id]).catch(err => { console.error('[usuarios_internos]', err.message); return { rows: [{ total: 0 }] } }),
      query(`SELECT COUNT(*) AS total FROM usuarios WHERE tenant_id = $1`, [id]).catch(err => { console.error('[usuarios]', err.message); return { rows: [{ total: 0 }] } }),
    ])

    res.json({
      success: true,
      data: {
        total_guias: Number(totalGuias.rows[0]?.total ?? 0),
        guias_last_30d: Number(guias30d.rows[0]?.total ?? 0),
        total_tarimas: Number(tarimas.rows[0]?.total ?? 0),
        total_folios: Number(folios.rows[0]?.total ?? 0),
        active_scanners: Number(scanners.rows[0]?.total ?? 0),
        total_users: Number(users.rows[0]?.total ?? 0),
      },
    })
  } catch (err) {
    console.error('[admin/tenants/:id/stats]', err.message)
    res.status(500).json({ error: 'Error interno', details: err.message })
  }
})

// GET /api/admin/tenants/:id
router.get('/tenants/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const [tenantRes, logRes, subRes] = await Promise.all([
      query('SELECT t.*, p.name as plan_name FROM tenants t LEFT JOIN plans p ON t.current_plan_id = p.id WHERE t.id = $1', [id]),
      query('SELECT * FROM provisioning_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50', [id]),
      query(
        `SELECT s.id, s.code, s.tenant_id, s.plan_id, s.subscription_type, s.price_amount, s.price_currency,
                s.status, s.started_at, s.expires_at, s.payment_reference, s.notes, s.created_at,
                p.name as plan_name, p.code as plan_code, p.duration_days
         FROM subscriptions s
         JOIN plans p ON s.plan_id = p.id
         WHERE s.tenant_id = $1
         ORDER BY s.expires_at DESC NULLS LAST, s.created_at DESC`,
        [id]
      ),
    ])
    if (tenantRes.rows.length === 0) return res.status(404).json({ error: 'Tenant no encontrado' })

    const allSubscriptions = subRes.rows
    const activeSubscriptions = allSubscriptions.filter(s => 
      s.status === 'active' && (s.expires_at === null || new Date(s.expires_at) >= new Date())
    )

    res.json({
      success: true,
      tenant: tenantRes.rows[0],
      provisioning_log: logRes.rows,
      subscriptions: activeSubscriptions,
      subscription_history: allSubscriptions,
      active_subscription: activeSubscriptions[0] || null,
    })
  } catch (err) {
    console.error('[admin/tenants/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PATCH /api/admin/tenants/:id — update editable tenant fields
router.patch('/tenants/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { legal_name, contact_email, contact_phone, country, notes, slug, zona_horaria } = req.body

    // Auto-generate slug from legal_name if slug field sent as empty and legal_name provided
    let finalSlug = slug !== undefined ? (slug || null) : undefined
    if (finalSlug === '' || (finalSlug === undefined && !slug)) finalSlug = null
    if (slug === '' && legal_name) {
      finalSlug = legal_name.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    }

    await query(
      `UPDATE tenants SET
         legal_name = COALESCE($1, legal_name),
         contact_email = COALESCE($2, contact_email),
         contact_phone = COALESCE($3, contact_phone),
         country = COALESCE($4, country),
         notes = $5,
         slug = COALESCE($6, slug),
         zona_horaria = COALESCE($7, zona_horaria),
         updated_at = now()
       WHERE id = $8`,
      [legal_name || null, contact_email || null, contact_phone || null, country || null, notes ?? null, finalSlug, zona_horaria || null, id]
    )
    adminAudit(req.admin.id, 'UPDATE_TENANT', 'tenant', id, { legal_name, contact_email, contact_phone, country, slug: finalSlug, zona_horaria })
    res.json({ success: true })
  } catch (err) {
    console.error('[admin/tenants/:id PATCH]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/admin/tenants — create tenant directly without signup flow
router.post('/tenants', authenticateAdmin, async (req, res) => {
  const { legal_name, contact_name, contact_email, contact_phone, country, admin_password, slug, plan_id, subscription_type, started_at, zona_horaria } = req.body
  if (!legal_name || !contact_name || !contact_email || !admin_password) {
    return res.status(400).json({ error: 'legal_name, contact_name, contact_email y admin_password son requeridos' })
  }

  let client
  try {
    client = await getClient()
    await client.query('BEGIN')

    // Generate a stable slug from the provided value or the legal name.
    const baseSlug = normalizeSlug(slug || legal_name)
    if (!baseSlug) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'No se pudo generar un slug valido' })
    }

    // 1. Create tenant. If a concurrent request wins the same slug race, retry with a suffix.
    let tenant = null
    let finalSlug = baseSlug
    let suffix = 1
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const tenantRes = await client.query(
          `INSERT INTO tenants (slug, legal_name, contact_name, contact_email, contact_phone, country, status, current_plan_id, zona_horaria)
           VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8)
           RETURNING *`,
          [finalSlug, legal_name, contact_name, contact_email.toLowerCase().trim(), contact_phone || null, country || null, plan_id || null, zona_horaria || 'America/Mexico_City']
        )
        tenant = tenantRes.rows[0]
        break
      } catch (err) {
        if (err.code === '23505' && String(err.constraint || '').includes('slug')) {
          finalSlug = `${baseSlug}-${suffix++}`
          continue
        }
        throw err
      }
    }
    if (!tenant) {
      throw new Error('No se pudo reservar un slug unico para el tenant')
    }

    // 2. Create subscription if plan provided
    if (plan_id) {
      const planRes = await client.query('SELECT * FROM plans WHERE id = $1', [plan_id])
      if (planRes.rows.length > 0) {
        const plan = planRes.rows[0]

        const start = started_at ? new Date(started_at) : new Date()
        const durationDays = subscription_type === 'annual' ? 365 : (plan.duration_days || 30)
        const rawExpiry = new Date(start)
        rawExpiry.setDate(rawExpiry.getDate() + durationDays)
        const tz = zona_horaria || 'America/Mexico_City'
        const expiresAt = endOfDayInTimezone(rawExpiry, tz)
        const subscriptionMeta = buildSubscriptionTypeAndPrice(plan, subscription_type)
        const subscriptionCode = `SUB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

        await client.query(
          `INSERT INTO subscriptions (tenant_id, code, plan_id, subscription_type, price_amount, price_currency, status, started_at, expires_at, recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9)`,
          [tenant.id, subscriptionCode, plan_id, subscriptionMeta.subscription_type, subscriptionMeta.price_amount, subscriptionMeta.price_currency, start, expiresAt, req.admin.id]
        )
        await client.query(
          `UPDATE tenants SET subscription_expires_at = $1, updated_at = now() WHERE id = $2`,
          [expiresAt, tenant.id]
        )
      }
    }

    // 3. Create Admin role (is_default = true, non-deletable from frontend)
    console.log('[admin/tenants POST] step 3: creating admin role for tenant', tenant.id)
    const rolePermisos = {
      global: { inicio: 'eliminar', administracion: 'eliminar', wms: 'eliminar' },
      dropscan: { dashboard: 'eliminar', escaneo: 'eliminar', tarimas: 'eliminar', reportes: 'eliminar', configuracion: 'eliminar' },
      fep: { folios: 'eliminar' },
      inventory: { escaneo: 'eliminar', tarimas: 'eliminar', reportes: 'eliminar' },
    }
    const roleRes = await client.query(
      `INSERT INTO roles (tenant_id, nombre, permisos, is_default)
       VALUES ($1, 'Administrador', $2, true)
       ON CONFLICT (tenant_id, nombre) DO UPDATE SET permisos = EXCLUDED.permisos, is_default = true
       RETURNING id`,
      [tenant.id, JSON.stringify(rolePermisos)]
    )
    const roleId = roleRes.rows[0].id
    console.log('[admin/tenants POST] step 3 ok: roleId=%s', roleId)

    // 4. Create admin user — use only base columns, then UPDATE new optional columns defensively
    console.log('[admin/tenants POST] step 4: creating admin user')
    const bcryptMod = await import('bcryptjs')
    const hash = await bcryptMod.default.hash(admin_password, 12)
    const adminCodigo = `ADM-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

    const userRes = await client.query(
      `INSERT INTO usuarios (tenant_id, codigo, email, password_hash, nombre_completo, rol_id, estado)
       VALUES ($1,$2,$3,$4,$5,$6,'ACTIVO')
       ON CONFLICT (tenant_id, email) DO UPDATE SET
         nombre_completo = EXCLUDED.nombre_completo,
         password_hash   = EXCLUDED.password_hash,
         rol_id          = EXCLUDED.rol_id,
         estado          = 'ACTIVO'
       RETURNING id, email`,
      [tenant.id, adminCodigo, contact_email.toLowerCase().trim(), hash, contact_name, roleId]
    )
    const userId = userRes.rows[0].id

    // Set new optional columns defensively — columns added by migrations that may not exist on older DBs
    for (const [col, val] of [['es_admin_tenant', true], ['is_default', true], ['must_change_password', false]]) {
      try {
        await client.query(`UPDATE usuarios SET ${col} = $1 WHERE id = $2`, [val, userId])
      } catch (colErr) {
        console.error('[admin/tenants POST] step 4 optional column %s skipped: %s', col, colErr.message)
      }
    }
    console.log('[admin/tenants POST] step 4 ok: userId=%s', userId)

    // 5. Seed dropscan config — configuraciones table is what the scan UI reads
    console.log('[admin/tenants POST] step 5: seeding configuraciones for tenant', tenant.id)
    const seedConfigs = [
      { tipo: 'empresa', codigo: 'FEDEX', nombre: 'FedEx', config_json: JSON.stringify({ color: '#4d148c' }) },
      { tipo: 'empresa', codigo: 'DHL', nombre: 'DHL', config_json: JSON.stringify({ color: '#ffcc00' }) },
      { tipo: 'empresa', codigo: 'UPS', nombre: 'UPS', config_json: JSON.stringify({ color: '#351c15' }) },
      { tipo: 'canal', codigo: 'PRINCIPAL', nombre: 'Canal Principal', config_json: null },
    ]
    for (const c of seedConfigs) {
      await client.query(
        `INSERT INTO configuraciones (tenant_id, modulo, tipo, codigo, nombre, config_json)
         VALUES ($1,'dropscan',$2,$3,$4,$5)
         ON CONFLICT (tenant_id, modulo, tipo, codigo) DO NOTHING`,
        [tenant.id, c.tipo, c.codigo, c.nombre, c.config_json]
      )
    }
    console.log('[admin/tenants POST] step 5 ok')

    // 6. Log provisioning
    console.log('[admin/tenants POST] step 6: provisioning log')
    await client.query(
      `INSERT INTO provisioning_log (tenant_id, step, status, created_at)
       VALUES ($1, 'full_provisioning', 'ok', now())`,
      [tenant.id]
    ).catch(e => console.error('[admin/tenants POST] step 6 non-fatal:', e.message))

    // 7. Enqueue welcome email
    console.log('[admin/tenants POST] step 7: enqueue welcome email')
    await client.query(
      `INSERT INTO notifications_outbox (tenant_id, recipient_email, template_code, payload, status, created_at)
       VALUES ($1, $2, 'welcome_email', $3, 'pending', now())`,
      [tenant.id, contact_email.toLowerCase().trim(), JSON.stringify({
        to: contact_email.toLowerCase().trim(),
        tenant_name: legal_name,
        admin_name: contact_name,
        temp_password: admin_password,
        login_url: `https://${finalSlug}.kirion.app/login`,
      })]
    ).catch(e => console.error('[admin/tenants POST] step 7 non-fatal:', e.message))

    await client.query('COMMIT')
    console.log('[admin/tenants POST] COMMIT ok — tenant_id=%s slug=%s', tenant.id, finalSlug)
    adminAudit(req.admin.id, 'CREATE_TENANT_DIRECT', 'tenant', tenant.id, { legal_name, contact_email, plan_id })
    res.status(201).json({ success: true, tenant_id: tenant.id, slug: finalSlug, admin_email: userRes.rows[0].email })
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK') } catch (_) {}
    }
    console.error('[admin/tenants POST] FAILED at step — code=%s constraint=%s table=%s column=%s detail=%s message=%s',
      err.code, err.constraint, err.table, err.column, err.detail, err.message)

    if (err.code === '23505') {
      let message = 'Error de duplicado: ' + (err.constraint || err.detail || 'violacion de unicidad')
      if (err.constraint?.includes('tenants_slug')) message = 'El slug ya existe'
      else if (err.constraint?.includes('usuarios_tenant_id_email') || err.constraint?.includes('usuarios_tenant_email')) message = 'El email del administrador ya esta en uso'
      else if (err.constraint?.includes('usuarios_tenant_id_codigo') || err.constraint?.includes('usuarios_tenant_codigo')) message = 'El codigo del administrador ya esta en uso'
      else if (err.constraint?.includes('roles_tenant_id_nombre') || err.constraint?.includes('roles_tenant_nombre')) message = 'El rol Administrador ya existe para este tenant'
      return res.status(409).json({ error: message })
    }

    if (err.code === '42703') {
      console.error('[admin/tenants POST] Column not found — check migrations:', err.message)
      return res.status(500).json({ error: 'Error de esquema: columna faltante. Contactar soporte.' })
    }

    res.status(500).json({ error: err.message || 'Error al crear tenant' })
  } finally {
    if (client) client.release()
  }
})

// POST /api/admin/tenants/:id/suspend
router.post('/tenants/:id/suspend', authenticateAdmin, async (req, res) => {
  try {
    await query(`UPDATE tenants SET status = 'suspended', updated_at = now() WHERE id = $1`, [req.params.id])
    adminAudit(req.admin.id, 'SUSPEND_TENANT', 'tenant', req.params.id, null)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/admin/tenants/:id/reactivate
router.post('/tenants/:id/reactivate', authenticateAdmin, async (req, res) => {
  try {
    await query(`UPDATE tenants SET status = 'active', updated_at = now() WHERE id = $1`, [req.params.id])
    adminAudit(req.admin.id, 'REACTIVATE_TENANT', 'tenant', req.params.id, null)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/admin/tenants/:id/reset-password — reset tenant admin password
router.post('/tenants/:id/reset-password', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$'
    let pwd = ''
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]

    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.default.hash(pwd, 12)

    // Find tenant admin user (es_admin_tenant or first admin role user)
    const userRes = await query(
      `SELECT u.id, u.email, u.nombre_completo FROM usuarios u
       WHERE u.tenant_id = $1 AND u.es_admin_tenant = true LIMIT 1`,
      [id]
    )
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'No se encontro usuario admin del tenant' })
    const user = userRes.rows[0]

    await query(
      `UPDATE usuarios SET password_hash = $1, force_password_change = true, updated_at = now() WHERE id = $2`,
      [hash, user.id]
    )

    // Notify via email
    const tenantRes = await query('SELECT legal_name FROM tenants WHERE id = $1', [id])
    await query(
      `INSERT INTO notifications_outbox (tenant_id, recipient_email, template_code, payload)
       VALUES ($1,$2,'password_reset',$3)`,
      [id, user.email, JSON.stringify({ contact_name: user.nombre_completo, temp_password: pwd, tenant_name: tenantRes.rows[0]?.legal_name })]
    )

    adminAudit(req.admin.id, 'RESET_PASSWORD', 'usuario', user.id, { tenant_id: id })
    res.json({ success: true, email: user.email, temp_password: pwd })
  } catch (err) {
    console.error('[admin/reset-password]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/admin/tenants/:id — delete tenant and all data (requires confirm_name in body)
router.delete('/tenants/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { confirm_name } = req.body
    if (!confirm_name) return res.status(400).json({ error: 'confirm_name requerido' })

    const tenantRes = await query('SELECT * FROM tenants WHERE id = $1', [id])
    if (tenantRes.rows.length === 0) return res.status(404).json({ error: 'Tenant no encontrado' })
    const tenant = tenantRes.rows[0]

    if (confirm_name.trim() !== tenant.legal_name.trim()) {
      return res.status(400).json({ error: 'El nombre de confirmacion no coincide' })
    }

    // Cascade delete in order (FK dependencies)
    await query(`DELETE FROM folios_entrega WHERE tenant_id = $1`, [id]).catch(() => {})
    await query(`DELETE FROM guias WHERE tenant_id = $1`, [id]).catch(() => {})
    await query(`DELETE FROM tarimas WHERE tenant_id = $1`, [id]).catch(() => {})
    await query(`DELETE FROM usuarios_internos WHERE tenant_id = $1`, [id]).catch(() => {})
    await query(`DELETE FROM notifications_outbox WHERE tenant_id = $1`, [id]).catch(() => {})
    await query(`DELETE FROM subscriptions WHERE tenant_id = $1`, [id]).catch(() => {})
    await query(`DELETE FROM provisioning_log WHERE tenant_id = $1`, [id]).catch(() => {})
    await query(`DELETE FROM roles WHERE tenant_id = $1`, [id]).catch(() => {})
    await query(`DELETE FROM usuarios WHERE tenant_id = $1`, [id]).catch(() => {})
    await query(`DELETE FROM tenants WHERE id = $1`, [id])

    adminAudit(req.admin.id, 'DELETE_TENANT', 'tenant', id, { legal_name: tenant.legal_name, deleted_at: new Date().toISOString() })
    res.json({ success: true })
  } catch (err) {
    console.error('[admin/tenants DELETE]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ── Subscriptions ──────────────────────────────────────────────────────────────

// GET /api/admin/plans — all plans (active + inactive) for management
router.get('/plans', authenticateAdmin, async (req, res) => {
  try {
    const activeOnly = req.query.active_only === 'true'
    let result
    try {
      // Prefer ordering by display_order (added in migration 026)
      const sql = activeOnly
        ? 'SELECT * FROM plans WHERE is_active = true ORDER BY display_order ASC NULLS LAST, price_amount ASC'
        : 'SELECT * FROM plans ORDER BY display_order ASC NULLS LAST, price_amount ASC'
      result = await query(sql)
    } catch {
      // Fallback: display_order column may not exist yet (migration 026 pending)
      const sql = activeOnly
        ? 'SELECT * FROM plans WHERE is_active = true ORDER BY price_amount ASC'
        : 'SELECT * FROM plans ORDER BY price_amount ASC'
      result = await query(sql)
    }
    res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[admin/plans GET]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/admin/plans — create plan
router.post('/plans', authenticateAdmin, async (req, res) => {
  try {
    const { code, name, description, guide_limit, warehouse_count, price_amount, price_annual, price_currency, modules, is_active, is_visible, display_order } = req.body
    if (!name || price_amount === undefined) return res.status(400).json({ error: 'name y price_amount son requeridos' })
    const safeCode = code || name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const result = await query(
      `INSERT INTO plans (code, name, description, guide_limit, warehouse_count, price_amount, price_annual, price_currency, modules, is_active, is_visible, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [safeCode, name, description || null, guide_limit || null, warehouse_count || 1,
       price_amount, price_annual || null, price_currency || 'USD',
       JSON.stringify(modules || ['dropscan']), is_active !== false, is_visible !== false, display_order || 0]
    )
    adminAudit(req.admin.id, 'CREATE_PLAN', 'plan', result.rows[0].id, { name })
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[admin/plans POST]', err)
    res.status(500).json({ error: err.code === '23505' ? 'Ya existe un plan con ese codigo' : 'Error interno' })
  }
})

// PUT /api/admin/plans/:id — update plan
router.put('/plans/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, guide_limit, warehouse_count, price_amount, price_annual, price_currency, modules, is_active, is_visible, display_order } = req.body
    await query(
      `UPDATE plans SET
         name = COALESCE($1, name),
         description = $2,
         guide_limit = $3,
         warehouse_count = COALESCE($4, warehouse_count),
         price_amount = COALESCE($5, price_amount),
         price_annual = $6,
         price_currency = COALESCE($7, price_currency),
         modules = COALESCE($8, modules),
         is_active = COALESCE($9, is_active),
         is_visible = COALESCE($10, is_visible),
         display_order = COALESCE($11, display_order),
         updated_at = now()
       WHERE id = $12`,
      [name, description ?? null, guide_limit ?? null, warehouse_count, price_amount, price_annual ?? null,
       price_currency, modules ? JSON.stringify(modules) : null, is_active, is_visible, display_order, id]
    )
    adminAudit(req.admin.id, 'UPDATE_PLAN', 'plan', id, { name })
    res.json({ success: true })
  } catch (err) {
    console.error('[admin/plans PUT]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/admin/plans/:id — delete plan (only if no active subscriptions)
router.delete('/plans/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const active = await query(`SELECT COUNT(*) AS n FROM subscriptions WHERE plan_id = $1 AND status = 'active'`, [id])
    if (Number(active.rows[0].n) > 0) {
      return res.status(409).json({ error: 'No se puede eliminar: el plan tiene suscripciones activas' })
    }
    await query('DELETE FROM plans WHERE id = $1', [id])
    adminAudit(req.admin.id, 'DELETE_PLAN', 'plan', id, null)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/admin/subscriptions — list all subscriptions across all tenants
router.get('/subscriptions', authenticateAdmin, async (req, res) => {
  try {
    const { status, tenant_id, plan_id, date_from, date_to } = req.query

    const params = []
    const where = []
    let pc = 1

    if (status) { where.push(`s.status = $${pc}`); params.push(status); pc++ }
    if (tenant_id) { where.push(`s.tenant_id = $${pc}`); params.push(tenant_id); pc++ }
    if (plan_id) { where.push(`s.plan_id = $${pc}`); params.push(plan_id); pc++ }
    if (date_from) { where.push(`s.started_at >= $${pc}`); params.push(date_from); pc++ }
    if (date_to) { where.push(`s.expires_at <= $${pc}`); params.push(date_to); pc++ }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''

    const result = await query(
      `SELECT
         s.id,
         s.code,
         s.tenant_id,
         t.legal_name,
         t.slug,
         p.id as plan_id,
         p.name as plan_name,
         p.price_amount,
         p.price_currency,
         p.price_annual,
         s.subscription_type,
         s.price_amount as subscription_price_amount,
         s.price_currency as subscription_price_currency,
         s.status,
         s.started_at,
         s.expires_at,
         s.payment_reference,
         s.notes,
         s.created_at,
         CASE
           WHEN s.subscription_type = 'annual' THEN 'anual'
           WHEN s.subscription_type = 'monthly' THEN 'mensual'
           WHEN (s.expires_at - s.started_at) > INTERVAL '180 days' THEN 'anual'
           ELSE 'mensual'
         END as subscription_kind
       FROM subscriptions s
       JOIN tenants t ON s.tenant_id = t.id
       JOIN plans p ON s.plan_id = p.id
       ${whereClause}
       ORDER BY s.created_at DESC`,
      params
    )

    res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[admin/subscriptions GET]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/admin/tenants/:id/subscriptions
router.post('/tenants/:id/subscriptions', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { plan_id, expires_at, payment_reference, notes, started_at } = req.body

    if (!plan_id || !expires_at) {
      return res.status(400).json({ error: 'plan_id y expires_at son requeridos' })
    }

    // Resolve tenant timezone
    const tenantTzRes = await query('SELECT zona_horaria FROM tenants WHERE id = $1', [id])
    const tz = tenantTzRes.rows[0]?.zona_horaria || 'America/Mexico_City'
    const planRes = await query('SELECT * FROM plans WHERE id = $1', [plan_id])
    if (planRes.rows.length === 0) {
      return res.status(404).json({ error: 'Plan no encontrado' })
    }
    const plan = planRes.rows[0]
    const subscriptionType = plan.duration_days && plan.duration_days >= 180 ? 'annual' : 'monthly'
    const subscriptionMeta = buildSubscriptionTypeAndPrice(plan, subscriptionType)
    const expiresAtUtc = endOfDayInTimezone(expires_at, tz)
    const subscriptionCode = `SUB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

    // Expire any current active subscriptions for this tenant
    await query(
      `UPDATE subscriptions SET status = 'expired' WHERE tenant_id = $1 AND status = 'active'`,
      [id]
    )

    const subRes = await query(
      `INSERT INTO subscriptions (tenant_id, code, plan_id, subscription_type, price_amount, price_currency, status, started_at, expires_at, payment_reference, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10,$11) RETURNING id, code`,
      [
        id,
        subscriptionCode,
        plan_id,
        subscriptionMeta.subscription_type,
        subscriptionMeta.price_amount,
        subscriptionMeta.price_currency,
        started_at || new Date(),
        expiresAtUtc,
        payment_reference || null,
        notes || null,
        req.admin.id,
      ]
    )

    await query(
      `UPDATE tenants SET status = 'active', subscription_expires_at = $1, current_plan_id = $2, updated_at = now()
       WHERE id = $3`,
      [expiresAtUtc, plan_id, id]
    )

    // Notify tenant
    const tenantRes = await query('SELECT contact_name, contact_email FROM tenants WHERE id = $1', [id])
    if (tenantRes.rows.length > 0) {
      const t = tenantRes.rows[0]
      const formattedExpiry = new Intl.DateTimeFormat('es-MX', {
        timeZone: tz, day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(expiresAtUtc)
      await query(
        `INSERT INTO notifications_outbox (tenant_id, recipient_email, template_code, payload)
         VALUES ($1,$2,'subscription_activated',$3)`,
        [id, t.contact_email, JSON.stringify({
          contact_name: t.contact_name,
          expires_at: formattedExpiry,
          timezone: tz,
        })]
      )
    }

    adminAudit(req.admin.id, 'ADD_SUBSCRIPTION', 'tenant', id, { plan_id, expires_at: expiresAtUtc, payment_reference })
    res.json({ success: true, subscription_id: subRes.rows[0].id, subscription_code: subRes.rows[0].code, expires_at: expiresAtUtc, timezone: tz })
  } catch (err) {
    console.error('[admin/subscriptions]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ── Dashboard ──────────────────────────────────────────────────────────────────

// GET /api/admin/dashboard
router.get('/dashboard', authenticateAdmin, async (_req, res) => {
  try {
    const [counts, recent, conversions] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'trial')          as trial,
          COUNT(*) FILTER (WHERE status = 'active')         as active,
          COUNT(*) FILTER (WHERE status = 'trial_expired')  as trial_expired,
          COUNT(*) FILTER (WHERE status = 'expired')        as expired,
          COUNT(*) FILTER (WHERE status = 'suspended')      as suspended,
          COUNT(*)                                           as total
        FROM tenants
      `),
      query(`SELECT * FROM tenant_signup_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10`),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active')  as converted,
          COUNT(*) FILTER (WHERE status IN ('trial_expired','expired')) as not_converted
        FROM tenants
        WHERE created_at >= now() - INTERVAL '30 days'
      `),
    ])

    res.json({
      success: true,
      stats: counts.rows[0],
      pending_requests: recent.rows,
      last_30d_conversion: conversions.rows[0],
    })
  } catch (err) {
    console.error('[admin/dashboard]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/admin/usage-stats — real usage stats across all tenants
router.get('/usage-stats', authenticateAdmin, async (_req, res) => {
  try {
    const safeQuery = async (sql, params) => {
      try { return (await query(sql, params)).rows }
      catch (err) { console.error('[usage-stats query]', sql.slice(0, 60), err.message); return [] }
    }

    const [totalGuias, guias30d, topTenants, dbSize, tarimas, folios, usersInternos] = await Promise.all([
      safeQuery(`SELECT COUNT(*) AS total FROM guias`),
      safeQuery(`SELECT COUNT(*) AS total FROM guias WHERE created_at >= now() - INTERVAL '30 days'`),
      safeQuery(`
        SELECT t.legal_name, t.slug, t.status, COUNT(g.id) AS guias_total,
               COUNT(g.id) FILTER (WHERE g.created_at >= now() - INTERVAL '30 days') AS guias_30d
        FROM tenants t
        LEFT JOIN guias g ON g.tenant_id = t.id
        GROUP BY t.id, t.legal_name, t.slug, t.status
        ORDER BY guias_total DESC LIMIT 10
      `),
      safeQuery(`SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size`),
      safeQuery(`SELECT COUNT(*) AS total FROM tarimas`),
      safeQuery(`SELECT COUNT(*) AS total FROM folios_entrega`),
      safeQuery(`SELECT COUNT(*) AS total FROM usuarios_internos WHERE activo = true`),
    ])

    res.json({
      success: true,
      total_guias: Number(totalGuias[0]?.total ?? 0),
      guias_last_30d: Number(guias30d[0]?.total ?? 0),
      total_tarimas: Number(tarimas[0]?.total ?? 0),
      total_folios: Number(folios[0]?.total ?? 0),
      active_scanners: Number(usersInternos[0]?.total ?? 0),
      db_size: dbSize[0]?.db_size ?? 'N/A',
      top_tenants: topTenants,
    })
  } catch (err) {
    console.error('[admin/usage-stats]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/admin/analytics/landing — landing page event aggregates
router.get('/analytics/landing', authenticateAdmin, async (_req, res) => {
  try {
    const safeQuery = async (sql, params) => {
      try { return (await query(sql, params)).rows }
      catch { return [] }
    }

    const [totals, planStats, recentEvents, dailyVisits] = await Promise.all([
      safeQuery(`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'page_visit')  AS total_visits,
          COUNT(*) FILTER (WHERE event_type = 'form_submit') AS total_submissions,
          COUNT(*) FILTER (WHERE event_type = 'cta_click')   AS total_cta_clicks,
          COUNT(*) FILTER (WHERE event_type = 'plan_select') AS total_plan_selects,
          COUNT(*) FILTER (WHERE event_type = 'page_visit'  AND created_at >= now() - INTERVAL '7 days') AS visits_7d,
          COUNT(*) FILTER (WHERE event_type = 'form_submit' AND created_at >= now() - INTERVAL '7 days') AS submissions_7d
        FROM landing_events
      `),
      safeQuery(`
        SELECT payload->>'plan' AS plan, COUNT(*) AS count
        FROM landing_events
        WHERE event_type = 'plan_select' AND payload->>'plan' IS NOT NULL
        GROUP BY payload->>'plan'
        ORDER BY count DESC
      `),
      safeQuery(`
        SELECT event_type, payload, created_at
        FROM landing_events
        ORDER BY created_at DESC LIMIT 50
      `),
      safeQuery(`
        SELECT DATE(created_at) AS date, COUNT(*) AS visits
        FROM landing_events
        WHERE event_type = 'page_visit' AND created_at >= now() - INTERVAL '14 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `),
    ])

    const t = totals[0] || {}
    const visits = Number(t.total_visits ?? 0)
    const submissions = Number(t.total_submissions ?? 0)
    const conversionRate = visits > 0 ? ((submissions / visits) * 100).toFixed(1) : '0'

    res.json({
      success: true,
      data: {
        total_visits: visits,
        total_submissions: submissions,
        total_cta_clicks: Number(t.total_cta_clicks ?? 0),
        total_plan_selects: Number(t.total_plan_selects ?? 0),
        visits_7d: Number(t.visits_7d ?? 0),
        submissions_7d: Number(t.submissions_7d ?? 0),
        conversion_rate: conversionRate,
        plan_stats: planStats,
        recent_events: recentEvents,
        daily_visits: dailyVisits,
      },
    })
  } catch (err) {
    console.error('[admin/analytics/landing]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/admin/notifications?status=failed
router.get('/notifications', authenticateAdmin, async (req, res) => {
  try {
    const status = req.query.status
    const base = 'SELECT * FROM notifications_outbox'
    const result = status
      ? await query(`${base} WHERE status = $1 ORDER BY created_at DESC LIMIT 100`, [status])
      : await query(`${base} ORDER BY created_at DESC LIMIT 100`)
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/admin/notifications/:id/retry
router.post('/notifications/:id/retry', authenticateAdmin, async (req, res) => {
  try {
    await query(
      `UPDATE notifications_outbox SET status = 'pending', attempts = 0, last_error = null WHERE id = $1`,
      [req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Error interno' })
  }
})

// PATCH /api/admin/notifications/:id/status
router.patch('/notifications/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body
    if (!['pending', 'sent', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' })
    }
    await query(`UPDATE notifications_outbox SET status = $1 WHERE id = $2`, [status, req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/admin/notifications/:id
router.delete('/notifications/:id', authenticateAdmin, async (req, res) => {
  try {
    await query(`DELETE FROM notifications_outbox WHERE id = $1`, [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/admin/notifications (bulk delete)
router.delete('/notifications', authenticateAdmin, async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids requerido' })
    }
    await query(`DELETE FROM notifications_outbox WHERE id = ANY($1::int[])`, [ids])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router

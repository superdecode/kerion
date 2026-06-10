import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { query, tenantTransaction } from '../config/database.js'
import env from '../config/env.js'

const TRIAL_PLAN_CODE = 'trial_30d'
const TRIAL_DAYS = 30

function generateSecurePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  return Array.from(crypto.randomBytes(16))
    .map(b => chars[b % chars.length])
    .join('')
}

function generateSlug(orgName) {
  return orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
}

async function ensureUniqueSlug(base) {
  let slug = base
  let attempt = 0
  while (true) {
    const res = await query('SELECT 1 FROM tenants WHERE slug = $1', [slug])
    if (res.rows.length === 0) return slug
    attempt++
    const suffix = crypto.randomBytes(2).toString('hex')
    slug = `${base}-${suffix}`
    if (attempt > 10) throw new Error('Could not generate unique slug')
  }
}

async function logStep(tenantId, requestId, step, status, error = null, payload = null) {
  await query(
    `INSERT INTO provisioning_log (tenant_id, request_id, step, status, error_message, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, requestId, step, status, error, payload ? JSON.stringify(payload) : null]
  )
}

async function enqueueNotification(tenantId, recipientEmail, templateCode, payload) {
  await query(
    `INSERT INTO notifications_outbox (tenant_id, recipient_email, template_code, payload)
     VALUES ($1, $2, $3, $4)`,
    [tenantId, recipientEmail, templateCode, JSON.stringify(payload)]
  )
}

// Run provisioning for an approved signup request.
// Idempotent: each step checks for existing state before inserting.
export async function provisionTenant(requestId, approvedByAdminId) {
  // Load request
  const reqRes = await query(
    'SELECT * FROM tenant_signup_requests WHERE id = $1 AND status = $2 LIMIT 1',
    [requestId, 'pending']
  )
  if (reqRes.rows.length === 0) {
    throw new Error(`Signup request ${requestId} not found or not pending`)
  }
  const request = reqRes.rows[0]

  // Load trial plan
  const planRes = await query('SELECT * FROM plans WHERE code = $1 LIMIT 1', [TRIAL_PLAN_CODE])
  if (planRes.rows.length === 0) throw new Error('Trial plan not found in plans table')
  const trialPlan = planRes.rows[0]

  let tenantId = request.resulting_tenant_id

  // ── Step 1: create_tenant_record ──────────────────────────────────────────────
  if (!tenantId) {
    try {
      const slug = await ensureUniqueSlug(generateSlug(request.organization_name))
      const now = new Date()
      const trialExpires = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

      const tenantRes = await query(
        `INSERT INTO tenants
           (slug, legal_name, contact_name, contact_email, contact_phone, country,
            status, trial_started_at, trial_expires_at, current_plan_id, approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,'trial',$7,$8,$9,now())
         RETURNING id`,
        [
          slug, request.organization_name, request.contact_name,
          request.contact_email, request.contact_phone, request.country,
          now, trialExpires, trialPlan.id,
        ]
      )
      tenantId = tenantRes.rows[0].id

      await query(
        'UPDATE tenant_signup_requests SET resulting_tenant_id = $1 WHERE id = $2',
        [tenantId, requestId]
      )
      await logStep(tenantId, requestId, 'create_tenant_record', 'ok', null, { slug, tenantId })
    } catch (err) {
      const tmpId = tenantId || 'unknown'
      await logStep(tmpId, requestId, 'create_tenant_record', 'failed', err.message)
      await alertSuperAdmin(requestId, 'create_tenant_record', err.message)
      throw err
    }
  } else {
    await logStep(tenantId, requestId, 'create_tenant_record', 'skipped', null, { note: 'idempotent' })
  }

  // ── Step 2: create_admin_user ─────────────────────────────────────────────────
  let adminEmail = null
  let rawPassword = null

  const existingAdmin = await query(
    `SELECT id, email FROM usuarios WHERE tenant_id = $1 AND rol_id = (
       SELECT id FROM roles WHERE tenant_id = $1 AND nombre = 'Administrador' LIMIT 1
     ) LIMIT 1`,
    [tenantId]
  )

  if (existingAdmin.rows.length === 0) {
    try {
      rawPassword = generateSecurePassword()
      const hash = await bcrypt.hash(rawPassword, 12)
      adminEmail = request.contact_email

      await tenantTransaction(tenantId, async (client) => {
        // Seed default admin role for this tenant
        const roleRes = await client.query(
          `INSERT INTO roles (tenant_id, nombre, descripcion, permisos, is_default)
           VALUES ($1, 'Administrador', 'Acceso total', $2, true)
           ON CONFLICT (tenant_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre
           RETURNING id`,
          [tenantId, JSON.stringify({
            global: { inicio: 'eliminar', administracion: 'eliminar', wms: 'eliminar' },
            dropscan: { dashboard: 'eliminar', escaneo: 'eliminar', tarimas: 'eliminar', reportes: 'eliminar', configuracion: 'eliminar' },
            fep: { folios: 'eliminar' },
            inventory: { escaneo: 'eliminar', tarimas: 'eliminar', reportes: 'eliminar' },
            devoluciones: { entradas: 'eliminar', inventario: 'eliminar', salidas: 'eliminar' },
            surtido: { ordenes: 'eliminar', validacion: 'eliminar', registros: 'eliminar' },
          })]
        )
        const roleId = roleRes.rows[0].id

        const codigo = `ADM-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
        await client.query(
          `INSERT INTO usuarios
             (tenant_id, codigo, nombre_completo, email, password_hash, rol_id, estado, must_change_password, es_admin_tenant, is_default)
           VALUES ($1,$2,$3,$4,$5,$6,'ACTIVO',true,true,true)
           ON CONFLICT (tenant_id, email) DO UPDATE
             SET nombre_completo = EXCLUDED.nombre_completo,
                 password_hash = EXCLUDED.password_hash,
                 rol_id = EXCLUDED.rol_id,
                 estado = 'ACTIVO',
                 must_change_password = true,
                 es_admin_tenant = true,
                 is_default = true`,
          [tenantId, codigo, request.contact_name, adminEmail, hash, roleId]
        )
      })

      await logStep(tenantId, requestId, 'create_admin_user', 'ok', null, { email: adminEmail })
    } catch (err) {
      await logStep(tenantId, requestId, 'create_admin_user', 'failed', err.message)
      await alertSuperAdmin(requestId, 'create_admin_user', err.message)
      throw err
    }
  } else {
    adminEmail = existingAdmin.rows[0].email
    await logStep(tenantId, requestId, 'create_admin_user', 'skipped', null, { note: 'idempotent' })
  }

  // ── Step 2.5: seed_tenant_modules ─────────────────────────────────────────────
  try {
    for (const code of ['dropscan', 'surtido', 'inventario', 'devoluciones']) {
      await query(
        `INSERT INTO tenant_modules (tenant_id, module_code, enabled, enabled_at, enabled_by, notes)
         VALUES ($1, $2, true, now(), 'system', 'provisioned with tenant')
         ON CONFLICT (tenant_id, module_code) DO NOTHING`,
        [tenantId, code]
      )
    }
    await logStep(tenantId, requestId, 'seed_tenant_modules', 'ok')
  } catch (err) {
    await logStep(tenantId, requestId, 'seed_tenant_modules', 'failed', err.message)
    // Non-fatal: migration 043 backfill covers existing tenants
  }

  // ── Step 3: seed_default_dropscan_config ──────────────────────────────────────
  try {
    await tenantTransaction(tenantId, async (client) => {
      const configs = [
        { modulo: 'dropscan', tipo: 'empresa', codigo: 'FEDEX', nombre: 'FedEx', config_json: JSON.stringify({ color: '#4d148c' }) },
        { modulo: 'dropscan', tipo: 'empresa', codigo: 'DHL', nombre: 'DHL', config_json: JSON.stringify({ color: '#ffcc00' }) },
        { modulo: 'dropscan', tipo: 'empresa', codigo: 'UPS', nombre: 'UPS', config_json: JSON.stringify({ color: '#351c15' }) },
        { modulo: 'dropscan', tipo: 'canal', codigo: 'PRINCIPAL', nombre: 'Canal Principal', config_json: null },
      ]
      for (const c of configs) {
        await client.query(
          `INSERT INTO configuraciones (tenant_id, modulo, tipo, codigo, nombre, config_json)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (tenant_id, modulo, tipo, codigo) DO NOTHING`,
          [tenantId, c.modulo, c.tipo, c.codigo, c.nombre, c.config_json]
        )
      }
    })
    await logStep(tenantId, requestId, 'seed_default_dropscan_config', 'ok')
  } catch (err) {
    await logStep(tenantId, requestId, 'seed_default_dropscan_config', 'failed', err.message)
    // Non-fatal: continue
  }

  // ── Step 4: assign_trial_plan ─────────────────────────────────────────────────
  const existingSub = await query(
    'SELECT id FROM subscriptions WHERE tenant_id = $1 AND plan_id = $2 LIMIT 1',
    [tenantId, trialPlan.id]
  )
  if (existingSub.rows.length === 0) {
    try {
      const now = new Date()
      const expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
      const subscriptionCode = `SUB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
      await query(
        `INSERT INTO subscriptions (tenant_id, code, plan_id, subscription_type, price_amount, price_currency, status, started_at, expires_at, notes)
         VALUES ($1,$2,$3,'monthly',$4,$5,'active',$6,$7,'Trial automatico')`,
        [tenantId, subscriptionCode, trialPlan.id, trialPlan.price_amount || 0, trialPlan.price_currency || 'USD', now, expiresAt]
      )
      await logStep(tenantId, requestId, 'assign_trial_plan', 'ok', null, { expires_at: expiresAt })
    } catch (err) {
      await logStep(tenantId, requestId, 'assign_trial_plan', 'failed', err.message)
      await alertSuperAdmin(requestId, 'assign_trial_plan', err.message)
      throw err
    }
  } else {
    await logStep(tenantId, requestId, 'assign_trial_plan', 'skipped', null, { note: 'idempotent' })
  }

  // ── Step 5: enqueue_welcome_email ─────────────────────────────────────────────
  const existingWelcome = await query(
    `SELECT 1 FROM notifications_outbox
     WHERE tenant_id = $1 AND template_code = 'welcome' AND status != 'failed' LIMIT 1`,
    [tenantId]
  )
  if (existingWelcome.rows.length === 0) {
    try {
      const tenantRes = await query('SELECT slug FROM tenants WHERE id = $1', [tenantId])
      const slug = tenantRes.rows[0]?.slug
      const loginUrl = `https://${slug}.${env.TENANT_BASE_DOMAIN}/login`

      await enqueueNotification(tenantId, request.contact_email, 'welcome', {
        contact_name: request.contact_name,
        organization_name: request.organization_name,
        login_url: loginUrl,
        admin_email: adminEmail,
        temp_password: rawPassword,
        trial_days: TRIAL_DAYS,
      })
      await logStep(tenantId, requestId, 'enqueue_welcome_email', 'ok', null, { recipient: request.contact_email })
    } catch (err) {
      await logStep(tenantId, requestId, 'enqueue_welcome_email', 'failed', err.message)
    }
  } else {
    await logStep(tenantId, requestId, 'enqueue_welcome_email', 'skipped', null, { note: 'idempotent' })
  }

  // ── Step 6: mark_request_approved ─────────────────────────────────────────────
  await query(
    `UPDATE tenant_signup_requests
     SET status = 'approved', reviewed_by = $1, reviewed_at = now()
     WHERE id = $2`,
    [approvedByAdminId, requestId]
  )
  await logStep(tenantId, requestId, 'mark_request_approved', 'ok')

  return { tenantId, adminEmail, rawPassword }
}

async function alertSuperAdmin(requestId, step, errorMsg) {
  try {
    if (env.SUPER_ADMIN_EMAIL) {
      await query(
        `INSERT INTO notifications_outbox (recipient_email, template_code, payload)
         VALUES ($1, 'provisioning_failed', $2)`,
        [env.SUPER_ADMIN_EMAIL, JSON.stringify({ requestId, step, error: errorMsg })]
      )
    }
  } catch (_) { /* non-fatal */ }
}

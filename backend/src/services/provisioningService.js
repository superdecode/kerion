import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { getClient, query } from '../config/database.js'
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

async function execQuery(client, text, params) {
  return client ? client.query(text, params) : query(text, params)
}

async function ensureUniqueSlug(base, client = null) {
  let slug = base
  let attempt = 0
  while (true) {
    const res = await execQuery(client, 'SELECT 1 FROM tenants WHERE slug = $1', [slug])
    if (res.rows.length === 0) return slug
    attempt++
    const suffix = crypto.randomBytes(2).toString('hex')
    slug = `${base}-${suffix}`
    if (attempt > 10) throw new Error('Could not generate unique slug')
  }
}

async function logStep(tenantId, requestId, step, status, error = null, payload = null, client = null) {
  await execQuery(client,
    `INSERT INTO provisioning_log (tenant_id, request_id, step, status, error_message, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, requestId, step, status, error, payload ? JSON.stringify(payload) : null]
  )
}

async function enqueueNotification(tenantId, recipientEmail, templateCode, payload, client = null) {
  await execQuery(client,
    `INSERT INTO notifications_outbox (tenant_id, recipient_email, template_code, payload)
     VALUES ($1, $2, $3, $4)`,
    [tenantId, recipientEmail, templateCode, JSON.stringify(payload)]
  )
}

async function setTenantContext(client, tenantId) {
  await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId])
}

// Run provisioning for an approved signup request.
// Idempotent: each step checks for existing state before inserting.
export async function provisionTenant(requestId, approvedByAdminId) {
  let tenantId = null
  let adminEmail = null
  let rawPassword = null
  let failedStep = null
  const client = await getClient()

  try {
    await client.query('BEGIN')

    const reqRes = await client.query(
      'SELECT * FROM tenant_signup_requests WHERE id = $1 LIMIT 1 FOR UPDATE',
      [requestId]
    )
    if (reqRes.rows.length === 0) {
      throw new Error(`Signup request ${requestId} not found`)
    }
    const request = reqRes.rows[0]

    if (request.status === 'approved' && request.resulting_tenant_id) {
      const adminRes = await client.query(
        `SELECT email FROM usuarios WHERE tenant_id = $1 AND es_admin_tenant = true LIMIT 1`,
        [request.resulting_tenant_id]
      )
      await client.query('COMMIT')
      return {
        tenantId: request.resulting_tenant_id,
        adminEmail: adminRes.rows[0]?.email || request.contact_email,
        rawPassword: null,
      }
    }

    if (request.status !== 'pending') {
      throw new Error(`Signup request ${requestId} not found or not pending`)
    }

    const planRes = await client.query('SELECT * FROM plans WHERE code = $1 LIMIT 1', [TRIAL_PLAN_CODE])
    if (planRes.rows.length === 0) throw new Error('Trial plan not found in plans table')
    const trialPlan = planRes.rows[0]

    tenantId = request.resulting_tenant_id

    failedStep = 'create_tenant_record'
    if (!tenantId) {
      const slug = await ensureUniqueSlug(generateSlug(request.organization_name), client)
      const now = new Date()
      const trialExpires = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

      const tenantRes = await client.query(
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

      await client.query(
        'UPDATE tenant_signup_requests SET resulting_tenant_id = $1 WHERE id = $2',
        [tenantId, requestId]
      )
      await logStep(tenantId, requestId, 'create_tenant_record', 'ok', null, { slug, tenantId }, client)
    } else {
      await logStep(tenantId, requestId, 'create_tenant_record', 'skipped', null, { note: 'idempotent' }, client)
    }

    failedStep = 'create_admin_user'
    const existingAdmin = await client.query(
      `SELECT id, email FROM usuarios WHERE tenant_id = $1 AND rol_id = (
         SELECT id FROM roles WHERE tenant_id = $1 AND nombre = 'Administrador' LIMIT 1
       ) LIMIT 1`,
      [tenantId]
    )

    if (existingAdmin.rows.length === 0) {
      rawPassword = generateSecurePassword()
      const hash = await bcrypt.hash(rawPassword, 12)
      adminEmail = request.contact_email

      await setTenantContext(client, tenantId)

      const roleRes = await client.query(
        `INSERT INTO roles (tenant_id, nombre, descripcion, permisos, is_default)
         VALUES ($1, 'Administrador', 'Acceso total', $2, true)
         ON CONFLICT (tenant_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING id`,
        [tenantId, JSON.stringify({
          global: { inicio: 'eliminar', administracion: 'eliminar', wms: 'eliminar' },
          dropscan: { dashboard: 'eliminar', escaneo: 'eliminar', tarimas: 'eliminar', reportes: 'eliminar', configuracion: 'eliminar' },
          fep: { folios: 'eliminar' },
          inventario: { dashboard: 'eliminar', escaneo: 'eliminar', registros: 'eliminar', rastreo: 'eliminar' },
          devoluciones: { dashboard: 'eliminar', entradas: 'eliminar', inventario: 'eliminar', salidas: 'eliminar' },
          surtido: { dashboard: 'eliminar', ordenes: 'eliminar', validacion: 'eliminar', registros: 'eliminar' },
          anormalidades: { dashboard: 'eliminar', registro: 'eliminar', mejoras: 'eliminar', configuracion: 'eliminar' },
          despacho: { dashboard: 'eliminar', validar: 'eliminar', ordenes: 'eliminar', folios: 'eliminar' },
          recepcion: { dashboard: 'eliminar', recibir: 'eliminar', validacion: 'eliminar' },
          sistema: { wms: 'eliminar' },
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

      await logStep(tenantId, requestId, 'create_admin_user', 'ok', null, { email: adminEmail }, client)
    } else {
      adminEmail = existingAdmin.rows[0].email
      await logStep(tenantId, requestId, 'create_admin_user', 'skipped', null, { note: 'idempotent' }, client)
    }

    try {
      for (const code of ['dropscan', 'surtido', 'inventario', 'devoluciones', 'anormalidades', 'despacho', 'recepcion']) {
        await client.query(
          `INSERT INTO tenant_modules (tenant_id, module_code, enabled, enabled_at, enabled_by, notes)
           VALUES ($1, $2, true, now(), 'system', 'provisioned with tenant')
           ON CONFLICT (tenant_id, module_code) DO NOTHING`,
          [tenantId, code]
        )
      }
      await logStep(tenantId, requestId, 'seed_tenant_modules', 'ok', null, null, client)
    } catch (err) {
      await logStep(tenantId, requestId, 'seed_tenant_modules', 'failed', err.message, null, client)
    }

    try {
      const nivelesBase = [
      { codigo: 'L1', nombre: 'L1', prioridad: 1, horas_limite: 48, descripcion: 'Nivel operativo base' },
      { codigo: 'L2', nombre: 'L2', prioridad: 2, horas_limite: 24, descripcion: 'Nivel de atención intermedia' },
      { codigo: 'L3', nombre: 'L3', prioridad: 3, horas_limite: 4, descripcion: 'Nivel crítico' },
      ]
      await setTenantContext(client, tenantId)
      for (const nivel of nivelesBase) {
        await client.query(
        `INSERT INTO configuraciones (tenant_id, modulo, tipo, codigo, nombre, descripcion, activo, config_json)
         VALUES ($1,'anormalidades','nivel',$2,$3,$4,true,$5::jsonb)
         ON CONFLICT (tenant_id, modulo, tipo, codigo) DO NOTHING`,
        [tenantId, nivel.codigo, nivel.nombre, nivel.descripcion, JSON.stringify({ prioridad: nivel.prioridad, horas_limite: nivel.horas_limite })]
        )
      }

      const CODIGOS_BASE = [
      ['IN-01','Recibo incorrecto','收货错误','Recibo','L2'],
      ['IN-02','Daño en recibo','收货损坏','Recibo','L2'],
      ['IN-03','Faltante en recibo','收货短缺','Recibo','L2'],
      ['IN-04','Sobrante en recibo','收货多余','Recibo','L1'],
      ['IN-05','Error de documentación en recibo','收货文件错误','Recibo','L2'],
      ['IN-06','Recibo fuera de horario','超时收货','Recibo','L1'],
      ['INV-01','Diferencia de inventario','库存差异','Inventario','L2'],
      ['INV-02','Producto mal ubicado','货物错位','Inventario','L2'],
      ['INV-03','Producto sin etiqueta','货物无标签','Inventario','L1'],
      ['INV-04','Producto caducado','过期货物','Inventario','L3'],
      ['INV-05','Daño en almacén','仓储损坏','Inventario','L2'],
      ['INV-06','Faltante de inventario','库存短缺','Inventario','L3'],
      ['PICK-01','Error de picking','拣货错误','Picking','L2'],
      ['PICK-02','Producto incorrecto en pedido','货物错误','Picking','L2'],
      ['PICK-03','Cantidad incorrecta en pedido','数量错误','Picking','L2'],
      ['PICK-04','Ubicación incorrecta de picking','位置错误','Picking','L2'],
      ['PICK-05','Retraso en picking','拣货延误','Picking','L1'],
      ['OUT-01','Error en packing','打包错误','Salida','L2'],
      ['OUT-02','Documentación de salida incorrecta','出库文件错误','Salida','L2'],
      ['OUT-03','Ruta de entrega incorrecta','路线错误','Salida','L2'],
      ['OUT-04','Faltante en envío','发货短缺','Salida','L3'],
      ['OUT-05','Daño en envío','发货损坏','Salida','L2'],
      ['OUT-06','Retraso en salida','出库延误','Salida','L1'],
      ['POD-01','Rechazo del cliente','客户拒收','POD','L3'],
      ['POD-02','Entrega parcial','部分交付','POD','L2'],
      ['POD-03','Entrega a dirección incorrecta','错误地址交付','POD','L3'],
      ['POD-04','Firma no válida','签名无效','POD','L2'],
      ['POD-05','Retraso en entrega','交货延误','POD','L1'],
      ['SYS-01','Error del sistema','系统错误','Sistema','L3'],
      ['SYS-02','Error de integración','集成错误','Sistema','L2'],
      ]
      for (const [codigo, nombre_es, nombre_zh, proceso, nivel_sugerido] of CODIGOS_BASE) {
        await client.query(
        `INSERT INTO anormalidades_codigos (tenant_id, codigo, nombre_es, nombre_zh, proceso, nivel_sugerido, es_default)
         VALUES ($1,$2,$3,$4,$5,$6,true)
         ON CONFLICT (tenant_id, codigo) DO NOTHING`,
        [tenantId, codigo, nombre_es, nombre_zh, proceso, nivel_sugerido]
        )
      }
      await client.query(
      `INSERT INTO anormalidades_config (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId]
      )
      await logStep(tenantId, requestId, 'seed_anormalidades_codigos', 'ok', null, null, client)
    } catch (err) {
      await logStep(tenantId, requestId, 'seed_anormalidades_codigos', 'failed', err.message, null, client)
    }

    try {
      await setTenantContext(client, tenantId)
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
      await logStep(tenantId, requestId, 'seed_default_dropscan_config', 'ok', null, null, client)
    } catch (err) {
      await logStep(tenantId, requestId, 'seed_default_dropscan_config', 'failed', err.message, null, client)
    }

    failedStep = 'assign_trial_plan'
    const existingSub = await client.query(
      'SELECT id FROM subscriptions WHERE tenant_id = $1 AND plan_id = $2 LIMIT 1',
      [tenantId, trialPlan.id]
    )
    if (existingSub.rows.length === 0) {
      const now = new Date()
      const expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
      const subscriptionCode = `SUB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
      await client.query(
        `INSERT INTO subscriptions (tenant_id, code, plan_id, subscription_type, price_amount, price_currency, status, started_at, expires_at, notes)
         VALUES ($1,$2,$3,'monthly',$4,$5,'active',$6,$7,'Trial automatico')`,
        [tenantId, subscriptionCode, trialPlan.id, trialPlan.price_amount || 0, trialPlan.price_currency || 'USD', now, expiresAt]
      )
      await logStep(tenantId, requestId, 'assign_trial_plan', 'ok', null, { expires_at: expiresAt }, client)
    } else {
      await logStep(tenantId, requestId, 'assign_trial_plan', 'skipped', null, { note: 'idempotent' }, client)
    }

    const existingWelcome = await client.query(
      `SELECT 1 FROM notifications_outbox
       WHERE tenant_id = $1 AND template_code = 'welcome' AND status != 'failed' LIMIT 1`,
      [tenantId]
    )
    if (existingWelcome.rows.length === 0) {
      const tenantRes = await client.query('SELECT slug FROM tenants WHERE id = $1', [tenantId])
      const slug = tenantRes.rows[0]?.slug
      const loginUrl = `https://${slug}.${env.TENANT_BASE_DOMAIN}/login`

      await enqueueNotification(tenantId, request.contact_email, 'welcome', {
        contact_name: request.contact_name,
        organization_name: request.organization_name,
        login_url: loginUrl,
        admin_email: adminEmail,
        temp_password: rawPassword,
        trial_days: TRIAL_DAYS,
      }, client)
      await logStep(tenantId, requestId, 'enqueue_welcome_email', 'ok', null, { recipient: request.contact_email }, client)
    } else {
      await logStep(tenantId, requestId, 'enqueue_welcome_email', 'skipped', null, { note: 'idempotent' }, client)
    }

    await client.query(
      `UPDATE tenant_signup_requests
       SET status = 'approved', reviewed_by = $1, reviewed_at = now()
       WHERE id = $2`,
      [approvedByAdminId, requestId]
    )
    await logStep(tenantId, requestId, 'mark_request_approved', 'ok', null, null, client)

    await client.query('COMMIT')
    return { tenantId, adminEmail, rawPassword }
  } catch (err) {
    try { await client.query('ROLLBACK') } catch (_) {}
    if (failedStep) {
      const tmpId = tenantId || 'unknown'
      await logStep(tmpId, requestId, failedStep, 'failed', err.message)
      await alertSuperAdmin(requestId, failedStep, err.message)
    }
    throw err
  } finally {
    client.release()
  }
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

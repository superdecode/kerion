import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import env from '../../config/env.js'
import { query } from '../../config/database.js'

const router = Router()

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta mas tarde' },
})

const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
})

async function verifyTurnstile(token, ip) {
  if (env.NODE_ENV !== 'production') return true
  if (!env.TURNSTILE_SECRET) return true

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: token,
      remoteip: ip || '',
    }),
  })
  const data = await res.json()
  return data.success === true
}

// POST /api/public/signup-requests
router.post('/signup-requests', signupLimiter, async (req, res) => {
  try {
    const { organization_name, contact_name, contact_email, contact_phone, country, cf_turnstile_response, message, volume } = req.body

    if (!organization_name?.trim() || !contact_name?.trim() || !contact_email?.trim()) {
      return res.status(400).json({ error: 'Nombre de empresa, contacto y email son requeridos' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(contact_email)) {
      return res.status(400).json({ error: 'Email invalido' })
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
    const captchaOk = await verifyTurnstile(cf_turnstile_response, ip)
    if (!captchaOk) {
      return res.status(400).json({ error: 'Verificacion de seguridad fallida. Intenta de nuevo.' })
    }

    // Check for existing pending request with same email
    const existing = await query(
      `SELECT id FROM tenant_signup_requests
       WHERE contact_email = $1 AND status = 'pending' LIMIT 1`,
      [contact_email.toLowerCase().trim()]
    )
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe una solicitud pendiente para este email.' })
    }

    const insertRes = await query(
      `INSERT INTO tenant_signup_requests
         (organization_name, contact_name, contact_email, contact_phone, country, volume, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        organization_name.trim(), contact_name.trim(),
        contact_email.toLowerCase().trim(), contact_phone?.trim() || null,
        country?.trim() || null, volume?.trim() || null,
        JSON.stringify({ organization_name, contact_name, contact_email, contact_phone, country, volume, message, ip }),
      ]
    )
    const requestId = insertRes.rows[0].id

    // Confirm to requester
    await query(
      `INSERT INTO notifications_outbox (recipient_email, template_code, payload)
       VALUES ($1,'request_received',$2)`,
      [contact_email, JSON.stringify({ contact_name, organization_name })]
    )

    // Alert super admin
    if (env.SUPER_ADMIN_EMAIL) {
      await query(
        `INSERT INTO notifications_outbox (recipient_email, template_code, payload)
         VALUES ($1,'new_signup_request',$2)`,
        [env.SUPER_ADMIN_EMAIL, JSON.stringify({ organization_name, contact_name, contact_email, country, volume, message })]
      )
    }

    res.status(201).json({ success: true, request_id: requestId })
  } catch (err) {
    console.error('[public/signup-requests]', err)
    res.status(500).json({ error: 'Error interno. Intenta de nuevo.' })
  }
})

// POST /api/public/track — landing page analytics (fire and forget)
router.post('/track', trackLimiter, async (req, res) => {
  try {
    const { event_type, payload } = req.body
    if (!event_type || typeof event_type !== 'string') return res.json({ ok: true })
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
    const userAgent = req.headers['user-agent'] || null
    await query(
      `INSERT INTO landing_events (event_type, payload, ip, user_agent) VALUES ($1, $2, $3, $4)`,
      [event_type.slice(0, 50), payload ? JSON.stringify(payload) : null, ip, userAgent]
    )
  } catch { /* non-blocking */ }
  res.json({ ok: true })
})

// POST /api/public/renewal-request — tenant subscription renewal request
router.post('/renewal-request', async (req, res) => {
  try {
    const { tenant_name, contact_name, contact_email, current_plan, message, tenant_id } = req.body
    if (!contact_email) return res.status(400).json({ error: 'Email requerido' })

    // Store in signup_requests as renewal type so it appears in admin queue
    await query(
      `INSERT INTO tenant_signup_requests
         (organization_name, contact_name, contact_email, request_type, tenant_id, raw_payload)
       VALUES ($1,$2,$3,'renewal',$4,$5)`,
      [tenant_name || 'Renovacion', contact_name || '', contact_email.toLowerCase().trim(),
       tenant_id || null, JSON.stringify({ tenant_name, contact_name, contact_email, current_plan, message })]
    ).catch(() => {})

    // Alert super admin
    if (env.SUPER_ADMIN_EMAIL) {
      await query(
        `INSERT INTO notifications_outbox (recipient_email, template_code, payload)
         VALUES ($1,'renewal_request',$2)`,
        [env.SUPER_ADMIN_EMAIL, JSON.stringify({ tenant_name, contact_name, contact_email, current_plan, message })]
      ).catch(() => {})
    }
    res.json({ success: true })
  } catch {
    res.json({ success: true })
  }
})

// GET /api/public/health — simple liveness check (no auth required)
router.get('/health', (_req, res) => {
  res.json({ ok: true })
})

// GET /api/public/plans — active visible plans for landing page (no auth)
// price_annual is always computed as price_amount * 12 * 0.8 (20% annual discount)
router.get('/plans', async (_req, res) => {
  try {
    let result
    try {
      result = await query(
        `SELECT id, code, name, description, price_amount,
                ROUND(price_amount * 12 * 0.8) AS price_annual,
                price_currency, guide_limit, warehouse_count, modules, display_order
         FROM plans
         WHERE is_active = true AND is_visible = true
         ORDER BY display_order ASC NULLS LAST, price_amount ASC`
      )
    } catch {
      result = await query(
        `SELECT id, code, name, description, price_amount,
                ROUND(price_amount * 12 * 0.8) AS price_annual,
                price_currency, guide_limit, warehouse_count, modules
         FROM plans
         WHERE is_active = true AND is_visible = true
         ORDER BY price_amount ASC`
      )
    }
    res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[public/plans]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router

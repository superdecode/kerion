import { Router } from 'express'
import { query } from '../../config/database.js'
import { authenticateToken } from '../../shared/middleware/auth.js'

const router = Router()
const DAILY_LIMIT = 3
const VALID_ERROR_SOURCES = new Set(['frontend', 'api', 'react', 'global', 'backend'])
const VALID_ERROR_SEVERITIES = new Set(['info', 'warning', 'error', 'critical'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function limitText(value, max) {
  if (value === null || value === undefined) return null
  const text = String(value)
  return text.length > max ? text.slice(0, max) : text
}

function asUuidOrNull(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return UUID_RE.test(text) ? text : null
}

function getRequestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null
}

// POST /api/support/bug-report — authenticated tenant user submits a bug report
// tenantContext + tenantDB middleware already run before this route
router.post('/bug-report', authenticateToken, async (req, res) => {
  try {
    const { description, page_url } = req.body
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'La descripcion del problema es requerida' })
    }
    if (description.trim().length > 2000) {
      return res.status(400).json({ error: 'La descripcion no puede superar 2000 caracteres' })
    }

    const tenantId   = req.tenantId      || null
    const tenantName = req.tenant?.slug  || null
    const user       = req.user          || {}
    const userEmail  = user.email        || null

    // Check daily limit per user (by email)
    if (userEmail) {
      const countRes = await query(
        `SELECT count(*)::int AS total
           FROM bug_reports
          WHERE user_email = $1
            AND created_at >= now()::date`,
        [userEmail]
      )
      const todayCount = countRes.rows[0]?.total ?? 0
      if (todayCount >= DAILY_LIMIT) {
        return res.status(429).json({
          error: 'Has alcanzado el limite de 3 reportes por dia. Intenta de nuevo manana.',
          limit: DAILY_LIMIT,
          used: todayCount,
        })
      }
    }

    // Fetch nombre_completo from DB — not stored in JWT payload
    let userName = null
    if (user.id && req.tQuery) {
      const nameRes = await req.tQuery(
        'SELECT nombre_completo FROM usuarios WHERE id = $1',
        [user.id]
      )
      userName = nameRes.rows[0]?.nombre_completo || null
    }

    await query(
      `INSERT INTO bug_reports (tenant_id, tenant_name, user_email, user_name, description, page_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, tenantName, userEmail, userName, description.trim(), page_url || null]
    )

    // Count remaining for the day so the frontend can sync
    let remaining = DAILY_LIMIT - 1
    if (userEmail) {
      const afterRes = await query(
        `SELECT count(*)::int AS total FROM bug_reports WHERE user_email = $1 AND created_at >= now()::date`,
        [userEmail]
      )
      remaining = Math.max(0, DAILY_LIMIT - (afterRes.rows[0]?.total ?? DAILY_LIMIT))
    }

    res.json({ success: true, remaining })
  } catch (err) {
    console.error('[support/bug-report]', err.message)
    res.status(500).json({ error: 'Error al enviar el reporte' })
  }
})

// POST /api/support/error-event — authenticated automatic technical error capture
// tenantContext + tenantDB middleware already run before this route.
router.post('/error-event', authenticateToken, async (req, res) => {
  try {
    const {
      source = 'frontend',
      severity = 'error',
      fingerprint,
      message,
      stack,
      component_stack,
      page_url,
      route,
      http_method,
      http_status,
      api_url,
      metadata,
    } = req.body || {}

    const cleanMessage = limitText(message, 1000)
    if (!cleanMessage) return res.status(400).json({ error: 'message requerido' })

    const cleanSource = VALID_ERROR_SOURCES.has(source) ? source : 'frontend'
    const cleanSeverity = VALID_ERROR_SEVERITIES.has(severity) ? severity : 'error'
    const tenantId = req.tenantId || req.user?.tenant_id || null
    const tenantSlug = req.tenant?.slug || null
    const user = req.user || {}
    const safeUserId = asUuidOrNull(user.id)
    const metadataJson = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      ip: getRequestIp(req),
    }
    if (safeUserId === null && user.id !== null && user.id !== undefined) {
      metadataJson.actor_user_id = user.id
    }
    const cleanFingerprint = limitText(fingerprint, 500)

    if (cleanFingerprint) {
      const existing = await query(
        `UPDATE system_error_events
            SET occurrences = occurrences + 1,
                last_seen_at = now(),
                updated_at = now(),
                stack = COALESCE($3, stack),
                component_stack = COALESCE($4, component_stack),
                page_url = COALESCE($5, page_url),
                route = COALESCE($6, route),
                http_status = COALESCE($7, http_status),
                metadata = metadata || $8::jsonb
          WHERE tenant_id IS NOT DISTINCT FROM $1
            AND fingerprint = $2
            AND status IN ('open', 'reviewing')
          RETURNING id`,
        [
          tenantId,
          cleanFingerprint,
          limitText(stack, 3000),
          limitText(component_stack, 3000),
          limitText(page_url, 1000),
          limitText(route, 500),
          Number.isFinite(Number(http_status)) ? Number(http_status) : null,
          JSON.stringify(metadataJson),
        ]
      )
      if (existing.rows.length > 0) {
        return res.status(200).json({ success: true, id: existing.rows[0].id, grouped: true })
      }
    }

    const result = await query(
      `INSERT INTO system_error_events (
         tenant_id, tenant_slug, user_id, user_email, source, severity, fingerprint,
         message, stack, component_stack, page_url, route, http_method, http_status,
         api_url, user_agent, metadata
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        tenantId,
        tenantSlug,
        safeUserId,
        user.email || null,
        cleanSource,
        cleanSeverity,
        cleanFingerprint,
        cleanMessage,
        limitText(stack, 3000),
        limitText(component_stack, 3000),
        limitText(page_url, 1000),
        limitText(route, 500),
        http_method ? String(http_method).toUpperCase().slice(0, 12) : null,
        Number.isFinite(Number(http_status)) ? Number(http_status) : null,
        limitText(api_url, 1000),
        limitText(req.headers['user-agent'], 1000),
        JSON.stringify(metadataJson),
      ]
    )

    res.status(201).json({ success: true, id: result.rows[0]?.id })
  } catch (err) {
    console.error('[support/error-event]', err.message)
    res.status(500).json({ error: 'Error al registrar evento' })
  }
})

export default router

import { Router } from 'express'
import { query } from '../../config/database.js'
import { authenticateToken } from '../../shared/middleware/auth.js'

const router = Router()
const DAILY_LIMIT = 3

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

export default router

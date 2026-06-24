import { Router } from 'express'
import { query } from '../../config/database.js'

const router = Router()
const DAILY_LIMIT = 3

// POST /api/support/bug-report — authenticated tenant user submits a bug report
// tenantContext + tenantDB middleware already run before this route
router.post('/bug-report', async (req, res) => {
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
    const userEmail  = user.email || user.correo || null

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

    await query(
      `INSERT INTO bug_reports (tenant_id, tenant_name, user_email, user_name, description, page_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        tenantName,
        userEmail,
        user.nombre || user.name || null,
        description.trim(),
        page_url || null,
      ]
    )

    // Return remaining count so the frontend can update its local state
    const remaining = DAILY_LIMIT - ((userEmail
      ? (await query(
          `SELECT count(*)::int AS total FROM bug_reports WHERE user_email = $1 AND created_at >= now()::date`,
          [userEmail]
        )).rows[0]?.total ?? DAILY_LIMIT
      : DAILY_LIMIT))

    res.json({ success: true, remaining: Math.max(0, remaining) })
  } catch (err) {
    console.error('[support/bug-report]', err.message)
    res.status(500).json({ error: 'Error al enviar el reporte' })
  }
})

export default router

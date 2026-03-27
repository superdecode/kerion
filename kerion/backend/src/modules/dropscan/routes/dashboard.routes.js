import { Router } from 'express'
import { query } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// GET /api/dropscan/dashboard
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.dashboard', 'ver'),
  async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10)

      // Today's summary
      const summaryRes = await query(
        `SELECT
          COUNT(DISTINCT t.id) as total_tarimas,
          COUNT(DISTINCT CASE WHEN t.estado = 'COMPLETA' THEN t.id END) as tarimas_completadas,
          COUNT(DISTINCT CASE WHEN t.estado = 'EN_PROCESO' THEN t.id END) as tarimas_en_proceso,
          COALESCE(SUM(t.cantidad_guias), 0) as total_guias,
          COALESCE(AVG(CASE WHEN t.estado = 'COMPLETA' THEN t.tiempo_armado_segundos END), 0) as tiempo_promedio_seg
         FROM tarimas t
         WHERE DATE(t.fecha_inicio) = $1`,
        [today]
      )

      const alertasRes = await query(
        `SELECT COUNT(*) as total_alertas FROM alertas_duplicados
         WHERE DATE(timestamp_alerta) = $1`,
        [today]
      )

      // Active sessions
      const activeSessions = await query(
        `SELECT s.id, u.nombre_completo as operador, e.nombre as empresa,
                c.nombre as canal, s.total_guias, s.tarimas_completadas,
                s.fecha_inicio
         FROM sesiones_escaneo s
         JOIN usuarios u ON s.operador_id = u.id
         JOIN configuraciones e ON s.empresa_id = e.id
         JOIN configuraciones c ON s.canal_id = c.id
         WHERE s.activa = true
         ORDER BY s.fecha_inicio DESC`
      )

      // Guides per hour (today)
      const hourlyRes = await query(
        `SELECT EXTRACT(HOUR FROM g.timestamp_escaneo) as hora,
                COUNT(*) as cantidad
         FROM guias g
         JOIN tarimas t ON g.tarima_id = t.id
         WHERE DATE(g.timestamp_escaneo) = $1
         GROUP BY EXTRACT(HOUR FROM g.timestamp_escaneo)
         ORDER BY hora`,
        [today]
      )

      // Top operators today
      const operatorsRes = await query(
        `SELECT u.nombre_completo as operador, u.codigo,
                COUNT(DISTINCT t.id) as tarimas,
                SUM(t.cantidad_guias) as guias
         FROM tarimas t
         JOIN usuarios u ON t.operador_id = u.id
         WHERE DATE(t.fecha_inicio) = $1
         GROUP BY u.id, u.nombre_completo, u.codigo
         ORDER BY guias DESC
         LIMIT 10`,
        [today]
      )

      // Per company today
      const empresasRes = await query(
        `SELECT e.nombre as empresa, e.codigo,
                COUNT(DISTINCT t.id) as tarimas,
                SUM(t.cantidad_guias) as guias
         FROM tarimas t
         JOIN configuraciones e ON t.empresa_id = e.id
         WHERE DATE(t.fecha_inicio) = $1
         GROUP BY e.id, e.nombre, e.codigo
         ORDER BY guias DESC`,
        [today]
      )

      const summary = summaryRes.rows[0]

      res.json({
        fecha: today,
        resumen: {
          total_guias: parseInt(summary.total_guias) || 0,
          total_tarimas: parseInt(summary.total_tarimas) || 0,
          tarimas_completadas: parseInt(summary.tarimas_completadas) || 0,
          tarimas_en_proceso: parseInt(summary.tarimas_en_proceso) || 0,
          alertas_duplicados: parseInt(alertasRes.rows[0].total_alertas) || 0,
          tiempo_promedio_minutos: Math.round((parseFloat(summary.tiempo_promedio_seg) || 0) / 60 * 10) / 10,
        },
        sesiones_activas: activeSessions.rows,
        guias_por_hora: hourlyRes.rows.map(r => ({ hora: parseInt(r.hora), cantidad: parseInt(r.cantidad) })),
        por_operador: operatorsRes.rows.map(r => ({ ...r, tarimas: parseInt(r.tarimas), guias: parseInt(r.guias) })),
        por_empresa: empresasRes.rows.map(r => ({ ...r, tarimas: parseInt(r.tarimas), guias: parseInt(r.guias) })),
      })
    } catch (error) {
      console.error('Dashboard error:', error)
      res.status(500).json({ error: 'Error obteniendo métricas' })
    }
  }
)

// GET /api/dropscan/dashboard/metrics?fecha_inicio=&fecha_fin=
router.get('/metrics',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.reportes', 'ver'),
  async (req, res) => {
    try {
      const { fecha_inicio, fecha_fin } = req.query

      if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({ error: 'fecha_inicio y fecha_fin son requeridos' })
      }

      const dailyRes = await query(
        `SELECT DATE(t.fecha_inicio) as fecha,
                COUNT(DISTINCT t.id) as tarimas,
                SUM(t.cantidad_guias) as guias,
                COUNT(DISTINCT CASE WHEN t.estado = 'COMPLETA' THEN t.id END) as completadas,
                COALESCE(AVG(CASE WHEN t.estado = 'COMPLETA' THEN t.tiempo_armado_segundos END), 0) as tiempo_promedio
         FROM tarimas t
         WHERE DATE(t.fecha_inicio) BETWEEN $1 AND $2
         GROUP BY DATE(t.fecha_inicio)
         ORDER BY fecha`,
        [fecha_inicio, fecha_fin]
      )

      const totalRes = await query(
        `SELECT COUNT(DISTINCT t.id) as tarimas,
                SUM(t.cantidad_guias) as guias,
                COUNT(DISTINCT CASE WHEN t.estado = 'COMPLETA' THEN t.id END) as completadas
         FROM tarimas t
         WHERE DATE(t.fecha_inicio) BETWEEN $1 AND $2`,
        [fecha_inicio, fecha_fin]
      )

      res.json({
        periodo: { fecha_inicio, fecha_fin },
        totales: {
          tarimas: parseInt(totalRes.rows[0].tarimas) || 0,
          guias: parseInt(totalRes.rows[0].guias) || 0,
          completadas: parseInt(totalRes.rows[0].completadas) || 0,
        },
        por_dia: dailyRes.rows.map(r => ({
          fecha: r.fecha,
          tarimas: parseInt(r.tarimas),
          guias: parseInt(r.guias),
          completadas: parseInt(r.completadas),
          tiempo_promedio_min: Math.round((parseFloat(r.tiempo_promedio) || 0) / 60 * 10) / 10,
        }))
      })
    } catch (error) {
      console.error('Metrics error:', error)
      res.status(500).json({ error: 'Error obteniendo métricas' })
    }
  }
)

// GET /api/dropscan/guias/search?q=
router.get('/guias/search',
  authenticateToken,
  async (req, res) => {
    try {
      const { q } = req.query
      if (!q || q.length < 2) {
        return res.json({ guias: [] })
      }

      const result = await query(
        `SELECT g.id, g.codigo_guia, g.posicion, g.timestamp_escaneo,
                t.codigo as tarima_codigo, t.estado as tarima_estado,
                e.nombre as empresa_nombre, c.nombre as canal_nombre,
                u.nombre_completo as operador_nombre
         FROM guias g
         JOIN tarimas t ON g.tarima_id = t.id
         JOIN configuraciones e ON t.empresa_id = e.id
         JOIN configuraciones c ON t.canal_id = c.id
         JOIN usuarios u ON g.operador_id = u.id
         WHERE g.codigo_guia ILIKE $1
         ORDER BY g.timestamp_escaneo DESC
         LIMIT 20`,
        [`%${q}%`]
      )

      res.json({ guias: result.rows })
    } catch (error) {
      console.error('Search guias error:', error)
      res.status(500).json({ error: 'Error buscando guías' })
    }
  }
)

export default router

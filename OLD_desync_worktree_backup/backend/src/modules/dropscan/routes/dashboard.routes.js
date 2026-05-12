import { Router } from 'express'
import { query } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { getToday, dateInTZ, hourInTZ, dateFrom, dateTo } from '../../../shared/utils/dateUtils.js'

const router = Router()

// GET /api/dropscan/dashboard
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.dashboard', 'ver'),
  async (req, res) => {
    try {
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const today = getToday(tz)
      const { fecha_inicio = today, fecha_fin = today } = req.query

      const dateWhere = `${dateInTZ('t.fecha_inicio', tz)} BETWEEN $1 AND $2`
      const dateParams = [fecha_inicio, fecha_fin]

      const [summaryRes, alertasRes, activeSessions, hourlyRes, operatorsRes, empresasRes] = await Promise.all([
        query(
          `SELECT
            COUNT(DISTINCT t.id) as total_tarimas,
            COUNT(DISTINCT CASE WHEN t.estado = 'FINALIZADA' THEN t.id END) as tarimas_completadas,
            COUNT(DISTINCT CASE WHEN t.estado = 'EN_PROCESO' THEN t.id END) as tarimas_en_proceso,
            COUNT(DISTINCT CASE WHEN t.estado = 'CANCELADA' THEN t.id END) as tarimas_canceladas,
            COALESCE(SUM(t.cantidad_guias), 0) as total_guias,
            COALESCE(AVG(CASE WHEN t.estado = 'FINALIZADA' THEN COALESCE(t.tiempo_armado_segundos, EXTRACT(EPOCH FROM (t.fecha_cierre - t.fecha_inicio))::INTEGER) END), 0) as tiempo_promedio_seg
           FROM tarimas t WHERE ${dateWhere}`,
          dateParams
        ),
        query(
          `SELECT COUNT(*) as total_alertas FROM alertas_duplicados
           WHERE ${dateInTZ('timestamp_alerta', tz)} BETWEEN $1 AND $2`,
          dateParams
        ),
        query(
          `SELECT s.id, COALESCE(ui.nombre, s.usuario_operador, u.nombre_completo) as operador,
                  e.nombre as empresa, c.nombre as canal,
                  s.total_guias, s.tarimas_completadas, s.fecha_inicio
           FROM sesiones_escaneo s
           JOIN usuarios u ON s.operador_id = u.id
           JOIN configuraciones e ON s.empresa_id = e.id
           JOIN configuraciones c ON s.canal_id = c.id
           LEFT JOIN usuarios_internos ui ON s.usuario_interno_id = ui.id
           WHERE s.activa = true
           ORDER BY s.fecha_inicio DESC`
        ),
        query(
          `SELECT ${hourInTZ('g.timestamp_escaneo', tz)} as hora, COUNT(*) as cantidad
           FROM guias g
           JOIN tarimas t ON g.tarima_id = t.id
           WHERE ${dateWhere}
           GROUP BY ${hourInTZ('g.timestamp_escaneo', tz)}
           ORDER BY hora`,
          dateParams
        ),
        query(
          `SELECT COALESCE(ui.nombre, g.usuario_operador, u.nombre_completo) as operador,
                  COUNT(DISTINCT g.tarima_id) as tarimas,
                  COUNT(g.id) as guias
           FROM guias g
           JOIN tarimas t ON g.tarima_id = t.id
           JOIN usuarios u ON g.operador_id = u.id
           LEFT JOIN usuarios_internos ui ON g.usuario_interno_id = ui.id
           WHERE ${dateWhere}
           GROUP BY COALESCE(ui.nombre, g.usuario_operador, u.nombre_completo)
           ORDER BY guias DESC
           LIMIT 10`,
          dateParams
        ),
        query(
          `SELECT e.nombre as empresa, e.codigo,
                  COUNT(DISTINCT t.id) as tarimas,
                  SUM(t.cantidad_guias) as guias
           FROM tarimas t
           JOIN configuraciones e ON t.empresa_id = e.id
           WHERE ${dateWhere}
           GROUP BY e.id, e.nombre, e.codigo
           ORDER BY guias DESC`,
          dateParams
        ),
      ])

      const summary = summaryRes.rows[0]

      res.json({
        fecha: fecha_inicio === fecha_fin ? fecha_inicio : `${fecha_inicio}/${fecha_fin}`,
        resumen: {
          total_guias: parseInt(summary.total_guias) || 0,
          total_tarimas: parseInt(summary.total_tarimas) || 0,
          tarimas_completadas: parseInt(summary.tarimas_completadas) || 0,
          tarimas_en_proceso: parseInt(summary.tarimas_en_proceso) || 0,
          tarimas_canceladas: parseInt(summary.tarimas_canceladas) || 0,
          alertas_duplicados: parseInt(alertasRes.rows[0].total_alertas) || 0,
          tiempo_promedio_minutos: Math.round((parseFloat(summary.tiempo_promedio_seg) || 0) / 60 * 10) / 10,
        },
        sesiones_activas: activeSessions.rows,
        guias_por_hora: hourlyRes.rows.map(r => ({ hora: parseInt(r.hora), cantidad: parseInt(r.cantidad) })),
        por_operador: operatorsRes.rows.map(r => ({ operador: r.operador, tarimas: parseInt(r.tarimas), guias: parseInt(r.guias) })),
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
      const { fecha_inicio, fecha_fin, empresa_id, canal_id, escaneador } = req.query

      if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({ error: 'fecha_inicio y fecha_fin son requeridos' })
      }

      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const where = [`TO_CHAR(${dateInTZ('t.fecha_inicio', tz)}, 'YYYY-MM-DD') BETWEEN $1 AND $2`]
      const params = [fecha_inicio, fecha_fin]
      let pCount = 2

      if (empresa_id) {
        const ids = empresa_id.split(',').map(Number).filter(Boolean)
        if (ids.length) { pCount++; where.push(`t.empresa_id = ANY($${pCount})`); params.push(ids) }
      }
      if (canal_id) {
        const ids = canal_id.split(',').map(Number).filter(Boolean)
        if (ids.length) { pCount++; where.push(`t.canal_id = ANY($${pCount})`); params.push(ids) }
      }
      if (escaneador) {
        const names = escaneador.split(',').map(n => n.trim()).filter(Boolean)
        if (names.length === 1) {
          pCount++
          where.push(`EXISTS (
            SELECT 1 FROM guias g2
            LEFT JOIN usuarios_internos ui2 ON g2.usuario_interno_id = ui2.id
            LEFT JOIN usuarios ue ON g2.operador_id = ue.id
            WHERE g2.tarima_id = t.id AND COALESCE(ui2.nombre, g2.usuario_operador, ue.nombre_completo) ILIKE $${pCount}
          )`)
          params.push(`%${names[0]}%`)
        } else if (names.length > 1) {
          pCount++
          where.push(`EXISTS (
            SELECT 1 FROM guias g2
            LEFT JOIN usuarios_internos ui2 ON g2.usuario_interno_id = ui2.id
            LEFT JOIN usuarios ue ON g2.operador_id = ue.id
            WHERE g2.tarima_id = t.id AND COALESCE(ui2.nombre, g2.usuario_operador, ue.nombre_completo) = ANY($${pCount})
          )`)
          params.push(names)
        }
      }
      const whereClause = where.join(' AND ')

      const operadorWhereClause = whereClause
      const [dailyRes, totalRes, empresasRes, canalesRes, escaneadoresRes, hourlyRes] = await Promise.all([
        query(
          `SELECT TO_CHAR(${dateInTZ('t.fecha_inicio', tz)}, 'YYYY-MM-DD') as fecha,
                  COUNT(DISTINCT t.id) as tarimas,
                  COALESCE(SUM(t.cantidad_guias), 0) as guias,
                  COUNT(DISTINCT CASE WHEN t.estado = 'FINALIZADA' THEN t.id END) as completadas,
                  COALESCE(AVG(CASE WHEN t.estado = 'FINALIZADA' THEN COALESCE(t.tiempo_armado_segundos, EXTRACT(EPOCH FROM (t.fecha_cierre - t.fecha_inicio))::INTEGER) END), 0) as tiempo_promedio
           FROM tarimas t WHERE ${whereClause}
           GROUP BY TO_CHAR(${dateInTZ('t.fecha_inicio', tz)}, 'YYYY-MM-DD') ORDER BY fecha`, params),
        query(
          `SELECT COUNT(DISTINCT t.id) as tarimas,
                  COALESCE(SUM(t.cantidad_guias), 0) as guias,
                  COUNT(DISTINCT CASE WHEN t.estado = 'FINALIZADA' THEN t.id END) as completadas
           FROM tarimas t WHERE ${whereClause}`, params),
        query(
          `SELECT e.nombre as empresa, e.config_json->>'color' as color,
                  COUNT(DISTINCT t.id) as tarimas,
                  COALESCE(SUM(t.cantidad_guias), 0) as guias
           FROM tarimas t JOIN configuraciones e ON t.empresa_id = e.id
           WHERE ${whereClause}
           GROUP BY e.id, e.nombre, e.config_json->>'color' ORDER BY guias DESC`, params),
        query(
          `SELECT c.nombre as canal,
                  COUNT(DISTINCT t.id) as tarimas,
                  COALESCE(SUM(t.cantidad_guias), 0) as guias
           FROM tarimas t JOIN configuraciones c ON t.canal_id = c.id
           WHERE ${whereClause}
           GROUP BY c.id, c.nombre ORDER BY guias DESC`, params),
        query(
          `SELECT COALESCE(ui.nombre, g.usuario_operador, u.nombre_completo) as escaneador,
                  COUNT(DISTINCT g.tarima_id) as tarimas,
                  COUNT(g.id) as guias
           FROM tarimas t
           JOIN guias g ON g.tarima_id = t.id
           JOIN usuarios u ON g.operador_id = u.id
           LEFT JOIN usuarios_internos ui ON g.usuario_interno_id = ui.id
           WHERE ${operadorWhereClause}
           GROUP BY COALESCE(ui.nombre, g.usuario_operador, u.nombre_completo)
           ORDER BY guias DESC LIMIT 15`, params),
        query(
          `SELECT ${hourInTZ('g.timestamp_escaneo', tz)} as hora,
                  COUNT(g.id) as cantidad
           FROM tarimas t
           JOIN guias g ON g.tarima_id = t.id
           WHERE ${operadorWhereClause}
           GROUP BY ${hourInTZ('g.timestamp_escaneo', tz)}
           ORDER BY hora`, params),
      ])

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
        })),
        por_empresa: empresasRes.rows.map(r => ({ empresa: r.empresa, color: r.color, tarimas: parseInt(r.tarimas), guias: parseInt(r.guias) })),
        por_canal: canalesRes.rows.map(r => ({ canal: r.canal, tarimas: parseInt(r.tarimas), guias: parseInt(r.guias) })),
        por_escaneador: escaneadoresRes.rows.map(r => ({ escaneador: r.escaneador, tarimas: parseInt(r.tarimas), guias: parseInt(r.guias) })),
        por_hora: Array.from({ length: 24 }, (_, h) => {
          const row = hourlyRes.rows.find(r => parseInt(r.hora) === h)
          return { hora: h, cantidad: parseInt(row?.cantidad || 0) }
        }),
      })
    } catch (error) {
      console.error('Metrics error:', error)
      res.status(500).json({ error: 'Error obteniendo métricas' })
    }
  }
)

// GET /api/dropscan/dashboard/export?fecha_inicio=&fecha_fin=
router.get('/export',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.reportes', 'ver'),
  async (req, res) => {
    try {
      const { fecha_inicio, fecha_fin, empresa_id, canal_id } = req.query

      if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({ error: 'fecha_inicio y fecha_fin son requeridos' })
      }

      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      let where = [`${dateInTZ('t.fecha_inicio', tz)} BETWEEN $1 AND $2`]
      let params = [fecha_inicio, fecha_fin]
      let paramCount = 2

      if (empresa_id) {
        const ids = empresa_id.split(',').map(Number).filter(Boolean)
        if (ids.length > 0) {
          paramCount++
          where.push(`t.empresa_id = ANY($${paramCount})`)
          params.push(ids)
        }
      }
      if (canal_id) {
        const ids = canal_id.split(',').map(Number).filter(Boolean)
        if (ids.length > 0) {
          paramCount++
          where.push(`t.canal_id = ANY($${paramCount})`)
          params.push(ids)
        }
      }

      const whereClause = where.join(' AND ')

      const result = await query(
        `SELECT
          t.codigo as tarima_codigo,
          e.nombre as empresa,
          c.nombre as canal,
          COALESCE(ui_s.nombre, s.usuario_operador, u.nombre_completo) as operador,
          t.estado,
          t.cantidad_guias,
          t.fecha_inicio,
          t.fecha_cierre,
          ROUND((t.tiempo_armado_segundos::numeric / 60), 1) as duracion_min,
          t.cancelada_razon,
          g.codigo_guia,
          g.posicion,
          g.timestamp_escaneo,
          COALESCE(ui_g.nombre, g.usuario_operador, gu.nombre_completo) as operador_guia
        FROM tarimas t
        JOIN configuraciones e ON t.empresa_id = e.id
        JOIN configuraciones c ON t.canal_id = c.id
        JOIN usuarios u ON t.operador_id = u.id
        LEFT JOIN sesiones_escaneo s ON s.tarima_actual_id = t.id OR (s.operador_id = t.operador_id AND s.empresa_id = t.empresa_id AND s.canal_id = t.canal_id AND DATE(s.fecha_inicio) = DATE(t.fecha_inicio))
        LEFT JOIN usuarios_internos ui_s ON s.usuario_interno_id = ui_s.id
        LEFT JOIN guias g ON g.tarima_id = t.id
        LEFT JOIN usuarios gu ON g.operador_id = gu.id
        LEFT JOIN usuarios_internos ui_g ON g.usuario_interno_id = ui_g.id
        WHERE ${whereClause}
        ORDER BY t.fecha_inicio ASC, t.codigo ASC, g.posicion ASC`,
        params
      )

      res.json({ registros: result.rows })
    } catch (error) {
      console.error('Export error:', error)
      res.status(500).json({ error: 'Error generando exportación' })
    }
  }
)

// GET /api/dropscan/guias/search?q=
router.get('/guias/search',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.historial', 'ver'),
  async (req, res) => {
    try {
      const { q } = req.query
      if (!q || q.length < 2) {
        return res.json({ guias: [] })
      }

      const result = await query(
        `SELECT g.id, g.codigo_guia, g.posicion, g.timestamp_escaneo,
                t.id as tarima_id, t.codigo as tarima_codigo, t.estado as tarima_estado,
                e.nombre as empresa_nombre, c.nombre as canal_nombre,
                u.nombre_completo as operador_nombre,
                (SELECT fe2.folio_numero FROM folios_entrega_tarimas fet2
                 JOIN folios_entrega fe2 ON fe2.id = fet2.folio_id
                 WHERE fet2.tarima_id = t.id AND fet2.eliminado_en IS NULL AND fe2.estado = 'ACTIVO'
                 LIMIT 1) AS folio_asignado,
                (SELECT fe2.id FROM folios_entrega_tarimas fet2
                 JOIN folios_entrega fe2 ON fe2.id = fet2.folio_id
                 WHERE fet2.tarima_id = t.id AND fet2.eliminado_en IS NULL AND fe2.estado = 'ACTIVO'
                 LIMIT 1) AS folio_id
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

// GET /api/dropscan/dashboard/escaneadores?fecha_inicio=&fecha_fin=
router.get('/escaneadores',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.historial', 'ver'),
  async (req, res) => {
    try {
      const { fecha_inicio, fecha_fin, empresa_id, canal_id } = req.query

      const where = []
      const params = []
      let pCount = 0

      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      if (fecha_inicio) { pCount++; where.push(dateFrom('t.fecha_inicio', pCount, tz)); params.push(fecha_inicio) }
      if (fecha_fin) { pCount++; where.push(dateTo('t.fecha_inicio', pCount, tz)); params.push(fecha_fin) }
      if (empresa_id) {
        const ids = String(empresa_id).split(',').map(Number).filter(Boolean)
        if (ids.length) { pCount++; where.push(`t.empresa_id = ANY($${pCount})`); params.push(ids) }
      }
      if (canal_id) {
        const ids = String(canal_id).split(',').map(Number).filter(Boolean)
        if (ids.length) { pCount++; where.push(`t.canal_id = ANY($${pCount})`); params.push(ids) }
      }

      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''

      const result = await query(
        `SELECT DISTINCT COALESCE(ui.nombre, g.usuario_operador, u.nombre_completo) as escaneador
         FROM guias g
         JOIN tarimas t ON g.tarima_id = t.id
         LEFT JOIN usuarios u ON g.operador_id = u.id
         LEFT JOIN usuarios_internos ui ON g.usuario_interno_id = ui.id
         ${whereClause}
         ORDER BY escaneador ASC`,
        params
      )

      res.json({ escaneadores: result.rows.map(r => r.escaneador) })
    } catch (error) {
      console.error('Escaneadores list error:', error)
      res.status(500).json({ error: 'Error obteniendo escaneadores' })
    }
  }
)

export default router

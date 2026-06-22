import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'

const router = Router()

function parseDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function getTrendBucket(fechaInicio, fechaFin) {
  const start = parseDateKey(fechaInicio)
  const end = parseDateKey(fechaFin)
  if (!start || !end) return { bucket: 'day', interval: '1 day', label: 'día' }

  const days = Math.max(1, Math.floor((end - start) / 86400000) + 1)
  if (days <= 7) return { bucket: 'day', interval: '1 day', label: 'día' }
  if (days <= 31) return { bucket: 'week', interval: '1 week', label: 'semana' }
  if (days <= 366) return { bucket: 'month', interval: '1 month', label: 'mes' }
  return { bucket: 'year', interval: '1 year', label: 'año' }
}

// GET /api/wmshub/dashboard?fecha_inicio=&fecha_fin=
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
      const { fecha_inicio = today, fecha_fin = today } = req.query

      const dateStart = `${fecha_inicio}T00:00:00`
      const dateEnd = `${fecha_fin}T23:59:59`
      const trend = getTrendBucket(fecha_inicio, fecha_fin)
      const trendPeriodExpr = `DATE_TRUNC('${trend.bucket}', ${instantDateInTZ('created_at', tz)}::timestamp)::date`

      const [
        ordenesEstadoRes,
        sesionesDiaRes,
        faltantesRes,
        anormalidadesRes,
        topOperadoresRes,
        tendenciaRes,
      ] = await Promise.all([
        // Órdenes únicas por estado operativo.
        req.tQuery(
          `SELECT status, COUNT(DISTINCT outbound_order_no) AS cantidad
           FROM pick_sessions
           WHERE tenant_id = $1
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3
           GROUP BY status
           ORDER BY cantidad DESC`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Sesiones del día
        req.tQuery(
          `SELECT
             COUNT(DISTINCT outbound_order_no) AS total_ordenes,
             COUNT(DISTINCT outbound_order_no) FILTER (WHERE status = 'open') AS ordenes_abiertas,
             COUNT(DISTINCT outbound_order_no) FILTER (WHERE status = 'complete') AS ordenes_completadas,
             COUNT(*) AS total_sesiones,
             COUNT(*) FILTER (WHERE status = 'open') AS sesiones_abiertas,
             COUNT(*) FILTER (WHERE status = 'complete') AS sesiones_completadas,
             COALESCE(SUM(total_scanned), 0) AS cajas_escaneadas,
             COALESCE(SUM(total_expected), 0) AS cajas_esperadas
           FROM pick_sessions
           WHERE tenant_id = $1
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Órdenes con faltantes activos
        req.tQuery(
          `SELECT COUNT(DISTINCT outbound_order_no) AS ordenes_con_faltantes
           FROM pick_box_status
           WHERE tenant_id = $1 AND estado = 'faltante'`,
          [req.tenantId]
        ),
        // Órdenes con anormalidades activas
        req.tQuery(
          `SELECT COUNT(DISTINCT outbound_order_no) AS ordenes_con_anormalidades
           FROM pick_box_status
           WHERE tenant_id = $1 AND estado = 'anormalidad'`,
          [req.tenantId]
        ),
        // Top operadores por cajas escaneadas
        req.tQuery(
          `SELECT u.nombre_completo AS operador,
                  COUNT(ps.id) AS sesiones,
                  COALESCE(SUM(ps.total_scanned), 0) AS cajas
           FROM pick_sessions ps
           JOIN usuarios u ON u.id = ps.operator_id
           WHERE ps.tenant_id = $1
             AND ${instantDateInTZ('ps.created_at', tz)} BETWEEN $2 AND $3
           GROUP BY u.nombre_completo
           ORDER BY cajas DESC
           LIMIT 8`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Tendencia compactada por rango: día, semana, mes o año.
        req.tQuery(
          `WITH bounds AS (
             SELECT
               DATE_TRUNC('${trend.bucket}', $2::date::timestamp)::date AS start_period,
               DATE_TRUNC('${trend.bucket}', $3::date::timestamp)::date AS end_period
           ),
           periods AS (
             SELECT GENERATE_SERIES(start_period, end_period, INTERVAL '${trend.interval}')::date AS periodo
             FROM bounds
           ),
           aggregated AS (
             SELECT
               ${trendPeriodExpr} AS periodo,
               COUNT(DISTINCT outbound_order_no) AS ordenes,
               COALESCE(SUM(total_scanned), 0) AS cajas
             FROM pick_sessions
             WHERE tenant_id = $1
               AND ${instantDateInTZ('created_at', tz)} BETWEEN $2::date AND $3::date
             GROUP BY periodo
           )
           SELECT
             p.periodo,
             COALESCE(a.ordenes, 0) AS ordenes,
             COALESCE(a.cajas, 0) AS cajas
           FROM periods p
           LEFT JOIN aggregated a ON a.periodo = p.periodo
           ORDER BY p.periodo`,
          [req.tenantId, fecha_inicio, fecha_fin]
        ),
      ])

      const ses = sesionesDiaRes.rows[0] || {}
      const cajasTotales = parseInt(ses.cajas_esperadas || 0)
      const cajasEscaneadas = parseInt(ses.cajas_escaneadas || 0)
      const tasaCompletado = cajasTotales > 0
        ? Math.round((cajasEscaneadas / cajasTotales) * 100)
        : 0

      res.json({
        success: true,
        data: {
          kpis: {
            ordenes_total: parseInt(ses.total_ordenes || 0),
            ordenes_abiertas: parseInt(ses.ordenes_abiertas || 0),
            ordenes_completadas: parseInt(ses.ordenes_completadas || 0),
            sesiones_hoy: parseInt(ses.total_sesiones || 0),
            sesiones_abiertas: parseInt(ses.sesiones_abiertas || 0),
            sesiones_completadas: parseInt(ses.sesiones_completadas || 0),
            cajas_escaneadas: cajasEscaneadas,
            cajas_esperadas: cajasTotales,
            tasa_completado: tasaCompletado,
            ordenes_con_faltantes: parseInt(faltantesRes.rows[0]?.ordenes_con_faltantes || 0),
            ordenes_con_anormalidades: parseInt(anormalidadesRes.rows[0]?.ordenes_con_anormalidades || 0),
          },
          graficas: {
            ordenes_por_estado: ordenesEstadoRes.rows,
            top_operadores: topOperadoresRes.rows,
            tendencia: tendenciaRes.rows,
            tendencia_periodo: trend.label,
            tendencia_bucket: trend.bucket,
            tendencia_semanal: tendenciaRes.rows,
          },
        },
      })
    } catch (err) {
      console.error('[surtido.dashboard]', err.message)
      res.status(500).json({ error: 'Error al obtener métricas de surtido' })
    }
  }
)

export default router

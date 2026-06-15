import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'

const router = Router()

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

      const [
        ordenesEstadoRes,
        sesionesDiaRes,
        faltantesRes,
        anormalidadesRes,
        topOperadoresRes,
        tendenciaRes,
      ] = await Promise.all([
        // Órdenes por estado (pick_sessions)
        req.tQuery(
          `SELECT status, COUNT(*) AS cantidad
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
        // Tendencia semanal de órdenes completadas
        req.tQuery(
          `SELECT
             DATE_TRUNC('week', ${instantDateInTZ('created_at', tz)}::timestamp) AS semana,
             COUNT(*) FILTER (WHERE status = 'complete') AS completadas,
             COUNT(*) AS total
           FROM pick_sessions
           WHERE tenant_id = $1
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3
           GROUP BY semana
           ORDER BY semana`,
          [req.tenantId, dateStart, dateEnd]
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
            sesiones_hoy: parseInt(ses.total_sesiones || 0),
            sesiones_abiertas: parseInt(ses.sesiones_abiertas || 0),
            sesiones_completadas: parseInt(ses.sesiones_completadas || 0),
            cajas_escaneadas: cajasEscaneadas,
            tasa_completado: tasaCompletado,
            ordenes_con_faltantes: parseInt(faltantesRes.rows[0]?.ordenes_con_faltantes || 0),
            ordenes_con_anormalidades: parseInt(anormalidadesRes.rows[0]?.ordenes_con_anormalidades || 0),
          },
          graficas: {
            ordenes_por_estado: ordenesEstadoRes.rows,
            top_operadores: topOperadoresRes.rows,
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

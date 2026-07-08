import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'

const router = Router()

// GET /api/inventory/dashboard?fecha_inicio=&fecha_fin=
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'actualizar'),
  async (req, res) => {
    try {
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
      const { fecha_inicio = today, fecha_fin = today } = req.query

      const firstOfMonth = today.slice(0, 7) + '-01'
      const dateStart = `${fecha_inicio}T00:00:00`
      const dateEnd = `${fecha_fin}T23:59:59`
      const monthStart = `${firstOfMonth}T00:00:00`
      const monthEnd = `${today}T23:59:59`

      const [
        cajasEstadoRes,
        rastreoActivosRes,
        rastreoEstadoCajasRes,
        cajasMesRes,
        tasaRastreoRes,
        rastreoSemanaRes,
        tiempoRastreoRes,
        topResponsablesRes,
        escaneoTendenciaRes,
        sesionesStatsRes,
      ] = await Promise.all([
        // Cajas en sistema por estado (desde inv_scans)
        req.tQuery(
          `SELECT
             COALESCE(SUM(CASE WHEN sc.scan_status = 'ok' THEN 1 ELSE 0 END), 0) AS disponibles,
             COALESCE(SUM(CASE WHEN sc.scan_status = 'blocked' THEN 1 ELSE 0 END), 0) AS bloqueadas,
             COALESCE(SUM(CASE WHEN sc.scan_status = 'nowms' THEN 1 ELSE 0 END), 0) AS no_wms
           FROM inv_scans sc
           JOIN inv_sessions sess ON sess.id = sc.session_id AND sess.tenant_id = $1
           WHERE sess.status = 'saved'`,
          [req.tenantId]
        ),
        // Órdenes de rastreo activas
        req.tQuery(
          `SELECT COUNT(*) AS activas
           FROM rastreo_ordenes
           WHERE tenant_id = $1
             AND COALESCE(estado, '') NOT IN ('completado', 'completada', 'resuelta', 'cancelado', 'cancelada', 'cerrada')`,
          [req.tenantId]
        ),
        // Desglose de cajas por estado en rastreos activos
        req.tQuery(
          `SELECT rc.estado_caja, COUNT(*) AS cantidad
           FROM rastreo_cajas rc
           JOIN rastreo_ordenes ro ON ro.id = rc.rastreo_orden_id
           WHERE rc.tenant_id = $1
             AND COALESCE(ro.estado, '') NOT IN ('completado', 'completada', 'resuelta', 'cancelado', 'cancelada', 'cerrada')
           GROUP BY rc.estado_caja
           ORDER BY cantidad DESC`,
          [req.tenantId]
        ),
        // Cajas escaneadas del mes (range)
        req.tQuery(
          `SELECT COUNT(*) AS total_mes
           FROM inv_scans sc
           JOIN inv_sessions sess ON sess.id = sc.session_id AND sess.tenant_id = $1
           WHERE ${instantDateInTZ('sc.scanned_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, monthStart, monthEnd]
        ),
        // Tasa de resolución de rastreo
        req.tQuery(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE COALESCE(estado, '') IN ('completado', 'completada', 'resuelta')) AS completados,
             COUNT(*) FILTER (WHERE COALESCE(estado, '') IN ('cancelado', 'cancelada', 'cerrada')) AS cancelados
           FROM rastreo_ordenes
           WHERE tenant_id = $1
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Rastreos creados/cerrados esta semana
        req.tQuery(
          `SELECT
             COUNT(*) FILTER (WHERE ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3) AS creados_semana,
             COUNT(*) FILTER (
               WHERE COALESCE(estado, '') IN ('completado', 'completada', 'resuelta', 'cancelado', 'cancelada', 'cerrada')
                 AND ${instantDateInTZ('updated_at', tz)} BETWEEN $2 AND $3
             ) AS cerrados_semana
           FROM rastreo_ordenes
           WHERE tenant_id = $1`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Tiempo promedio de resolución de rastreo
        req.tQuery(
          `SELECT
             ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600)::numeric, 1) AS horas_promedio
           FROM rastreo_ordenes
           WHERE tenant_id = $1
             AND COALESCE(estado, '') IN ('completado', 'completada', 'resuelta')
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Top responsables de rastreo
        req.tQuery(
          `SELECT u.nombre_completo AS responsable, COUNT(ro.id) AS cantidad
           FROM rastreo_ordenes ro
           JOIN usuarios u ON u.id = ro.asignado_a AND u.tenant_id = ro.tenant_id
           WHERE ro.tenant_id = $1
             AND ${instantDateInTZ('ro.created_at', tz)} BETWEEN $2 AND $3
             AND ro.asignado_a IS NOT NULL
           GROUP BY u.nombre_completo
           ORDER BY cantidad DESC
           LIMIT 5`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Daily escaneo trend in date range
        req.tQuery(
          `SELECT
             ${instantDateInTZ('sc.scanned_at', tz)} AS fecha,
             COUNT(*) AS escaneos
           FROM inv_scans sc
           JOIN inv_sessions sess ON sess.id = sc.session_id AND sess.tenant_id = $1
           WHERE ${instantDateInTZ('sc.scanned_at', tz)} BETWEEN $2 AND $3
           GROUP BY fecha
           ORDER BY fecha`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Session aggregate stats for the period
        req.tQuery(
          `SELECT
             COUNT(*) AS total_sesiones,
             COALESCE(SUM(total_scans), 0) AS total_escaneos,
             COALESCE(SUM(total_ok), 0) AS total_ok,
             COALESCE(SUM(total_blocked), 0) AS total_bloqueados,
             COALESCE(SUM(total_nowms), 0) AS total_nowms
           FROM inv_sessions
           WHERE tenant_id = $1
             AND ${instantDateInTZ('started_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
      ])

      const cajas = cajasEstadoRes.rows[0] || {}
      const rastreoTasa = tasaRastreoRes.rows[0] || {}
      const semana = rastreoSemanaRes.rows[0] || {}
      const sesiones = sesionesStatsRes.rows[0] || {}
      const total = parseInt(rastreoTasa.total || 0)
      const completados = parseInt(rastreoTasa.completados || 0)
      const tasaExito = total > 0 ? Math.round((completados / total) * 100) : 0

      res.json({
        success: true,
        data: {
          kpis: {
            cajas_disponibles: parseInt(cajas.disponibles || 0),
            cajas_bloqueadas: parseInt(cajas.bloqueadas || 0),
            cajas_no_wms: parseInt(cajas.no_wms || 0),
            rastreos_activos: parseInt(rastreoActivosRes.rows[0]?.activas || 0),
            cajas_mes: parseInt(cajasMesRes.rows[0]?.total_mes || 0),
            tasa_exito_rastreo: tasaExito,
            creados_semana: parseInt(semana.creados_semana || 0),
            cerrados_semana: parseInt(semana.cerrados_semana || 0),
            tiempo_promedio_horas: parseFloat(tiempoRastreoRes.rows[0]?.horas_promedio || 0),
            sesiones_periodo: parseInt(sesiones.total_sesiones || 0),
            escaneos_periodo: parseInt(sesiones.total_escaneos || 0),
            escaneos_ok_periodo: parseInt(sesiones.total_ok || 0),
            escaneos_bloqueados_periodo: parseInt(sesiones.total_bloqueados || 0),
            escaneos_nowms_periodo: parseInt(sesiones.total_nowms || 0),
          },
          graficas: {
            cajas_por_estado: [
              { estado: 'disponible', cantidad: parseInt(cajas.disponibles || 0) },
              { estado: 'bloqueada', cantidad: parseInt(cajas.bloqueadas || 0) },
              { estado: 'no_wms', cantidad: parseInt(cajas.no_wms || 0) },
            ],
            escaneo_diario: escaneoTendenciaRes.rows,
            rastreo_por_estado_cajas: rastreoEstadoCajasRes.rows,
            top_responsables: topResponsablesRes.rows,
          },
        },
      })
    } catch (err) {
      console.error('[inventario.dashboard]', err.message)
      res.status(500).json({ error: 'Error al obtener métricas de inventario' })
    }
  }
)

export default router

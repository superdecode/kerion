import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'

const router = Router()

// GET /api/despacho/dashboard?fecha_inicio=&fecha_fin=
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'ver'),
  async (req, res) => {
    try {
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
      const { fecha_inicio = today, fecha_fin = today } = req.query

      const dateStart = `${fecha_inicio}T00:00:00`
      const dateEnd = `${fecha_fin}T23:59:59`

      const [
        kpisHoyRes,
        kpisMesRes,
        porEstadoRes,
        conTrazabilidadRes,
        topDestinosRes,
        topTransportistasRes,
        tendenciaRes,
        tiempoPromedioRes,
      ] = await Promise.all([
        // Folios de hoy
        req.tQuery(
          `SELECT
             COUNT(*) AS total_hoy,
             COUNT(*) FILTER (WHERE estado = 'cerrado') AS cerrados_hoy,
             COUNT(*) FILTER (WHERE estado = 'en_proceso') AS en_proceso_hoy,
             COUNT(*) FILTER (WHERE estado = 'borrador') AS borradores_hoy
           FROM dispatch_folios
           WHERE tenant_id = $1
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Métricas del mes
        req.tQuery(
          `SELECT
             COUNT(DISTINCT f.id) AS total_folios,
             COALESCE(SUM(fo.bultos), 0) AS total_cajas,
             COUNT(DISTINCT CASE WHEN f.estado = 'cerrado' THEN f.id END) AS folios_cerrados,
             COUNT(DISTINCT f.unidad_id) AS unidades_activas,
             COUNT(DISTINCT fo.id) AS total_ordenes
           FROM dispatch_folios f
           LEFT JOIN dispatch_folio_orders fo ON fo.folio_id = f.id AND fo.tenant_id = f.tenant_id
           WHERE f.tenant_id = $1
             AND ${instantDateInTZ('f.created_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Por estado
        req.tQuery(
          `SELECT estado, COUNT(*) AS cantidad
           FROM dispatch_folios
           WHERE tenant_id = $1
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3
           GROUP BY estado
           ORDER BY cantidad DESC`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Órdenes con vs sin escaneo de trazabilidad
        req.tQuery(
          `SELECT
             COUNT(DISTINCT fo.id) AS total_ordenes,
             COUNT(DISTINCT dos.folio_order_id) AS con_escaneo
           FROM dispatch_folio_orders fo
           JOIN dispatch_folios f ON f.id = fo.folio_id
           LEFT JOIN dispatch_order_scans dos ON dos.folio_order_id = fo.id AND dos.tenant_id = fo.tenant_id
           WHERE fo.tenant_id = $1
             AND ${instantDateInTZ('f.created_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Top destinos (outbound_order_no por folio)
        req.tQuery(
          `SELECT fo.outbound_order_no AS destino, COUNT(*) AS cantidad
           FROM dispatch_folio_orders fo
           JOIN dispatch_folios f ON f.id = fo.folio_id
           WHERE fo.tenant_id = $1
             AND ${instantDateInTZ('f.created_at', tz)} BETWEEN $2 AND $3
             AND fo.outbound_order_no IS NOT NULL
           GROUP BY fo.outbound_order_no
           ORDER BY cantidad DESC
           LIMIT 10`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Top transportistas (conductores)
        req.tQuery(
          `SELECT c.nombre AS conductor, COUNT(f.id) AS folios
           FROM dispatch_folios f
           JOIN dispatch_conductores c ON c.id = f.conductor_id
           WHERE f.tenant_id = $1
             AND ${instantDateInTZ('f.created_at', tz)} BETWEEN $2 AND $3
           GROUP BY c.nombre
           ORDER BY folios DESC
           LIMIT 8`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Tendencia semanal
        req.tQuery(
          `SELECT
             DATE_TRUNC('week', ${instantDateInTZ('created_at', tz)}::timestamp) AS semana,
             COUNT(*) AS cantidad
           FROM dispatch_folios
           WHERE tenant_id = $1
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3
           GROUP BY semana
           ORDER BY semana`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Tiempo promedio entre creación y cierre
        req.tQuery(
          `SELECT
             ROUND(AVG(EXTRACT(EPOCH FROM (fecha_salida - created_at))/3600)::numeric, 1) AS horas_promedio
           FROM dispatch_folios
           WHERE tenant_id = $1
             AND estado = 'cerrado'
             AND fecha_salida IS NOT NULL
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
      ])

      const hoy = kpisHoyRes.rows[0] || {}
      const mes = kpisMesRes.rows[0] || {}
      const traz = conTrazabilidadRes.rows[0] || {}
      const totalOrdenes = parseInt(traz.total_ordenes || 0)
      const conEscaneo = parseInt(traz.con_escaneo || 0)
      const tasaDespacho = parseInt(mes.total_folios || 0) > 0
        ? Math.round((parseInt(mes.folios_cerrados || 0) / parseInt(mes.total_folios || 1)) * 100)
        : 0

      res.json({
        success: true,
        data: {
          kpis: {
            folios_hoy: parseInt(hoy.total_hoy || 0),
            cerrados_hoy: parseInt(hoy.cerrados_hoy || 0),
            en_proceso_hoy: parseInt(hoy.en_proceso_hoy || 0),
            cajas_despachadas: parseInt(mes.total_cajas || 0),
            tasa_despacho: tasaDespacho,
            ordenes_con_escaneo: conEscaneo,
            ordenes_sin_escaneo: totalOrdenes - conEscaneo,
            tiempo_promedio_horas: parseFloat(tiempoPromedioRes.rows[0]?.horas_promedio || 0),
          },
          graficas: {
            por_estado: porEstadoRes.rows,
            top_destinos: topDestinosRes.rows,
            top_conductores: topTransportistasRes.rows,
            tendencia_semanal: tendenciaRes.rows,
          },
        },
      })
    } catch (err) {
      console.error('[despacho.dashboard]', err.message)
      res.status(500).json({ error: 'Error al obtener métricas de despacho' })
    }
  }
)

export default router

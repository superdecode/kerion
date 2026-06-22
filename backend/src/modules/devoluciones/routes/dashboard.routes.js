import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'

const router = Router()

// GET /api/devoluciones/dashboard?fecha_inicio=&fecha_fin=
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.dashboard', 'ver'),
  async (req, res) => {
    try {
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
      const { fecha_inicio = today, fecha_fin = today } = req.query

      const dateStart = `${fecha_inicio}T00:00:00`
      const dateEnd = `${fecha_fin}T23:59:59`

      const [
        entradasRes,
        inventarioEstadoRes,
        salidasRes,
        topSkusRes,
        tendenciaRes,
        tiempoPromedioRes,
        pesoTotalRes,
      ] = await Promise.all([
        // Entradas del período
        req.tQuery(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE estado = 'confirmado') AS confirmadas,
             COUNT(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
             COUNT(DISTINCT responsable_id) AS responsables
           FROM dev_sesiones
           WHERE tenant_id = $1
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Inventario activo por estado
        req.tQuery(
          `SELECT
             CASE WHEN cantidad_disponible > 0 THEN 'disponible' ELSE 'sin_stock' END AS estado,
             COUNT(*) AS cantidad
           FROM dev_inventario
           WHERE tenant_id = $1
           GROUP BY 1
           ORDER BY 2 DESC`,
          [req.tenantId]
        ),
        // Salidas del período
        req.tQuery(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE estado = 'completado') AS completadas,
             COUNT(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
             COUNT(*) FILTER (WHERE estado = 'cancelado') AS canceladas
           FROM dev_salidas
           WHERE tenant_id = $1
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Top SKUs con más devoluciones
        req.tQuery(
          `SELECT sku.sku2, COUNT(*) AS cantidad
           FROM dev_item_skus sku
           JOIN dev_items i ON i.id = sku.item_id
           JOIN dev_sesiones s ON s.id = i.sesion_id
           WHERE sku.tenant_id = $1
             AND ${instantDateInTZ('s.created_at', tz)} BETWEEN $2 AND $3
             AND sku.sku2 IS NOT NULL
           GROUP BY sku.sku2
           ORDER BY cantidad DESC
           LIMIT 8`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Tendencia mensual entradas vs salidas
        req.tQuery(
          `SELECT
             DATE_TRUNC('week', ${instantDateInTZ('created_at', tz)}::timestamp) AS semana,
             COUNT(*) AS entradas
           FROM dev_sesiones
           WHERE tenant_id = $1
             AND estado = 'confirmado'
             AND ${instantDateInTZ('created_at', tz)} BETWEEN $2 AND $3
           GROUP BY semana
           ORDER BY semana`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Tiempo promedio entre entrada y salida
        req.tQuery(
          `SELECT
             ROUND(AVG(EXTRACT(EPOCH FROM (ds.created_at - di.created_at))/3600)::numeric, 1) AS horas_promedio
           FROM dev_inventario di
           JOIN dev_salida_items dsi ON dsi.inventario_id = di.id
           JOIN dev_salidas ds ON ds.id = dsi.salida_id
           WHERE di.tenant_id = $1
             AND ds.estado = 'completado'`,
          [req.tenantId]
        ),
        // Peso total registrado
        req.tQuery(
          `SELECT COALESCE(SUM(i.peso), 0) AS peso_total
           FROM dev_items i
           JOIN dev_sesiones s ON s.id = i.sesion_id
           WHERE i.tenant_id = $1
             AND s.estado = 'confirmado'
             AND ${instantDateInTZ('s.created_at', tz)} BETWEEN $2 AND $3`,
          [req.tenantId, dateStart, dateEnd]
        ),
      ])

      const ent = entradasRes.rows[0] || {}
      const sal = salidasRes.rows[0] || {}

      res.json({
        success: true,
        data: {
          kpis: {
            entradas_total: parseInt(ent.total || 0),
            entradas_confirmadas: parseInt(ent.confirmadas || 0),
            salidas_total: parseInt(sal.total || 0),
            salidas_completadas: parseInt(sal.completadas || 0),
            inventario_activo: inventarioEstadoRes.rows.find(r => r.estado === 'disponible')?.cantidad
              ? parseInt(inventarioEstadoRes.rows.find(r => r.estado === 'disponible').cantidad)
              : 0,
            peso_total_kg: parseFloat(pesoTotalRes.rows[0]?.peso_total || 0),
            tiempo_promedio_horas: parseFloat(tiempoPromedioRes.rows[0]?.horas_promedio || 0),
          },
          graficas: {
            inventario_por_estado: inventarioEstadoRes.rows,
            top_skus: topSkusRes.rows,
            tendencia_semanal: tendenciaRes.rows,
            salidas_por_estado: [
              { estado: 'completadas', cantidad: parseInt(sal.completadas || 0) },
              { estado: 'pendientes', cantidad: parseInt(sal.pendientes || 0) },
              { estado: 'canceladas', cantidad: parseInt(sal.canceladas || 0) },
            ],
          },
        },
      })
    } catch (err) {
      console.error('[devoluciones.dashboard]', err.message)
      res.status(500).json({ error: 'Error al obtener métricas de devoluciones' })
    }
  }
)

export default router

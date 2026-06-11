import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// ── GET /api/anormalidades/dashboard — métricas e indicadores ────────────────
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.dashboard', 'ver'),
  async (req, res) => {
    try {
      const { fecha_desde, fecha_hasta } = req.query
      const desde = fecha_desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const hasta = fecha_hasta || new Date().toISOString()

      const [
        hoyRes, pendientesRes, l3Res, vencidosRes, mesRes, cierreRes,
        procesosRes, origenRes, tendenciaRes, rankingRes,
        ultimasAbiertasRes, ultimasL3Res,
      ] = await Promise.all([
        // Incidencias del día
        req.tQuery(
          `SELECT COUNT(*) FROM anormalidades
           WHERE tenant_id = $1
             AND fecha_ocurrencia::date = CURRENT_DATE`,
          [req.tenantId]
        ),
        // Total pendientes sin cerrar
        req.tQuery(
          `SELECT COUNT(*) FROM anormalidades
           WHERE tenant_id = $1 AND estado NOT IN ('cerrado')`,
          [req.tenantId]
        ),
        // L3 críticas abiertas
        req.tQuery(
          `SELECT COUNT(*) FROM anormalidades
           WHERE tenant_id = $1 AND nivel = 'L3' AND estado NOT IN ('cerrado')`,
          [req.tenantId]
        ),
        // Vencidas
        req.tQuery(
          `SELECT COUNT(*) FROM anormalidades
           WHERE tenant_id = $1 AND estado NOT IN ('cerrado')
             AND fecha_limite < now()`,
          [req.tenantId]
        ),
        // Total del rango
        req.tQuery(
          `SELECT COUNT(*) FROM anormalidades
           WHERE tenant_id = $1
             AND fecha_ocurrencia BETWEEN $2 AND $3`,
          [req.tenantId, desde, hasta]
        ),
        // Tasa de cierre del rango
        req.tQuery(
          `SELECT
             COUNT(*) FILTER (WHERE estado = 'cerrado') AS cerradas,
             COUNT(*) AS total
           FROM anormalidades
           WHERE tenant_id = $1
             AND fecha_ocurrencia BETWEEN $2 AND $3`,
          [req.tenantId, desde, hasta]
        ),
        // Por proceso
        req.tQuery(
          `SELECT proceso, COUNT(*) AS cantidad
           FROM anormalidades
           WHERE tenant_id = $1
             AND fecha_ocurrencia BETWEEN $2 AND $3
           GROUP BY proceso
           ORDER BY cantidad DESC`,
          [req.tenantId, desde, hasta]
        ),
        // Por origen de responsabilidad
        req.tQuery(
          `SELECT origen_responsabilidad, COUNT(*) AS cantidad
           FROM anormalidades
           WHERE tenant_id = $1
             AND fecha_ocurrencia BETWEEN $2 AND $3
             AND origen_responsabilidad IS NOT NULL
           GROUP BY origen_responsabilidad
           ORDER BY cantidad DESC`,
          [req.tenantId, desde, hasta]
        ),
        // Tendencia semanal
        req.tQuery(
          `SELECT
             DATE_TRUNC('week', fecha_ocurrencia) AS semana,
             COUNT(*) AS cantidad
           FROM anormalidades
           WHERE tenant_id = $1
             AND fecha_ocurrencia BETWEEN $2 AND $3
           GROUP BY semana
           ORDER BY semana`,
          [req.tenantId, desde, hasta]
        ),
        // Top 5 códigos
        req.tQuery(
          `SELECT codigo, nombre, COUNT(*) AS cantidad
           FROM anormalidades
           WHERE tenant_id = $1
             AND fecha_ocurrencia BETWEEN $2 AND $3
           GROUP BY codigo, nombre
           ORDER BY cantidad DESC
           LIMIT 5`,
          [req.tenantId, desde, hasta]
        ),
        // Últimas 10 abiertas
        req.tQuery(
          `SELECT a.id, a.folio, a.nivel, a.proceso, a.estado, a.cliente,
                  a.fecha_ocurrencia, u.nombre_completo AS responsable_nombre,
                  EXTRACT(EPOCH FROM (now() - a.created_at))/86400 AS dias_abierto
           FROM anormalidades a
           LEFT JOIN usuarios u ON a.responsable_id = u.id
           WHERE a.tenant_id = $1 AND a.estado NOT IN ('cerrado')
           ORDER BY a.fecha_ocurrencia DESC
           LIMIT 10`,
          [req.tenantId]
        ),
        // Últimas 5 L3
        req.tQuery(
          `SELECT a.id, a.folio, a.nivel, a.proceso, a.estado, a.cliente,
                  a.fecha_ocurrencia, u.nombre_completo AS responsable_nombre
           FROM anormalidades a
           LEFT JOIN usuarios u ON a.responsable_id = u.id
           WHERE a.tenant_id = $1 AND a.nivel = 'L3'
           ORDER BY a.fecha_ocurrencia DESC
           LIMIT 5`,
          [req.tenantId]
        ),
      ])

      const cerradas = parseInt(cierreRes.rows[0].cerradas)
      const totalRango = parseInt(cierreRes.rows[0].total)
      const tasaCierre = totalRango > 0 ? Math.round((cerradas / totalRango) * 100) : 0

      res.json({
        success: true,
        data: {
          kpis: {
            hoy: parseInt(hoyRes.rows[0].count),
            pendientes: parseInt(pendientesRes.rows[0].count),
            l3_abiertas: parseInt(l3Res.rows[0].count),
            vencidas: parseInt(vencidosRes.rows[0].count),
            total_rango: parseInt(mesRes.rows[0].count),
            tasa_cierre: tasaCierre,
          },
          graficas: {
            por_proceso: procesosRes.rows,
            por_origen: origenRes.rows,
            tendencia_semanal: tendenciaRes.rows,
            top_codigos: rankingRes.rows,
          },
          tablas: {
            ultimas_abiertas: ultimasAbiertasRes.rows,
            ultimas_l3: ultimasL3Res.rows,
          },
        },
      })
    } catch (err) {
      console.error('[anorm.dashboard]', err.message)
      res.status(500).json({ error: 'Error al obtener métricas' })
    }
  }
)

export default router

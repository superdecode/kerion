import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { getNivelCriticoCodigo } from '../utils/niveles.js'

const router = Router()

function coerceRangeStart(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `${value}T00:00:00.000`
  return value
}

function coerceRangeEnd(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `${value}T23:59:59.999`
  return value
}

// ── GET /api/anormalidades/dashboard — métricas e indicadores ────────────────
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.dashboard', 'ver'),
  async (req, res) => {
    try {
      const criticalNivel = await getNivelCriticoCodigo(req.tQuery, req.tenantId)
      const { fecha_desde, fecha_hasta } = req.query
      const desde = coerceRangeStart(fecha_desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      const hasta = coerceRangeEnd(fecha_hasta || new Date().toISOString())

      const [
        hoyRes, pendientesRes, l3Res, vencidosRes, mesRes, cierreRes,
        procesosRes, origenRes, tendenciaRes, rankingRes,
        ultimasAbiertasRes, ultimasL3Res, estadoRes, responsablesRes,
        slaRes, agingRes, cierresRecientesRes,
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
           WHERE tenant_id = $1 AND nivel = $2 AND estado NOT IN ('cerrado')`,
          [req.tenantId, criticalNivel]
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
           WHERE a.tenant_id = $1 AND a.nivel = $2
           ORDER BY a.fecha_ocurrencia DESC
           LIMIT 5`,
          [req.tenantId, criticalNivel]
        ),
        req.tQuery(
          `SELECT
             CASE WHEN estado != 'cerrado' AND fecha_limite < now() THEN 'vencido' ELSE estado END AS estado,
             COUNT(*) AS cantidad
           FROM anormalidades
           WHERE tenant_id = $1
             AND fecha_ocurrencia BETWEEN $2 AND $3
           GROUP BY 1
           ORDER BY cantidad DESC`,
          [req.tenantId, desde, hasta]
        ),
        req.tQuery(
          `SELECT COALESCE(u.nombre_completo, 'Sin asignar') AS responsable,
                  COUNT(*) AS cantidad
           FROM anormalidades a
           LEFT JOIN usuarios u ON a.responsable_id = u.id
           WHERE a.tenant_id = $1
             AND a.fecha_ocurrencia BETWEEN $2 AND $3
           GROUP BY responsable
           ORDER BY cantidad DESC
           LIMIT 5`,
          [req.tenantId, desde, hasta]
        ),
        req.tQuery(
          `SELECT nivel,
                  COUNT(*) FILTER (WHERE estado = 'cerrado') AS cerradas,
                  COUNT(*) FILTER (
                    WHERE estado = 'cerrado'
                      AND fecha_cierre IS NOT NULL
                      AND fecha_limite IS NOT NULL
                      AND fecha_cierre <= fecha_limite
                  ) AS dentro_sla,
                  ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(fecha_cierre, now()) - created_at)) / 3600)::numeric, 1) AS horas_promedio
           FROM anormalidades
           WHERE tenant_id = $1
             AND fecha_ocurrencia BETWEEN $2 AND $3
           GROUP BY nivel
           ORDER BY nivel`,
          [req.tenantId, desde, hasta]
        ),
        req.tQuery(
          `SELECT bucket, COUNT(*) AS cantidad
           FROM (
             SELECT CASE
               WHEN EXTRACT(EPOCH FROM (now() - created_at))/3600 < 24 THEN '0-24h'
               WHEN EXTRACT(EPOCH FROM (now() - created_at))/3600 < 72 THEN '24-72h'
               WHEN EXTRACT(EPOCH FROM (now() - created_at))/3600 < 168 THEN '3-7d'
               ELSE '7d+'
             END AS bucket
             FROM anormalidades
             WHERE tenant_id = $1 AND estado NOT IN ('cerrado')
           ) s
           GROUP BY bucket
           ORDER BY CASE bucket
             WHEN '0-24h' THEN 1
             WHEN '24-72h' THEN 2
             WHEN '3-7d' THEN 3
             ELSE 4
           END`,
          [req.tenantId]
        ),
        req.tQuery(
          `SELECT a.id, a.folio, a.nivel, a.proceso, a.cliente, a.fecha_cierre,
                  EXTRACT(EPOCH FROM (a.fecha_cierre - a.created_at))/3600 AS horas_resolucion
           FROM anormalidades a
           WHERE a.tenant_id = $1
             AND a.estado = 'cerrado'
             AND a.fecha_cierre IS NOT NULL
           ORDER BY a.fecha_cierre DESC
           LIMIT 8`,
          [req.tenantId]
        ),
      ])

      const cerradas = parseInt(cierreRes.rows[0].cerradas)
      const totalRango = parseInt(cierreRes.rows[0].total)
      const tasaCierre = totalRango > 0 ? Math.round((cerradas / totalRango) * 100) : 0
      const horasPromedioResolucion = cierresRecientesRes.rows.length
        ? Math.round(
          cierresRecientesRes.rows.reduce((acc, row) => acc + Number(row.horas_resolucion || 0), 0) / cierresRecientesRes.rows.length
        )
        : 0

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
            horas_promedio_resolucion: horasPromedioResolucion,
          },
          graficas: {
            por_proceso: procesosRes.rows,
            por_origen: origenRes.rows,
            tendencia_semanal: tendenciaRes.rows,
            top_codigos: rankingRes.rows,
            por_estado: estadoRes.rows,
            top_responsables: responsablesRes.rows,
            aging_abiertas: agingRes.rows,
          },
          detalle_sla: slaRes.rows.map((row) => ({
            ...row,
            cerradas: parseInt(row.cerradas || 0),
            dentro_sla: parseInt(row.dentro_sla || 0),
            cumplimiento: Number(row.cerradas || 0) > 0
              ? Math.round((Number(row.dentro_sla || 0) / Number(row.cerradas || 1)) * 100)
              : 0,
          })),
          tablas: {
            ultimas_abiertas: ultimasAbiertasRes.rows,
            ultimas_l3: ultimasL3Res.rows,
            cierres_recientes: cierresRecientesRes.rows,
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

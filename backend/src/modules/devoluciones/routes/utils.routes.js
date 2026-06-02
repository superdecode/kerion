import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { buildEntradaWorkbook, buildSalidaWorkbook } from '../utils/excel.js'

const router = Router()

router.get('/sku-autocomplete',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'ver'),
  async (req, res) => {
    try {
      const q = String(req.query.q || '').trim()
      if (!q) return res.json({ items: [] })
      const result = await req.tQuery(
        `WITH latest_by_sku AS (
           SELECT DISTINCT ON (sku)
                  sku,
                  sku2,
                  descripcion,
                  peso,
                  largo,
                  ancho,
                  alto,
                  created_at
           FROM dev_item_skus
           WHERE tenant_id = $1
             AND (sku ILIKE $2 OR COALESCE(sku2, '') ILIKE $2 OR COALESCE(descripcion, '') ILIKE $2)
           ORDER BY sku, created_at DESC, id DESC
         ),
         usage_rank AS (
           SELECT sku, COUNT(*)::int AS frecuencia
           FROM dev_item_skus
           WHERE tenant_id = $1
           GROUP BY sku
         )
         SELECT l.sku,
                l.sku2,
                l.descripcion,
                l.peso,
                l.largo,
                l.ancho,
                l.alto,
                COALESCE(u.frecuencia, 1) AS frecuencia
         FROM latest_by_sku l
         LEFT JOIN usage_rank u ON u.sku = l.sku
         ORDER BY
           CASE
             WHEN l.sku ILIKE $2 THEN 0
             WHEN COALESCE(l.sku2, '') ILIKE $2 THEN 1
             ELSE 2
           END,
           l.created_at DESC,
           l.sku ASC
         LIMIT 10`,
        [req.tenantId, `%${q}%`]
      )
      res.json({ items: result.rows })
    } catch (error) {
      console.error('SKU autocomplete error:', error)
      res.status(500).json({ error: 'Error buscando SKU' })
    }
  }
)

router.get('/export/entradas/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'exportar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT s.codigo AS codigo_sesion,
                s.created_at AS fecha,
                u.nombre_completo AS responsable,
                COALESCE(ub.nombre, '') AS ubicacion,
                i.codigo_trazabilidad,
                COALESCE(i.embalaje1, '') AS embalaje1,
                COALESCE(i.embalaje2, '') AS embalaje2,
                sk.sku,
                COALESCE(sk.sku2, '') AS sku2,
                COALESCE(sk.descripcion, i.descripcion, '') AS descripcion,
                sk.cantidad,
                COALESCE(i.peso, '') AS peso,
                COALESCE(i.largo, '') AS largo,
                COALESCE(i.ancho, '') AS ancho,
                COALESCE(i.alto, '') AS alto,
                CASE WHEN i.multicaja THEN 'Si' ELSE 'No' END AS multicaja,
                COALESCE(i.notas, '') AS notas
         FROM dev_sesiones s
         JOIN usuarios u ON u.id = s.responsable_id
         JOIN dev_items i ON i.sesion_id = s.id
         JOIN dev_item_skus sk ON sk.item_id = i.id
         LEFT JOIN dev_ubicaciones ub ON ub.id = COALESCE(i.ubicacion_id, s.ubicacion_id)
         WHERE s.id = $1 AND s.tenant_id = $2 AND s.estado = 'confirmado'
         ORDER BY i.created_at ASC, sk.created_at ASC`,
        [req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Entrada confirmada no encontrada' })

      const rows = result.rows.map((row) => ({
        codigo_sesion: row.codigo_sesion,
        fecha: row.fecha,
        responsable: row.responsable,
        ubicacion: row.ubicacion,
        trazabilidad: row.codigo_trazabilidad,
        embalaje1: row.embalaje1,
        embalaje2: row.embalaje2,
        sku: row.sku,
        sku2: row.sku2,
        descripcion: row.descripcion,
        cantidad: row.cantidad,
        peso: row.peso,
        largo: row.largo,
        ancho: row.ancho,
        alto: row.alto,
        multicaja: row.multicaja,
        notas: row.notas,
      }))
      const buffer = await buildEntradaWorkbook(rows)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="entrada-${result.rows[0].codigo_sesion}.xlsx"`)
      res.send(buffer)
    } catch (error) {
      console.error('Export entrada error:', error)
      res.status(500).json({ error: 'Error exportando entrada' })
    }
  }
)

router.get('/export/salidas/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.salidas', 'exportar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT s.codigo AS codigo_salida,
                s.created_at AS fecha,
                u.nombre_completo AS responsable,
                COALESCE(ub.nombre, '') AS ubicacion,
                si.codigo_trazabilidad,
                si.sku,
                COALESCE(i.sku2, '') AS sku2,
                COALESCE(si.descripcion, i.descripcion, '') AS descripcion,
                si.cantidad_solicitada,
                COALESCE(si.cantidad_surtida, 0) AS cantidad_surtida,
                CASE WHEN si.surtido THEN 'Si' ELSE 'No' END AS surtido,
                COALESCE(s.notas, '') AS notas
         FROM dev_salidas s
         JOIN usuarios u ON u.id = s.responsable_id
         JOIN dev_salida_items si ON si.salida_id = s.id
         JOIN dev_inventario i ON i.id = si.inventario_id
         LEFT JOIN dev_ubicaciones ub ON ub.id = si.ubicacion_id
         WHERE s.id = $1 AND s.tenant_id = $2 AND s.estado = 'completado'
         ORDER BY si.created_at ASC`,
        [req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Salida completada no encontrada' })

      const rows = result.rows.map((row) => ({
        codigo_salida: row.codigo_salida,
        fecha: row.fecha,
        responsable: row.responsable,
        ubicacion: row.ubicacion,
        trazabilidad: row.codigo_trazabilidad,
        sku: row.sku,
        sku2: row.sku2,
        descripcion: row.descripcion,
        cantidad_solicitada: row.cantidad_solicitada,
        cantidad_surtida: row.cantidad_surtida,
        surtido: row.surtido,
        notas: row.notas,
      }))
      const buffer = await buildSalidaWorkbook(rows)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="salida-${result.rows[0].codigo_salida}.xlsx"`)
      res.send(buffer)
    } catch (error) {
      console.error('Export salida error:', error)
      res.status(500).json({ error: 'Error exportando salida' })
    }
  }
)

export default router

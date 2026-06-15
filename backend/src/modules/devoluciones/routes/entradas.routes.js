import { Router } from 'express'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { generateDevCodigo, generateItemTrazabilidad } from '../utils/codigos.js'
import { uploadEvidence, deleteEvidence, getEvidencePublicUrl } from '../utils/storage.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'
import { checkModuleLimitForUpdate } from '../../middleware/usageGuard.js'

const DEVOLUCIONES_COUNT_QUERY = `SELECT COUNT(*) FROM dev_sesiones WHERE tenant_id = $1 AND estado = 'confirmado' AND confirmado_at >= date_trunc('month', now())`

const router = Router()

async function getSesionDetail(req, sesionId) {
  const sesionRes = await req.tQuery(
    `SELECT s.*,
            u.nombre_completo AS responsable_nombre,
            ub.codigo AS ubicacion_codigo,
            ub.nombre AS ubicacion_nombre,
            COUNT(DISTINCT i.id) AS total_items
     FROM dev_sesiones s
     JOIN usuarios u ON u.id = s.responsable_id
     LEFT JOIN dev_ubicaciones ub ON ub.id = s.ubicacion_id
     LEFT JOIN dev_items i ON i.sesion_id = s.id
     WHERE s.id = $1 AND s.tenant_id = $2
     GROUP BY s.id, u.nombre_completo, ub.codigo, ub.nombre`,
    [sesionId, req.tenantId]
  )
  if (sesionRes.rows.length === 0) return null

  const itemsRes = await req.tQuery(
    `SELECT i.*,
            u.nombre_completo AS responsable_nombre,
            ub.codigo AS ubicacion_codigo,
            ub.nombre AS ubicacion_nombre
     FROM dev_items i
     JOIN usuarios u ON u.id = i.responsable_id
     LEFT JOIN dev_ubicaciones ub ON ub.id = i.ubicacion_id
     WHERE i.sesion_id = $1 AND i.tenant_id = $2
     ORDER BY i.created_at DESC`,
    [sesionId, req.tenantId]
  )

  const itemIds = itemsRes.rows.map((row) => row.id)
  let skusByItem = new Map()
  let fotosByItem = new Map()

  if (itemIds.length > 0) {
    const skusRes = await req.tQuery(
      `SELECT * FROM dev_item_skus WHERE item_id = ANY($1::uuid[]) AND tenant_id = $2 ORDER BY created_at ASC`,
      [itemIds, req.tenantId]
    )
    skusByItem = skusRes.rows.reduce((map, row) => {
      map.set(row.item_id, [...(map.get(row.item_id) || []), row])
      return map
    }, new Map())

    const fotosRes = await req.tQuery(
      `SELECT * FROM dev_item_fotos WHERE item_id = ANY($1::uuid[]) AND tenant_id = $2 ORDER BY created_at ASC`,
      [itemIds, req.tenantId]
    )
    fotosByItem = fotosRes.rows.reduce((map, row) => {
      map.set(row.item_id, [...(map.get(row.item_id) || []), {
        ...row,
        public_url: getEvidencePublicUrl(row.storage_path),
      }])
      return map
    }, new Map())
  }

  return {
    sesion: {
      ...sesionRes.rows[0],
      items: itemsRes.rows.map((item) => ({
        ...item,
        skus: skusByItem.get(item.id) || [],
        fotos: fotosByItem.get(item.id) || [],
      })),
    },
  }
}

router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'ver'),
  async (req, res) => {
    try {
      const { q = '', estado = '', responsable_id = '', fecha_inicio = '', fecha_fin = '', fecha_desde = '', fecha_hasta = '' } = req.query
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const params = [req.tenantId]
      const where = [`s.tenant_id = $1`]

      if (estado) {
        params.push(estado)
        where.push(`s.estado = $${params.length}`)
      }
      if (responsable_id) {
        params.push(responsable_id)
        where.push(`s.responsable_id = $${params.length}`)
      }
      const fechaIni = fecha_inicio || fecha_desde
      const fechaFin = fecha_fin || fecha_hasta
      if (fechaIni) {
        params.push(fechaIni)
        where.push(`${instantDateInTZ('s.created_at', tz)} >= $${params.length}`)
      }
      if (fechaFin) {
        params.push(fechaFin)
        where.push(`${instantDateInTZ('s.created_at', tz)} <= $${params.length}`)
      }
      if (q.trim()) {
        params.push(`%${q.trim()}%`)
        const idx = params.length
        where.push(`(
          s.codigo ILIKE $${idx}
          OR EXISTS (
            SELECT 1
            FROM dev_items di
            LEFT JOIN dev_item_skus dis ON dis.item_id = di.id
            WHERE di.sesion_id = s.id
              AND (
                di.embalaje1 ILIKE $${idx}
                OR di.embalaje2 ILIKE $${idx}
                OR di.codigo_trazabilidad ILIKE $${idx}
                OR dis.sku ILIKE $${idx}
                OR COALESCE(dis.sku2, '') ILIKE $${idx}
              )
          )
        )`)
      }

      const result = await req.tQuery(
        `SELECT s.*,
                u.nombre_completo AS responsable_nombre,
                ub.codigo AS ubicacion_codigo,
                ub.nombre AS ubicacion_nombre,
                COUNT(DISTINCT i.id) AS total_items
         FROM dev_sesiones s
         JOIN usuarios u ON u.id = s.responsable_id
         LEFT JOIN dev_ubicaciones ub ON ub.id = s.ubicacion_id
         LEFT JOIN dev_items i ON i.sesion_id = s.id
         WHERE ${where.join(' AND ')}
         GROUP BY s.id, u.nombre_completo, ub.codigo, ub.nombre
         ORDER BY s.created_at DESC`,
        params
      )
      res.json({ sesiones: result.rows })
    } catch (error) {
      console.error('List entradas error:', error)
      res.status(500).json({ error: 'Error obteniendo entradas' })
    }
  }
)

router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'crear'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const { ubicacion_id = null, notas = '' } = req.body
      const codigo = await generateDevCodigo(client, req.tenantId, 'KIB', 'dev_sesiones', req.fullUser.zona_horaria)
      const result = await client.query(
        `INSERT INTO dev_sesiones (codigo, responsable_id, ubicacion_id, notas, tenant_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [codigo, req.user.id, ubicacion_id, notas || null, req.tenantId]
      )
      await client.query('COMMIT')
      auditLog(req, 'DEV_ENTRADA_CREATE', 'dev_sesion', result.rows[0].id, { codigo })
      res.status(201).json({ sesion: result.rows[0] })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Create entrada error:', error)
      res.status(500).json({ error: 'Error creando entrada' })
    } finally {
      if (client) client.release()
    }
  }
)

router.get('/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'ver'),
  async (req, res) => {
    try {
      const detail = await getSesionDetail(req, req.params.id)
      if (!detail) return res.status(404).json({ error: 'Entrada no encontrada' })
      res.json(detail)
    } catch (error) {
      console.error('Get entrada detail error:', error)
      res.status(500).json({ error: 'Error obteniendo entrada' })
    }
  }
)

router.put('/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'actualizar'),
  async (req, res) => {
    try {
      const { ubicacion_id = null, notas = '' } = req.body
      const result = await req.tQuery(
        `UPDATE dev_sesiones
         SET ubicacion_id = $1, notas = $2, updated_at = now()
         WHERE id = $3 AND tenant_id = $4 AND estado IN ('borrador','en_proceso')
         RETURNING *`,
        [ubicacion_id, notas || null, req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'La entrada ya no se puede editar' })
      }
      res.json({ sesion: result.rows[0] })
    } catch (error) {
      console.error('Update entrada error:', error)
      res.status(500).json({ error: 'Error actualizando entrada' })
    }
  }
)

router.post('/:id/confirmar',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'actualizar'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const sesionRes = await client.query(
        `SELECT * FROM dev_sesiones WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, req.tenantId]
      )
      const sesion = sesionRes.rows[0]
      if (!sesion) return res.status(404).json({ error: 'Entrada no encontrada' })
      if (sesion.estado === 'confirmado') return res.status(409).json({ error: 'La entrada ya fue confirmada' })
      if (sesion.estado === 'cancelado') return res.status(409).json({ error: 'La entrada esta cancelada' })

      const limitCheck = await checkModuleLimitForUpdate(
        client,
        req.tenantId,
        'devoluciones_limit',
        DEVOLUCIONES_COUNT_QUERY,
        1
      )
      if (limitCheck.limited) {
        await client.query('ROLLBACK')
        return res.status(402).json({
          error: 'Límite mensual del plan alcanzado para este módulo.',
          code: 'DEVOLUCIONES_LIMIT_REACHED',
          used: limitCheck.used,
          limit: limitCheck.limit,
        })
      }

      const itemsRes = await client.query(
        `SELECT * FROM dev_items WHERE sesion_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
        [req.params.id, req.tenantId]
      )
      if (itemsRes.rows.length === 0) {
        return res.status(400).json({ error: 'La entrada no tiene items' })
      }

      for (const item of itemsRes.rows) {
        const skusRes = await client.query(
          `SELECT * FROM dev_item_skus WHERE item_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
          [item.id, req.tenantId]
        )
        if (skusRes.rows.length === 0) {
          return res.status(400).json({ error: `El item ${item.codigo_trazabilidad} no tiene SKU` })
        }

        for (const skuRow of skusRes.rows) {
          const invRes = await client.query(
            `INSERT INTO dev_inventario
               (item_id, sesion_id, sku, sku2, descripcion, embalaje1, embalaje2, codigo_trazabilidad,
                cantidad_disponible, cantidad_original, ubicacion_id, codigo_multicaja, tenant_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING *`,
            [
              item.id,
              req.params.id,
              skuRow.sku,
              skuRow.sku2 || null,
              skuRow.descripcion || item.descripcion || null,
              item.embalaje1 || null,
              item.embalaje2 || null,
              item.codigo_trazabilidad,
              skuRow.cantidad,
              skuRow.cantidad,
              item.ubicacion_id || sesion.ubicacion_id || null,
              item.codigo_multicaja || null,
              req.tenantId,
            ]
          )
          await client.query(
            `INSERT INTO dev_movimientos
               (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva, ubicacion_nueva_id,
                referencia_id, referencia_tipo, usuario_id, descripcion, documento, tenant_id)
             VALUES ('entrada', $1, $2, 0, $3, $4, $5, 'sesion', $6, $7, $8, $9)`,
            [
              invRes.rows[0].id,
              item.id,
              skuRow.cantidad,
              invRes.rows[0].ubicacion_id,
              req.params.id,
              req.user.id,
              'Confirmacion de entrada',
              sesion.codigo,
              req.tenantId,
            ]
          )
        }
      }

      await client.query(
        `UPDATE dev_items SET en_inventario = true, updated_at = now()
         WHERE sesion_id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      const updateRes = await client.query(
        `UPDATE dev_sesiones
         SET estado = 'confirmado', confirmado_at = now(), updated_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [req.params.id, req.tenantId]
      )
      await client.query('COMMIT')
      res.json({ sesion: updateRes.rows[0] })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Confirm entrada error:', error)
      res.status(500).json({ error: 'Error confirmando entrada' })
    } finally {
      if (client) client.release()
    }
  }
)

router.post('/:id/cancelar',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'eliminar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `UPDATE dev_sesiones
         SET estado = 'cancelado', cancelado_at = now(), updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado = 'en_proceso'
         RETURNING *`,
        [req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Solo se puede cancelar una entrada en proceso' })
      }
      res.json({ sesion: result.rows[0] })
    } catch (error) {
      console.error('Cancelar entrada error:', error)
      res.status(500).json({ error: 'Error cancelando entrada' })
    }
  }
)

router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'eliminar'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const sesionRes = await client.query(
        `SELECT estado FROM dev_sesiones WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, req.tenantId]
      )
      if (sesionRes.rows.length === 0) return res.status(404).json({ error: 'Entrada no encontrada' })
      if (!['borrador', 'cancelado'].includes(sesionRes.rows[0].estado)) {
        return res.status(409).json({ error: 'Solo se puede eliminar una entrada en borrador o cancelada' })
      }

      const itemIdsRes = await client.query(
        `SELECT id FROM dev_items WHERE sesion_id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      const itemIds = itemIdsRes.rows.map(row => row.id)

      if (itemIds.length > 0) {
        await client.query(`DELETE FROM dev_item_fotos WHERE item_id = ANY($1::uuid[]) AND tenant_id = $2`, [itemIds, req.tenantId])
        await client.query(`DELETE FROM dev_item_skus WHERE item_id = ANY($1::uuid[]) AND tenant_id = $2`, [itemIds, req.tenantId])
        await client.query(`DELETE FROM dev_items WHERE id = ANY($1::uuid[]) AND tenant_id = $2`, [itemIds, req.tenantId])
      }

      await client.query(`DELETE FROM dev_sesiones WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId])
      await client.query('COMMIT')
      res.json({ ok: true })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Delete entrada error:', error)
      res.status(500).json({ error: 'Error eliminando sesión' })
    } finally {
      if (client) client.release()
    }
  }
)

router.post('/:id/items',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'crear'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const sesionRes = await client.query(
        `SELECT * FROM dev_sesiones WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, req.tenantId]
      )
      const sesion = sesionRes.rows[0]
      if (!sesion) return res.status(404).json({ error: 'Entrada no encontrada' })
      if (!['borrador', 'en_proceso'].includes(sesion.estado)) {
        return res.status(409).json({ error: 'La entrada no acepta nuevos items' })
      }

      const {
        embalaje1 = null,
        embalaje2 = null,
        descripcion = null,
        multicaja = false,
        es_danado = false,
        notas = null,
        ubicacion_id = null,
        skus = [],
      } = req.body

      if (!Array.isArray(skus) || skus.length === 0) {
        return res.status(400).json({ error: 'Debe agregar al menos un SKU' })
      }

      // Generate multicaja code when item has multiple SKUs
      let codigo_multicaja = null
      if (Boolean(multicaja) && skus.length > 1) {
        const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
        const now = new Date()
        const dayLetter = DAY_LETTERS[now.getDay()]
        const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26))
        const dayNum = String(now.getDate()).padStart(2, '0')
        const countRes = await client.query(
          `SELECT COUNT(*) FROM dev_items WHERE tenant_id = $1 AND codigo_multicaja IS NOT NULL AND created_at >= CURRENT_DATE`,
          [req.tenantId]
        )
        const seq = String(parseInt(countRes.rows[0].count) + 1).padStart(3, '0')
        codigo_multicaja = `${dayLetter}${randomLetter}${dayNum}-${seq}`
      }

      // Use per-SKU dimensions from first sku as item-level fallback (for backward compat)
      const firstSku = skus[0] || {}
      const peso = firstSku.peso ?? null
      const largo = firstSku.largo ?? null
      const ancho = firstSku.ancho ?? null
      const alto = firstSku.alto ?? null

      const codigo_trazabilidad = await generateItemTrazabilidad(client, req.tenantId, req.params.id, sesion.codigo)
      const itemRes = await client.query(
        `INSERT INTO dev_items
           (sesion_id, codigo_trazabilidad, embalaje1, embalaje2, descripcion, peso, largo, ancho, alto,
            multicaja, es_danado, notas, responsable_id, ubicacion_id, codigo_multicaja, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
          req.params.id,
          codigo_trazabilidad,
          embalaje1,
          embalaje2,
          descripcion,
          peso,
          largo,
          ancho,
          alto,
          Boolean(multicaja),
          Boolean(es_danado),
          notas,
          req.user.id,
          ubicacion_id || sesion.ubicacion_id || null,
          codigo_multicaja,
          req.tenantId,
        ]
      )

      for (const skuRow of skus) {
        await client.query(
          `INSERT INTO dev_item_skus (item_id, sku, sku2, descripcion, cantidad, peso, largo, ancho, alto, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            itemRes.rows[0].id,
            skuRow.sku,
            skuRow.sku2 || null,
            skuRow.descripcion || descripcion || null,
            skuRow.cantidad || 1,
            skuRow.peso ?? null,
            skuRow.largo ?? null,
            skuRow.ancho ?? null,
            skuRow.alto ?? null,
            req.tenantId,
          ]
        )
      }

      await client.query(
        `UPDATE dev_sesiones
         SET estado = 'en_proceso', updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado = 'borrador'`,
        [req.params.id, req.tenantId]
      )
      await client.query('COMMIT')
      const detail = await getSesionDetail(req, req.params.id)
      res.status(201).json({ ...detail, created_item_id: itemRes.rows[0].id })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Create entrada item error:', error)
      res.status(500).json({ error: 'Error agregando item' })
    } finally {
      if (client) client.release()
    }
  }
)

router.put('/:id/items/:itemId',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'actualizar'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const sesionRes = await client.query(
        `SELECT estado FROM dev_sesiones WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, req.tenantId]
      )
      if (sesionRes.rows.length === 0) return res.status(404).json({ error: 'Entrada no encontrada' })
      if (!['borrador', 'en_proceso'].includes(sesionRes.rows[0].estado)) {
        return res.status(409).json({ error: 'La entrada ya no se puede editar' })
      }

      const {
        embalaje1 = null,
        embalaje2 = null,
        descripcion = null,
        multicaja = false,
        es_danado = false,
        notas = null,
        ubicacion_id = null,
        skus = [],
      } = req.body

      const firstSku = skus[0] || {}
      const peso = firstSku.peso ?? null
      const largo = firstSku.largo ?? null
      const ancho = firstSku.ancho ?? null
      const alto = firstSku.alto ?? null

      await client.query(
        `UPDATE dev_items
         SET embalaje1 = $1, embalaje2 = $2, descripcion = $3, peso = $4, largo = $5, ancho = $6, alto = $7,
             multicaja = $8, es_danado = $9, notas = $10, ubicacion_id = $11, updated_at = now()
         WHERE id = $12 AND sesion_id = $13 AND tenant_id = $14`,
        [embalaje1, embalaje2, descripcion, peso, largo, ancho, alto, Boolean(multicaja), Boolean(es_danado), notas, ubicacion_id, req.params.itemId, req.params.id, req.tenantId]
      )
      if (Array.isArray(skus) && skus.length > 0) {
        await client.query(`DELETE FROM dev_item_skus WHERE item_id = $1 AND tenant_id = $2`, [req.params.itemId, req.tenantId])
        for (const skuRow of skus) {
          await client.query(
            `INSERT INTO dev_item_skus (item_id, sku, sku2, descripcion, cantidad, peso, largo, ancho, alto, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [req.params.itemId, skuRow.sku, skuRow.sku2 || null, skuRow.descripcion || descripcion || null, skuRow.cantidad || 1, skuRow.peso ?? null, skuRow.largo ?? null, skuRow.ancho ?? null, skuRow.alto ?? null, req.tenantId]
          )
        }
      }
      await client.query('COMMIT')
      const detail = await getSesionDetail(req, req.params.id)
      res.json({ ...detail, updated_item_id: req.params.itemId })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Update entrada item error:', error)
      res.status(500).json({ error: 'Error actualizando item' })
    } finally {
      if (client) client.release()
    }
  }
)

router.delete('/:id/items/:itemId',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'eliminar'),
  async (req, res) => {
    try {
      const sesionRes = await req.tQuery(
        `SELECT estado FROM dev_sesiones WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (sesionRes.rows.length === 0) return res.status(404).json({ error: 'Entrada no encontrada' })
      if (!['borrador', 'en_proceso'].includes(sesionRes.rows[0].estado)) {
        return res.status(409).json({ error: 'No se puede eliminar el item' })
      }
      await req.tQuery(
        `DELETE FROM dev_items WHERE id = $1 AND sesion_id = $2 AND tenant_id = $3`,
        [req.params.itemId, req.params.id, req.tenantId]
      )
      const detail = await getSesionDetail(req, req.params.id)
      res.json(detail)
    } catch (error) {
      console.error('Delete entrada item error:', error)
      res.status(500).json({ error: 'Error eliminando item' })
    }
  }
)

router.post('/:id/items/:itemId/fotos',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'actualizar'),
  async (req, res) => {
    try {
      const { filename, contentType, dataBase64 } = req.body
      if (!filename || !dataBase64) {
        return res.status(400).json({ error: 'filename y dataBase64 son requeridos' })
      }
      const buffer = Buffer.from(dataBase64, 'base64')
      const upload = await uploadEvidence({
        tenantId: req.tenantId,
        itemId: req.params.itemId,
        filename,
        contentType,
        buffer,
      })
      const result = await req.tQuery(
        `INSERT INTO dev_item_fotos (item_id, storage_path, nombre_original, tenant_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.params.itemId, upload.storagePath, filename, req.tenantId]
      )
      res.status(201).json({ foto: { ...result.rows[0], public_url: upload.publicUrl } })
    } catch (error) {
      console.error('Upload evidencia error:', error)
      const status = error.code === 'SUPABASE_NOT_CONFIGURED' ? 501 : 500
      res.status(status).json({ error: error.message || 'Error subiendo evidencia' })
    }
  }
)

router.delete('/:id/items/:itemId/fotos/:fotoId',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.entradas', 'eliminar'),
  async (req, res) => {
    try {
      const fotoRes = await req.tQuery(
        `SELECT * FROM dev_item_fotos WHERE id = $1 AND item_id = $2 AND tenant_id = $3`,
        [req.params.fotoId, req.params.itemId, req.tenantId]
      )
      if (fotoRes.rows.length === 0) return res.status(404).json({ error: 'Foto no encontrada' })
      try {
        await deleteEvidence(fotoRes.rows[0].storage_path)
      } catch (error) {
        if (error.code !== 'SUPABASE_NOT_CONFIGURED') throw error
      }
      await req.tQuery(
        `DELETE FROM dev_item_fotos WHERE id = $1 AND tenant_id = $2`,
        [req.params.fotoId, req.tenantId]
      )
      res.json({ success: true })
    } catch (error) {
      console.error('Delete evidencia error:', error)
      res.status(500).json({ error: 'Error eliminando evidencia' })
    }
  }
)

export default router

import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { generateDevCodigo } from '../utils/codigos.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'

const router = Router()

async function getSalidaDetail(req, salidaId) {
  const salidaRes = await req.tQuery(
    `SELECT s.*, u.nombre_completo AS responsable_nombre
     FROM dev_salidas s
     JOIN usuarios u ON u.id = s.responsable_id
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [salidaId, req.tenantId]
  )
  if (salidaRes.rows.length === 0) return null
  const itemsRes = await req.tQuery(
    `SELECT si.*,
            ub.codigo AS ubicacion_codigo,
            ub.nombre AS ubicacion_nombre,
            i.sku2,
            i.embalaje1,
            i.embalaje2,
            i.cantidad_disponible
     FROM dev_salida_items si
     JOIN dev_inventario i ON i.id = si.inventario_id
     LEFT JOIN dev_ubicaciones ub ON ub.id = si.ubicacion_id
     WHERE si.salida_id = $1 AND si.tenant_id = $2
     ORDER BY si.created_at ASC`,
    [salidaId, req.tenantId]
  )
  return { salida: { ...salidaRes.rows[0], items: itemsRes.rows } }
}

async function replaceSalidaItems(client, tenantId, salidaId, items) {
  await client.query(`DELETE FROM dev_salida_items WHERE salida_id = $1 AND tenant_id = $2`, [salidaId, tenantId])
  for (const item of items) {
    await client.query(
      `INSERT INTO dev_salida_items
         (salida_id, inventario_id, sku, descripcion, codigo_trazabilidad, ubicacion_id, cantidad_solicitada, cantidad_surtida, surtido, tenant_id)
       SELECT $1, i.id, i.sku, COALESCE($4, i.descripcion), i.codigo_trazabilidad, i.ubicacion_id, $2, $3, $5, $6
       FROM dev_inventario i
       WHERE i.id = $7 AND i.tenant_id = $6`,
      [
        salidaId,
        item.cantidad_solicitada,
        item.cantidad_surtida ?? null,
        item.descripcion || null,
        Boolean(item.surtido),
        tenantId,
        item.inventario_id,
      ]
    )
  }
}

router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.salidas', 'ver'),
  async (req, res) => {
    try {
      const { estado = '', fecha_inicio = '', fecha_fin = '', fecha_desde = '', fecha_hasta = '', q = '' } = req.query
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const params = [req.tenantId]
      const where = ['s.tenant_id = $1']
      if (estado) {
        params.push(estado)
        where.push(`s.estado = $${params.length}`)
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
        where.push(`(s.codigo ILIKE $${idx} OR u.nombre_completo ILIKE $${idx})`)
      }
      const result = await req.tQuery(
        `SELECT s.*, u.nombre_completo AS responsable_nombre, COUNT(si.id) AS total_lineas
         FROM dev_salidas s
         JOIN usuarios u ON u.id = s.responsable_id
         LEFT JOIN dev_salida_items si ON si.salida_id = s.id
         WHERE ${where.join(' AND ')}
         GROUP BY s.id, u.nombre_completo
         ORDER BY s.created_at DESC`,
        params
      )
      res.json({ salidas: result.rows })
    } catch (error) {
      console.error('List salidas error:', error)
      res.status(500).json({ error: 'Error obteniendo salidas' })
    }
  }
)

router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.salidas', 'crear'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const { notas = '', estado = 'borrador', referencia = null, items = [] } = req.body
      const codigo = await generateDevCodigo(client, req.tenantId, 'KOT-', 'dev_salidas', req.fullUser.zona_horaria)
      const result = await client.query(
        `INSERT INTO dev_salidas (codigo, estado, notas, referencia, responsable_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [codigo, estado, notas || null, referencia || null, req.user.id, req.tenantId]
      )
      if (Array.isArray(items) && items.length > 0) {
        await replaceSalidaItems(client, req.tenantId, result.rows[0].id, items)
      }
      await client.query('COMMIT')
      const detail = await getSalidaDetail(req, result.rows[0].id)
      res.status(201).json(detail)
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Create salida error:', error)
      res.status(500).json({ error: 'Error creando salida' })
    } finally {
      if (client) client.release()
    }
  }
)

router.post('/importar-preview',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.salidas', 'crear'),
  async (req, res) => {
    try {
      const { rows = [] } = req.body
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'rows es requerido' })
      }
      const encontrados = []
      const noEncontrados = []
      for (const row of rows) {
        const termino = String(row.sku || '').trim()
        const cantidad = Number(row.cantidad || 0)
        if (!termino || cantidad <= 0) {
          noEncontrados.push({ sku: termino || '—', cantidad, motivo: 'SKU vacío o cantidad inválida' })
          continue
        }
        const invBySku = await req.tQuery(
          `SELECT i.*, ub.codigo AS ubicacion_codigo, ub.nombre AS ubicacion_nombre
           FROM dev_inventario i
           LEFT JOIN dev_ubicaciones ub ON ub.id = i.ubicacion_id
           WHERE i.tenant_id = $1 AND i.sku = $2 AND i.cantidad_disponible > 0
           ORDER BY i.created_at ASC LIMIT 1`,
          [req.tenantId, termino]
        )
        if (invBySku.rows.length > 0) {
          const inv = invBySku.rows[0]
          encontrados.push({
            inventario_id: inv.id, sku: inv.sku, descripcion: inv.descripcion,
            embalaje1: inv.embalaje1, codigo_trazabilidad: inv.codigo_trazabilidad,
            ubicacion_nombre: inv.ubicacion_nombre || inv.ubicacion_codigo,
            cantidad_disponible: inv.cantidad_disponible, cantidad_solicitada: cantidad,
            match_type: 'sku',
          })
          continue
        }
        const invByGuia = await req.tQuery(
          `SELECT i.*, ub.codigo AS ubicacion_codigo, ub.nombre AS ubicacion_nombre
           FROM dev_inventario i
           LEFT JOIN dev_ubicaciones ub ON ub.id = i.ubicacion_id
           WHERE i.tenant_id = $1 AND i.embalaje1 = $2 AND i.cantidad_disponible > 0
           ORDER BY i.created_at ASC LIMIT 1`,
          [req.tenantId, termino]
        )
        if (invByGuia.rows.length > 0) {
          const inv = invByGuia.rows[0]
          encontrados.push({
            inventario_id: inv.id, sku: inv.sku, descripcion: inv.descripcion,
            embalaje1: inv.embalaje1, codigo_trazabilidad: inv.codigo_trazabilidad,
            ubicacion_nombre: inv.ubicacion_nombre || inv.ubicacion_codigo,
            cantidad_disponible: inv.cantidad_disponible, cantidad_solicitada: cantidad,
            match_type: 'guia', guia_buscada: termino,
          })
          continue
        }
        noEncontrados.push({ sku: termino, cantidad, motivo: 'No encontrado en inventario disponible' })
      }
      res.json({ encontrados, no_encontrados: noEncontrados })
    } catch (error) {
      console.error('Preview importar salida error:', error)
      res.status(500).json({ error: 'Error procesando importación' })
    }
  }
)

router.get('/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.salidas', 'ver'),
  async (req, res) => {
    try {
      const detail = await getSalidaDetail(req, req.params.id)
      if (!detail) return res.status(404).json({ error: 'Salida no encontrada' })
      res.json(detail)
    } catch (error) {
      console.error('Get salida detail error:', error)
      res.status(500).json({ error: 'Error obteniendo salida' })
    }
  }
)

router.put('/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.salidas', 'actualizar'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const currentRes = await client.query(
        `SELECT * FROM dev_salidas WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, req.tenantId]
      )
      const current = currentRes.rows[0]
      if (!current) return res.status(404).json({ error: 'Salida no encontrada' })
      if (!['borrador', 'pendiente', 'en_proceso'].includes(current.estado)) {
        return res.status(409).json({ error: 'La salida ya no se puede editar' })
      }
      const { notas = '', estado = current.estado, referencia = current.referencia, items = [] } = req.body
      const result = await client.query(
        `UPDATE dev_salidas
         SET notas = $1, estado = $2, referencia = $3, updated_at = now()
         WHERE id = $4 AND tenant_id = $5
         RETURNING *`,
        [notas || null, estado, referencia || null, req.params.id, req.tenantId]
      )
      if (Array.isArray(items)) {
        await replaceSalidaItems(client, req.tenantId, req.params.id, items)
      }
      await client.query('COMMIT')
      const detail = await getSalidaDetail(req, req.params.id)
      res.json(detail || { salida: result.rows[0] })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Update salida error:', error)
      res.status(500).json({ error: 'Error actualizando salida' })
    } finally {
      if (client) client.release()
    }
  }
)

router.post('/:id/completar',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.salidas', 'actualizar'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const salidaRes = await client.query(
        `SELECT * FROM dev_salidas WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, req.tenantId]
      )
      const salida = salidaRes.rows[0]
      if (!salida) return res.status(404).json({ error: 'Salida no encontrada' })
      if (salida.estado === 'completado') return res.status(409).json({ error: 'La salida ya fue completada' })

      const { items = [] } = req.body
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Debe enviar items a surtir' })
      }

      for (const item of items) {
        const lineRes = await client.query(
          `SELECT si.*, inv.cantidad_disponible, inv.item_id, inv.ubicacion_id
           FROM dev_salida_items si
           JOIN dev_inventario inv ON inv.id = si.inventario_id
           WHERE si.id = $1 AND si.salida_id = $2 AND si.tenant_id = $3
           FOR UPDATE`,
          [item.id, req.params.id, req.tenantId]
        )
        const line = lineRes.rows[0]
        if (!line) return res.status(404).json({ error: 'Linea de salida no encontrada' })

        const surtida = Math.max(0, Number(item.cantidad_surtida ?? line.cantidad_solicitada))
        if (surtida > line.cantidad_disponible) {
          return res.status(409).json({ error: `Inventario insuficiente para ${line.sku}` })
        }
        const nuevaCantidad = line.cantidad_disponible - surtida

        await client.query(
          `UPDATE dev_inventario
           SET cantidad_disponible = $1, updated_at = now()
           WHERE id = $2 AND tenant_id = $3`,
          [nuevaCantidad, line.inventario_id, req.tenantId]
        )
        await client.query(
          `UPDATE dev_salida_items
           SET cantidad_surtida = $1, surtido = $2, updated_at = now()
           WHERE id = $3 AND tenant_id = $4`,
          [surtida, surtida > 0, line.id, req.tenantId]
        )
        await client.query(
          `INSERT INTO dev_movimientos
             (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva, ubicacion_anterior_id, referencia_id, referencia_tipo, usuario_id, descripcion, documento, tenant_id)
           VALUES ('salida', $1, $2, $3, $4, $5, $6, 'salida', $7, $8, $9, $10)`,
          [line.inventario_id, line.item_id, line.cantidad_disponible, nuevaCantidad, line.ubicacion_id, req.params.id, req.user.id, 'Confirmacion de surtido', salida.codigo, req.tenantId]
        )
      }

      const result = await client.query(
        `UPDATE dev_salidas
         SET estado = 'completado', completado_at = now(), updated_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [req.params.id, req.tenantId]
      )
      await client.query('COMMIT')
      res.json({ salida: result.rows[0] })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Completar salida error:', error)
      res.status(500).json({ error: 'Error completando salida' })
    } finally {
      if (client) client.release()
    }
  }
)

router.post('/:id/cancelar',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.salidas', 'eliminar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `UPDATE dev_salidas
         SET estado = 'cancelado', updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado = 'en_proceso'
         RETURNING *`,
        [req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(409).json({ error: 'Solo se puede cancelar una salida en proceso' })
      res.json({ salida: result.rows[0] })
    } catch (error) {
      console.error('Cancelar salida error:', error)
      res.status(500).json({ error: 'Error cancelando salida' })
    }
  }
)

router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.salidas', 'eliminar'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const salidaRes = await client.query(
        `SELECT estado FROM dev_salidas WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, req.tenantId]
      )
      if (salidaRes.rows.length === 0) return res.status(404).json({ error: 'Salida no encontrada' })
      if (!['borrador', 'cancelado'].includes(salidaRes.rows[0].estado)) {
        return res.status(409).json({ error: 'Solo se puede eliminar una salida en borrador o cancelada' })
      }

      await client.query(`DELETE FROM dev_salida_items WHERE salida_id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId])
      await client.query(`DELETE FROM dev_salidas WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId])
      await client.query('COMMIT')
      res.json({ ok: true })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Delete salida error:', error)
      res.status(500).json({ error: 'Error eliminando salida' })
    } finally {
      if (client) client.release()
    }
  }
)

router.post('/importar',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.salidas', 'crear'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const { notas = '', rows = [] } = req.body
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'rows es requerido' })
      }
      const codigo = await generateDevCodigo(client, req.tenantId, 'KOT-', 'dev_salidas', req.fullUser.zona_horaria)
      const salidaRes = await client.query(
        `INSERT INTO dev_salidas (codigo, estado, notas, responsable_id, tenant_id)
         VALUES ($1, 'pendiente', $2, $3, $4)
         RETURNING *`,
        [codigo, notas || null, req.user.id, req.tenantId]
      )

      const createdItems = []
      for (const row of rows) {
        const sku = String(row.sku || '').trim()
        const cantidad = Number(row.cantidad || 0)
        if (!sku || cantidad <= 0) continue
        const invRes = await client.query(
          `SELECT *
           FROM dev_inventario
           WHERE tenant_id = $1 AND sku = $2 AND cantidad_disponible > 0
           ORDER BY created_at ASC
           LIMIT 1`,
          [req.tenantId, sku]
        )
        if (invRes.rows.length === 0) {
          createdItems.push({ sku, cantidad_solicitada: cantidad, encontrado: false })
          continue
        }
        const inv = invRes.rows[0]
        await client.query(
          `INSERT INTO dev_salida_items
             (salida_id, inventario_id, sku, descripcion, codigo_trazabilidad, ubicacion_id, cantidad_solicitada, tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [salidaRes.rows[0].id, inv.id, inv.sku, inv.descripcion, inv.codigo_trazabilidad, inv.ubicacion_id, cantidad, req.tenantId]
        )
        createdItems.push({ sku, cantidad_solicitada: cantidad, encontrado: true, inventario_id: inv.id })
      }

      await client.query('COMMIT')
      res.status(201).json({ salida: salidaRes.rows[0], items: createdItems })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Import salida error:', error)
      res.status(500).json({ error: 'Error importando salida' })
    } finally {
      if (client) client.release()
    }
  }
)

export default router

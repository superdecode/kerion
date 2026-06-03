import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { generateDevCodigo, generateImportDocumento, generateImportTrazabilidad } from '../utils/codigos.js'

const router = Router()

function normalizeText(value) {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

function buildRowError(rowNumber, sku, error) {
  return {
    row: rowNumber ?? null,
    sku: sku || null,
    error: error instanceof Error ? error.message : String(error),
  }
}

async function assertTenantExists(client, tenantId) {
  const tenantRes = await client.query(
    'SELECT 1 FROM tenants WHERE id = $1 LIMIT 1',
    [tenantId]
  )
  if (!tenantRes.rows.length) {
    throw new Error('Tenant no encontrado o inválido')
  }
}

async function resolveUbicacionId(client, tenantId, ubicacionCodigo) {
  const codigo = normalizeText(ubicacionCodigo)
  if (!codigo) return null

  const ubRes = await client.query(
    `SELECT id
     FROM dev_ubicaciones
     WHERE codigo = $1 AND tenant_id = $2
     LIMIT 1`,
    [codigo, tenantId]
  )

  if (!ubRes.rows.length) {
    throw new Error(`Ubicación no encontrada: ${codigo}`)
  }

  return ubRes.rows[0].id
}

async function assertUbicacionIdExists(client, tenantId, ubicacionId) {
  const result = await client.query(
    `SELECT id
     FROM dev_ubicaciones
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [ubicacionId, tenantId]
  )

  if (!result.rows.length) {
    throw new Error(`Ubicación destino no encontrada: ${ubicacionId}`)
  }
}

async function resolveSkuCatalogData(client, tenantId, sku) {
  const normalizedSku = normalizeText(sku)
  if (!normalizedSku) return null

  const result = await client.query(
    `SELECT sk.sku,
            sk.sku2,
            COALESCE(sk.descripcion, i.descripcion) AS descripcion,
            i.id AS item_id,
            i.sesion_id,
            i.codigo_trazabilidad,
            i.embalaje1,
            i.embalaje2,
            i.ubicacion_id,
            i.codigo_multicaja
     FROM dev_item_skus sk
     JOIN dev_items i ON i.id = sk.item_id AND i.tenant_id = sk.tenant_id
     WHERE sk.sku = $1
       AND sk.tenant_id = $2
     ORDER BY sk.created_at DESC, i.updated_at DESC NULLS LAST, i.created_at DESC
     LIMIT 1`,
    [normalizedSku, tenantId]
  )

  return result.rows[0] || null
}

async function resolveDescripcionFallback(client, tenantId, sku, currentDescription = null) {
  const directValue = normalizeText(currentDescription)
  if (directValue) return directValue

  const skuData = await resolveSkuCatalogData(client, tenantId, sku)
  return normalizeText(skuData?.descripcion)
}

router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'ver'),
  async (req, res) => {
    try {
      const { q = '' } = req.query
      const params = [req.tenantId]
      let filter = ''
      if (q.trim()) {
        params.push(`%${q.trim()}%`)
        filter = `AND (
          i.sku ILIKE $2 OR COALESCE(i.sku2, '') ILIKE $2 OR COALESCE(i.descripcion, '') ILIKE $2
          OR COALESCE(i.embalaje1, '') ILIKE $2 OR COALESCE(i.embalaje2, '') ILIKE $2
          OR i.codigo_trazabilidad ILIKE $2
          OR COALESCE(i.codigo_multicaja, '') ILIKE $2
        )`
      }
      const result = await req.tQuery(
        `SELECT i.*,
                ub.codigo AS ubicacion_codigo,
                ub.nombre AS ubicacion_nombre,
                s_user.nombre_completo AS responsable_nombre,
                lm_user.nombre_completo AS ultimo_usuario_nombre,
                COALESCE(lm.documento, sal.referencia, sal.codigo, ses.codigo, aju.codigo) AS ultima_referencia
         FROM dev_inventario i
         LEFT JOIN dev_ubicaciones ub ON ub.id = i.ubicacion_id
         LEFT JOIN dev_sesiones s ON s.id = i.sesion_id
         LEFT JOIN usuarios s_user ON s_user.id = s.responsable_id
         LEFT JOIN LATERAL (
           SELECT m.usuario_id, m.referencia_id, m.referencia_tipo, m.documento
           FROM dev_movimientos m
           WHERE m.inventario_id = i.id AND m.tenant_id = i.tenant_id
           ORDER BY m.created_at DESC
           LIMIT 1
         ) lm ON true
         LEFT JOIN usuarios lm_user ON lm_user.id = lm.usuario_id
         LEFT JOIN dev_salidas sal ON sal.id = lm.referencia_id AND lm.referencia_tipo = 'salida'
         LEFT JOIN dev_sesiones ses ON ses.id = lm.referencia_id AND lm.referencia_tipo = 'sesion'
         LEFT JOIN dev_ajustes aju ON aju.id = lm.referencia_id AND lm.referencia_tipo IN ('ajuste', 'importacion')
         WHERE i.tenant_id = $1
           AND i.cantidad_disponible > 0
           ${filter}
         ORDER BY i.updated_at DESC`,
        params
      )
      res.json({ inventario: result.rows })
    } catch (error) {
      console.error('List inventario error:', error)
      res.status(500).json({ error: 'Error obteniendo inventario' })
    }
  }
)

router.get('/historial',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'ver'),
  async (req, res) => {
    try {
      const { tipo = '', fecha_inicio = '', fecha_fin = '', fecha_desde = '', fecha_hasta = '' } = req.query
      const params = [req.tenantId]
      const where = ['m.tenant_id = $1']
      if (tipo) {
        const tipos = tipo.split(',').map(t => t.trim()).filter(Boolean)
        if (tipos.length === 1) {
          params.push(tipos[0])
          where.push(`m.tipo = $${params.length}`)
        } else if (tipos.length > 1) {
          params.push(tipos)
          where.push(`m.tipo = ANY($${params.length})`)
        }
      }
      const fechaIni = fecha_inicio || fecha_desde
      const fechaFin = fecha_fin || fecha_hasta
      if (fechaIni) {
        params.push(fechaIni)
        where.push(`DATE(m.created_at) >= $${params.length}`)
      }
      if (fechaFin) {
        params.push(fechaFin)
        where.push(`DATE(m.created_at) <= $${params.length}`)
      }
      const result = await req.tQuery(
        `SELECT m.*,
                i.sku,
                i.sku2,
                i.codigo_trazabilidad,
                COALESCE(m.documento, sal.referencia, sal.codigo, ses.codigo, aju.codigo) AS documento,
                ub_prev.codigo AS ubicacion_anterior_codigo,
                ub_new.codigo AS ubicacion_nueva_codigo,
                CASE
                  WHEN m.tipo = 'salida' THEN COALESCE(ub_prev.codigo, ub_new.codigo)
                  WHEN m.tipo = 'entrada' THEN COALESCE(ub_new.codigo, ub_prev.codigo)
                  WHEN m.tipo = 'traslado' THEN COALESCE(ub_prev.codigo, ub_new.codigo)
                  ELSE COALESCE(ub_new.codigo, ub_prev.codigo)
                END AS ubicacion_codigo,
                u.nombre_completo AS usuario_nombre,
                m.observacion
         FROM dev_movimientos m
         LEFT JOIN dev_inventario i ON i.id = m.inventario_id
         LEFT JOIN dev_salidas sal ON sal.id = m.referencia_id AND m.referencia_tipo = 'salida'
         LEFT JOIN dev_sesiones ses ON ses.id = m.referencia_id AND m.referencia_tipo = 'sesion'
         LEFT JOIN dev_ajustes aju ON aju.id = m.referencia_id AND m.referencia_tipo IN ('ajuste', 'importacion')
         LEFT JOIN dev_ubicaciones ub_prev ON ub_prev.id = COALESCE(m.ubicacion_anterior_id, i.ubicacion_id)
         LEFT JOIN dev_ubicaciones ub_new ON ub_new.id = COALESCE(m.ubicacion_nueva_id, i.ubicacion_id)
         LEFT JOIN usuarios u ON u.id = m.usuario_id
         WHERE ${where.join(' AND ')}
         ORDER BY m.created_at DESC`,
        params
      )
      res.json({ movimientos: result.rows })
    } catch (error) {
      console.error('Historial inventario error:', error)
      res.status(500).json({ error: 'Error obteniendo historial' })
    }
  }
)

router.get('/ajustes',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT a.*, u.nombre_completo AS usuario_nombre
         FROM dev_ajustes a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.tenant_id = $1
         ORDER BY a.created_at DESC`,
        [req.tenantId]
      )
      res.json({ ajustes: result.rows })
    } catch (error) {
      console.error('List ajustes error:', error)
      res.status(500).json({ error: 'Error obteniendo ajustes' })
    }
  }
)

router.post('/ajustes',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'crear'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      await client.query('BEGIN')
      const { tipo, descripcion = '', inventario = [], ubicacion_destino_id = null } = req.body
      if (!['ajuste', 'movimiento'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo de ajuste invalido' })
      }
      if (!Array.isArray(inventario) || inventario.length === 0) {
        return res.status(400).json({ error: 'Debe seleccionar inventario' })
      }
      await assertTenantExists(client, req.tenantId)
      if (tipo === 'movimiento' && !ubicacion_destino_id) {
        return res.status(400).json({ error: 'Debe seleccionar una ubicación destino' })
      }
      if (tipo === 'movimiento') {
        await assertUbicacionIdExists(client, req.tenantId, ubicacion_destino_id)
      }

      const ajusteCodigo = await generateDevCodigo(client, req.tenantId, 'AJU-', 'dev_ajustes', req.fullUser?.zona_horaria)
      const ajusteRes = await client.query(
        `INSERT INTO dev_ajustes (codigo, tipo, descripcion, usuario_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [ajusteCodigo, tipo, descripcion || null, req.user.id, req.tenantId]
      )

      const summary = { total: inventario.length, creados: 0, actualizados: 0, fallidos: 0 }
      const erroresDetalle = []

      for (let index = 0; index < inventario.length; index++) {
        const row = inventario[index]
        const rowNumber = Number(row.row_number) || index + 1
        const savepoint = `sp_ajuste_${index + 1}`

        await client.query(`SAVEPOINT ${savepoint}`)
        try {
          const invRes = await client.query(
            `SELECT * FROM dev_inventario WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [row.inventario_id, req.tenantId]
          )
          const current = invRes.rows[0]
          if (!current) {
            throw new Error('Inventario no encontrado')
          }

          if (tipo === 'ajuste') {
            const nuevaCantidad = Number(row.cantidad_nueva)
            if (!Number.isFinite(nuevaCantidad) || nuevaCantidad < 0) {
              throw new Error('Cantidad nueva inválida')
            }

            const observacion = row.observacion || descripcion || 'Ajuste manual'
            await client.query(
              `UPDATE dev_inventario
               SET cantidad_disponible = $1,
                   descripcion = COALESCE($2, descripcion),
                   updated_at = now()
               WHERE id = $3 AND tenant_id = $4`,
              [
                nuevaCantidad,
                await resolveDescripcionFallback(client, req.tenantId, current.sku, current.descripcion),
                current.id,
                req.tenantId,
              ]
            )
            await client.query(
              `INSERT INTO dev_movimientos
                 (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva, ubicacion_nueva_id,
                  referencia_id, referencia_tipo, usuario_id, descripcion, observacion, documento, tenant_id)
               VALUES ('ajuste', $1, $2, $3, $4, $5, $6, 'ajuste', $7, $8, $9, $10, $11)`,
              [current.id, current.item_id, current.cantidad_disponible, nuevaCantidad, current.ubicacion_id, ajusteRes.rows[0].id, req.user.id, row.motivo || descripcion || 'Ajuste manual', observacion, ajusteCodigo, req.tenantId]
            )
            summary.actualizados++
          } else {
            const cantidadTraslado = row.cantidad ? Number(row.cantidad) : current.cantidad_disponible
            const observacion = row.observacion || descripcion || 'Traslado manual'
            if (!Number.isFinite(cantidadTraslado) || cantidadTraslado <= 0 || cantidadTraslado > current.cantidad_disponible) {
              throw new Error(`Cantidad inválida para traslado de ${current.sku || current.id}`)
            }

            if (Number(current.ubicacion_id) === Number(ubicacion_destino_id)) {
              throw new Error('La ubicación destino no puede ser igual a la ubicación origen')
            }

            const cantidadRestante = current.cantidad_disponible - cantidadTraslado

            await client.query(
              `UPDATE dev_inventario
               SET cantidad_disponible = $1,
                   descripcion = COALESCE($2, descripcion),
                   updated_at = now()
               WHERE id = $3 AND tenant_id = $4`,
              [
                cantidadRestante,
                await resolveDescripcionFallback(client, req.tenantId, current.sku, current.descripcion),
                current.id,
                req.tenantId,
              ]
            )

            await client.query(
              `INSERT INTO dev_movimientos
                 (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva, ubicacion_anterior_id,
                  referencia_id, referencia_tipo, usuario_id, descripcion, observacion, documento, tenant_id)
               VALUES ('salida', $1, $2, $3, $4, $5, $6, 'ajuste', $7, $8, $9, $10, $11)`,
              [
                current.id,
                current.item_id,
                current.cantidad_disponible,
                cantidadRestante,
                current.ubicacion_id,
                ajusteRes.rows[0].id,
                req.user.id,
                descripcion || 'Traslado - salida origen',
                observacion,
                ajusteCodigo,
                req.tenantId,
              ]
            )

            const targetRes = await client.query(
              `SELECT *
               FROM dev_inventario
               WHERE tenant_id = $1
                 AND ubicacion_id = $2
                 AND item_id = $3
                 AND sku = $4
                 AND COALESCE(sku2, '') = COALESCE($5, '')
                 AND codigo_trazabilidad = $6
                 AND COALESCE(embalaje1, '') = COALESCE($7, '')
                 AND COALESCE(embalaje2, '') = COALESCE($8, '')
                 AND COALESCE(codigo_multicaja, '') = COALESCE($9, '')
               LIMIT 1
               FOR UPDATE`,
              [
                req.tenantId,
                ubicacion_destino_id,
                current.item_id,
                current.sku,
                current.sku2,
                current.codigo_trazabilidad,
                current.embalaje1,
                current.embalaje2,
                current.codigo_multicaja,
              ]
            )

            if (targetRes.rows[0]) {
              const target = targetRes.rows[0]
              const nuevaCantidadDestino = Number(target.cantidad_disponible) + cantidadTraslado
              const nuevaCantidadOriginal = Number(target.cantidad_original || 0) + cantidadTraslado

              await client.query(
                `UPDATE dev_inventario
                 SET cantidad_disponible = $1,
                     cantidad_original = $2,
                     descripcion = COALESCE($3, descripcion),
                     updated_at = now()
                 WHERE id = $4 AND tenant_id = $5`,
                [
                  nuevaCantidadDestino,
                  nuevaCantidadOriginal,
                  await resolveDescripcionFallback(client, req.tenantId, target.sku, target.descripcion),
                  target.id,
                  req.tenantId,
                ]
              )

              await client.query(
                `INSERT INTO dev_movimientos
                   (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva, ubicacion_nueva_id,
                    referencia_id, referencia_tipo, usuario_id, descripcion, observacion, documento, tenant_id)
                 VALUES ('entrada', $1, $2, $3, $4, $5, $6, 'ajuste', $7, $8, $9, $10, $11)`,
                [
                  target.id,
                  target.item_id,
                  target.cantidad_disponible,
                  nuevaCantidadDestino,
                  ubicacion_destino_id,
                  ajusteRes.rows[0].id,
                  req.user.id,
                  descripcion || 'Traslado - entrada destino',
                  observacion,
                  ajusteCodigo,
                  req.tenantId,
                ]
              )
              summary.actualizados++
            } else {
              const newInvRes = await client.query(
                `INSERT INTO dev_inventario
                   (sku, sku2, descripcion, codigo_trazabilidad, embalaje1, embalaje2,
                    cantidad_disponible, cantidad_original, ubicacion_id, sesion_id,
                    codigo_multicaja, item_id, tenant_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 RETURNING *`,
                [
                  current.sku,
                  current.sku2,
                  await resolveDescripcionFallback(client, req.tenantId, current.sku, current.descripcion),
                  current.codigo_trazabilidad,
                  current.embalaje1,
                  current.embalaje2,
                  cantidadTraslado,
                  cantidadTraslado,
                  ubicacion_destino_id,
                  current.sesion_id,
                  current.codigo_multicaja,
                  current.item_id,
                  req.tenantId,
                ]
              )
              const newInv = newInvRes.rows[0]

              await client.query(
                `INSERT INTO dev_movimientos
                   (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva, ubicacion_nueva_id,
                    referencia_id, referencia_tipo, usuario_id, descripcion, observacion, documento, tenant_id)
                 VALUES ('entrada', $1, $2, 0, $3, $4, $5, 'ajuste', $6, $7, $8, $9, $10)`,
                [
                  newInv.id,
                  newInv.item_id,
                  cantidadTraslado,
                  ubicacion_destino_id,
                  ajusteRes.rows[0].id,
                  req.user.id,
                  descripcion || 'Traslado - entrada destino',
                  observacion,
                  ajusteCodigo,
                  req.tenantId,
                ]
              )
              summary.creados++
            }
          }

          await client.query(`RELEASE SAVEPOINT ${savepoint}`)
        } catch (rowError) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
          await client.query(`RELEASE SAVEPOINT ${savepoint}`)
          summary.fallidos++
          erroresDetalle.push(buildRowError(rowNumber, row?._sku || row?.sku || null, rowError))
        }
      }

      if (summary.creados === 0 && summary.actualizados === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          error: 'No se pudo procesar ningún ajuste',
          summary,
          errors: erroresDetalle,
        })
      }

      await client.query('COMMIT')
      const statusCode = summary.fallidos > 0 ? 207 : 201
      res.status(statusCode).json({
        ajuste: ajusteRes.rows[0],
        summary,
        errors: erroresDetalle,
      })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Create ajuste error:', error)
      res.status(500).json({ error: 'Error creando ajuste' })
    } finally {
      if (client) client.release()
    }
  }
)

router.put('/ajustes/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'actualizar'),
  async (req, res) => {
    try {
      const { descripcion = '', estado = 'confirmado' } = req.body
      const result = await req.tQuery(
        `UPDATE dev_ajustes
         SET descripcion = $1, estado = $2, updated_at = now()
         WHERE id = $3 AND tenant_id = $4
         RETURNING *`,
        [descripcion || null, estado, req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Ajuste no encontrado' })
      res.json({ ajuste: result.rows[0] })
    } catch (error) {
      console.error('Update ajuste error:', error)
      res.status(500).json({ error: 'Error actualizando ajuste' })
    }
  }
)

router.delete('/ajustes/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'eliminar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `UPDATE dev_ajustes
         SET estado = 'cancelado', updated_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Ajuste no encontrado' })
      res.json({ ajuste: result.rows[0] })
    } catch (error) {
      console.error('Delete ajuste error:', error)
      res.status(500).json({ error: 'Error eliminando ajuste' })
    }
  }
)

router.post('/importar',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'crear'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      await client.query('BEGIN')
      const { tipo, descripcion = '', filas = [] } = req.body
      if (!['ajuste', 'importacion'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido' })
      }
      if (!Array.isArray(filas) || filas.length === 0) {
        return res.status(400).json({ error: 'No hay filas para importar' })
      }
      await assertTenantExists(client, req.tenantId)

      const importCodigo = await generateDevCodigo(client, req.tenantId, 'AJU-', 'dev_ajustes', req.fullUser?.zona_horaria)
      const importDocumento = await generateImportDocumento(client, req.tenantId, req.fullUser?.zona_horaria)
      const ajusteRes = await client.query(
        `INSERT INTO dev_ajustes (codigo, tipo, descripcion, usuario_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [importCodigo, 'ajuste', descripcion || 'Importación masiva', req.user.id, req.tenantId]
      )
      const ajusteId = ajusteRes.rows[0].id

      const summary = { total: filas.length, creados: 0, actualizados: 0, fallidos: 0 }
      const erroresDetalle = []

      for (let index = 0; index < filas.length; index++) {
        const fila = filas[index]
        const savepoint = `sp_import_${index + 1}`
        const rowNumber = Number(fila.row_number) || index + 1

        await client.query(`SAVEPOINT ${savepoint}`)
        try {
          const {
            sku,
            cantidad,
            tipo_ajuste = 'set',
            inventario_id,
            descripcion: filDesc,
            ubicacion_codigo,
            guia1,
            guia2,
            multicaja,
            observacion: filObs,
          } = fila

          const normalizedSku = normalizeText(sku)
          const movementObs = filObs || descripcion || 'Importación'
          const cantNum = Number(cantidad)
          if (!normalizedSku) {
            throw new Error('SKU requerido')
          }
          if (!Number.isFinite(cantNum) || cantNum < 0) {
            throw new Error('Cantidad inválida')
          }

          const ubicacionId = await resolveUbicacionId(client, req.tenantId, ubicacion_codigo)

          if (inventario_id) {
            const invRes = await client.query(
              `SELECT * FROM dev_inventario WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
              [inventario_id, req.tenantId]
            )
            const current = invRes.rows[0]
            if (!current) {
              throw new Error('Inventario no encontrado')
            }

            let nuevaCantidad
            if (tipo_ajuste === 'add') nuevaCantidad = current.cantidad_disponible + cantNum
            else if (tipo_ajuste === 'subtract') nuevaCantidad = Math.max(0, current.cantidad_disponible - cantNum)
            else nuevaCantidad = cantNum

            const finalDesc = await resolveDescripcionFallback(client, req.tenantId, normalizedSku, filDesc || current.descripcion)

            await client.query(
              `UPDATE dev_inventario
               SET cantidad_disponible = $1,
                   descripcion = COALESCE($2, descripcion),
                   embalaje1 = COALESCE($3, embalaje1),
                   embalaje2 = COALESCE($4, embalaje2),
                   codigo_multicaja = COALESCE($5, codigo_multicaja),
                   updated_at = now()
               WHERE id = $6 AND tenant_id = $7`,
              [nuevaCantidad, finalDesc, normalizeText(guia1), normalizeText(guia2), normalizeText(multicaja), current.id, req.tenantId]
            )
            await client.query(
              `INSERT INTO dev_movimientos
                 (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva,
                  ubicacion_nueva_id, referencia_id, referencia_tipo, usuario_id, descripcion, observacion, documento, tenant_id)
               VALUES ('ajuste', $1, $2, $3, $4, $5, $6, 'importacion', $7, $8, $9, $10, $11)`,
              [current.id, current.item_id, current.cantidad_disponible, nuevaCantidad,
               ubicacionId || current.ubicacion_id, ajusteId, req.user.id,
               finalDesc || descripcion || 'Importación', movementObs, importDocumento, req.tenantId]
            )
            summary.actualizados++
          } else if (tipo === 'importacion') {
            const skuData = await resolveSkuCatalogData(client, req.tenantId, normalizedSku)
            const finalDesc = await resolveDescripcionFallback(client, req.tenantId, normalizedSku, filDesc || skuData?.descripcion)
            const finalUbicacionId = ubicacionId || skuData?.ubicacion_id || null

            let existingRes = { rows: [] }
            if (finalUbicacionId && skuData?.item_id) {
              existingRes = await client.query(
                `SELECT *
                 FROM dev_inventario
                 WHERE tenant_id = $1
                   AND ubicacion_id = $2
                   AND item_id = $3
                   AND sku = $4
                   AND COALESCE(sku2, '') = COALESCE($5, '')
                 LIMIT 1
                 FOR UPDATE`,
                [
                  req.tenantId,
                  finalUbicacionId,
                  skuData.item_id,
                  normalizedSku,
                  skuData.sku2,
                ]
              )
            }

            if (existingRes.rows[0]) {
              const current = existingRes.rows[0]
              const nuevaCantidad = Number(current.cantidad_disponible) + cantNum
              const nuevaCantidadOriginal = Number(current.cantidad_original || 0) + cantNum

              await client.query(
                `UPDATE dev_inventario
                 SET cantidad_disponible = $1,
                     cantidad_original = $2,
                     descripcion = COALESCE($3, descripcion),
                     embalaje1 = COALESCE($4, embalaje1),
                     embalaje2 = COALESCE($5, embalaje2),
                     codigo_multicaja = COALESCE($6, codigo_multicaja),
                     updated_at = now()
                 WHERE id = $7 AND tenant_id = $8`,
                [
                  nuevaCantidad,
                  nuevaCantidadOriginal,
                  finalDesc,
                  normalizeText(guia1) || skuData?.embalaje1 || null,
                  normalizeText(guia2) || skuData?.embalaje2 || null,
                  normalizeText(multicaja) || skuData?.codigo_multicaja || null,
                  current.id,
                  req.tenantId,
                ]
              )

              await client.query(
                `INSERT INTO dev_movimientos
                   (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva,
                    ubicacion_nueva_id, referencia_id, referencia_tipo, usuario_id, descripcion, observacion, documento, tenant_id)
                 VALUES ('entrada', $1, $2, $3, $4, $5, $6, 'importacion', $7, $8, $9, $10, $11)`,
                [
                  current.id,
                  current.item_id,
                  current.cantidad_disponible,
                  nuevaCantidad,
                  finalUbicacionId,
                  ajusteId,
                  req.user.id,
                  finalDesc || descripcion || 'Importación',
                  movementObs,
                  importDocumento,
                  req.tenantId,
                ]
              )
              summary.actualizados++
            } else {
              const codigoImportacion = await generateImportTrazabilidad(client, req.tenantId, req.fullUser?.zona_horaria)
              const invRes = (skuData?.item_id && skuData?.sesion_id)
                ? await client.query(
                    `INSERT INTO dev_inventario
                       (item_id, sesion_id, sku, sku2, descripcion, codigo_trazabilidad, embalaje1, embalaje2,
                        cantidad_disponible, cantidad_original, ubicacion_id, codigo_multicaja, tenant_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                     RETURNING *`,
                    [
                      skuData.item_id,
                      skuData.sesion_id,
                      normalizedSku,
                      skuData.sku2 || null,
                      finalDesc || null,
                      codigoImportacion,
                      normalizeText(guia1) || skuData.embalaje1 || null,
                      normalizeText(guia2) || skuData.embalaje2 || null,
                      cantNum,
                      cantNum,
                      finalUbicacionId,
                      normalizeText(multicaja) || skuData.codigo_multicaja || null,
                      req.tenantId,
                    ]
                  )
                : await client.query(
                    `INSERT INTO dev_inventario
                       (sku, descripcion, codigo_trazabilidad, cantidad_disponible, cantidad_original, ubicacion_id,
                        embalaje1, embalaje2, codigo_multicaja, tenant_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                     RETURNING *`,
                    [
                      normalizedSku,
                      finalDesc || null,
                      codigoImportacion,
                      cantNum,
                      cantNum,
                      finalUbicacionId,
                      normalizeText(guia1) || null,
                      normalizeText(guia2) || null,
                      normalizeText(multicaja) || null,
                      req.tenantId,
                    ]
                  )
              const newInv = invRes.rows[0]
              await client.query(
                `INSERT INTO dev_movimientos
                   (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva,
                    ubicacion_nueva_id, referencia_id, referencia_tipo, usuario_id, descripcion, observacion, documento, tenant_id)
                 VALUES ('entrada', $1, $2, 0, $3, $4, $5, 'importacion', $6, $7, $8, $9, $10)`,
                [
                  newInv.id,
                  newInv.item_id || null,
                  cantNum,
                  finalUbicacionId,
                  ajusteId,
                  req.user.id,
                  finalDesc || descripcion || 'Importación',
                  movementObs,
                  importDocumento,
                  req.tenantId,
                ]
              )
              summary.creados++
            }
          } else {
            throw new Error('Fila inválida para tipo ajuste')
          }

          await client.query(`RELEASE SAVEPOINT ${savepoint}`)
        } catch (rowError) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
          await client.query(`RELEASE SAVEPOINT ${savepoint}`)
          summary.fallidos++
          erroresDetalle.push(buildRowError(rowNumber, fila?.sku || null, rowError))
        }
      }

      if (summary.creados === 0 && summary.actualizados === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          error: 'No se pudo procesar ninguna fila',
          summary,
          errors: erroresDetalle,
        })
      }

      await client.query('COMMIT')
      const statusCode = summary.fallidos > 0 ? 207 : 201
      res.status(statusCode).json({
        ajuste_id: ajusteId,
        summary,
        errors: erroresDetalle,
      })
    } catch (error) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Import inventario error:', error)
      res.status(500).json({ error: 'Error importando inventario' })
    } finally {
      if (client) client.release()
    }
  }
)

router.get('/ubicaciones',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT u.*,
                COALESCE(SUM(i.cantidad_disponible), 0) AS pcs_stock
         FROM dev_ubicaciones u
         LEFT JOIN dev_inventario i
           ON i.ubicacion_id = u.id AND i.tenant_id = u.tenant_id AND i.cantidad_disponible > 0
         WHERE u.tenant_id = $1
         GROUP BY u.id
         ORDER BY u.activo DESC, u.codigo ASC`,
        [req.tenantId]
      )
      res.json({ ubicaciones: result.rows })
    } catch (error) {
      console.error('List ubicaciones error:', error)
      res.status(500).json({ error: 'Error obteniendo ubicaciones' })
    }
  }
)

router.post('/ubicaciones',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'actualizar'),
  async (req, res) => {
    try {
      const { codigo, nombre, descripcion = '', activo = true } = req.body
      if (!codigo || !nombre) return res.status(400).json({ error: 'codigo y nombre son requeridos' })
      const result = await req.tQuery(
        `INSERT INTO dev_ubicaciones (codigo, nombre, descripcion, activo, tenant_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [codigo.trim(), nombre.trim(), descripcion || null, Boolean(activo), req.tenantId]
      )
      res.status(201).json({ ubicacion: result.rows[0] })
    } catch (error) {
      console.error('Create ubicacion error:', error)
      res.status(500).json({ error: 'Error creando ubicacion' })
    }
  }
)

router.put('/ubicaciones/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'actualizar'),
  async (req, res) => {
    try {
      const { codigo, nombre, descripcion = '', activo = true } = req.body
      const result = await req.tQuery(
        `UPDATE dev_ubicaciones
         SET codigo = $1, nombre = $2, descripcion = $3, activo = $4, updated_at = now()
         WHERE id = $5 AND tenant_id = $6
         RETURNING *`,
        [codigo.trim(), nombre.trim(), descripcion || null, Boolean(activo), req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Ubicacion no encontrada' })
      res.json({ ubicacion: result.rows[0] })
    } catch (error) {
      console.error('Update ubicacion error:', error)
      res.status(500).json({ error: 'Error actualizando ubicacion' })
    }
  }
)

router.delete('/ubicaciones/:id',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'eliminar'),
  async (req, res) => {
    try {
      const stockRes = await req.tQuery(
        `SELECT COUNT(*) AS count
         FROM dev_inventario
         WHERE ubicacion_id = $1 AND tenant_id = $2 AND cantidad_disponible > 0`,
        [req.params.id, req.tenantId]
      )
      if (Number.parseInt(stockRes.rows[0].count, 10) > 0) {
        return res.status(409).json({ error: 'La ubicacion tiene inventario activo; solo se puede desactivar' })
      }
      await req.tQuery(
        `DELETE FROM dev_ubicaciones WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      res.json({ success: true })
    } catch (error) {
      if (error.code === '23503') {
        return res.status(409).json({ error: 'No se puede eliminar: la ubicación tiene registros históricos asociados. Desactívala en su lugar.' })
      }
      console.error('Delete ubicacion error:', error)
      res.status(500).json({ error: 'Error eliminando ubicacion' })
    }
  }
)

router.post('/ubicaciones/importar',
  authenticateToken, loadFullUser,
  requirePermission('devoluciones.inventario', 'actualizar'),
  async (req, res) => {
    try {
      const { rows = [] } = req.body
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'rows es requerido y no puede estar vacío' })
      }

      const procesados = []
      const errores = []
      const codigosVistos = new Set()

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const numFila = i + 1
        const codigo = String(row.codigo || '').trim()
        const nombre = String(row.nombre || '').trim()
        const descripcion = row.descripcion !== undefined ? String(row.descripcion || '').trim() : null

        // Validaciones de errores comunes
        if (!codigo) {
          errores.push({ fila: numFila, error: 'El código de ubicación es requerido' })
          continue
        }
        if (codigo.length > 50) {
          errores.push({ fila: numFila, codigo, error: 'El código excede los 50 caracteres permitidos' })
          continue
        }
        if (!nombre) {
          errores.push({ fila: numFila, codigo, error: 'El nombre de ubicación es requerido' })
          continue
        }
        if (nombre.length > 200) {
          errores.push({ fila: numFila, codigo, error: 'El nombre excede los 200 caracteres permitidos' })
          continue
        }

        // Detectar duplicados en el mismo archivo
        if (codigosVistos.has(codigo.toLowerCase())) {
          errores.push({ fila: numFila, codigo, error: `Código duplicado dentro del archivo: ${codigo}` })
          continue
        }
        codigosVistos.add(codigo.toLowerCase())

        try {
          const result = await req.tQuery(
            `INSERT INTO dev_ubicaciones (codigo, nombre, descripcion, tenant_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (codigo, tenant_id)
             DO UPDATE SET
               nombre = EXCLUDED.nombre,
               descripcion = COALESCE(EXCLUDED.descripcion, dev_ubicaciones.descripcion),
               updated_at = now()
             RETURNING (xmax = 0) AS es_nuevo`,
            [codigo, nombre, descripcion, req.tenantId]
          )
          
          procesados.push({
            codigo,
            status: result.rows[0].es_nuevo ? 'creado' : 'actualizado'
          })
        } catch (dbError) {
          console.error(`Error DB en fila ${numFila}:`, dbError)
          errores.push({ fila: numFila, codigo, error: dbError.message || 'Error interno al guardar en base de datos' })
        }
      }

      res.json({
        resumen: {
          total: rows.length,
          procesados: procesados.length,
          creados: procesados.filter(p => p.status === 'creado').length,
          actualizados: procesados.filter(p => p.status === 'actualizado').length,
          errores: errores.length
        },
        detalles_errores: errores
      })
    } catch (error) {
      console.error('Import ubicaciones error:', error)
      res.status(500).json({ error: 'Error crítico procesando la importación' })
    }
  }
)

export default router

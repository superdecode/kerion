import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { generateDevCodigo } from '../utils/codigos.js'

const router = Router()

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
                COALESCE(sal.referencia, sal.codigo) AS ultima_referencia
         FROM dev_inventario i
         LEFT JOIN dev_ubicaciones ub ON ub.id = i.ubicacion_id
         LEFT JOIN dev_sesiones s ON s.id = i.sesion_id
         LEFT JOIN usuarios s_user ON s_user.id = s.responsable_id
         LEFT JOIN LATERAL (
           SELECT m.usuario_id, m.referencia_id, m.referencia_tipo
           FROM dev_movimientos m
           WHERE m.inventario_id = i.id AND m.tenant_id = i.tenant_id
           ORDER BY m.created_at DESC
           LIMIT 1
         ) lm ON true
         LEFT JOIN usuarios lm_user ON lm_user.id = lm.usuario_id
         LEFT JOIN dev_salidas sal ON sal.id = lm.referencia_id AND lm.referencia_tipo = 'salida'
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

      const ajusteCodigo = await generateDevCodigo(client, req.tenantId, 'AJU-', 'dev_ajustes', req.fullUser?.zona_horaria)
      const ajusteRes = await client.query(
        `INSERT INTO dev_ajustes (codigo, tipo, descripcion, usuario_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [ajusteCodigo, tipo, descripcion || null, req.user.id, req.tenantId]
      )

      for (const row of inventario) {
        const invRes = await client.query(
          `SELECT * FROM dev_inventario WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [row.inventario_id, req.tenantId]
        )
        const current = invRes.rows[0]
        if (!current) {
          return res.status(404).json({ error: 'Inventario no encontrado' })
        }
        if (tipo === 'ajuste') {
          const nuevaCantidad = Number(row.cantidad_nueva)
          const observacion = row.observacion || descripcion || 'Ajuste manual'
          await client.query(
            `UPDATE dev_inventario
             SET cantidad_disponible = $1, updated_at = now()
             WHERE id = $2 AND tenant_id = $3`,
            [nuevaCantidad, current.id, req.tenantId]
          )
          await client.query(
            `INSERT INTO dev_movimientos
               (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva, ubicacion_nueva_id,
                referencia_id, referencia_tipo, usuario_id, motivo, observacion, tenant_id)
             VALUES ('ajuste', $1, $2, $3, $4, $5, $6, 'ajuste', $7, $8, $9, $10)`,
            [current.id, current.item_id, current.cantidad_disponible, nuevaCantidad, current.ubicacion_id, ajusteRes.rows[0].id, req.user.id, descripcion || 'Ajuste manual', observacion, req.tenantId]
          )
        } else {
          const cantidadTraslado = row.cantidad ? Number(row.cantidad) : current.cantidad_disponible
          const observacion = row.observacion || descripcion || 'Traslado manual'
          if (cantidadTraslado <= 0 || cantidadTraslado > current.cantidad_disponible) {
            await client.query('ROLLBACK')
            return res.status(400).json({ error: `Cantidad inválida para traslado de ${current.sku || current.id}` })
          }
          const cantidadRestante = current.cantidad_disponible - cantidadTraslado

          await client.query(
            `UPDATE dev_inventario
             SET cantidad_disponible = $1, updated_at = now()
             WHERE id = $2 AND tenant_id = $3`,
            [cantidadRestante, current.id, req.tenantId]
          )

          await client.query(
            `INSERT INTO dev_movimientos
               (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva, ubicacion_anterior_id,
                referencia_id, referencia_tipo, usuario_id, motivo, observacion, tenant_id)
             VALUES ('salida', $1, $2, $3, $4, $5, $6, 'ajuste', $7, $8, $9, $10)`,
            [
              current.id,
              current.item_id,
              current.cantidad_disponible,
              cantidadRestante,
              current.ubicacion_id,
              ajusteRes.rows[0].id,
              req.user.id,
              descripcion || 'Traslado — salida origen',
              observacion,
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
               SET cantidad_disponible = $1, cantidad_original = $2, updated_at = now()
               WHERE id = $3 AND tenant_id = $4`,
              [nuevaCantidadDestino, nuevaCantidadOriginal, target.id, req.tenantId]
            )

            await client.query(
              `INSERT INTO dev_movimientos
                 (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva, ubicacion_nueva_id,
                  referencia_id, referencia_tipo, usuario_id, motivo, observacion, tenant_id)
               VALUES ('entrada', $1, $2, $3, $4, $5, $6, 'ajuste', $7, $8, $9, $10)`,
              [
                target.id,
                target.item_id,
                target.cantidad_disponible,
                nuevaCantidadDestino,
                ubicacion_destino_id,
                ajusteRes.rows[0].id,
                req.user.id,
                descripcion || 'Traslado — entrada destino',
                observacion,
                req.tenantId,
              ]
            )
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
                current.descripcion,
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
                  referencia_id, referencia_tipo, usuario_id, motivo, observacion, tenant_id)
               VALUES ('entrada', $1, $2, 0, $3, $4, $5, 'ajuste', $6, $7, $8, $9)`,
              [
                newInv.id,
                newInv.item_id,
                cantidadTraslado,
                ubicacion_destino_id,
                ajusteRes.rows[0].id,
                req.user.id,
                descripcion || 'Traslado — entrada destino',
                observacion,
                req.tenantId,
              ]
            )
          }
        }
      }
      await client.query('COMMIT')
      res.status(201).json({ ajuste: ajusteRes.rows[0] })
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

      const importCodigo = await generateDevCodigo(client, req.tenantId, 'AJU-', 'dev_ajustes', req.fullUser?.zona_horaria)
      const ajusteRes = await client.query(
        `INSERT INTO dev_ajustes (codigo, tipo, descripcion, usuario_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [importCodigo, 'ajuste', descripcion || 'Importación masiva', req.user.id, req.tenantId]
      )
      const ajusteId = ajusteRes.rows[0].id

      let procesados = 0
      let errores = 0

      for (const fila of filas) {
        const {
          sku, cantidad, tipo_ajuste = 'set', inventario_id,
          descripcion: filDesc, ubicacion_codigo,
          guia1, guia2, multicaja, observacion: filObs
        } = fila

        let ubicacionId = null
        if (ubicacion_codigo) {
          const ubRes = await client.query(
            `SELECT id FROM dev_ubicaciones WHERE codigo = $1 AND tenant_id = $2 LIMIT 1`,
            [ubicacion_codigo, req.tenantId]
          )
          if (ubRes.rows.length) ubicacionId = ubRes.rows[0].id
        }

        const movementObs = filObs || descripcion || 'Importación'

        if (inventario_id) {
          const invRes = await client.query(
            `SELECT * FROM dev_inventario WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [inventario_id, req.tenantId]
          )
          const current = invRes.rows[0]
          if (!current) { errores++; continue }

          const cantNum = Number(cantidad)
          let nuevaCantidad
          if (tipo_ajuste === 'add') nuevaCantidad = current.cantidad_disponible + cantNum
          else if (tipo_ajuste === 'subtract') nuevaCantidad = Math.max(0, current.cantidad_disponible - cantNum)
          else nuevaCantidad = cantNum

          await client.query(
            `UPDATE dev_inventario
             SET cantidad_disponible = $1,
                 embalaje1 = COALESCE($2, embalaje1),
                 embalaje2 = COALESCE($3, embalaje2),
                 codigo_multicaja = COALESCE($4, codigo_multicaja),
                 updated_at = now()
             WHERE id = $5 AND tenant_id = $6`,
            [nuevaCantidad, guia1 || null, guia2 || null, multicaja || null, current.id, req.tenantId]
          )
          await client.query(
            `INSERT INTO dev_movimientos
               (tipo, inventario_id, item_id, cantidad_anterior, cantidad_nueva,
                ubicacion_nueva_id, referencia_id, referencia_tipo, usuario_id, motivo, observacion, tenant_id)
             VALUES ('ajuste', $1, $2, $3, $4, $5, $6, 'ajuste', $7, $8, $9, $10)`,
            [current.id, current.item_id, current.cantidad_disponible, nuevaCantidad,
             ubicacionId || current.ubicacion_id, ajusteId, req.user.id,
             filDesc || descripcion || 'Importación', movementObs, req.tenantId]
          )
          procesados++
        } else if (tipo === 'importacion') {
          // Look up SKU description if not provided
          let finalDesc = filDesc
          if (!finalDesc && sku) {
            const skuRes = await client.query(
              `SELECT descripcion FROM dev_item_skus WHERE sku = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
              [sku, req.tenantId]
            )
            if (skuRes.rows.length) finalDesc = skuRes.rows[0].descripcion
          }

          const invRes = await client.query(
            `INSERT INTO dev_inventario
               (sku, descripcion, cantidad_disponible, cantidad_original, ubicacion_id,
                embalaje1, embalaje2, codigo_multicaja, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [
              sku, finalDesc || null, Number(cantidad), Number(cantidad), ubicacionId,
              guia1 || null, guia2 || null, multicaja || null, req.tenantId
            ]
          )
          const newInv = invRes.rows[0]
          await client.query(
            `INSERT INTO dev_movimientos
               (tipo, inventario_id, cantidad_anterior, cantidad_nueva,
                ubicacion_nueva_id, referencia_id, referencia_tipo, usuario_id, motivo, observacion, tenant_id)
             VALUES ('entrada', $1, 0, $2, $3, $4, 'ajuste', $5, $6, $7, $8)`,
            [newInv.id, Number(cantidad), ubicacionId, ajusteId,
             req.user.id, filDesc || descripcion || 'Importación', movementObs, req.tenantId]
          )
          procesados++
        } else {
          errores++
        }
      }

      await client.query('COMMIT')
      res.status(201).json({ procesados, errores, ajuste_id: ajusteId })
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
        const descripcion = String(row.descripcion || '').trim()

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
               descripcion = EXCLUDED.descripcion,
               updated_at = now()
             RETURNING (xmax = 0) AS es_nuevo`,
            [codigo, nombre, descripcion || null, req.tenantId]
          )
          
          procesados.push({
            codigo,
            status: result.rows[0].es_nuevo ? 'creado' : 'actualizado'
          })
        } catch (dbError) {
          console.error(`Error DB en fila ${numFila}:`, dbError)
          errores.push({ fila: numFila, codigo, error: 'Error interno al guardar en base de datos' })
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

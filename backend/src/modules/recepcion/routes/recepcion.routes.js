import { Router } from 'express'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { getPermissionLevel, requirePermission } from '../../../shared/middleware/permissions.js'
import { checkModuleLimit } from '../../middleware/usageGuard.js'

const router = Router()

function sanitizeValidationConfig(input = {}) {
  const toPositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
  }
  const sanitizeTarimaAssignments = (value) => {
    const entries = Array.isArray(value)
      ? value
      : value && typeof value === 'object'
        ? Object.entries(value).map(([base, num]) => ({ base, num }))
        : []
    return entries
      .map((entry) => {
        const base = String(entry?.base || '').trim()
        const num = parseInt(entry?.num, 10)
        return base && Number.isInteger(num) && num > 0 ? { base, num } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.num - b.num || a.base.localeCompare(b.base, 'es'))
  }
  const sanitizeEmptyTarimas = (value) => {
    const values = Array.isArray(value) ? value : value == null ? [] : [value]
    return Array.from(new Set(
      values
        .map((entry) => parseInt(entry, 10))
        .filter((num) => Number.isInteger(num) && num > 0)
    )).sort((a, b) => a - b)
  }

  const mode = input?.mode === 'tarimas' ? 'tarimas' : 'ubicacion'

  return {
    mode,
    locked: mode === 'tarimas' ? Boolean(input?.locked) : false,
    sectionMode: Boolean(input?.sectionMode),
    maxTarimasPerSection: toPositiveInt(input?.maxTarimasPerSection, 20),
    groupSmallCodes: Boolean(input?.groupSmallCodes),
    minCajasParaAgrupar: toPositiveInt(input?.minCajasParaAgrupar, 3),
    maxCajasEnGrupo: toPositiveInt(input?.maxCajasEnGrupo, 10),
    sortTarimasByCountDesc: Boolean(input?.sortTarimasByCountDesc),
    tarimaAssignments: mode === 'tarimas' ? sanitizeTarimaAssignments(input?.tarimaAssignments) : [],
    emptyTarimas: mode === 'tarimas' ? sanitizeEmptyTarimas(input?.emptyTarimas) : [],
  }
}

async function generateFolioNumero(req) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const countRes = await req.tQuery(
    `SELECT COUNT(*) FROM inbound_orders WHERE tenant_id=$1 AND folio LIKE $2`,
    [req.tenantId, `INB-${dateStr}-%`]
  )
  const seq = String(parseInt(countRes.rows[0].count) + 1).padStart(4, '0')
  return `INB-${dateStr}-${seq}`
}

// GET /orders/clientes — distinct client list for filter dropdown (must be before /orders/:id)
router.get('/orders/clientes',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT DISTINCT cliente FROM inbound_orders WHERE tenant_id=$1 AND cliente IS NOT NULL ORDER BY cliente`,
        [req.tenantId]
      )
      res.json({ clientes: result.rows.map(r => r.cliente) })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener clientes' })
    }
  }
)

// GET /orders — list with filters
router.get('/orders',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'ver'),
  async (req, res) => {
    try {
      const { clientes, estado, tracking_no, reference_no, fecha_desde, fecha_hasta, q, page = 1, limit = 50 } = req.query
      const params = [req.tenantId]
      const where = ['o.tenant_id = $1']

      // clientes may be a comma-separated list or single value
      if (clientes) {
        const list = String(clientes).split(',').map(s => s.trim()).filter(Boolean)
        if (list.length === 1) { params.push(`%${list[0]}%`); where.push(`o.cliente ILIKE $${params.length}`) }
        else if (list.length > 1) { params.push(list); where.push(`o.cliente = ANY($${params.length})`) }
      }
      if (estado) { params.push(estado); where.push(`o.estado = $${params.length}`) }
      if (tracking_no) { params.push(`%${tracking_no}%`); where.push(`o.tracking_no ILIKE $${params.length}`) }
      if (reference_no) { params.push(`%${reference_no}%`); where.push(`o.reference_no ILIKE $${params.length}`) }
      if (fecha_desde) { params.push(fecha_desde); where.push(`o.created_at >= $${params.length}::date`) }
      if (fecha_hasta) { params.push(fecha_hasta); where.push(`o.created_at < ($${params.length}::date + interval '1 day')`) }
      if (q) {
        params.push(`%${q}%`)
        const p = `$${params.length}`
        where.push(`(o.folio ILIKE ${p} OR o.cliente ILIKE ${p} OR o.inbound_order_no ILIKE ${p} OR o.tracking_no ILIKE ${p} OR o.reference_no ILIKE ${p} OR EXISTS (SELECT 1 FROM inbound_lines il WHERE il.order_id=o.id AND il.tenant_id=o.tenant_id AND (il.custom_box_barcode ILIKE ${p} OR il.box_type ILIKE ${p} OR il.sku ILIKE ${p})))`)
      }

      const whereClause = where.join(' AND ')
      const countRes = await req.tQuery(
        `SELECT COUNT(*) FROM inbound_orders o WHERE ${whereClause}`,
        params
      )

      const offset = (parseInt(page) - 1) * parseInt(limit)
      params.push(parseInt(limit), offset)
      const result = await req.tQuery(
        `SELECT o.*, u.nombre_completo AS responsable_nombre,
                COALESCE((
                  SELECT COUNT(*)::int
                  FROM inbound_scan_events e
                  WHERE e.order_id = o.id AND e.tenant_id = o.tenant_id
                ), 0) AS validation_records
         FROM inbound_orders o
         LEFT JOIN usuarios u ON u.id = o.responsable_id
         WHERE ${whereClause}
         ORDER BY o.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      )

      res.json({ orders: result.rows, total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) })
    } catch (err) {
      console.error('[recepcion] list:', err.message)
      res.status(500).json({ error: 'Error al obtener órdenes de recepción' })
    }
  }
)

// POST /orders — create order + lines
router.post('/orders',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'crear'),
  async (req, res) => {
    try {
      const limitCheck = await checkModuleLimit(
        req.tenantId,
        'recepcion_limit',
        `SELECT COUNT(*) AS count FROM inbound_orders WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`
      )
      if (limitCheck.limited) {
        return res.status(402).json({
          error: 'Límite mensual del plan alcanzado para Recepción.',
          code: 'PLAN_LIMIT_REACHED',
          used: limitCheck.used,
          limit: limitCheck.limit,
        })
      }

      const { cliente, inbound_order_no, tracking_no, reference_no, lines } = req.body
      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ error: 'Se requieren líneas de recepción' })
      }

      const inboundOrderNo = String(inbound_order_no || '').trim()
      if (inboundOrderNo) {
        const duplicateRes = await req.tQuery(
          `SELECT id, folio
           FROM inbound_orders
           WHERE tenant_id=$1 AND LOWER(TRIM(inbound_order_no)) = LOWER($2)
           ORDER BY created_at DESC
           LIMIT 1`,
          [req.tenantId, inboundOrderNo]
        )

        if (duplicateRes.rows.length > 0) {
          return res.status(409).json({
            error: `La IB Order ${inboundOrderNo} ya fue importada en la orden ${duplicateRes.rows[0].folio}.`,
            duplicateInboundOrder: true,
            existingOrder: duplicateRes.rows[0],
          })
        }
      }

      const folio = await generateFolioNumero(req)
      const orderRes = await req.tQuery(
        `INSERT INTO inbound_orders (tenant_id, folio, cliente, inbound_order_no, tracking_no, reference_no, total_cajas, responsable_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.tenantId, folio, cliente || null, inboundOrderNo || null, tracking_no || null, reference_no || null, lines.length, req.user.id]
      )
      const order = orderRes.rows[0]

      // Bulk INSERT — one round-trip regardless of line count
      const COLS = 12
      const placeholders = lines.map((_, i) => {
        const b = i * COLS + 1
        return `($${b},$${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11})`
      }).join(',')
      const lineParams = lines.flatMap(l => [
        req.tenantId, order.id,
        l.box_type || null, l.custom_box_barcode || null,
        l.sku || null, l.qty_per_box || null,
        l.length_oms || null, l.width_oms || null, l.height_oms || null,
        l.dimension_unit || null, l.weight_oms || null, l.weight_unit || null,
      ])
      await req.tQuery(
        `INSERT INTO inbound_lines (tenant_id, order_id, box_type, custom_box_barcode, sku, qty_per_box, length_oms, width_oms, height_oms, dimension_unit, weight_oms, weight_unit)
         VALUES ${placeholders}`,
        lineParams
      )

      auditLog(req, 'RECEPCION_ORDER_CREATE', 'inbound_orders', order.id, { folio, total_cajas: lines.length })
      res.status(201).json({ order })
    } catch (err) {
      console.error('[recepcion] create:', err.message)
      res.status(500).json({ error: 'Error al crear orden de recepción' })
    }
  }
)

// PATCH /lines/:id — update line estado manually (before /:id to avoid param conflict)
router.patch('/lines/:id',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'actualizar'),
  async (req, res) => {
    try {
      const { estado_validacion, notas } = req.body
      const allowed = ['pendiente', 'validada', 'faltante']
      if (!allowed.includes(estado_validacion)) return res.status(400).json({ error: 'Estado inválido' })

      const result = await req.tQuery(
        `UPDATE inbound_lines SET estado_validacion=$3, notas=COALESCE($4, notas)
         WHERE id=$1 AND tenant_id=$2 RETURNING *`,
        [req.params.id, req.tenantId, estado_validacion, notas || null]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Línea no encontrada' })

      const orderId = result.rows[0].order_id
      await req.tQuery(
        `UPDATE inbound_orders SET
           cajas_validadas=(SELECT COUNT(*) FROM inbound_lines WHERE order_id=$1 AND tenant_id=$2 AND estado_validacion='validada'),
           updated_at=now()
         WHERE id=$1 AND tenant_id=$2`,
        [orderId, req.tenantId]
      )

      res.json({ line: result.rows[0] })
    } catch (err) {
      res.status(500).json({ error: 'Error al actualizar línea' })
    }
  }
)

// DELETE /lines/:id
router.delete('/lines/:id',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'eliminar'),
  async (req, res) => {
    try {
      const lineRes = await req.tQuery(
        `SELECT order_id FROM inbound_lines WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.tenantId]
      )
      if (lineRes.rows.length === 0) return res.status(404).json({ error: 'Línea no encontrada' })

      await req.tQuery(`DELETE FROM inbound_lines WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])

      const orderId = lineRes.rows[0].order_id
      await req.tQuery(
        `UPDATE inbound_orders SET
           total_cajas=(SELECT COUNT(*) FROM inbound_lines WHERE order_id=$1 AND tenant_id=$2),
           cajas_validadas=(SELECT COUNT(*) FROM inbound_lines WHERE order_id=$1 AND tenant_id=$2 AND estado_validacion='validada'),
           updated_at=now()
         WHERE id=$1 AND tenant_id=$2`,
        [orderId, req.tenantId]
      )
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar línea' })
    }
  }
)

// GET /orders/search-by-code — find order(s) by box/sku code (must be before /:id)
router.get('/orders/search-by-code',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'ver'),
  async (req, res) => {
    try {
      const { code } = req.query
      if (!code || String(code).trim().length < 2) {
        return res.status(400).json({ error: 'Código requerido' })
      }
      const c = String(code).trim()
      const result = await req.tQuery(
        `SELECT DISTINCT o.id, o.folio, o.cliente, o.estado, o.total_cajas, o.cajas_validadas, o.created_at
         FROM inbound_orders o
         JOIN inbound_lines l ON l.order_id = o.id AND l.tenant_id = o.tenant_id
         WHERE o.tenant_id = $1 AND (
           l.custom_box_barcode = $2 OR l.sku = $2
           OR l.custom_box_barcode ILIKE $3 OR l.sku ILIKE $3
         )
         ORDER BY o.created_at DESC
         LIMIT 10`,
        [req.tenantId, c, `%${c}%`]
      )
      res.json({ orders: result.rows, count: result.rows.length })
    } catch (err) {
      console.error('[recepcion] search-by-code:', err.message)
      res.status(500).json({ error: 'Error al buscar por código' })
    }
  }
)

// GET /orders/:id — order detail with lines
router.get('/orders/:id',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'ver'),
  async (req, res) => {
    try {
      const [orderRes, linesRes] = await Promise.all([
        req.tQuery(
          `SELECT o.*, u.nombre_completo AS responsable_nombre
           FROM inbound_orders o
           LEFT JOIN usuarios u ON u.id = o.responsable_id
           WHERE o.id=$1 AND o.tenant_id=$2`,
          [req.params.id, req.tenantId]
        ),
        req.tQuery(
          `SELECT l.*, u.nombre_completo AS validated_by_nombre
           FROM inbound_lines l
           LEFT JOIN usuarios u ON u.id = l.validated_by
           WHERE l.order_id=$1 AND l.tenant_id=$2
           ORDER BY l.created_at ASC`,
          [req.params.id, req.tenantId]
        ),
      ])
      if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Orden no encontrada' })
      res.json({ order: orderRes.rows[0], lines: linesRes.rows })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener detalle de orden' })
    }
  }
)

// PATCH /orders/:id — update order state
router.patch('/orders/:id',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'actualizar'),
  async (req, res) => {
    try {
      const { estado, validation_config } = req.body
      const allowed = ['pendiente_validacion', 'en_validacion', 'completo', 'parcial', 'cancelado']
      if (estado && !allowed.includes(estado)) return res.status(400).json({ error: 'Estado inválido' })

      const updates = ['updated_at=now()']
      const params = [req.params.id, req.tenantId]

      if (estado !== undefined) {
        params.push(estado || null)
        updates.push(`estado=COALESCE($${params.length}, estado)`)
      }

      if (validation_config !== undefined) {
        const currentRes = await req.tQuery(
          `SELECT validation_config FROM inbound_orders WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
          [req.params.id, req.tenantId]
        )
        if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Orden no encontrada' })
        const currentConfig = currentRes.rows[0]?.validation_config || null
        const nextConfig = sanitizeValidationConfig(validation_config)
        if (currentConfig?.mode === 'tarimas' && currentConfig?.locked === true) {
          const sameLockedConfig =
            nextConfig.mode === 'tarimas' &&
            nextConfig.locked === true &&
            Boolean(currentConfig.sectionMode) === nextConfig.sectionMode &&
            parseInt(currentConfig.maxTarimasPerSection || 20, 10) === nextConfig.maxTarimasPerSection &&
            Boolean(currentConfig.groupSmallCodes) === nextConfig.groupSmallCodes &&
            parseInt(currentConfig.minCajasParaAgrupar || 3, 10) === nextConfig.minCajasParaAgrupar &&
            parseInt(currentConfig.maxCajasEnGrupo || 10, 10) === nextConfig.maxCajasEnGrupo &&
            Boolean(currentConfig.sortTarimasByCountDesc) === nextConfig.sortTarimasByCountDesc

          if (!sameLockedConfig) {
            return res.status(409).json({ error: 'La configuración de tarimas ya está bloqueada para esta orden' })
          }
        }
        params.push(JSON.stringify(nextConfig))
        updates.push(`validation_config=$${params.length}::jsonb`)
      }

      const result = await req.tQuery(
        `UPDATE inbound_orders SET ${updates.join(', ')}
         WHERE id=$1 AND tenant_id=$2 RETURNING *`,
        params
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Orden no encontrada' })
      res.json({ order: result.rows[0] })
    } catch (err) {
      res.status(500).json({ error: 'Error al actualizar orden' })
    }
  }
)

// DELETE /orders/:id
// actualizar: only if there are no validation records
// eliminar: full destructive delete, including validation records
router.delete('/orders/:id',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'actualizar'),
  async (req, res) => {
    let client
    try {
      client = await req.tGetClient()
      const canForceDelete = req.fullUser?.es_admin_tenant === true ||
        getPermissionLevel(req.fullUser?.permisos, 'recepcion.recibir') === 'eliminar'

      const check = await client.query(
        `SELECT estado FROM inbound_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
        [req.params.id, req.tenantId]
      )
      if (check.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Orden no encontrada' })
      }

      const validationRes = await client.query(
        `SELECT COUNT(*)::int AS validation_records
         FROM inbound_scan_events
         WHERE order_id=$1 AND tenant_id=$2`,
        [req.params.id, req.tenantId]
      )
      const validationRecords = Number(validationRes.rows[0]?.validation_records || 0)

      if (!canForceDelete && validationRecords > 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Solo se pueden eliminar órdenes sin registros de validación' })
      }

      await client.query(`DELETE FROM inbound_scan_events WHERE order_id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])
      await client.query(`DELETE FROM inbound_validation_sessions WHERE order_id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])
      await client.query(`DELETE FROM inbound_novedades WHERE order_id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])
      await client.query(`DELETE FROM inbound_lines WHERE order_id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])
      await client.query(`DELETE FROM inbound_orders WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId])
      await client.query('COMMIT')
      auditLog(req, 'RECEPCION_ORDER_DELETE', 'inbound_orders', req.params.id, {})
      res.json({ ok: true })
    } catch (err) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('[recepcion] delete order:', err.message)
      res.status(500).json({ error: 'Error al eliminar orden' })
    } finally {
      if (client) client.release()
    }
  }
)

export default router

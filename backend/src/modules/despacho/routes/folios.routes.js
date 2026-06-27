import { Router } from 'express'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { requireAnyPermission, requirePermission } from '../../../shared/middleware/permissions.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'
import { checkModuleLimit } from '../../middleware/usageGuard.js'

const router = Router()
const requireDespachoValidar = (action) => requireAnyPermission([
  { modulePath: 'despacho.validar', action },
  { modulePath: 'despacho.folios', action },
])

async function generateFolioNumero(req) {
  const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    .format(new Date())
    .replace(/-/g, '')
  const countRes = await req.tQuery(
    `SELECT COUNT(*) FROM dispatch_folios
     WHERE tenant_id = $1 AND folio_numero LIKE $2`,
    [req.tenantId, `DSP-${dateStr}-%`]
  )
  const seq = String(parseInt(countRes.rows[0].count) + 1).padStart(2, '0')
  return `DSP-${dateStr}-${seq}`
}

async function syncOrderProgressByOrderNo(req, folioId, orderNo) {
  if (!orderNo) return
  await req.tQuery(
    `WITH counts AS (
       SELECT COUNT(*)::int AS scanned
       FROM dispatch_order_scans
       WHERE tenant_id = $3 AND folio_id = $1 AND matched_order_no = $2
     )
     UPDATE dispatch_folio_orders o
     SET bultos = counts.scanned,
         estado = CASE
           WHEN o.estado IN ('entregado', 'devolucion') THEN o.estado
           WHEN COALESCE(o.bultos_esperados, 0) > 0 AND counts.scanned >= o.bultos_esperados THEN 'cargado'
           ELSE 'pendiente'
         END
     FROM counts
     WHERE o.folio_id = $1 AND o.outbound_order_no = $2 AND o.tenant_id = $3`,
    [folioId, orderNo, req.tenantId]
  )
}

async function syncOrderProgressById(req, folioOrderId) {
  if (!folioOrderId) return
  await req.tQuery(
    `WITH counts AS (
       SELECT COUNT(*)::int AS scanned
       FROM dispatch_order_scans
       WHERE tenant_id = $2 AND folio_order_id = $1
     )
     UPDATE dispatch_folio_orders o
     SET bultos = counts.scanned,
         estado = CASE
           WHEN o.estado IN ('entregado', 'devolucion') THEN o.estado
           WHEN COALESCE(o.bultos_esperados, 0) > 0 AND counts.scanned >= o.bultos_esperados THEN 'cargado'
           ELSE 'pendiente'
         END
     FROM counts
     WHERE o.id = $1 AND o.tenant_id = $2`,
    [folioOrderId, req.tenantId]
  )
}

async function getFolioDetail(req, folioId) {
  const [folioRes, ordersRes] = await Promise.all([
    req.tQuery(
      `SELECT f.*,
              c.nombre AS conductor_nombre, c.licencia AS conductor_licencia, c.telefono AS conductor_telefono,
              u.placa AS unidad_placa, u.tipo AS unidad_tipo,
              us.nombre_completo AS operador_nombre,
              COUNT(fo.id) AS total_ordenes
       FROM dispatch_folios f
       LEFT JOIN dispatch_conductores c ON c.id = f.conductor_id
       LEFT JOIN dispatch_unidades u ON u.id = f.unidad_id
       LEFT JOIN usuarios us ON us.id = f.operador_id
       LEFT JOIN dispatch_folio_orders fo ON fo.folio_id = f.id
       WHERE f.id = $1 AND f.tenant_id = $2 AND f.deleted_at IS NULL
       GROUP BY f.id, c.nombre, c.licencia, c.telefono, u.placa, u.tipo, us.nombre_completo`,
      [folioId, req.tenantId]
    ),
    req.tQuery(
      `SELECT o.*, COALESCE(ps.total_scanned, 0) AS surtido_validadas
       FROM dispatch_folio_orders o
       LEFT JOIN (
         SELECT tenant_id, outbound_order_no, COALESCE(SUM(total_scanned), 0) AS total_scanned
         FROM pick_sessions
         GROUP BY tenant_id, outbound_order_no
       ) ps ON ps.outbound_order_no = o.outbound_order_no AND ps.tenant_id = o.tenant_id
       WHERE o.folio_id = $1 AND o.tenant_id = $2
       ORDER BY o.created_at ASC`,
      [folioId, req.tenantId]
    ),
  ])
  if (folioRes.rows.length === 0) return null

  const orderIds = ordersRes.rows.map(o => o.id)
  const orderNos = ordersRes.rows.map(o => o.outbound_order_no).filter(Boolean)
  const orderIdByNo = new Map(ordersRes.rows.map(o => [o.outbound_order_no, o.id]))
  const scansMap = {}
  if (orderIds.length > 0) {
    const scansRes = await req.tQuery(
      `SELECT s.*, u.nombre_completo AS validated_by_nombre
       FROM dispatch_order_scans s
       LEFT JOIN usuarios u ON u.id = s.validated_by
       WHERE s.tenant_id = $1
         AND (
           s.folio_order_id = ANY($2::uuid[])
           OR (s.folio_id = $3 AND s.matched_order_no = ANY($4::text[]))
         )
       ORDER BY s.created_at ASC`,
      [req.tenantId, orderIds, folioId, orderNos]
    )
    for (const scan of scansRes.rows) {
      const orderId = scan.folio_order_id || orderIdByNo.get(scan.matched_order_no)
      if (!orderId) continue
      if (!scansMap[orderId]) scansMap[orderId] = []
      scansMap[orderId].push(scan)
    }
  }

  const orders = ordersRes.rows.map(o => ({ ...o, scans: scansMap[o.id] || [] }))
  return { folio: folioRes.rows[0], orders }
}

// List folios (exclude soft-deleted)
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'ver'),
  async (req, res) => {
    try {
      const { q = '', estado = '', fecha_inicio = '', fecha_fin = '' } = req.query
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const params = [req.tenantId]
      const where = ['f.tenant_id = $1', 'f.deleted_at IS NULL']

      if (estado) {
        params.push(estado)
        where.push(`f.estado = $${params.length}`)
      }
      if (fecha_inicio) {
        params.push(fecha_inicio)
        where.push(`${instantDateInTZ('f.created_at', tz)} >= $${params.length}`)
      }
      if (fecha_fin) {
        params.push(fecha_fin)
        where.push(`${instantDateInTZ('f.created_at', tz)} <= $${params.length}`)
      }
      if (q.trim()) {
        params.push(`%${q.trim()}%`)
        where.push(`(f.folio_numero ILIKE $${params.length} OR c.nombre ILIKE $${params.length} OR u.placa ILIKE $${params.length})`)
      }

      const result = await req.tQuery(
        `SELECT f.*,
                c.nombre AS conductor_nombre,
                u.placa AS unidad_placa, u.tipo AS unidad_tipo,
                us.nombre_completo AS operador_nombre,
                COUNT(fo.id) AS total_ordenes,
                COALESCE(SUM(fo.bultos), 0) AS total_cajas
         FROM dispatch_folios f
         LEFT JOIN dispatch_conductores c ON c.id = f.conductor_id
         LEFT JOIN dispatch_unidades u ON u.id = f.unidad_id
         LEFT JOIN usuarios us ON us.id = f.operador_id
         LEFT JOIN dispatch_folio_orders fo ON fo.folio_id = f.id
         WHERE ${where.join(' AND ')}
         GROUP BY f.id, c.nombre, u.placa, u.tipo, us.nombre_completo
         ORDER BY f.created_at DESC`,
        params
      )
      res.json({ folios: result.rows })
    } catch (error) {
      console.error('List folios error:', error.message, error.code, error.detail)
      res.status(500).json({ error: 'Error obteniendo folios' })
    }
  }
)

// Dispatch status for outbound orders
router.get('/ordenes-dispatch',
  authenticateToken, loadFullUser,
  requirePermission('despacho.ordenes', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT fo.outbound_order_no, fo.estado AS order_estado, fo.folio_id,
                f.folio_numero, f.estado AS folio_estado
         FROM dispatch_folio_orders fo
         JOIN dispatch_folios f ON f.id = fo.folio_id
         WHERE fo.tenant_id = $1 AND f.estado IN ('borrador','en_proceso','cerrado') AND f.deleted_at IS NULL`,
        [req.tenantId]
      )
      res.json({ dispatch: result.rows })
    } catch (error) {
      console.error('Ordenes dispatch status error:', error)
      res.status(500).json({ error: 'Error obteniendo estado de despacho' })
    }
  }
)

// Create folio
router.post('/',
  authenticateToken, loadFullUser,
  requireDespachoValidar('crear'),
  async (req, res) => {
    try {
      const limitCheck = await checkModuleLimit(
        req.tenantId,
        'despacho_limit',
        `SELECT COUNT(*) AS count FROM dispatch_folios WHERE tenant_id = $1 AND deleted_at IS NULL AND created_at >= date_trunc('month', now())`
      )
      if (limitCheck.limited) {
        return res.status(402).json({
          error: 'Límite mensual del plan alcanzado para Despacho.',
          code: 'PLAN_LIMIT_REACHED',
          used: limitCheck.used,
          limit: limitCheck.limit,
        })
      }

      const { conductor_id = null, unidad_id = null, notas = '', tipo = 'por_orden', destino = null, orders = [] } = req.body
      const fecha_salida = req.body.fecha_salida === '' ? null : (req.body.fecha_salida ?? null)
      if (!conductor_id || !unidad_id || !fecha_salida) {
        return res.status(400).json({ error: 'Conductor, unidad y fecha de salida son obligatorios para crear el folio' })
      }
      const folio_numero = await generateFolioNumero(req)
      const result = await req.tTransaction(async (client) => {
        const folioInsert = await client.query(
          `INSERT INTO dispatch_folios (tenant_id, folio_numero, conductor_id, unidad_id, operador_id, fecha_salida, notas, tipo, destino)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *`,
          [req.tenantId, folio_numero, conductor_id, unidad_id, req.user.id, fecha_salida, notas || null, tipo, destino || null]
        )
        const folio = folioInsert.rows[0]

        const normalizedOrders = Array.isArray(orders)
          ? orders
              .map((order) => ({
                outbound_order_no: String(order?.outbound_order_no || '').trim(),
                destinatario: order?.destinatario || null,
                bultos: Number.isFinite(Number(order?.bultos)) ? Number(order.bultos) : 0,
                bultos_esperados: order?.bultos_esperados ?? null,
                notas: typeof order?.notas === 'string'
                  ? order.notas
                  : order?.notas
                    ? JSON.stringify(order.notas)
                    : null,
                outbound_date: order?.outbound_date || null,
              }))
              .filter(order => order.outbound_order_no)
          : []

        if (normalizedOrders.length > 0) {
          const orderNos = [...new Set(normalizedOrders.map(order => order.outbound_order_no))]
          const conflictRes = await client.query(
            `SELECT fo.outbound_order_no, f.folio_numero
             FROM dispatch_folio_orders fo
             JOIN dispatch_folios f ON f.id = fo.folio_id
             WHERE fo.tenant_id = $1
               AND fo.outbound_order_no = ANY($2::text[])
               AND f.estado IN ('borrador','en_proceso')
               AND f.deleted_at IS NULL`,
            [req.tenantId, orderNos]
          )
          if (conflictRes.rows.length > 0) {
            const activeFolio = conflictRes.rows[0].folio_numero
            const blockedCodes = conflictRes.rows.map(row => row.outbound_order_no).join(', ')
            const error = new Error(`Las órdenes ${blockedCodes} ya están asignadas al folio activo ${activeFolio}.`)
            error.status = 409
            error.code = 'ORDER_ALREADY_IN_ACTIVE_FOLIO'
            error.folio_numero = activeFolio
            error.codes = conflictRes.rows.map(row => row.outbound_order_no)
            throw error
          }

          for (const order of normalizedOrders) {
            await client.query(
              `INSERT INTO dispatch_folio_orders
                 (tenant_id, folio_id, outbound_order_no, destinatario, bultos, bultos_esperados, notas, outbound_date)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT (tenant_id, folio_id, outbound_order_no) DO NOTHING`,
              [req.tenantId, folio.id, order.outbound_order_no, order.destinatario, order.bultos, order.bultos_esperados, order.notas, order.outbound_date]
            )
          }
        }

        await client.query(
          `UPDATE dispatch_folios SET estado = CASE WHEN $3::int > 0 THEN 'en_proceso' ELSE estado END, updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [folio.id, req.tenantId, normalizedOrders.length]
        )

        return { folio, orders_added: normalizedOrders.length }
      })
      auditLog(req, 'DESPACHO_FOLIO_CREATE', 'dispatch_folio', result.folio.id, { folio_numero, tipo, orders_added: result.orders_added })
      res.status(201).json({ folio: result.folio, orders_added: result.orders_added })
    } catch (error) {
      if (error.status === 409) {
        return res.status(409).json({
          error: error.message,
          code: error.code || 'ORDER_ALREADY_IN_ACTIVE_FOLIO',
          folio_numero: error.folio_numero || null,
          codes: error.codes || [],
        })
      }
      console.error('Create folio error:', error)
      res.status(500).json({ error: 'Error creando folio' })
    }
  }
)

// Get folio detail
router.get('/:id',
  authenticateToken, loadFullUser,
  requireDespachoValidar('ver'),
  async (req, res) => {
    try {
      const detail = await getFolioDetail(req, req.params.id)
      if (!detail) return res.status(404).json({ error: 'Folio no encontrado' })
      res.json(detail)
    } catch (error) {
      console.error('Get folio detail error:', error)
      res.status(500).json({ error: 'Error obteniendo folio' })
    }
  }
)

// Update folio metadata (allowed for borrador, en_proceso, cerrado — not cancelado)
// Also handles validar_por_tarimas toggle (only for active folios)
router.put('/:id',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const folioRes = await req.tQuery(
        `SELECT estado FROM dispatch_folios WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.tenantId]
      )
      if (folioRes.rows.length === 0) return res.status(404).json({ error: 'Folio no encontrado' })
      const { estado } = folioRes.rows[0]
      if (estado === 'cancelado') return res.status(409).json({ error: 'No se puede editar un folio cancelado' })

      const setClauses = ['updated_at = now()']
      const params = []

      if ('conductor_id' in req.body) {
        params.push(req.body.conductor_id || null)
        setClauses.push(`conductor_id = $${params.length}`)
      }
      if ('unidad_id' in req.body) {
        params.push(req.body.unidad_id || null)
        setClauses.push(`unidad_id = $${params.length}`)
      }
      if ('notas' in req.body) {
        params.push(req.body.notas || null)
        setClauses.push(`notas = $${params.length}`)
      }
      if ('fecha_salida' in req.body) {
        params.push(req.body.fecha_salida === '' ? null : (req.body.fecha_salida ?? null))
        setClauses.push(`fecha_salida = $${params.length}`)
      }
      // validar_por_tarimas only for active folios
      if ('validar_por_tarimas' in req.body && ['borrador', 'en_proceso'].includes(estado)) {
        params.push(req.body.validar_por_tarimas ?? false)
        setClauses.push(`validar_por_tarimas = $${params.length}`)
      }

      params.push(req.params.id, req.tenantId)
      const result = await req.tQuery(
        `UPDATE dispatch_folios SET ${setClauses.join(', ')}
         WHERE id = $${params.length - 1} AND tenant_id = $${params.length} AND deleted_at IS NULL
         RETURNING *`,
        params
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Folio no encontrado' })
      res.json({ folio: result.rows[0] })
    } catch (error) {
      console.error('Update folio error:', error)
      res.status(500).json({ error: 'Error actualizando folio' })
    }
  }
)

// Bulk-add orders to folio (for por_destino: insert all destino orders at once)
router.post('/:id/orders/bulk',
  authenticateToken, loadFullUser,
  requireDespachoValidar('crear'),
  async (req, res) => {
    try {
      const { orders } = req.body
      if (!Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({ error: 'orders array requerido' })
      }
      const folioRes = await req.tQuery(
        `SELECT estado FROM dispatch_folios WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.tenantId]
      )
      if (folioRes.rows.length === 0) return res.status(404).json({ error: 'Folio no encontrado' })
      if (!['borrador','en_proceso'].includes(folioRes.rows[0].estado)) {
        return res.status(409).json({ error: 'El folio no acepta más órdenes' })
      }
      // Insert all orders — skip duplicates silently
      for (const o of orders) {
        if (!o.outbound_order_no) continue
        const notes = typeof o.notas === 'string'
          ? o.notas
          : o.notas
            ? JSON.stringify(o.notas)
            : null
        await req.tQuery(
          `INSERT INTO dispatch_folio_orders
             (tenant_id, folio_id, outbound_order_no, destinatario, bultos, bultos_esperados, notas, outbound_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (tenant_id, folio_id, outbound_order_no) DO NOTHING`,
          [req.tenantId, req.params.id, o.outbound_order_no,
           o.destinatario || null, o.bultos || 0, o.bultos_esperados || null, notes, o.outbound_date || null]
        )
      }
      await req.tQuery(
        `UPDATE dispatch_folios SET estado = 'en_proceso', updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado = 'borrador'`,
        [req.params.id, req.tenantId]
      )
      const detail = await getFolioDetail(req, req.params.id)
      res.status(201).json(detail)
    } catch (error) {
      console.error('Bulk add orders error:', error)
      res.status(500).json({ error: 'Error agregando órdenes al folio' })
    }
  }
)

// Get all scans for a folio (for por_destino detail view)
router.get('/:id/scans',
  authenticateToken, loadFullUser,
  requireDespachoValidar('ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT s.*, u.nombre_completo AS validated_by_nombre
         FROM dispatch_order_scans s
         LEFT JOIN usuarios u ON u.id = s.validated_by
         WHERE s.tenant_id = $1 AND s.folio_id = $2
         ORDER BY s.validated_at ASC`,
        [req.tenantId, req.params.id]
      )
      res.json({ scans: result.rows })
    } catch (error) {
      console.error('Get folio scans error:', error)
      res.status(500).json({ error: 'Error obteniendo escaneos' })
    }
  }
)

// Add folio-level scan (for por_destino — box matched to order client-side)
router.post('/:id/scans',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const { codigo_caja, tarima_ref = null, matched_order_no = null } = req.body
      if (!codigo_caja?.trim()) return res.status(400).json({ error: 'codigo_caja requerido' })

      const folioRes = await req.tQuery(
        `SELECT estado FROM dispatch_folios WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.tenantId]
      )
      if (!folioRes.rows.length || !['borrador','en_proceso'].includes(folioRes.rows[0].estado)) {
        return res.status(409).json({ error: 'Folio no editable' })
      }

      // Duplicate within this folio
      const folioDedupeRes = await req.tQuery(
        `SELECT id FROM dispatch_order_scans
         WHERE tenant_id = $1 AND folio_id = $2 AND codigo_caja = $3`,
        [req.tenantId, req.params.id, codigo_caja.trim()]
      )
      if (folioDedupeRes.rows.length > 0) {
        return res.status(409).json({ error: 'Código ya escaneado en este folio', code: 'DUPLICATE_IN_FOLIO' })
      }

      let ensuredOrderId = null
      if (matched_order_no) {
        const orderRes = await req.tQuery(
          `SELECT id FROM dispatch_folio_orders
           WHERE tenant_id = $1 AND folio_id = $2 AND outbound_order_no = $3`,
          [req.tenantId, req.params.id, matched_order_no.trim()]
        )
        if (orderRes.rows.length > 0) {
          ensuredOrderId = orderRes.rows[0].id
        } else {
          const insertedOrder = await req.tQuery(
            `INSERT INTO dispatch_folio_orders
               (tenant_id, folio_id, outbound_order_no, destinatario, bultos, bultos_esperados, notas, outbound_date, estado)
             VALUES ($1,$2,$3,NULL,0,NULL,$4,NULL,'pendiente')
             ON CONFLICT (tenant_id, folio_id, outbound_order_no) DO UPDATE SET updated_at = now()
             RETURNING id`,
            [req.tenantId, req.params.id, matched_order_no.trim(), JSON.stringify({ fallback_manual: true })]
          )
          ensuredOrderId = insertedOrder.rows[0]?.id || null
        }
      }

      // Cross-folio same-day dedup (excluding cancelled folios)
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const crossFolioRes = await req.tQuery(
        `SELECT f.folio_numero FROM dispatch_order_scans s
         JOIN dispatch_folios f ON f.id = s.folio_id
         WHERE s.tenant_id = $1 AND s.codigo_caja = $2
           AND s.folio_id != $3
           AND f.estado != 'cancelado'
           AND f.deleted_at IS NULL
           AND date_trunc('day', s.validated_at AT TIME ZONE $4) =
               date_trunc('day', now() AT TIME ZONE $4)
         LIMIT 1`,
        [req.tenantId, codigo_caja.trim(), req.params.id, tz]
      )
      if (crossFolioRes.rows.length > 0) {
        return res.status(409).json({
          error: `Caja ya escaneada hoy en folio ${crossFolioRes.rows[0].folio_numero}`,
          code: 'DUPLICATE_CROSS_FOLIO',
          folio_numero: crossFolioRes.rows[0].folio_numero,
        })
      }

      const insertRes = await req.tQuery(
        `INSERT INTO dispatch_order_scans
           (tenant_id, folio_id, codigo_caja, tarima_ref, matched_order_no, validated_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [req.tenantId, req.params.id, codigo_caja.trim(), tarima_ref || null, matched_order_no || null, req.user.id]
      )

      if (matched_order_no) {
        await syncOrderProgressByOrderNo(req, req.params.id, matched_order_no)
        if (ensuredOrderId) {
          await syncOrderProgressById(req, ensuredOrderId)
        }
      }

      await req.tQuery(
        `UPDATE dispatch_folios SET estado = 'en_proceso', updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado = 'borrador'`,
        [req.params.id, req.tenantId]
      )

      const scanRes = await req.tQuery(
        `SELECT s.*, u.nombre_completo AS validated_by_nombre
         FROM dispatch_order_scans s
         LEFT JOIN usuarios u ON u.id = s.validated_by
         WHERE s.tenant_id = $1 AND s.id = $2`,
        [req.tenantId, insertRes.rows[0].id]
      )
      res.json({ scan: scanRes.rows[0] })
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Código ya escaneado en este folio', code: 'DUPLICATE_IN_FOLIO' })
      }
      console.error('Add folio scan error:', error)
      res.status(500).json({ error: 'Error registrando escaneo' })
    }
  }
)

// Delete a specific scan (por_destino — by scan id)
router.delete('/:id/scans/:scanId',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const folioRes = await req.tQuery(
        `SELECT estado FROM dispatch_folios WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.tenantId]
      )
      if (!folioRes.rows.length || !['borrador','en_proceso'].includes(folioRes.rows[0].estado)) {
        return res.status(409).json({ error: 'Folio no editable' })
      }
      const delRes = await req.tQuery(
        `DELETE FROM dispatch_order_scans
         WHERE id = $1 AND folio_id = $2 AND tenant_id = $3
         RETURNING matched_order_no`,
        [req.params.scanId, req.params.id, req.tenantId]
      )
      if (delRes.rows.length === 0) return res.status(404).json({ error: 'Escaneo no encontrado' })

      const matchedOrderNo = delRes.rows[0].matched_order_no
      if (matchedOrderNo) {
        await syncOrderProgressByOrderNo(req, req.params.id, matchedOrderNo)
      }
      const scansRes = await req.tQuery(
        `SELECT s.*, u.nombre_completo AS validated_by_nombre
         FROM dispatch_order_scans s
         LEFT JOIN usuarios u ON u.id = s.validated_by
         WHERE s.tenant_id = $1 AND s.folio_id = $2
         ORDER BY s.validated_at ASC`,
        [req.tenantId, req.params.id]
      )
      res.json({ scans: scansRes.rows })
    } catch (error) {
      console.error('Delete folio scan error:', error)
      res.status(500).json({ error: 'Error eliminando escaneo' })
    }
  }
)

// Move a specific scan to another tarima (por_destino — by scan id)
router.patch('/:id/scans/:scanId/tarima',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const { tarima_ref = null } = req.body
      const cleanTarimaRef = String(tarima_ref || '').trim() || null

      const folioRes = await req.tQuery(
        `SELECT estado FROM dispatch_folios WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.tenantId]
      )
      if (!folioRes.rows.length || !['borrador','en_proceso'].includes(folioRes.rows[0].estado)) {
        return res.status(409).json({ error: 'Folio no editable' })
      }

      const updateRes = await req.tQuery(
        `UPDATE dispatch_order_scans
         SET tarima_ref = $1
         WHERE id = $2 AND folio_id = $3 AND tenant_id = $4
         RETURNING id`,
        [cleanTarimaRef, req.params.scanId, req.params.id, req.tenantId]
      )
      if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Escaneo no encontrado' })

      const scansRes = await req.tQuery(
        `SELECT s.*, u.nombre_completo AS validated_by_nombre
         FROM dispatch_order_scans s
         LEFT JOIN usuarios u ON u.id = s.validated_by
         WHERE s.tenant_id = $1 AND s.folio_id = $2
         ORDER BY s.validated_at ASC`,
        [req.tenantId, req.params.id]
      )
      res.json({ scans: scansRes.rows })
    } catch (error) {
      console.error('Move folio scan tarima error:', error)
      res.status(500).json({ error: 'Error moviendo escaneo de tarima' })
    }
  }
)

// Add order to folio
router.post('/:id/orders',
  authenticateToken, loadFullUser,
  requireDespachoValidar('crear'),
  async (req, res) => {
    try {
      const { outbound_order_no, destinatario = null, bultos = 1, bultos_esperados = null, notas = '', outbound_date = null } = req.body
      if (!outbound_order_no) return res.status(400).json({ error: 'outbound_order_no es requerido' })

      const folioRes = await req.tQuery(
        `SELECT estado FROM dispatch_folios WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.tenantId]
      )
      if (folioRes.rows.length === 0) return res.status(404).json({ error: 'Folio no encontrado' })
      if (!['borrador','en_proceso'].includes(folioRes.rows[0].estado)) {
        return res.status(409).json({ error: 'El folio no acepta más órdenes' })
      }

      // Reject duplicate within same folio
      const dupeRes = await req.tQuery(
        `SELECT id FROM dispatch_folio_orders
         WHERE tenant_id = $1 AND folio_id = $2 AND outbound_order_no = $3`,
        [req.tenantId, req.params.id, outbound_order_no]
      )
      if (dupeRes.rows.length > 0) {
        return res.status(409).json({ error: 'Esta orden ya está registrada en este folio' })
      }

      // Reject if order belongs to another non-cancelled folio
      const otherFolioRes = await req.tQuery(
        `SELECT f.folio_numero FROM dispatch_folio_orders fo
         JOIN dispatch_folios f ON f.id = fo.folio_id
         WHERE fo.tenant_id = $1 AND fo.outbound_order_no = $2
           AND f.estado NOT IN ('cancelado') AND f.deleted_at IS NULL
           AND f.id != $3`,
        [req.tenantId, outbound_order_no, req.params.id]
      )
      if (otherFolioRes.rows.length > 0) {
        return res.status(409).json({ error: `La orden ya está asignada al folio ${otherFolioRes.rows[0].folio_numero}` })
      }

      const result = await req.tQuery(
        `INSERT INTO dispatch_folio_orders
           (tenant_id, folio_id, outbound_order_no, destinatario, bultos, bultos_esperados, notas, outbound_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [req.tenantId, req.params.id, outbound_order_no, destinatario, bultos, bultos_esperados, notas || null, outbound_date || null]
      )
      await req.tQuery(
        `UPDATE dispatch_folios SET estado = 'en_proceso', updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado = 'borrador'`,
        [req.params.id, req.tenantId]
      )
      const detail = await getFolioDetail(req, req.params.id)
      res.status(201).json({ ...detail, added_order_id: result.rows[0].id })
    } catch (error) {
      console.error('Add order to folio error:', {
        message: error.message, code: error.code, detail: error.detail,
        constraint: error.constraint, table: error.table,
      })
      res.status(500).json({ error: 'Error agregando orden al folio' })
    }
  }
)

// Update order status in folio
router.put('/:id/orders/:orderId',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const { estado, notas, bultos, destinatario } = req.body
      const result = await req.tQuery(
        `UPDATE dispatch_folio_orders
         SET estado = COALESCE($1, estado),
             notas = COALESCE($2, notas),
             bultos = COALESCE($3, bultos),
             destinatario = COALESCE($4, destinatario)
         WHERE id = $5 AND folio_id = $6 AND tenant_id = $7
         RETURNING *`,
        [estado, notas, bultos, destinatario, req.params.orderId, req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Orden no encontrada en folio' })
      const detail = await getFolioDetail(req, req.params.id)
      res.json(detail)
    } catch (error) {
      console.error('Update folio order error:', error)
      res.status(500).json({ error: 'Error actualizando orden' })
    }
  }
)

// Add scan to order (accepts optional tarima_ref)
router.post('/:id/orders/:orderId/scans',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const { codigo_caja, tarima_ref = null } = req.body
      if (!codigo_caja?.trim()) return res.status(400).json({ error: 'codigo_caja requerido' })

      const folioRes = await req.tQuery(
        `SELECT estado FROM dispatch_folios WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.tenantId]
      )
      if (!folioRes.rows.length || !['borrador','en_proceso'].includes(folioRes.rows[0].estado)) {
        return res.status(409).json({ error: 'Folio no editable' })
      }

      await req.tQuery(
        `INSERT INTO dispatch_order_scans (tenant_id, folio_id, folio_order_id, codigo_caja, tarima_ref, validated_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.tenantId, req.params.id, req.params.orderId, codigo_caja.trim(), tarima_ref || null, req.user.id]
      )
      await syncOrderProgressById(req, req.params.orderId)
      const detail = await getFolioDetail(req, req.params.id)
      res.json(detail)
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Código ya escaneado en esta orden' })
      console.error('Add order scan error:', error)
      res.status(500).json({ error: 'Error registrando escaneo' })
    }
  }
)

// Delete last scan of an order
router.delete('/:id/orders/:orderId/scans/last',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const lastRes = await req.tQuery(
        `SELECT id FROM dispatch_order_scans
         WHERE folio_order_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [req.params.orderId, req.tenantId]
      )
      if (!lastRes.rows.length) return res.status(404).json({ error: 'No hay escaneos para eliminar' })

      await req.tQuery(
        `DELETE FROM dispatch_order_scans WHERE id = $1 AND tenant_id = $2`,
        [lastRes.rows[0].id, req.tenantId]
      )
      await syncOrderProgressById(req, req.params.orderId)
      const detail = await getFolioDetail(req, req.params.id)
      res.json(detail)
    } catch (error) {
      console.error('Delete last scan error:', error)
      res.status(500).json({ error: 'Error eliminando escaneo' })
    }
  }
)

// Remove an order from destination validation, including its folio-level scans
router.delete('/:id/destination-orders/:orderId',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const removed = await req.tTransaction(async (client) => {
        const folioRes = await client.query(
          `SELECT estado, tipo FROM dispatch_folios
           WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [req.params.id, req.tenantId]
        )
        if (folioRes.rows.length === 0) return { status: 404, error: 'Folio no encontrado' }
        if (!['borrador','en_proceso'].includes(folioRes.rows[0].estado)) {
          return { status: 409, error: 'El folio ya no se puede modificar' }
        }

        const orderRes = await client.query(
          `SELECT id, outbound_order_no
           FROM dispatch_folio_orders
           WHERE id = $1 AND folio_id = $2 AND tenant_id = $3
           FOR UPDATE`,
          [req.params.orderId, req.params.id, req.tenantId]
        )
        if (orderRes.rows.length === 0) return { status: 404, error: 'Orden no encontrada en folio' }

        const order = orderRes.rows[0]
        const scansDelRes = await client.query(
          `DELETE FROM dispatch_order_scans
           WHERE tenant_id = $1
             AND folio_id = $2
             AND (
               folio_order_id = $3
               OR matched_order_no = $4
             )
           RETURNING id`,
          [req.tenantId, req.params.id, order.id, order.outbound_order_no]
        )

        await client.query(
          `DELETE FROM dispatch_folio_orders
           WHERE id = $1 AND folio_id = $2 AND tenant_id = $3`,
          [req.params.orderId, req.params.id, req.tenantId]
        )

        await client.query(
          `UPDATE dispatch_folios SET updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [req.params.id, req.tenantId]
        )

        return { order, removedScans: scansDelRes.rows.length }
      })

      if (removed?.status) return res.status(removed.status).json({ error: removed.error })

      auditLog(req, 'DESPACHO_DESTINO_ORDER_REMOVE', 'dispatch_folio_order', removed.order.id, {
        folio_id: req.params.id,
        outbound_order_no: removed.order.outbound_order_no,
        removed_scans: removed.removedScans,
      })

      const detail = await getFolioDetail(req, req.params.id)
      res.json({ ...detail, removed_order_id: removed.order.id, removed_scans: removed.removedScans })
    } catch (error) {
      console.error('Remove destination folio order error:', error)
      res.status(500).json({ error: 'Error retirando orden del destino' })
    }
  }
)

// Remove order from folio
router.delete('/:id/orders/:orderId',
  authenticateToken, loadFullUser,
  requireDespachoValidar('eliminar'),
  async (req, res) => {
    try {
      const folioRes = await req.tQuery(
        `SELECT estado FROM dispatch_folios WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.tenantId]
      )
      if (folioRes.rows.length === 0) return res.status(404).json({ error: 'Folio no encontrado' })
      if (!['borrador','en_proceso'].includes(folioRes.rows[0].estado)) {
        return res.status(409).json({ error: 'El folio ya no se puede modificar' })
      }
      await req.tQuery(
        `DELETE FROM dispatch_folio_orders WHERE id = $1 AND folio_id = $2 AND tenant_id = $3`,
        [req.params.orderId, req.params.id, req.tenantId]
      )
      const detail = await getFolioDetail(req, req.params.id)
      res.json(detail)
    } catch (error) {
      console.error('Remove folio order error:', error)
      res.status(500).json({ error: 'Error eliminando orden del folio' })
    }
  }
)

// Close folio
router.post('/:id/cerrar',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `UPDATE dispatch_folios
         SET estado = 'cerrado', fecha_salida = COALESCE(fecha_salida, now()), updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado = 'en_proceso' AND deleted_at IS NULL
         RETURNING *`,
        [req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(409).json({ error: 'Solo se puede cerrar un folio en proceso' })
      auditLog(req, 'DESPACHO_FOLIO_CERRAR', 'dispatch_folio', req.params.id, {})
      res.json({ folio: result.rows[0] })
    } catch (error) {
      console.error('Cerrar folio error:', error)
      res.status(500).json({ error: 'Error cerrando folio' })
    }
  }
)

// Reopen folio — set closed folio back to en_proceso
router.post('/:id/reabrir',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `UPDATE dispatch_folios
         SET estado = 'en_proceso', updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado = 'cerrado' AND deleted_at IS NULL
         RETURNING *`,
        [req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(409).json({ error: 'Solo se puede reabrir un folio cerrado' })
      auditLog(req, 'DESPACHO_FOLIO_REABRIR', 'dispatch_folio', req.params.id, {})
      res.json({ folio: result.rows[0] })
    } catch (error) {
      console.error('Reabrir folio error:', error)
      res.status(500).json({ error: 'Error reabriendo folio' })
    }
  }
)

// Cancel folio — requires actualizar or higher (not eliminar)
router.post('/:id/cancelar',
  authenticateToken, loadFullUser,
  requireDespachoValidar('actualizar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `UPDATE dispatch_folios
         SET estado = 'cancelado', updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado IN ('borrador','en_proceso') AND deleted_at IS NULL
         RETURNING *`,
        [req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(409).json({ error: 'El folio no se puede cancelar' })
      res.json({ folio: result.rows[0] })
    } catch (error) {
      console.error('Cancelar folio error:', error)
      res.status(500).json({ error: 'Error cancelando folio' })
    }
  }
)

// Delete folio — only cancelled folios, requires eliminar
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'eliminar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `UPDATE dispatch_folios
         SET deleted_at = now(), updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado = 'cancelado' AND deleted_at IS NULL
         RETURNING id`,
        [req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Solo se pueden eliminar folios cancelados' })
      }
      auditLog(req, 'DESPACHO_FOLIO_DELETE', 'dispatch_folio', req.params.id, {})
      res.json({ ok: true })
    } catch (error) {
      console.error('Delete folio error:', error)
      res.status(500).json({ error: 'Error eliminando folio' })
    }
  }
)

export default router

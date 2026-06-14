import { Router } from 'express'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'

const router = Router()

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

async function getFolioDetail(req, folioId) {
  const folioRes = await req.tQuery(
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
     WHERE f.id = $1 AND f.tenant_id = $2
     GROUP BY f.id, c.nombre, c.licencia, c.telefono, u.placa, u.tipo, us.nombre_completo`,
    [folioId, req.tenantId]
  )
  if (folioRes.rows.length === 0) return null
  const ordersRes = await req.tQuery(
    `SELECT * FROM dispatch_folio_orders WHERE folio_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
    [folioId, req.tenantId]
  )
  return { folio: folioRes.rows[0], orders: ordersRes.rows }
}

// List folios
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'ver'),
  async (req, res) => {
    try {
      const { q = '', estado = '', fecha_inicio = '', fecha_fin = '' } = req.query
      const tz = req.fullUser?.zona_horaria || 'America/Mexico_City'
      const params = [req.tenantId]
      const where = ['f.tenant_id = $1']

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
                COUNT(fo.id) AS total_ordenes
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
      res.status(500).json({ error: 'Error obteniendo folios', detail: error.message })
    }
  }
)

// Dispatch status for outbound orders (which folio each order is in)
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
         WHERE fo.tenant_id = $1 AND f.estado IN ('borrador','en_proceso','cerrado')`,
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
  requirePermission('despacho.folios', 'crear'),
  async (req, res) => {
    try {
      const { conductor_id = null, unidad_id = null, notas = '' } = req.body
      const fecha_salida = req.body.fecha_salida === '' ? null : (req.body.fecha_salida ?? null)
      const folio_numero = await generateFolioNumero(req)
      const result = await req.tQuery(
        `INSERT INTO dispatch_folios (tenant_id, folio_numero, conductor_id, unidad_id, operador_id, fecha_salida, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [req.tenantId, folio_numero, conductor_id, unidad_id, req.user.id, fecha_salida, notas || null]
      )
      auditLog(req, 'DESPACHO_FOLIO_CREATE', 'dispatch_folio', result.rows[0].id, { folio_numero })
      res.status(201).json({ folio: result.rows[0] })
    } catch (error) {
      console.error('Create folio error:', error)
      res.status(500).json({ error: 'Error creando folio' })
    }
  }
)

// Get folio detail
router.get('/:id',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'ver'),
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

// Update folio metadata
router.put('/:id',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'actualizar'),
  async (req, res) => {
    try {
      const { conductor_id = null, unidad_id = null, notas = '' } = req.body
      const fecha_salida = req.body.fecha_salida === '' ? null : (req.body.fecha_salida ?? null)
      const result = await req.tQuery(
        `UPDATE dispatch_folios
         SET conductor_id = $1, unidad_id = $2, fecha_salida = $3, notas = $4, updated_at = now()
         WHERE id = $5 AND tenant_id = $6 AND estado IN ('borrador','en_proceso')
         RETURNING *`,
        [conductor_id, unidad_id, fecha_salida, notas || null, req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(409).json({ error: 'El folio ya no se puede editar' })
      res.json({ folio: result.rows[0] })
    } catch (error) {
      console.error('Update folio error:', error)
      res.status(500).json({ error: 'Error actualizando folio' })
    }
  }
)

// Add order to folio
router.post('/:id/orders',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'crear'),
  async (req, res) => {
    try {
      const { outbound_order_no, cliente = null, bultos = 1, notas = '' } = req.body
      const peso_kg = req.body.peso_kg === '' || req.body.peso_kg == null ? null : Number(req.body.peso_kg)
      if (!outbound_order_no) return res.status(400).json({ error: 'outbound_order_no es requerido' })

      const folioRes = await req.tQuery(
        `SELECT estado FROM dispatch_folios WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (folioRes.rows.length === 0) return res.status(404).json({ error: 'Folio no encontrado' })
      if (!['borrador','en_proceso'].includes(folioRes.rows[0].estado)) {
        return res.status(409).json({ error: 'El folio no acepta más órdenes' })
      }

      const result = await req.tQuery(
        `INSERT INTO dispatch_folio_orders (tenant_id, folio_id, outbound_order_no, cliente, bultos, peso_kg, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id, folio_id, outbound_order_no) DO UPDATE
           SET cliente = EXCLUDED.cliente, bultos = EXCLUDED.bultos, peso_kg = EXCLUDED.peso_kg, notas = EXCLUDED.notas
         RETURNING *`,
        [req.tenantId, req.params.id, outbound_order_no, cliente, bultos, peso_kg, notas || null]
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
        message: error.message,
        code: error.code,
        detail: error.detail,
        constraint: error.constraint,
        table: error.table,
      })
      res.status(500).json({ error: 'Error agregando orden al folio' })
    }
  }
)

// Update order status in folio
router.put('/:id/orders/:orderId',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'actualizar'),
  async (req, res) => {
    try {
      const { estado, notas, bultos } = req.body
      const peso_kg = req.body.peso_kg === '' || req.body.peso_kg == null ? null : Number(req.body.peso_kg)
      const result = await req.tQuery(
        `UPDATE dispatch_folio_orders
         SET estado = COALESCE($1, estado),
             notas = COALESCE($2, notas),
             bultos = COALESCE($3, bultos),
             peso_kg = COALESCE($4, peso_kg)
         WHERE id = $5 AND folio_id = $6 AND tenant_id = $7
         RETURNING *`,
        [estado, notas, bultos, peso_kg, req.params.orderId, req.params.id, req.tenantId]
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

// Remove order from folio
router.delete('/:id/orders/:orderId',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'eliminar'),
  async (req, res) => {
    try {
      const folioRes = await req.tQuery(
        `SELECT estado FROM dispatch_folios WHERE id = $1 AND tenant_id = $2`,
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
  requirePermission('despacho.folios', 'actualizar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `UPDATE dispatch_folios
         SET estado = 'cerrado', fecha_salida = COALESCE(fecha_salida, now()), updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado = 'en_proceso'
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

// Cancel folio
router.post('/:id/cancelar',
  authenticateToken, loadFullUser,
  requirePermission('despacho.folios', 'eliminar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `UPDATE dispatch_folios
         SET estado = 'cancelado', updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND estado IN ('borrador','en_proceso')
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

export default router

import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// ── Config ─────────────────────────────────────────────────────────────────

// GET /api/upapex/config
router.get('/config',
  authenticateToken, loadFullUser,
  requirePermission('sistema.wms', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT id, base_url, is_active, last_verified_at, created_at, updated_at,
                app_key, app_secret_encrypted, sheet_inventory_url, sheet_outbound_url
         FROM wms_config WHERE tenant_id = $1 AND is_active = true ORDER BY id DESC LIMIT 1`,
        [req.tenantId]
      )
      if (result.rows.length === 0) return res.json({ success: true, data: null })
      const row = result.rows[0]
      res.json({
        success: true,
        data: {
          id: row.id,
          base_url: row.base_url,
          is_active: row.is_active,
          last_verified_at: row.last_verified_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
          app_key_masked: row.app_key ? `****${row.app_key.slice(-4)}` : null,
          has_secret: !!row.app_secret_encrypted,
          sheet_inventory_url: row.sheet_inventory_url || null,
          sheet_outbound_url:  row.sheet_outbound_url  || null,
        },
      })
    } catch (err) {
      console.error('GET upapex/config error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo configuración Upapex' })
    }
  }
)

// PUT /api/upapex/config/sheets — save Google Sheets URLs
router.put('/config/sheets',
  authenticateToken, loadFullUser,
  requirePermission('sistema.wms', 'editar'),
  async (req, res) => {
    try {
      const { sheet_inventory_url, sheet_outbound_url } = req.body
      const existing = await req.tQuery(
        'SELECT id FROM wms_config WHERE tenant_id = $1 LIMIT 1',
        [req.tenantId]
      )
      if (existing.rows.length > 0) {
        await req.tQuery(
          'UPDATE wms_config SET sheet_inventory_url = $1, sheet_outbound_url = $2, updated_at = now() WHERE tenant_id = $3',
          [sheet_inventory_url || null, sheet_outbound_url || null, req.tenantId]
        )
      } else {
        await req.tQuery(
          'INSERT INTO wms_config (tenant_id, sheet_inventory_url, sheet_outbound_url) VALUES ($1, $2, $3)',
          [req.tenantId, sheet_inventory_url || null, sheet_outbound_url || null]
        )
      }
      res.json({ success: true })
    } catch (err) {
      console.error('PUT upapex/config/sheets error:', err.message)
      res.status(500).json({ success: false, error: 'Error guardando URLs de hojas' })
    }
  }
)

// GET /api/upapex/proxy/sheet?url= — CORS proxy for Google Sheets CSV
router.get('/proxy/sheet',
  authenticateToken, loadFullUser,
  async (req, res) => {
    try {
      const { url } = req.query
      if (!url || !url.startsWith('https://docs.google.com/')) {
        return res.status(400).json({ success: false, error: 'URL inválida: debe ser una hoja de Google' })
      }
      const upstream = await fetch(url, {
        headers: { Accept: 'text/csv,text/plain' },
        signal: AbortSignal.timeout(15000),
      })
      if (!upstream.ok) {
        return res.status(502).json({ success: false, error: `Error al acceder a la hoja: HTTP ${upstream.status}` })
      }
      const text = await upstream.text()
      res.set('Content-Type', 'text/plain; charset=utf-8').send(text)
    } catch (err) {
      console.error('GET upapex/proxy/sheet error:', err.message)
      res.status(502).json({ success: false, error: 'No se pudo obtener la hoja de cálculo' })
    }
  }
)

// ── Scan Sessions ──────────────────────────────────────────────────────────

// POST /api/upapex/scan-session — create new scan session
router.post('/scan-session',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'crear'),
  async (req, res) => {
    try {
      const { outbound_order_no, third_order_no, total_expected } = req.body
      if (!outbound_order_no) return res.status(400).json({ success: false, error: 'outbound_order_no es requerido' })

      const result = await req.tQuery(
        `INSERT INTO pick_sessions
           (tenant_id, outbound_order_no, third_order_no, operator_id, status, total_expected, total_scanned)
         VALUES ($1, $2, $3, $4, 'open', $5, 0)
         RETURNING *`,
        [req.tenantId, outbound_order_no, third_order_no || null, req.user.id, total_expected || 0]
      )
      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('POST upapex/scan-session error:', err.message)
      res.status(500).json({ success: false, error: 'Error creando sesión de escaneo' })
    }
  }
)

// GET /api/upapex/scan-sessions — list with pagination
router.get('/scan-sessions',
  authenticateToken, loadFullUser,
  requirePermission('surtido.registros', 'ver'),
  async (req, res) => {
    try {
      const { page = 1, pageSize = 20, status, operator_id, fecha_inicio, fecha_fin, outbound_order_no } = req.query
      const limit = Math.min(parseInt(pageSize) || 20, 100)
      const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit

      const conditions = ['s.tenant_id = $1']
      const params = [req.tenantId]
      let p = 2

      if (status) { conditions.push(`s.status = $${p++}`); params.push(status) }
      if (operator_id) { conditions.push(`s.operator_id = $${p++}`); params.push(parseInt(operator_id)) }
      if (fecha_inicio) { conditions.push(`s.started_at >= $${p++}`); params.push(fecha_inicio) }
      if (fecha_fin) { conditions.push(`s.started_at <= $${p++}`); params.push(fecha_fin) }
      if (outbound_order_no) { conditions.push(`s.outbound_order_no = $${p++}`); params.push(outbound_order_no) }

      const where = conditions.join(' AND ')
      const [sessionsRes, countRes] = await Promise.all([
        req.tQuery(
          `SELECT s.*, u.nombre_completo as operator_nombre
           FROM pick_sessions s
           LEFT JOIN usuarios u ON u.id = s.operator_id
           WHERE ${where}
           ORDER BY s.started_at DESC
           LIMIT $${p} OFFSET $${p + 1}`,
          [...params, limit, offset]
        ),
        req.tQuery(
          `SELECT COUNT(*) as total FROM pick_sessions s WHERE ${where}`,
          params
        ),
      ])

      res.json({
        success: true,
        data: {
          records: sessionsRes.rows,
          total: parseInt(countRes.rows[0].total),
          page: parseInt(page),
          pageSize: limit,
        },
      })
    } catch (err) {
      console.error('GET upapex/scan-sessions error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo sesiones' })
    }
  }
)

// GET /api/upapex/scan-session/:id
router.get('/scan-session/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.registros', 'ver'),
  async (req, res) => {
    try {
      const [sessionRes, eventsRes] = await Promise.all([
        req.tQuery(
          `SELECT s.*, u.nombre_completo as operator_nombre
           FROM pick_sessions s
           LEFT JOIN usuarios u ON u.id = s.operator_id
           WHERE s.id = $1 AND s.tenant_id = $2`,
          [req.params.id, req.tenantId]
        ),
        req.tQuery(
          'SELECT * FROM pick_events WHERE session_id = $1 ORDER BY scanned_at ASC',
          [req.params.id]
        ),
      ])

      if (sessionRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
      res.json({
        success: true,
        data: { session: sessionRes.rows[0], events: eventsRes.rows },
      })
    } catch (err) {
      console.error('GET upapex/scan-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo sesión' })
    }
  }
)

// PUT /api/upapex/scan-session/:id — update (complete, add notes, update counts)
router.put('/scan-session/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'crear'),
  async (req, res) => {
    try {
      const { status, notes, total_scanned, ubicacion_id } = req.body
      const sessionRes = await req.tQuery(
        'SELECT * FROM pick_sessions WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (sessionRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })

      const session = sessionRes.rows[0]
      if (session.operator_id !== req.user.id && req.fullUser.rol_nombre !== 'Administrador') {
        return res.status(403).json({ success: false, error: 'No autorizado para modificar esta sesión' })
      }

      const fields = []
      const params = []
      let p = 1
      if (status !== undefined) { fields.push(`status = $${p++}`); params.push(status) }
      if (notes !== undefined) { fields.push(`notes = $${p++}`); params.push(notes) }
      if (total_scanned !== undefined) { fields.push(`total_scanned = $${p++}`); params.push(total_scanned) }
      if (ubicacion_id !== undefined) { fields.push(`ubicacion_id = $${p++}`); params.push(ubicacion_id || null) }
      if (status === 'complete' || status === 'with_discrepancies') {
        fields.push(`completed_at = $${p++}`)
        params.push(new Date().toISOString())
      }
      fields.push(`updated_at = now()`)
      params.push(req.params.id, req.tenantId)

      const result = await req.tQuery(
        `UPDATE pick_sessions SET ${fields.join(', ')} WHERE id = $${p++} AND tenant_id = $${p} RETURNING *`,
        params
      )
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('PUT upapex/scan-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error actualizando sesión' })
    }
  }
)

// POST /api/upapex/scan-event — add scan event
router.post('/scan-event',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'crear'),
  async (req, res) => {
    try {
      const { session_id, scanned_code, normalized_code, matched_sku, matched_box_type, scan_result, quantity } = req.body
      if (!session_id || !scanned_code || !scan_result) {
        return res.status(400).json({ success: false, error: 'session_id, scanned_code y scan_result son requeridos' })
      }

      const sessionCheck = await req.tQuery(
        'SELECT id, operator_id FROM pick_sessions WHERE id = $1 AND tenant_id = $2 AND status = $3',
        [session_id, req.tenantId, 'open']
      )
      if (sessionCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Sesión no encontrada o no activa' })
      }

      const result = await req.tQuery(
        `INSERT INTO pick_events
           (session_id, scanned_code, normalized_code, matched_sku, matched_box_type, scan_result, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          session_id,
          scanned_code,
          normalized_code || scanned_code,
          matched_sku || null,
          matched_box_type || null,
          scan_result,
          quantity || 1,
        ]
      )

      // Update session scanned count when result is 'ok'
      if (scan_result === 'ok') {
        await req.tQuery(
          'UPDATE pick_sessions SET total_scanned = total_scanned + $1, updated_at = now() WHERE id = $2 AND tenant_id = $3',
          [quantity || 1, session_id, req.tenantId]
        )
      }

      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('POST upapex/scan-event error:', err.message)
      res.status(500).json({ success: false, error: 'Error registrando evento de escaneo' })
    }
  }
)

// ── Inventory Sessions (Inventario WMS) ────────────────────────────────────

// POST /api/upapex/inventory-session — create session with all scans (batch save)
router.post('/inventory-session',
  authenticateToken, loadFullUser,
  requirePermission('inventario.escaneo', 'crear'),
  async (req, res) => {
    try {
      const { scan_type, scans = [], notes, ubicacion_id } = req.body
      if (!scan_type || !['unificado', 'clasificacion'].includes(scan_type)) {
        return res.status(400).json({ success: false, error: 'scan_type inválido' })
      }

      const totals = scans.reduce((acc, s) => {
        acc.total++
        if (s.scan_status === 'ok') acc.ok++
        else if (s.scan_status === 'blocked') acc.blocked++
        else acc.nowms++
        return acc
      }, { total: 0, ok: 0, blocked: 0, nowms: 0 })

      const sessionRes = await req.tQuery(
        ubicacion_id
          ? `INSERT INTO inv_sessions
               (tenant_id, operator_id, scan_type, status, completed_at, notes, ubicacion_id,
                total_scans, total_ok, total_blocked, total_nowms)
             VALUES ($1, $2, $3, 'saved', now(), $4, $5, $6, $7, $8, $9)
             RETURNING *`
          : `INSERT INTO inv_sessions
               (tenant_id, operator_id, scan_type, status, completed_at, notes,
                total_scans, total_ok, total_blocked, total_nowms)
             VALUES ($1, $2, $3, 'saved', now(), $4, $5, $6, $7, $8)
             RETURNING *`,
        ubicacion_id
          ? [req.tenantId, req.user.id, scan_type, notes || null, ubicacion_id,
             totals.total, totals.ok, totals.blocked, totals.nowms]
          : [req.tenantId, req.user.id, scan_type, notes || null,
             totals.total, totals.ok, totals.blocked, totals.nowms]
      )
      const session = sessionRes.rows[0]

      if (scans.length > 0) {
        const values = scans.map((_, i) => {
          const b = i * 9
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`
        }).join(',')
        const params = scans.flatMap(s => [
          session.id, s.scanned_code, s.normalized_code, s.code2 || null,
          s.was_swapped || false, s.scan_status, s.sku || null,
          s.product_name || null, s.group_assignment || 'auto',
        ])
        await req.tQuery(
          `INSERT INTO inv_scans
             (session_id, scanned_code, normalized_code, code2, was_swapped,
              scan_status, sku, product_name, group_assignment)
           VALUES ${values}`,
          params
        )
      }

      res.status(201).json({ success: true, data: session })
    } catch (err) {
      console.error('POST upapex/inventory-session error:', err.message)
      res.status(500).json({ success: false, error: 'Error guardando sesión de inventario' })
    }
  }
)

// GET /api/upapex/inventory-sessions
router.get('/inventory-sessions',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'ver'),
  async (req, res) => {
    try {
      const { page = 1, pageSize = 20 } = req.query
      const limit = Math.min(parseInt(pageSize) || 20, 100)
      const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit

      const [rows, countRes] = await Promise.all([
        req.tQuery(
          `SELECT s.*, u.nombre_completo as operator_nombre
           FROM inv_sessions s
           LEFT JOIN usuarios u ON u.id = s.operator_id
           WHERE s.tenant_id = $1 AND s.status = 'saved'
           ORDER BY s.completed_at DESC
           LIMIT $2 OFFSET $3`,
          [req.tenantId, limit, offset]
        ),
        req.tQuery(
          'SELECT COUNT(*) as total FROM inv_sessions WHERE tenant_id = $1 AND status = $2',
          [req.tenantId, 'saved']
        ),
      ])
      res.json({
        success: true,
        data: { records: rows.rows, total: parseInt(countRes.rows[0].total), page: parseInt(page), pageSize: limit },
      })
    } catch (err) {
      console.error('GET upapex/inventory-sessions error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo sesiones de inventario' })
    }
  }
)

// GET /api/upapex/inventory-session/:id — with all scans
router.get('/inventory-session/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'ver'),
  async (req, res) => {
    try {
      const [sessionRes, scansRes] = await Promise.all([
        req.tQuery(
          `SELECT s.*, u.nombre_completo as operator_nombre
           FROM inv_sessions s
           LEFT JOIN usuarios u ON u.id = s.operator_id
           WHERE s.id = $1 AND s.tenant_id = $2`,
          [req.params.id, req.tenantId]
        ),
        req.tQuery(
          'SELECT * FROM inv_scans WHERE session_id = $1 ORDER BY scanned_at ASC',
          [req.params.id]
        ),
      ])
      if (sessionRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
      res.json({ success: true, data: { session: sessionRes.rows[0], scans: scansRes.rows } })
    } catch (err) {
      console.error('GET upapex/inventory-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo sesión' })
    }
  }
)

// DELETE /api/upapex/inventory-session/:id — only most recent allowed
router.delete('/inventory-session/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.admin', 'eliminar'),
  async (req, res) => {
    try {
      const mostRecent = await req.tQuery(
        `SELECT id FROM inv_sessions
         WHERE tenant_id = $1 AND status = 'saved'
         ORDER BY completed_at DESC LIMIT 1`,
        [req.tenantId]
      )
      if (mostRecent.rows.length === 0 || mostRecent.rows[0].id !== req.params.id) {
        return res.status(403).json({ success: false, error: 'Solo se puede eliminar el registro más reciente' })
      }
      await req.tQuery(
        'DELETE FROM inv_sessions WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      res.json({ success: true })
    } catch (err) {
      console.error('DELETE upapex/inventory-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error eliminando sesión' })
    }
  }
)

// ── Surtidores ─────────────────────────────────────────────────────────────

router.get('/surtidores',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'ver'),
  async (req, res) => {
    try {
      const rows = await req.tQuery(
        'SELECT * FROM pick_surtidores WHERE tenant_id = $1 AND activo = true ORDER BY nombre',
        [req.tenantId]
      )
      res.json({ success: true, data: rows.rows })
    } catch (err) {
      res.status(500).json({ success: false, error: 'Error obteniendo surtidores' })
    }
  }
)

router.post('/surtidores',
  authenticateToken, loadFullUser,
  requirePermission('surtido.assign', 'crear'),
  async (req, res) => {
    try {
      const { nombre } = req.body
      if (!nombre?.trim()) return res.status(400).json({ success: false, error: 'Nombre requerido' })
      const result = await req.tQuery(
        'INSERT INTO pick_surtidores (tenant_id, nombre) VALUES ($1, $2) RETURNING *',
        [req.tenantId, nombre.trim()]
      )
      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, error: 'Ya existe un surtidor con ese nombre' })
      res.status(500).json({ success: false, error: 'Error creando surtidor' })
    }
  }
)

router.delete('/surtidores/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.admin', 'eliminar'),
  async (req, res) => {
    try {
      await req.tQuery(
        'UPDATE pick_surtidores SET activo = false WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ success: false, error: 'Error eliminando surtidor' })
    }
  }
)

// ── Order Tracking ─────────────────────────────────────────────────────────

router.get('/order-tracking',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'ver'),
  async (req, res) => {
    try {
      const rows = await req.tQuery(
        `SELECT ot.*, s.nombre as surtidor_nombre_actual,
                (SELECT COUNT(*) FROM pick_sessions ss
                 WHERE ss.outbound_order_no = ot.outbound_order_no AND ss.tenant_id = ot.tenant_id) as session_count,
                (SELECT COALESCE(SUM(total_scanned),0) FROM pick_sessions ss
                 WHERE ss.outbound_order_no = ot.outbound_order_no AND ss.tenant_id = ot.tenant_id) as total_scanned
         FROM pick_order_tracking ot
         LEFT JOIN pick_surtidores s ON s.id = ot.surtidor_id
         WHERE ot.tenant_id = $1
         ORDER BY ot.updated_at DESC`,
        [req.tenantId]
      )
      res.json({ success: true, data: rows.rows })
    } catch (err) {
      console.error('GET order-tracking error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo seguimiento de órdenes' })
    }
  }
)

router.get('/order-tracking/:obc',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'ver'),
  async (req, res) => {
    try {
      const row = await req.tQuery(
        `SELECT ot.*, s.nombre as surtidor_nombre_actual
         FROM pick_order_tracking ot
         LEFT JOIN pick_surtidores s ON s.id = ot.surtidor_id
         WHERE ot.tenant_id = $1 AND ot.outbound_order_no = $2`,
        [req.tenantId, req.params.obc]
      )
      res.json({ success: true, data: row.rows[0] || null })
    } catch (err) {
      res.status(500).json({ success: false, error: 'Error obteniendo seguimiento' })
    }
  }
)

router.put('/order-tracking/:obc',
  authenticateToken, loadFullUser,
  requirePermission('surtido.assign', 'crear'),
  async (req, res) => {
    try {
      const { surtidor_id, status, notes, third_order_no } = req.body
      const existing = await req.tQuery(
        'SELECT id FROM pick_order_tracking WHERE tenant_id = $1 AND outbound_order_no = $2',
        [req.tenantId, req.params.obc]
      )

      let surtidorNombre = null
      if (surtidor_id) {
        const s = await req.tQuery('SELECT nombre FROM pick_surtidores WHERE id = $1 AND tenant_id = $2', [surtidor_id, req.tenantId])
        surtidorNombre = s.rows[0]?.nombre || null
      }

      if (existing.rows.length === 0) {
        const result = await req.tQuery(
          `INSERT INTO pick_order_tracking
             (tenant_id, outbound_order_no, third_order_no, surtidor_id, surtidor_nombre, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [req.tenantId, req.params.obc, third_order_no || null, surtidor_id || null,
           surtidorNombre, status || 'pending_assignment', notes || null]
        )
        return res.json({ success: true, data: result.rows[0] })
      }

      const fields = ['updated_at = now()']
      const params = []
      let p = 1
      if (status !== undefined) { fields.push(`status = $${p++}`); params.push(status) }
      if (surtidor_id !== undefined) {
        fields.push(`surtidor_id = $${p++}`); params.push(surtidor_id || null)
        fields.push(`surtidor_nombre = $${p++}`); params.push(surtidorNombre)
      }
      if (notes !== undefined) { fields.push(`notes = $${p++}`); params.push(notes) }
      params.push(req.tenantId, req.params.obc)

      const result = await req.tQuery(
        `UPDATE pick_order_tracking SET ${fields.join(', ')}
         WHERE tenant_id = $${p++} AND outbound_order_no = $${p} RETURNING *`,
        params
      )
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('PUT order-tracking error:', err.message)
      res.status(500).json({ success: false, error: 'Error actualizando seguimiento' })
    }
  }
)

// DELETE scan session events (for recount)
router.delete('/scan-session/:id/events',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'crear'),
  async (req, res) => {
    try {
      const sessionRes = await req.tQuery(
        'SELECT * FROM pick_sessions WHERE id = $1 AND tenant_id = $2 AND status = $3',
        [req.params.id, req.tenantId, 'open']
      )
      if (sessionRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada o cerrada' })

      await req.tQuery('DELETE FROM pick_events WHERE session_id = $1', [req.params.id])
      await req.tQuery(
        'UPDATE pick_sessions SET total_scanned = 0, updated_at = now() WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ success: false, error: 'Error reiniciando conteo' })
    }
  }
)

// GET /api/upapex/ubicaciones?modulo= — shared ubicaciones for Inventario and Surtido
router.get('/ubicaciones',
  authenticateToken, loadFullUser,
  async (req, res) => {
    try {
      const { modulo } = req.query
      const params = [req.tenantId]
      let filter = ''
      if (modulo && modulo !== 'todos') {
        filter = ` AND (modulo_uso @> ARRAY['todos'] OR modulo_uso @> ARRAY[$2])`
        params.push(modulo)
      }
      const result = await req.tQuery(
        `SELECT id, codigo, nombre FROM dev_ubicaciones WHERE tenant_id = $1 AND activo = true${filter} ORDER BY codigo ASC`,
        params
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      console.error('GET upapex/ubicaciones error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo ubicaciones' })
    }
  }
)

export default router

import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { generateRastreoFolio } from '../services/folioService.js'
import { crearAnormalidadRastreo } from '../services/anormalidadHelper.js'

const router = Router()

function normalizeCode(raw) {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9\-/]/g, '')
}

// ── GET /api/rastreo/buscar?q=<boxCode> — cross-DB box search ────────────────
router.get('/buscar',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const q = (req.query.q || '').trim()
      if (!q) return res.status(400).json({ error: 'Parámetro q requerido' })

      const [invRes, pickRes] = await Promise.all([
        // Inventario escaneo
        req.tQuery(
          `SELECT s.barcode, s.sku, s.product_name, s.cell_no, s.available_stock,
                  s.status, s.created_at,
                  u.nombre_completo AS operador,
                  sess.origin_location
           FROM inventory_scans s
           JOIN inventory_sessions sess ON sess.id = s.session_id
           JOIN usuarios u ON u.id = s.user_id
           WHERE s.tenant_id = $1
             AND (UPPER(s.barcode) = UPPER($2) OR s.barcode ILIKE $3)
           ORDER BY s.created_at DESC
           LIMIT 30`,
          [req.tenantId, q, `%${q}%`]
        ),
        // Surtido pick_events (validacion individual)
        req.tQuery(
          `SELECT pe.scanned_code, pe.scan_result, pe.created_at,
                  ps.outbound_order_no, ps.status AS session_status,
                  u.nombre_completo AS operador
           FROM pick_events pe
           JOIN pick_sessions ps ON ps.id = pe.session_id
           LEFT JOIN usuarios u ON u.id = ps.operator_id
           WHERE ps.tenant_id = $1
             AND (UPPER(pe.scanned_code) = UPPER($2) OR pe.scanned_code ILIKE $3)
           ORDER BY pe.created_at DESC
           LIMIT 30`,
          [req.tenantId, q, `%${q}%`]
        ),
      ])

      res.json({
        success: true,
        data: {
          inventario_escaneo: invRes.rows,
          surtido_validacion: pickRes.rows,
        },
      })
    } catch (err) {
      console.error('[rastreo.buscar]', err.message)
      res.status(500).json({ error: 'Error en la búsqueda' })
    }
  }
)

// ── GET /api/rastreo/usuarios/asignables ─────────────────────────────────────
router.get('/usuarios/asignables',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const rows = await req.tQuery(
        `SELECT id, nombre_completo, codigo, email
         FROM usuarios
         WHERE tenant_id = $1 AND estado = 'ACTIVO'
         ORDER BY nombre_completo`,
        [req.tenantId]
      )
      res.json({ success: true, data: rows.rows })
    } catch (err) {
      console.error('[rastreo.usuarios]', err.message)
      res.status(500).json({ error: 'Error al obtener usuarios' })
    }
  }
)

// ── GET /api/rastreo — lista paginada ────────────────────────────────────────
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const {
        page = 1, limit = 30,
        search, estado, asignado_a,
        sort = 'created_at', dir = 'DESC',
      } = req.query

      const offset = (parseInt(page) - 1) * parseInt(limit)
      const ALLOWED_SORT = new Set(['created_at', 'folio', 'estado', 'updated_at'])
      const sortCol = ALLOWED_SORT.has(sort) ? `ro.${sort}` : 'ro.created_at'
      const sortDir = dir === 'ASC' ? 'ASC' : 'DESC'

      let where = 'WHERE ro.tenant_id = $1'
      const params = [req.tenantId]
      let p = 2

      if (search) {
        where += ` AND (ro.folio ILIKE $${p} OR ro.outbound_order_no ILIKE $${p} OR ro.customer_code ILIKE $${p})`
        params.push(`%${search}%`)
        p++
      }
      if (estado) {
        where += ` AND ro.estado = $${p++}`
        params.push(estado)
      }
      if (asignado_a) {
        if (asignado_a === 'ninguno') {
          where += ` AND ro.asignado_a IS NULL`
        } else {
          where += ` AND ro.asignado_a = $${p++}`
          params.push(asignado_a)
        }
      }

      const [countRes, rowsRes] = await Promise.all([
        req.tQuery(`SELECT COUNT(*) FROM rastreo_ordenes ro ${where}`, params),
        req.tQuery(
          `SELECT ro.*,
                  u.nombre_completo AS asignado_nombre,
                  u2.nombre_completo AS creado_por_nombre,
                  (SELECT COUNT(*) FROM rastreo_cajas rc WHERE rc.rastreo_orden_id = ro.id) AS total_cajas,
                  (SELECT COUNT(*) FROM rastreo_cajas rc WHERE rc.rastreo_orden_id = ro.id AND rc.estado_caja = 'localizada') AS cajas_localizadas,
                  (SELECT COUNT(*) FROM rastreo_cajas rc WHERE rc.rastreo_orden_id = ro.id AND rc.estado_caja = 'no_encontrada') AS cajas_no_encontradas
           FROM rastreo_ordenes ro
           LEFT JOIN usuarios u ON u.id = ro.asignado_a AND u.tenant_id = ro.tenant_id
           LEFT JOIN usuarios u2 ON u2.id = ro.creado_por AND u2.tenant_id = ro.tenant_id
           ${where}
           ORDER BY ${sortCol} ${sortDir}
           LIMIT $${p++} OFFSET $${p++}`,
          [...params, parseInt(limit), offset]
        ),
      ])

      res.json({
        success: true,
        data: rowsRes.rows,
        meta: {
          total: parseInt(countRes.rows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
        },
      })
    } catch (err) {
      console.error('[rastreo.list]', err.message)
      res.status(500).json({ error: 'Error al obtener órdenes de rastreo' })
    }
  }
)

// ── GET /api/rastreo/:folio — detalle ────────────────────────────────────────
router.get('/:folio',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const [ordenRes, cajasRes, histRes] = await Promise.all([
        req.tQuery(
          `SELECT ro.*,
                  u.nombre_completo AS asignado_nombre,
                  u2.nombre_completo AS creado_por_nombre
           FROM rastreo_ordenes ro
           LEFT JOIN usuarios u ON u.id = ro.asignado_a AND u.tenant_id = ro.tenant_id
           LEFT JOIN usuarios u2 ON u2.id = ro.creado_por AND u2.tenant_id = ro.tenant_id
           WHERE ro.tenant_id = $1 AND ro.folio = $2`,
          [req.tenantId, req.params.folio]
        ),
        req.tQuery(
          `SELECT rc.*, a.folio AS anormalidad_folio
           FROM rastreo_cajas rc
           LEFT JOIN anormalidades a ON a.id = rc.anormalidad_id
           WHERE rc.tenant_id = $1 AND rc.rastreo_orden_id = (
             SELECT id FROM rastreo_ordenes WHERE tenant_id = $1 AND folio = $2 LIMIT 1
           )
           ORDER BY rc.created_at`,
          [req.tenantId, req.params.folio]
        ),
        req.tQuery(
          `SELECT rh.*, u.nombre_completo AS actor_nombre
           FROM rastreo_historial rh
           LEFT JOIN usuarios u ON u.id = rh.actor_id
           WHERE rh.tenant_id = $1 AND rh.rastreo_orden_id = (
             SELECT id FROM rastreo_ordenes WHERE tenant_id = $1 AND folio = $2 LIMIT 1
           )
           ORDER BY rh.created_at DESC`,
          [req.tenantId, req.params.folio]
        ),
      ])

      if (!ordenRes.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })

      res.json({
        success: true,
        data: {
          orden: ordenRes.rows[0],
          cajas: cajasRes.rows,
          historial: histRes.rows,
        },
      })
    } catch (err) {
      console.error('[rastreo.detail]', err.message)
      res.status(500).json({ error: 'Error al obtener detalle' })
    }
  }
)

// ── POST /api/rastreo — crear orden ──────────────────────────────────────────
router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'crear'),
  async (req, res) => {
    try {
      const {
        outbound_order_no,
        customer_code,
        asignado_a,
        notas,
        cajas = [],
      } = req.body

      if (!cajas.length) {
        return res.status(400).json({ error: 'Debe incluir al menos una caja' })
      }

      const folio = await generateRastreoFolio(req.tQuery, req.tenantId)
      const userId = req.fullUser.id
      const userName = req.fullUser.nombre_completo

      // Validate asignado_a exists in this tenant
      let asignadoId = null
      if (asignado_a) {
        const uRes = await req.tQuery(
          `SELECT id FROM usuarios WHERE id = $1 AND tenant_id = $2 AND estado = 'ACTIVO'`,
          [asignado_a, req.tenantId]
        )
        if (uRes.rows.length) asignadoId = parseInt(asignado_a)
      }

      // Build cajas with validated-in-surtido flag
      const cajasData = await Promise.all(cajas.map(async (c) => {
        const normalized = normalizeCode(c.box_code)
        let validada = false

        if (outbound_order_no) {
          const peRes = await req.tQuery(
            `SELECT 1 FROM pick_events pe
             JOIN pick_sessions ps ON ps.id = pe.session_id
             WHERE ps.tenant_id = $1 AND ps.outbound_order_no = $2
               AND pe.scan_result = 'ok' AND LOWER(pe.scanned_code) = LOWER($3)
             LIMIT 1`,
            [req.tenantId, outbound_order_no, c.box_code]
          )
          validada = peRes.rows.length > 0
        }

        return {
          box_code: c.box_code,
          box_code_normalized: normalized,
          ubicacion: c.ubicacion || null,
          producto: c.producto || null,
          cantidad_disponible: c.cantidad_disponible != null ? c.cantidad_disponible : null,
          validada_en_surtido: validada,
        }
      }))

      // Insert orden + cajas in one transaction
      const { tenantTransaction } = await import('../../../config/database.js')
      let ordenId

      await tenantTransaction(req.tenantId, async (client) => {
        const ordenRes = await client.query(
          `INSERT INTO rastreo_ordenes
             (tenant_id, folio, outbound_order_no, customer_code, asignado_a, creado_por, notas)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id`,
          [req.tenantId, folio, outbound_order_no || null, customer_code || null,
           asignadoId, userId, notas || null]
        )
        ordenId = ordenRes.rows[0].id

        for (const c of cajasData) {
          await client.query(
            `INSERT INTO rastreo_cajas
               (tenant_id, rastreo_orden_id, box_code, box_code_normalized,
                ubicacion, producto, cantidad_disponible, validada_en_surtido)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [req.tenantId, ordenId, c.box_code, c.box_code_normalized,
             c.ubicacion, c.producto, c.cantidad_disponible, c.validada_en_surtido]
          )
        }

        await client.query(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'creada',$3,$4)`,
          [req.tenantId, ordenId,
           `Orden creada con ${cajasData.length} caja(s)`,
           userId]
        )
      })

      res.status(201).json({ success: true, data: { folio, id: ordenId } })
    } catch (err) {
      console.error('[rastreo.create]', err.message)
      res.status(500).json({ error: 'Error al crear orden de rastreo' })
    }
  }
)

// ── PATCH /api/rastreo/:id — actualizar orden ────────────────────────────────
router.patch('/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { estado, asignado_a, notas, agregar_nota } = req.body
      const userId = req.fullUser.id
      const userName = req.fullUser.nombre_completo

      const existing = await req.tQuery(
        'SELECT id, estado, asignado_a, folio FROM rastreo_ordenes WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })

      const row = existing.rows[0]
      const updates = []
      const params = [req.params.id, req.tenantId]
      let p = 3

      if (estado && estado !== row.estado) {
        updates.push(`estado = $${p++}`)
        params.splice(p - 2, 0, estado)
      }
      if (asignado_a !== undefined) {
        const newVal = asignado_a ? parseInt(asignado_a) : null
        updates.push(`asignado_a = $${p++}`)
        params.splice(p - 2, 0, newVal)
      }
      if (notas !== undefined) {
        updates.push(`notas = $${p++}`)
        params.splice(p - 2, 0, notas)
      }

      // Agregar nota individual al historial (sin modificar la orden)
      if (agregar_nota) {
        await req.tQuery(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'nota',$3,$4)`,
          [req.tenantId, req.params.id, agregar_nota, userId]
        )
        if (!updates.length) return res.json({ success: true })
      }

      if (!updates.length) return res.json({ success: true })

      updates.push(`updated_at = now()`)

      await req.tQuery(
        `UPDATE rastreo_ordenes SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2`,
        params
      )

      const histDesc = estado && estado !== row.estado
        ? `Estado cambiado: ${row.estado} → ${estado}`
        : 'Orden actualizada'

      await req.tQuery(
        `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.tenantId, req.params.id,
         estado ? 'estado_cambiado' : 'nota',
         histDesc, userId]
      )

      res.json({ success: true })
    } catch (err) {
      console.error('[rastreo.update]', err.message)
      res.status(500).json({ error: 'Error al actualizar orden' })
    }
  }
)

// ── PATCH /api/rastreo/cajas/:id — cambiar estado caja ──────────────────────
router.patch('/cajas/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { estado_caja, notas } = req.body
      const userId = req.fullUser.id
      const userName = req.fullUser.nombre_completo

      const cajaRes = await req.tQuery(
        `SELECT rc.*, ro.folio AS orden_folio, ro.outbound_order_no, ro.id AS orden_id
         FROM rastreo_cajas rc
         JOIN rastreo_ordenes ro ON ro.id = rc.rastreo_orden_id
         WHERE rc.id = $1 AND rc.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (!cajaRes.rows.length) return res.status(404).json({ error: 'Caja no encontrada' })

      const caja = cajaRes.rows[0]

      const updates = [`estado_caja = $3`, `updated_at = now()`]
      const params = [req.params.id, req.tenantId, estado_caja]
      let p = 4

      if (notas !== undefined) {
        updates.push(`notas = $${p++}`)
        params.push(notas)
      }

      let anormalidadId = null
      if (estado_caja === 'no_encontrada' && !caja.anormalidad_id) {
        anormalidadId = await crearAnormalidadRastreo(req.tQuery, req.tenantId, {
          boxCode: caja.box_code,
          ordenFolio: caja.orden_folio,
          outboundOrderNo: caja.outbound_order_no,
          userId,
          userName,
        })
        if (anormalidadId) {
          updates.push(`anormalidad_id = $${p++}`)
          params.push(anormalidadId)
        }
      }

      await req.tQuery(
        `UPDATE rastreo_cajas SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2`,
        params
      )

      const accion = estado_caja === 'localizada' ? 'caja_localizada'
        : estado_caja === 'no_encontrada' ? 'caja_no_encontrada'
        : 'estado_cambiado'

      await req.tQuery(
        `INSERT INTO rastreo_historial
           (tenant_id, rastreo_orden_id, rastreo_caja_id, accion, descripcion, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.tenantId, caja.orden_id, caja.id, accion,
         `Caja ${caja.box_code}: ${estado_caja}`,
         userId]
      )

      res.json({ success: true, anormalidad_id: anormalidadId })
    } catch (err) {
      console.error('[rastreo.caja.update]', err.message)
      res.status(500).json({ error: 'Error al actualizar caja' })
    }
  }
)

// ── DELETE /api/rastreo/:id ───────────────────────────────────────────────────
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'eliminar'),
  async (req, res) => {
    try {
      const existing = await req.tQuery(
        'SELECT id FROM rastreo_ordenes WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })

      await req.tQuery(
        'DELETE FROM rastreo_ordenes WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )

      res.json({ success: true })
    } catch (err) {
      console.error('[rastreo.delete]', err.message)
      res.status(500).json({ error: 'Error al eliminar orden' })
    }
  }
)

export default router

import { Router } from 'express'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { getPermissionLevel, requirePermission, resolvePermission } from '../../../shared/middleware/permissions.js'
import { checkModuleLimit } from '../../middleware/usageGuard.js'
import { getRecepcionValidationRecordCount, refreshRecepcionOrderState } from '../utils/orderState.js'

const router = Router()
let inboundLineColumnsCache = null

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

function hasModulePermission(user, modulePath, action) {
  const isAdmin = user?.es_admin_tenant === true ||
    (user?.es_admin_tenant === undefined && user?.rol_nombre === 'Administrador')
  if (isAdmin) return true
  return resolvePermission(getPermissionLevel(user?.permisos, modulePath), action)
}

async function generateFolioNumero(req, db = null) {
  const runner = db || { query: (text, params) => req.tQuery(text, params) }
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const countRes = await runner.query(
    `SELECT COUNT(*) FROM inbound_orders WHERE tenant_id=$1 AND folio LIKE $2`,
    [req.tenantId, `INB-${dateStr}-%`]
  )
  const seq = String(parseInt(countRes.rows[0].count) + 1).padStart(4, '0')
  return `INB-${dateStr}-${seq}`
}

async function getInboundLineColumns(db) {
  if (inboundLineColumnsCache) return inboundLineColumnsCache
  const result = await db.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'inbound_lines'`
  )
  inboundLineColumnsCache = new Set(result.rows.map((row) => row.column_name))
  return inboundLineColumnsCache
}

function buildInboundLinesInsertPayload(lines, availableColumns, ctx) {
  const specs = [
    { column: 'tenant_id', type: 'uuid[]', values: (_, ctx) => ctx.tenantId },
    { column: 'order_id', type: 'uuid[]', values: (_, ctx) => ctx.orderId },
    { column: 'box_type', type: 'text[]', values: (line) => line.box_type || null },
    { column: 'custom_box_barcode', type: 'text[]', values: (line) => line.custom_box_barcode || null },
    { column: 'sku', type: 'text[]', values: (line) => line.sku || null },
    { column: 'qty_per_box', type: 'numeric[]', values: (line) => line.qty_per_box ?? null },
    { column: 'length_oms', type: 'numeric[]', values: (line) => line.length_oms ?? null },
    { column: 'width_oms', type: 'numeric[]', values: (line) => line.width_oms ?? null },
    { column: 'height_oms', type: 'numeric[]', values: (line) => line.height_oms ?? null },
    { column: 'dimension_unit', type: 'text[]', values: (line) => line.dimension_unit || null },
    { column: 'weight_oms', type: 'numeric[]', values: (line) => line.weight_oms ?? null },
    { column: 'weight_unit', type: 'text[]', values: (line) => line.weight_unit || null },
  ]

  const activeSpecs = specs.filter((spec) => availableColumns.has(spec.column))
  const columnsSql = activeSpecs.map((spec) => spec.column).join(', ')
  const unnestSql = activeSpecs.map((spec, index) => `$${index + 1}::${spec.type}`).join(', ')
  const params = activeSpecs.map((spec) => lines.map((line) => spec.values(line, ctx)))

  return { columnsSql, unnestSql, params, activeColumns: activeSpecs.map((spec) => spec.column) }
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
                    AND e.resultado = 'correcto'
                ), 0) + COALESCE((
                  SELECT COUNT(*)::int
                  FROM inbound_novedades n
                  WHERE n.order_id = o.id AND n.tenant_id = o.tenant_id
                    AND COALESCE(n.cuenta_conteo, true) = true
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
      if (lines.length > 50000) {
        return res.status(400).json({ error: `El límite máximo de importación es 50,000 registros. El archivo enviado contiene ${lines.length.toLocaleString()}.` })
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

      const order = await req.tTransaction(async (client) => {
        const availableColumns = await getInboundLineColumns(client)
        const folio = await generateFolioNumero(req, client)
        const orderRes = await client.query(
          `INSERT INTO inbound_orders (tenant_id, folio, cliente, inbound_order_no, tracking_no, reference_no, total_cajas, responsable_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [req.tenantId, folio, cliente || null, inboundOrderNo || null, tracking_no || null, reference_no || null, lines.length, req.user.id]
        )
        const createdOrder = orderRes.rows[0]
        const { columnsSql, unnestSql, params, activeColumns } = buildInboundLinesInsertPayload(
          lines,
          availableColumns,
          { tenantId: req.tenantId, orderId: createdOrder.id }
        )

        await client.query(
          `INSERT INTO inbound_lines (${columnsSql})
           SELECT * FROM UNNEST(${unnestSql})`,
          params
        )

        const skippedColumns = [
          'length_oms',
          'width_oms',
          'height_oms',
          'dimension_unit',
          'weight_oms',
          'weight_unit',
        ].filter((column) => !activeColumns.includes(column))
        if (skippedColumns.length > 0) {
          console.warn('[recepcion] create: inbound_lines missing optional columns, imported with fallback schema', {
            skippedColumns,
          })
        }

        return createdOrder
      })

      auditLog(req, 'RECEPCION_ORDER_CREATE', 'inbound_orders', order.id, { folio: order.folio, total_cajas: lines.length })
      res.status(201).json({ order })
    } catch (err) {
      console.error('[recepcion] create:', {
        message: err.message,
        code: err.code,
        detail: err.detail,
        hint: err.hint,
        stack: err.stack,
      })
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
      await refreshRecepcionOrderState(req, req.tenantId, orderId)

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
      await refreshRecepcionOrderState(req, req.tenantId, orderId)
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
        `SELECT
           o.id,
           o.folio,
           o.cliente,
           o.estado,
           o.total_cajas,
           o.cajas_validadas,
           o.cajas_forzadas,
           o.cajas_registradas,
           o.created_at,
           COUNT(*)::int AS matching_lines,
           COUNT(*) FILTER (WHERE l.estado_validacion = 'pendiente')::int AS pending_lines,
           COUNT(*) FILTER (
             WHERE l.estado_validacion = 'pendiente'
               AND (l.custom_box_barcode ILIKE $2 OR l.sku ILIKE $2)
           )::int AS pending_exact_lines,
           COUNT(*) FILTER (WHERE l.estado_validacion = 'validada')::int AS validated_lines,
           COUNT(*) FILTER (WHERE l.estado_validacion = 'faltante')::int AS missing_lines
         FROM inbound_orders o
         JOIN inbound_lines l ON l.order_id = o.id AND l.tenant_id = o.tenant_id
         WHERE o.tenant_id = $1 AND (
           l.custom_box_barcode = $2 OR l.sku = $2
           OR l.custom_box_barcode ILIKE $3 OR l.sku ILIKE $3
         )
         GROUP BY o.id, o.folio, o.cliente, o.estado, o.total_cajas, o.cajas_validadas, o.cajas_forzadas, o.cajas_registradas, o.created_at
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

// GET /orders/quick-box-search — PDA-friendly lookup by Box Type or Custom Box Barcode
router.get('/orders/quick-box-search',
  authenticateToken, loadFullUser,
  async (req, res) => {
    try {
      const canSearch = hasModulePermission(req.fullUser, 'recepcion.recibir', 'ver') ||
        hasModulePermission(req.fullUser, 'recepcion.validacion', 'ver')
      if (!canSearch) return res.status(403).json({ error: 'Permiso insuficiente' })

      const q = String(req.query.q || '').trim()
      if (q.length < 2) return res.status(400).json({ error: 'Ingresa al menos 2 caracteres' })

      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30))
      const like = `%${q}%`
      const result = await req.tQuery(
        `SELECT
           l.id AS line_id,
           l.box_type,
           l.custom_box_barcode,
           l.sku,
           l.qty_per_box,
           l.estado_validacion,
           l.validated_at,
           o.id AS order_id,
           o.folio,
           o.cliente,
           o.inbound_order_no,
           o.tracking_no,
           o.reference_no,
           o.estado AS order_estado,
           ev.id AS scan_event_id,
           ev.codigo_escaneado,
           ev.resultado AS scan_resultado,
           ev.scanned_at,
           ev.ubicacion,
           ev.scanned_by_nombre,
           COUNT(*) OVER()::int AS total_matches
         FROM inbound_lines l
         JOIN inbound_orders o ON o.id = l.order_id AND o.tenant_id = l.tenant_id
         LEFT JOIN LATERAL (
           SELECT e.id, e.codigo_escaneado, e.resultado, e.scanned_at, e.ubicacion,
                  u.nombre_completo AS scanned_by_nombre
             FROM inbound_scan_events e
             LEFT JOIN usuarios u ON u.id = e.scanned_by AND u.tenant_id = e.tenant_id
            WHERE e.tenant_id = l.tenant_id
              AND e.order_id = l.order_id
              AND (
                e.line_id = l.id
                OR (
                  e.line_id IS NULL
                  AND l.custom_box_barcode IS NOT NULL
                  AND UPPER(e.codigo_escaneado) = UPPER(l.custom_box_barcode)
                )
              )
            ORDER BY CASE WHEN e.resultado = 'correcto' THEN 0 ELSE 1 END, e.scanned_at DESC, e.id DESC
            LIMIT 1
         ) ev ON true
         WHERE l.tenant_id = $1
           AND (
             l.custom_box_barcode ILIKE $2
             OR l.box_type ILIKE $2
           )
         ORDER BY
           CASE
             WHEN l.custom_box_barcode = $3 THEN 0
             WHEN l.box_type = $3 THEN 1
             WHEN l.custom_box_barcode ILIKE $4 THEN 2
             WHEN l.box_type ILIKE $4 THEN 3
             ELSE 4
           END,
           ev.scanned_at DESC NULLS LAST,
           o.created_at DESC,
           l.created_at ASC
         LIMIT $5`,
        [req.tenantId, like, q, `${q}%`, limit]
      )
      res.json({
        results: result.rows.map(({ total_matches, ...row }) => row),
        count: result.rows.length,
        total: result.rows[0]?.total_matches || 0,
      })
    } catch (err) {
      console.error('[recepcion] quick-box-search:', err.message)
      res.status(500).json({ error: 'Error al buscar cajas de recepción' })
    }
  }
)

// GET /orders/:id — order detail with lines
router.get('/orders/:id',
  authenticateToken, loadFullUser,
  requirePermission('recepcion.recibir', 'ver'),
  async (req, res) => {
    let client
    try {
      const page = Math.max(1, parseInt(req.query.lines_page, 10) || 1)
      const requestedLimit = parseInt(req.query.lines_limit, 10) || 100
      const maxLimit = req.query.validation_mode === '1' ? 10000 : 500
      const limit = Math.min(maxLimit, Math.max(25, requestedLimit))
      const offset = (page - 1) * limit
      const q = String(req.query.lines_q || '').trim()
      const sortKey = String(req.query.lines_sort_key || 'created_at')
      const sortDir = String(req.query.lines_sort_dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
      const sortColumns = {
        box_type: 'l.box_type',
        custom_box_barcode: 'l.custom_box_barcode',
        sku: 'l.sku',
        qty_per_box: 'l.qty_per_box',
        estado_validacion: 'l.estado_validacion',
        validated_by_nombre: 'u.nombre_completo',
        validated_at: 'l.validated_at',
        created_at: 'l.created_at',
      }
      const sortColumn = sortColumns[sortKey] || sortColumns.created_at
      const includeLines = req.query.include_lines !== '0'

      client = await req.tGetClient()

      const orderRes = await client.query(
        `SELECT o.*, u.nombre_completo AS responsable_nombre
         FROM inbound_orders o
         LEFT JOIN usuarios u ON u.id = o.responsable_id
         WHERE o.id=$1 AND o.tenant_id=$2`,
        [req.params.id, req.tenantId]
      )
      if (orderRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Orden no encontrada' })
      }

      const statsRes = await client.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE estado_validacion='validada')::int AS validada,
           COUNT(*) FILTER (WHERE estado_validacion='faltante')::int AS faltante,
           COUNT(*) FILTER (WHERE estado_validacion='pendiente')::int AS pendiente
         FROM inbound_lines
         WHERE order_id=$1 AND tenant_id=$2`,
        [req.params.id, req.tenantId]
      )

      const where = ['l.order_id=$1', 'l.tenant_id=$2']
      const params = [req.params.id, req.tenantId]
      if (q) {
        params.push(`%${q}%`)
        const p = `$${params.length}`
        where.push(`(
          l.box_type ILIKE ${p}
          OR l.custom_box_barcode ILIKE ${p}
          OR l.sku ILIKE ${p}
          OR l.id::text ILIKE ${p}
          OR l.qty_per_box::text ILIKE ${p}
          OR l.estado_validacion ILIKE ${p}
          OR u.nombre_completo ILIKE ${p}
          OR COALESCE(l.validated_at::text, '') ILIKE ${p}
          OR COALESCE(l.created_at::text, '') ILIKE ${p}
        )`)
      }
      const whereClause = where.join(' AND ')

      const filteredTotal = q
        ? Number((await client.query(
            `SELECT COUNT(*)::int AS total
             FROM inbound_lines l
             LEFT JOIN usuarios u ON u.id = l.validated_by
             WHERE ${whereClause}`,
            params
          )).rows[0]?.total || 0)
        : Number(statsRes.rows[0]?.total || 0)

      if (!includeLines) {
        await client.query('COMMIT')
        return res.json({
          order: orderRes.rows[0],
          lines: [],
          lines_meta: {
            page,
            limit: 0,
            total: filteredTotal,
            total_all: Number(statsRes.rows[0]?.total || 0),
            lines_loaded: false,
            status_counts: {
              validada: Number(statsRes.rows[0]?.validada || 0),
              faltante: Number(statsRes.rows[0]?.faltante || 0),
              pendiente: Number(statsRes.rows[0]?.pendiente || 0),
            },
          },
        })
      }

      const linesParams = [...params, limit, offset]
      const linesRes = await client.query(
        `SELECT l.*, u.nombre_completo AS validated_by_nombre
         FROM inbound_lines l
         LEFT JOIN usuarios u ON u.id = l.validated_by
         WHERE ${whereClause}
         ORDER BY ${sortColumn} ${sortDir} NULLS LAST, l.created_at ASC, l.id ASC
         LIMIT $${linesParams.length - 1} OFFSET $${linesParams.length}`,
        linesParams
      )

      await client.query('COMMIT')
      res.json({
        order: orderRes.rows[0],
        lines: linesRes.rows,
        lines_meta: {
          page,
          limit,
          total: filteredTotal,
          total_all: Number(statsRes.rows[0]?.total || 0),
          lines_loaded: true,
          status_counts: {
            validada: Number(statsRes.rows[0]?.validada || 0),
            faltante: Number(statsRes.rows[0]?.faltante || 0),
            pendiente: Number(statsRes.rows[0]?.pendiente || 0),
          },
        },
      })
    } catch (err) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('[recepcion] detail:', err.message)
      res.status(500).json({ error: 'Error al obtener detalle de orden', detalle: err.message })
    } finally {
      if (client) client.release()
    }
  }
)

// PATCH /orders/:id — update order state
router.patch('/orders/:id',
  authenticateToken, loadFullUser,
  async (req, res) => {
    let client
    try {
      const { estado, validation_config, reconfigure_tarimas } = req.body
      const allowed = ['pendiente_validacion', 'en_validacion', 'completo', 'parcial', 'cancelado', 'anormal']
      if (estado && !allowed.includes(estado)) return res.status(400).json({ error: 'Estado inválido' })
      const updatingState = estado !== undefined
      const updatingValidationConfig = validation_config !== undefined
      const canUpdateRecepcion = hasModulePermission(req.fullUser, 'recepcion.recibir', 'actualizar')
      const canUpdateValidation = hasModulePermission(req.fullUser, 'recepcion.validacion', 'actualizar')
      if (updatingState && !canUpdateRecepcion) {
        return res.status(403).json({ error: 'No tienes permisos para actualizar la orden' })
      }
      if (updatingValidationConfig && !canUpdateValidation && !canUpdateRecepcion) {
        return res.status(403).json({ error: 'No tienes permisos para actualizar la configuración de validación' })
      }
      if (reconfigure_tarimas === true && !canUpdateValidation) {
        return res.status(403).json({ error: 'No tienes permisos para reconfigurar tarimas' })
      }
      if (!updatingState && !updatingValidationConfig) {
        return res.status(400).json({ error: 'No hay cambios para actualizar' })
      }

      const updates = ['updated_at=now()']
      const params = [req.params.id, req.tenantId]
      let shouldResetTarimaNumbering = false

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
        if (currentConfig?.mode !== 'tarimas' && nextConfig.mode === 'tarimas') {
          const validationRecords = await getRecepcionValidationRecordCount(req, req.tenantId, req.params.id)
          if (validationRecords > 0) {
            return res.status(409).json({ error: 'La clasificación de tarimas no se puede activar porque ya hay registros en modo normal' })
          }
        }
        if (currentConfig?.mode === 'tarimas' && currentConfig?.locked === true) {
          const reconfigureRequested = reconfigure_tarimas === true
          const disablingTarimas = nextConfig.mode !== 'tarimas'
          if (disablingTarimas) {
            const validationRecords = await getRecepcionValidationRecordCount(req, req.tenantId, req.params.id)
            if (validationRecords > 0) {
              return res.status(409).json({ error: 'La clasificación de tarimas no se puede desactivar porque ya hay registros de validación' })
            }
          }
          const sameLockedConfig =
            nextConfig.mode === 'tarimas' &&
            nextConfig.locked === true &&
            Boolean(currentConfig.sectionMode) === nextConfig.sectionMode &&
            parseInt(currentConfig.maxTarimasPerSection || 20, 10) === nextConfig.maxTarimasPerSection &&
            Boolean(currentConfig.groupSmallCodes) === nextConfig.groupSmallCodes &&
            parseInt(currentConfig.minCajasParaAgrupar || 3, 10) === nextConfig.minCajasParaAgrupar &&
            parseInt(currentConfig.maxCajasEnGrupo || 10, 10) === nextConfig.maxCajasEnGrupo &&
            Boolean(currentConfig.sortTarimasByCountDesc) === nextConfig.sortTarimasByCountDesc

          if (!disablingTarimas && !sameLockedConfig && (!reconfigureRequested || !canUpdateValidation)) {
            return res.status(409).json({ error: 'La configuración de tarimas ya está bloqueada para esta orden' })
          }
          shouldResetTarimaNumbering = reconfigureRequested && canUpdateValidation && nextConfig.mode === 'tarimas'
        }
        params.push(JSON.stringify(nextConfig))
        updates.push(`validation_config=$${params.length}::jsonb`)
      }

      client = await req.tGetClient()
      const result = await client.query(
        `UPDATE inbound_orders SET ${updates.join(', ')}
         WHERE id=$1 AND tenant_id=$2 RETURNING *`,
        params
      )
      if (result.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Orden no encontrada' })
      }
      let tarimaNumberingCleared = 0
      if (shouldResetTarimaNumbering) {
        const clearRes = await client.query(
          `UPDATE inbound_scan_events
           SET ubicacion = NULL
           WHERE order_id=$1
             AND tenant_id=$2
             AND resultado='correcto'
             AND ubicacion IS NOT NULL`,
          [req.params.id, req.tenantId]
        )
        tarimaNumberingCleared = clearRes.rowCount || 0
      }
      await client.query('COMMIT')
      res.json({ order: result.rows[0], tarima_numbering_cleared: tarimaNumberingCleared })
    } catch (err) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('[recepcion] update order:', err.message)
      res.status(500).json({ error: 'Error al actualizar orden' })
    } finally {
      if (client) client.release()
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

      const validationRecords = await getRecepcionValidationRecordCount(client, req.tenantId, req.params.id)

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

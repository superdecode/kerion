import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { getPermissionLevel } from '../../../shared/middleware/permissions.js'
import { generateRastreoFolioForClient } from '../services/folioService.js'
import { crearAnormalidadRastreo, crearAnormalidadRastreoConsolidada } from '../services/anormalidadHelper.js'
import { normalizeCode } from '../../../shared/utils/codeNormalization.js'

const router = Router()
const EXACT_RESULT_LIMIT = 120
const FLEXIBLE_RESULT_LIMIT = 180

const STATUS_ALIASES = {
  resuelta: 'completada',
  cerrada: 'cancelada',
}

const VALID_ESTADOS = ['abierta', 'en_proceso', 'parcial', 'completada', 'cancelada']

const ESTADO_LABELS = {
  abierta: 'Abierta',
  en_proceso: 'En proceso',
  parcial: 'Parcial',
  completada: 'Finalizada',
  cancelada: 'Cancelada',
}

const ESTADO_TRANSITIONS = {
  abierta: new Set(['en_proceso', 'parcial', 'completada', 'cancelada']),
  en_proceso: new Set(['parcial', 'completada', 'cancelada']),
  parcial: new Set(['en_proceso', 'completada', 'cancelada']),
  completada: new Set(['parcial', 'cancelada']),
  cancelada: new Set(['parcial', 'completada']),
}

const tableColumnCache = new Map()

function normalizeEstado(raw) {
  if (!raw) return raw
  return STATUS_ALIASES[raw] || raw
}

function persistEstado(raw) {
  const normalized = normalizeEstado(raw)
  if (normalized === 'completada') return 'resuelta'
  if (normalized === 'cancelada') return 'cerrada'
  return normalized
}

function expandEstadoValues(raw) {
  const normalized = normalizeEstado(raw)
  if (normalized === 'completada') return ['completada', 'resuelta']
  if (normalized === 'cancelada') return ['cancelada', 'cerrada']
  return [normalized]
}

function canTransitionEstado(currentRaw, nextRaw) {
  const current = normalizeEstado(currentRaw)
  const next = normalizeEstado(nextRaw)
  if (!current || !next) return false
  if (current === next) return true
  return ESTADO_TRANSITIONS[current]?.has(next) || false
}

function stripCode(raw) {
  return normalizeCode(raw).replace(/[^A-Z0-9]/g, '')
}

function canonicalCodeKey(raw) {
  const normalized = normalizeCode(raw)
  const embedded = normalized.match(/\d{6,}[-/]\d+/)
  return stripCode(embedded?.[0] || normalized)
}

function extractBaseCode(raw) {
  if (!raw) return ''
  let base = normalizeCode(raw).split('/')[0].split('-')[0]
  const uMatch = base.match(/^(.+?)U\d+$/)
  if (uMatch) base = uMatch[1]
  const zeroMatch = base.match(/^(.+?)0{3,8}\d*$/)
  if (zeroMatch) base = zeroMatch[1]
  return base || normalizeCode(raw)
}

function getSearchTokens(raw) {
  const normalized = normalizeCode(raw)
  const altNormalized = normalized.includes('-')
    ? normalized.replace(/-/g, '/')
    : normalized.replace(/\//g, '-')
  const compact = stripCode(raw)
  const baseCode = extractBaseCode(normalized)
  const baseCompact = baseCode && baseCode !== normalized ? stripCode(baseCode) : ''
  return {
    normalized,
    altNormalized: altNormalized === normalized ? '' : altNormalized,
    compact,
    baseCode,
    baseCompact: baseCompact.length >= 6 ? baseCompact : '',
    exactVariants: [...new Set([normalized, altNormalized].filter(Boolean))],
    partialVariants: [...new Set([normalized, altNormalized].filter(Boolean).map(code => `%${code}%`))],
  }
}

function normalizeOptionalText(raw) {
  if (raw === undefined || raw === null) return null
  const value = String(raw).trim()
  return value || null
}

function normalizeOptionalNumber(raw) {
  if (raw === undefined || raw === null || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function buildMedidasSnapshot(raw) {
  const direct = normalizeOptionalText(
    raw?.medidas
    || raw?.measures
    || raw?.measure
    || raw?.dimensions
    || raw?.dimension
    || raw?.size
    || raw?.specification
    || raw?.spec
  )
  if (direct) return direct

  const largo = normalizeOptionalText(raw?.largo || raw?.length)
  const ancho = normalizeOptionalText(raw?.ancho || raw?.width)
  const alto = normalizeOptionalText(raw?.alto || raw?.height)
  const unit = normalizeOptionalText(raw?.unidad_medida || raw?.measure_unit || raw?.dimension_unit || raw?.unit)
  if (!largo && !ancho && !alto) return null

  const parts = [largo, ancho, alto].filter(Boolean)
  if (!parts.length) return null
  return `${parts.join(' × ')}${unit ? ` ${unit}` : ''}`
}

function buildAnyCodeMatch(columns, { exactParam, compactParam, baseParam }) {
  if (!columns.length) return 'FALSE'
  const upperCols = columns.map(col => `UPPER(COALESCE(${col}, '')) = ANY($${exactParam}::text[])`).join(' OR ')
  const compactCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') = ANY($${compactParam}::text[])`).join(' OR ')
  const baseCols = columns.map(col => `EXISTS (
    SELECT 1 FROM unnest($${baseParam}::text[]) AS base_code
    WHERE base_code <> ''
      AND REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') LIKE base_code || '%'
  )`).join(' OR ')
  return `(${upperCols} OR ${compactCols} OR ${baseCols})`
}

function buildCajaData(raw) {
  const boxCode = normalizeOptionalText(raw?.box_code || raw?.customizeCode || raw?.customize_code || raw?.boxType || raw?.box_type)
  const boxType = normalizeOptionalText(raw?.box_type || raw?.boxType)
  if (!boxCode) return null

  const tokens = getSearchTokens(boxCode)
  return {
    box_code: boxCode,
    box_code_normalized: tokens.normalized,
    box_type: boxType,
    ubicacion: normalizeOptionalText(raw?.ubicacion || raw?.cellNo || raw?.cell_no),
    medidas: buildMedidasSnapshot(raw),
    producto: normalizeOptionalText(raw?.producto || raw?.productName || raw?.product_name),
    cantidad_disponible: normalizeOptionalNumber(raw?.cantidad_disponible ?? raw?.availableAmount ?? raw?.available_stock),
    validada_en_surtido: false,
  }
}

async function isCajaValidadaEnSurtido(queryable, tenantId, outboundOrderNo, caja) {
  if (!outboundOrderNo || !caja?.box_code) return false

  const candidates = [caja.box_code, caja.box_type].filter(Boolean)
  const tokenList = candidates.map(getSearchTokens)
  const exactVariants = [...new Set(tokenList.flatMap(t => t.exactVariants))]
  const compactVariants = [...new Set(tokenList.map(t => t.compact).filter(Boolean))]
  const baseVariants = [...new Set(tokenList.map(t => t.baseCompact).filter(Boolean))]
  if (!exactVariants.length && !compactVariants.length && !baseVariants.length) return false

  try {
    const cols = await getTableColumns(queryable, 'pick_events')
    const matchColumns = ['scanned_code', 'normalized_code', 'matched_box_type']
      .filter(col => cols.has(col))
      .map(col => `pe.${col}`)
    if (!matchColumns.length) return false

    const peRes = await runDbQuery(
      queryable,
      `SELECT 1
         FROM pick_events pe
         JOIN pick_sessions ps ON ps.id = pe.session_id
        WHERE ps.tenant_id = $1
          AND ps.outbound_order_no = $2
          AND pe.scan_result = 'ok'
          AND ${buildAnyCodeMatch(matchColumns, { exactParam: 3, compactParam: 4, baseParam: 5 })}
        LIMIT 1`,
      [tenantId, outboundOrderNo, exactVariants, compactVariants, baseVariants]
    )
    return peRes.rows.length > 0
  } catch (peErr) {
    console.error('[rastreo.validacionSurtido] non-fatal:', peErr.message, peErr.code || '')
    return false
  }
}

async function findRastreoDuplicates(queryable, tenantId, { outboundOrderNo, cajasData }) {
  const duplicates = []
  const normalizedBoxes = [...new Set((cajasData || []).map(c => c.box_code_normalized).filter(Boolean))]

  if (outboundOrderNo) {
    const orderRes = await runDbQuery(
      queryable,
      `SELECT ro.id, ro.folio, ro.outbound_order_no, ro.created_at, ro.estado,
              u.nombre_completo AS asignado_nombre
         FROM rastreo_ordenes ro
         LEFT JOIN usuarios u ON u.id = ro.asignado_a AND u.tenant_id = ro.tenant_id
        WHERE ro.tenant_id = $1
          AND UPPER(COALESCE(ro.outbound_order_no, '')) = UPPER($2)
        ORDER BY ro.created_at DESC
        LIMIT 5`,
      [tenantId, outboundOrderNo]
    )
    for (const row of orderRes.rows) {
      duplicates.push({
        type: 'orden',
        folio: row.folio,
        rastreo_orden_id: row.id,
        outbound_order_no: row.outbound_order_no,
        created_at: row.created_at,
        estado: normalizeEstado(row.estado),
        asignado_nombre: row.asignado_nombre,
      })
    }
  }

  if (normalizedBoxes.length) {
    const boxRes = await runDbQuery(
      queryable,
      `SELECT rc.box_code, rc.box_code_normalized, rc.estado_caja,
              ro.id AS rastreo_orden_id, ro.folio, ro.outbound_order_no, ro.created_at, ro.estado,
              u.nombre_completo AS asignado_nombre
         FROM rastreo_cajas rc
         JOIN rastreo_ordenes ro ON ro.id = rc.rastreo_orden_id AND ro.tenant_id = rc.tenant_id
         LEFT JOIN usuarios u ON u.id = ro.asignado_a AND u.tenant_id = ro.tenant_id
        WHERE rc.tenant_id = $1
          AND rc.box_code_normalized = ANY($2::text[])
        ORDER BY ro.created_at DESC
        LIMIT 20`,
      [tenantId, normalizedBoxes]
    )
    for (const row of boxRes.rows) {
      duplicates.push({
        type: 'caja',
        folio: row.folio,
        rastreo_orden_id: row.rastreo_orden_id,
        outbound_order_no: row.outbound_order_no,
        box_code: row.box_code,
        box_code_normalized: row.box_code_normalized,
        estado_caja: row.estado_caja,
        created_at: row.created_at,
        estado: normalizeEstado(row.estado),
        asignado_nombre: row.asignado_nombre,
      })
    }
  }

  const seen = new Set()
  return duplicates.filter(item => {
    const key = [item.type, item.folio, item.box_code_normalized || item.outbound_order_no || ''].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildMatchCase(columns, { exactParam, compactParam, baseParam, partialParam }) {
  const upperCols = columns.map(col => `UPPER(COALESCE(${col}, '')) = ANY($${exactParam}::text[])`).join(' OR ')
  const compactCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') = $${compactParam}`).join(' OR ')
  const baseCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') LIKE $${baseParam}::text || '%'`).join(' OR ')
  const partialCols = columns.map(col => `${col} ILIKE ANY($${partialParam}::text[])`).join(' OR ')
  return `CASE
    WHEN ${upperCols} THEN 'exact'
    WHEN ${compactCols} THEN 'normalized'
    WHEN COALESCE($${baseParam}::text, '') <> '' AND (${baseCols}) THEN 'base'
    WHEN ${partialCols} THEN 'partial'
    ELSE NULL
  END`
}

function buildFlexibleMatchWhere(columns, params) {
  return `(${buildMatchCase(columns, params)}) IS NOT NULL`
}

function buildStrictCodeMatch(columns, { exactParam, compactParam, baseParam }) {
  const upperCols = columns.map(col => `UPPER(COALESCE(${col}, '')) = ANY($${exactParam}::text[])`).join(' OR ')
  const compactCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') = $${compactParam}`).join(' OR ')
  const baseCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') LIKE $${baseParam}::text || '%'`).join(' OR ')
  return `(
    ${upperCols}
    OR ${compactCols}
    OR (COALESCE($${baseParam}::text, '') <> '' AND (${baseCols}))
  )`
}

function buildExactOnlyWhere(columns, { exactParam, compactParam }) {
  const upperCols = columns.map(col => `UPPER(COALESCE(${col}, '')) = ANY($${exactParam}::text[])`).join(' OR ')
  const compactCols = columns.map(col => `REGEXP_REPLACE(UPPER(COALESCE(${col}, '')), '[^A-Z0-9]', '', 'g') = $${compactParam}`).join(' OR ')
  return `(${upperCols} OR ${compactCols})`
}

async function runDbQuery(queryable, text, params = []) {
  if (typeof queryable === 'function') return queryable(text, params)
  return queryable.query(text, params)
}

// Allowlist tables introspected via string interpolation (SELECT * FROM ${tableName}).
// All callers pass literals; this blocks any future caller passing user input.
const INTROSPECTABLE_TABLES = new Set(['pick_events', 'rastreo_cajas', 'rastreo_ordenes', 'rastreo_historial'])

async function getTableColumns(queryable, tableName) {
  if (tableColumnCache.has(tableName)) return tableColumnCache.get(tableName)
  if (!INTROSPECTABLE_TABLES.has(tableName)) {
    throw new Error(`Unsupported table for column introspection: ${String(tableName).slice(0, 40)}`)
  }
  let cols
  try {
    const probe = await runDbQuery(queryable, `SELECT * FROM ${tableName} LIMIT 0`, [])
    cols = new Set((probe.fields || []).map((field) => field.name))
  } catch {
    const result = await runDbQuery(
      queryable,
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    )
    cols = new Set(result.rows.map((row) => row.column_name))
  }
  tableColumnCache.set(tableName, cols)
  return cols
}

async function hasTableColumn(queryable, tableName, columnName) {
  const cols = await getTableColumns(queryable, tableName)
  return cols.has(columnName)
}

async function insertRastreoCajaSnapshot(client, tenantId, ordenId, cajaData, { hasBoxType, hasMedidas }) {
  const fields = ['tenant_id', 'rastreo_orden_id', 'box_code', 'box_code_normalized']
  const values = [tenantId, ordenId, cajaData.box_code, cajaData.box_code_normalized]

  if (hasBoxType) {
    fields.push('box_type')
    values.push(cajaData.box_type)
  }

  fields.push('ubicacion')
  values.push(cajaData.ubicacion)

  if (hasMedidas) {
    fields.push('medidas')
    values.push(cajaData.medidas)
  }

  fields.push('producto', 'cantidad_disponible', 'validada_en_surtido')
  values.push(cajaData.producto, cajaData.cantidad_disponible, cajaData.validada_en_surtido)

  const placeholders = values.map((_, index) => `$${index + 1}`).join(',')
  return runDbQuery(
    client,
    `INSERT INTO rastreo_cajas (${fields.join(', ')})
     VALUES (${placeholders})
     RETURNING id`,
    values
  )
}

function dedupeRows(rows, keyFn) {
  const seen = new Set()
  return rows.filter(row => {
    const key = keyFn(row)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Run thunks with bounded concurrency, preserving result order.
// `limit` caps how many DB connections are used at once so parallel search
// queries don't starve the pool for other concurrent requests.
async function runLimited(thunks, limit) {
  const results = new Array(thunks.length)
  let next = 0
  async function worker() {
    while (next < thunks.length) {
      const idx = next++
      results[idx] = await thunks[idx]()
    }
  }
  const workers = Array.from({ length: Math.min(limit, thunks.length) }, worker)
  await Promise.all(workers)
  return results
}

// ── GET /api/rastreo/causas — catálogo causa tipos ───────────────────────────
router.get('/causas',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT id, descripcion, area, activo, created_at, updated_at
         FROM rastreo_causa_tipos
         WHERE tenant_id = $1
         ORDER BY area, descripcion`,
        [req.tenantId]
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      console.error('[rastreo.causas.list]', err.message)
      res.status(500).json({ error: 'Error al obtener causas de rastreo' })
    }
  }
)

// ── POST /api/rastreo/causas — crear causa tipo ───────────────────────────────
router.post('/causas',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'crear'),
  async (req, res) => {
    try {
      const { descripcion, area } = req.body
      if (!descripcion?.trim() || !area?.trim()) {
        return res.status(400).json({ error: 'descripcion y area son requeridos' })
      }
      const result = await req.tQuery(
        `INSERT INTO rastreo_causa_tipos (tenant_id, descripcion, area)
         VALUES ($1, $2, $3)
         RETURNING id, descripcion, area, activo, created_at`,
        [req.tenantId, descripcion.trim(), area.trim()]
      )
      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('[rastreo.causas.create]', err.message)
      res.status(500).json({ error: 'Error al crear causa de rastreo' })
    }
  }
)

// ── PATCH /api/rastreo/causas/:id — editar causa tipo ────────────────────────
router.patch('/causas/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { descripcion, area, activo } = req.body
      const updates = []
      const values = [req.params.id, req.tenantId]
      let p = 3
      if (descripcion !== undefined) { updates.push(`descripcion = $${p++}`); values.push(descripcion.trim()) }
      if (area !== undefined) { updates.push(`area = $${p++}`); values.push(area.trim()) }
      if (activo !== undefined) { updates.push(`activo = $${p++}`); values.push(activo) }
      if (!updates.length) return res.status(400).json({ error: 'Sin cambios' })
      updates.push(`updated_at = now()`)
      const result = await req.tQuery(
        `UPDATE rastreo_causa_tipos SET ${updates.join(', ')}
         WHERE id = $1 AND tenant_id = $2
         RETURNING id, descripcion, area, activo`,
        values
      )
      if (!result.rows.length) return res.status(404).json({ error: 'Causa no encontrada' })
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('[rastreo.causas.update]', err.message)
      res.status(500).json({ error: 'Error al actualizar causa' })
    }
  }
)

// ── DELETE /api/rastreo/causas/:id — eliminar causa tipo ─────────────────────
router.delete('/causas/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'eliminar'),
  async (req, res) => {
    try {
      const inUse = await req.tQuery(
        `SELECT 1 FROM rastreo_cajas WHERE causa_rastreo_id = $1 AND tenant_id = $2 LIMIT 1`,
        [req.params.id, req.tenantId]
      )
      if (inUse.rows.length) {
        return res.status(409).json({ error: 'La causa está en uso y no puede eliminarse' })
      }
      const result = await req.tQuery(
        `DELETE FROM rastreo_causa_tipos WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [req.params.id, req.tenantId]
      )
      if (!result.rows.length) return res.status(404).json({ error: 'Causa no encontrada' })
      res.json({ success: true })
    } catch (err) {
      console.error('[rastreo.causas.delete]', err.message)
      res.status(500).json({ error: 'Error al eliminar causa' })
    }
  }
)

// ── POST /api/rastreo/cajas/bulk/causa — asignación masiva de causa ───────────
router.post('/cajas/bulk/causa',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { caja_ids, causa_rastreo_id } = req.body
      if (!caja_ids?.length) return res.status(400).json({ error: 'caja_ids requeridos' })
      const causaId = causa_rastreo_id || null
      const placeholders = caja_ids.map((_, i) => `$${i + 3}`).join(',')
      await req.tQuery(
        `UPDATE rastreo_cajas SET causa_rastreo_id = $1, updated_at = now()
         WHERE tenant_id = $2 AND id IN (${placeholders})`,
        [causaId, req.tenantId, ...caja_ids]
      )
      res.json({ success: true, updated: caja_ids.length })
    } catch (err) {
      console.error('[rastreo.cajas.bulk.causa]', err.message)
      res.status(500).json({ error: 'Error al asignar causa masiva' })
    }
  }
)

// ── GET /api/rastreo/buscar?q=<boxCode> ──────────────────────────────────────
router.get('/buscar',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const q = (req.query.q || '').trim()
      const mode = req.query.mode === 'exact' ? 'exact' : 'flexible'
      if (!q) return res.status(400).json({ error: 'Parámetro q requerido' })
      if (mode === 'flexible' && q.length < 3) {
        return res.status(400).json({ error: 'La búsqueda flexible requiere al menos 3 caracteres' })
      }
      const resultLimit = mode === 'exact' ? EXACT_RESULT_LIMIT : FLEXIBLE_RESULT_LIMIT
      const tokens = getSearchTokens(q)
      const hasRastreoBoxType = await hasTableColumn(req.tQuery, 'rastreo_cajas', 'box_type')
      const rastreoMatchColumns = hasRastreoBoxType
        ? ['rc.box_code', 'rc.box_code_normalized', 'rc.box_type', 'ro.outbound_order_no']
        : ['rc.box_code', 'rc.box_code_normalized', 'ro.outbound_order_no']
      const matchParams = {
        exactParam: 2,
        compactParam: 3,
        baseParam: 4,
        partialParam: 5,
      }

      const inventoryWhere = mode === 'exact'
        ? buildExactOnlyWhere(['s.barcode'], matchParams)
        : buildFlexibleMatchWhere(['s.barcode'], matchParams)
      const registrosWhere = mode === 'exact'
        ? buildExactOnlyWhere(['sc.scanned_code', 'sc.normalized_code', 'sc.code2'], matchParams)
        : buildFlexibleMatchWhere(['sc.scanned_code', 'sc.normalized_code', 'sc.code2'], matchParams)
      const surtidoWhere = mode === 'exact'
        ? buildExactOnlyWhere(['pe.scanned_code', 'pe.normalized_code', 'pe.matched_box_type', 'ps.outbound_order_no'], matchParams)
        : buildFlexibleMatchWhere(['pe.scanned_code', 'pe.normalized_code', 'pe.matched_box_type', 'ps.outbound_order_no'], matchParams)
      const rastreoWhere = mode === 'exact'
        ? buildExactOnlyWhere(rastreoMatchColumns, matchParams)
        : buildFlexibleMatchWhere(rastreoMatchColumns, matchParams)
      const inboundWhere = mode === 'exact'
        ? buildExactOnlyWhere(['il.custom_box_barcode', 'il.box_type', 'io.inbound_order_no'], matchParams)
        : buildFlexibleMatchWhere(['il.custom_box_barcode', 'il.box_type', 'io.inbound_order_no'], matchParams)
      const despOrdenesWhere = mode === 'exact'
        ? buildExactOnlyWhere(['dfo.outbound_order_no', 'df.folio_numero'], matchParams)
        : buildFlexibleMatchWhere(['dfo.outbound_order_no', 'df.folio_numero'], matchParams)

      const searchParams = [req.tenantId, tokens.exactVariants, tokens.compact, tokens.baseCompact, tokens.partialVariants]
      const flexibleSearchParams = [...searchParams, mode !== 'exact']
      const invT = () => req.tQuery(
          `SELECT s.barcode, s.sku, s.product_name, s.cell_no, s.available_stock,
                  s.status, s.created_at,
                  u.nombre_completo AS operador,
                  sess.origin_location,
                  ${buildMatchCase(['s.barcode'], matchParams)} AS match_type
           FROM inventory_scans s
           JOIN inventory_sessions sess ON sess.id = s.session_id
           JOIN usuarios u ON u.id = s.user_id
           WHERE u.tenant_id = $1
             AND ${inventoryWhere}
           ORDER BY
             CASE ${buildMatchCase(['s.barcode'], matchParams)}
               WHEN 'exact' THEN 1
               WHEN 'normalized' THEN 2
               WHEN 'base' THEN 3
               ELSE 4
             END,
             s.created_at DESC
           LIMIT ${resultLimit}`,
          searchParams
        )
        const invRegT = () => req.tQuery(
          // sc.cell_no is the SKU's current/official stock cell (a snapshot of the inventory
          // list at scan time), not where this scan was actually registered. The session tracks
          // both: origin_location (free text — where the operator counted from) and ubicacion_id
          // (the scanned destino location). Show both instead of the stock snapshot.
          `SELECT sc.id, sc.scanned_code, sc.normalized_code, sc.code2, sc.scan_status,
                  sess.origin_location,
                  ub.codigo AS ubicacion_destino_codigo, ub.nombre AS ubicacion_destino_nombre,
                  sc.group_assignment, sc.scanned_at,
                  sess.id AS session_id, sess.scan_type,
                  u_op.nombre_completo AS operator_nombre,
                  ${buildMatchCase(['sc.scanned_code', 'sc.normalized_code', 'sc.code2'], matchParams)} AS match_type
           FROM inv_scans sc
           JOIN inv_sessions sess ON sess.id = sc.session_id
           LEFT JOIN usuarios u_op ON u_op.id = sess.operator_id
           LEFT JOIN dev_ubicaciones ub ON ub.id = sess.ubicacion_id
           WHERE sess.tenant_id = $1
             AND ${registrosWhere}
           ORDER BY
             CASE ${buildMatchCase(['sc.scanned_code', 'sc.normalized_code', 'sc.code2'], matchParams)}
               WHEN 'exact' THEN 1
               WHEN 'normalized' THEN 2
               WHEN 'base' THEN 3
               ELSE 4
             END,
             sc.scanned_at DESC
           LIMIT ${resultLimit}`,
          searchParams
        )
        const pickT = () => req.tQuery(
          `SELECT pe.scanned_code, pe.scan_result, pe.scanned_at AS created_at,
                  pe.normalized_code, pe.matched_box_type,
                  ps.outbound_order_no, ps.status AS session_status,
                  u.nombre_completo AS operador,
                  COALESCE(ub.codigo, ps.ubicacion_nota) AS ubicacion_codigo,
                  ${buildMatchCase(['pe.scanned_code', 'pe.normalized_code', 'pe.matched_box_type', 'ps.outbound_order_no'], matchParams)} AS match_type
           FROM pick_events pe
           JOIN pick_sessions ps ON ps.id = pe.session_id
           LEFT JOIN usuarios u ON u.id = ps.operator_id
           LEFT JOIN dev_ubicaciones ub ON ub.id = ps.ubicacion_id AND ub.tenant_id = ps.tenant_id
           WHERE ps.tenant_id = $1
             AND ${surtidoWhere}
           ORDER BY
             CASE ${buildMatchCase(['pe.scanned_code', 'pe.normalized_code', 'pe.matched_box_type', 'ps.outbound_order_no'], matchParams)}
               WHEN 'exact' THEN 1
               WHEN 'normalized' THEN 2
               WHEN 'base' THEN 3
               ELSE 4
             END,
             pe.scanned_at DESC
           LIMIT ${resultLimit}`,
          searchParams
        )
        const pickStatusT = () => req.tQuery(
          `SELECT
             pbs.box_code AS scanned_code,
             pbs.box_code AS normalized_code,
             NULL::text AS matched_box_type,
             pbs.outbound_order_no,
             CASE
              WHEN UPPER(COALESCE(pbs.box_code, '')) = ANY($2::text[])
                OR UPPER(COALESCE(pbs.outbound_order_no, '')) = ANY($2::text[]) THEN 'exact'
              WHEN REGEXP_REPLACE(UPPER(COALESCE(pbs.box_code, '')), '[^A-Z0-9]', '', 'g') = $3 THEN 'normalized'
              WHEN $6::boolean AND COALESCE($4::text, '') <> '' AND REGEXP_REPLACE(UPPER(COALESCE(pbs.box_code, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%' THEN 'base'
              WHEN $6::boolean AND (pbs.box_code ILIKE ANY($5::text[]) OR pbs.outbound_order_no ILIKE ANY($5::text[])) THEN 'partial'
              ELSE 'partial'
            END AS match_type,
             CASE
               WHEN pbs.estado = 'validada' THEN 'ok'
               WHEN pbs.estado = 'faltante' THEN 'rejected'
               WHEN pbs.estado = 'anormalidad' THEN 'duplicate'
               ELSE 'duplicate'
             END AS scan_result,
             pbs.estado AS box_status,
             pbs.updated_at AS created_at,
             pbs.updated_by AS operador,
             COALESCE(ub.codigo, latest_ps.ubicacion_nota) AS ubicacion_codigo
           FROM pick_box_status pbs
           LEFT JOIN LATERAL (
             SELECT ps2.ubicacion_id, ps2.ubicacion_nota
               FROM pick_sessions ps2
              WHERE ps2.tenant_id = pbs.tenant_id AND ps2.outbound_order_no = pbs.outbound_order_no
              ORDER BY ps2.started_at DESC
              LIMIT 1
           ) latest_ps ON true
           LEFT JOIN dev_ubicaciones ub ON ub.id = latest_ps.ubicacion_id AND ub.tenant_id = pbs.tenant_id
           WHERE pbs.tenant_id = $1
             AND (
              UPPER(COALESCE(pbs.box_code, '')) = ANY($2::text[])
              OR REGEXP_REPLACE(UPPER(COALESCE(pbs.box_code, '')), '[^A-Z0-9]', '', 'g') = $3
               OR ($6::boolean AND COALESCE($4::text, '') <> '' AND REGEXP_REPLACE(UPPER(COALESCE(pbs.box_code, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%')
               OR ($6::boolean AND pbs.box_code ILIKE ANY($5::text[]))
               OR UPPER(COALESCE(pbs.outbound_order_no, '')) = ANY($2::text[])
               OR REGEXP_REPLACE(UPPER(COALESCE(pbs.outbound_order_no, '')), '[^A-Z0-9]', '', 'g') = $3
               OR ($6::boolean AND pbs.outbound_order_no ILIKE ANY($5::text[]))
             )
           ORDER BY
             CASE
               WHEN UPPER(COALESCE(pbs.box_code, '')) = ANY($2::text[])
                 OR UPPER(COALESCE(pbs.outbound_order_no, '')) = ANY($2::text[]) THEN 1
               WHEN REGEXP_REPLACE(UPPER(COALESCE(pbs.box_code, '')), '[^A-Z0-9]', '', 'g') = $3 THEN 2
               ELSE 3
             END,
             pbs.updated_at DESC
           LIMIT ${resultLimit}`,
          flexibleSearchParams
        )
        const rastreoT = () => req.tQuery(
          `WITH inbound_xref AS (
             SELECT DISTINCT il.custom_box_barcode AS xref_barcode
             FROM inbound_lines il
             JOIN inbound_orders io ON io.id = il.order_id
             WHERE io.tenant_id = $1
               AND (
                 UPPER(COALESCE(il.box_type, '')) = ANY($2::text[])
                 OR REGEXP_REPLACE(UPPER(COALESCE(il.box_type, '')), '[^A-Z0-9]', '', 'g') = $3
               )
               AND il.custom_box_barcode IS NOT NULL
           )
           SELECT rc.id, rc.box_code, rc.box_code_normalized, ${hasRastreoBoxType ? 'rc.box_type' : 'NULL::text AS box_type'}, rc.estado_caja, rc.ubicacion,
                  rc.producto, rc.validada_en_surtido, rc.created_at, rc.updated_at,
                  ro.folio, ro.outbound_order_no, ro.estado AS orden_estado,
                  COALESCE(
                    ${buildMatchCase(rastreoMatchColumns, matchParams)},
                    'triangulated'
             ) AS match_type
           FROM rastreo_cajas rc
           JOIN rastreo_ordenes ro ON ro.id = rc.rastreo_orden_id
           WHERE rc.tenant_id = $1
             AND (
               ${rastreoWhere}
               OR rc.box_code IN (SELECT xref_barcode FROM inbound_xref)
               OR rc.box_code_normalized IN (SELECT xref_barcode FROM inbound_xref)
             )
           ORDER BY
             CASE COALESCE(
               ${buildMatchCase(rastreoMatchColumns, matchParams)},
               'triangulated'
             )
               WHEN 'exact' THEN 1
               WHEN 'normalized' THEN 2
               WHEN 'base' THEN 3
               WHEN 'triangulated' THEN 5
               ELSE 4
             END,
             rc.updated_at DESC
           LIMIT ${resultLimit}`,
          searchParams
        )
        const inboundT = () => req.tQuery(
          `WITH recepcion_matches AS (
             SELECT
               il.id::text AS id,
               'linea'::text AS recepcion_tipo_registro,
               il.order_id,
               il.custom_box_barcode,
               il.box_type,
               il.sku,
               il.qty_per_box,
               il.estado_validacion,
               il.validated_at,
               il.created_at,
               il.box_type AS otros_tipo,
               u_val.nombre_completo AS validated_by_nombre,
               io.folio,
               io.cliente,
               io.inbound_order_no,
               io.tracking_no,
               io.estado AS orden_estado,
               ${buildMatchCase(['il.custom_box_barcode', 'il.box_type', 'io.inbound_order_no'], matchParams)} AS match_type
             FROM inbound_lines il
             JOIN inbound_orders io ON io.id = il.order_id
             LEFT JOIN usuarios u_val ON u_val.id = il.validated_by AND u_val.tenant_id = io.tenant_id
             WHERE io.tenant_id = $1
               AND ${inboundWhere}

             UNION ALL

             SELECT
               n.id::text AS id,
               'otros'::text AS recepcion_tipo_registro,
               n.order_id,
               n.codigo AS custom_box_barcode,
               NULL::text AS box_type,
               NULL::text AS sku,
               NULL::numeric AS qty_per_box,
               NULL::text AS estado_validacion,
               n.created_at AS validated_at,
               n.created_at,
               n.tipo AS otros_tipo,
               u_nov.nombre_completo AS validated_by_nombre,
               io.folio,
               io.cliente,
               io.inbound_order_no,
               io.tracking_no,
               io.estado AS orden_estado,
               CASE
                 WHEN UPPER(COALESCE(n.codigo, '')) = ANY($2::text[])
                   OR UPPER(COALESCE(n.tipo, '')) = ANY($2::text[])
                   OR UPPER(COALESCE(io.inbound_order_no, '')) = ANY($2::text[]) THEN 'exact'
                 WHEN REGEXP_REPLACE(UPPER(COALESCE(n.codigo, '')), '[^A-Z0-9]', '', 'g') = $3
                   OR REGEXP_REPLACE(UPPER(COALESCE(n.tipo, '')), '[^A-Z0-9]', '', 'g') = $3 THEN 'normalized'
                 WHEN $6::boolean AND COALESCE($4::text, '') <> ''
                   AND (
                     REGEXP_REPLACE(UPPER(COALESCE(n.codigo, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                     OR REGEXP_REPLACE(UPPER(COALESCE(n.tipo, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   ) THEN 'base'
                 ELSE 'partial'
               END AS match_type
             FROM inbound_novedades n
             JOIN inbound_orders io ON io.id = n.order_id
             LEFT JOIN usuarios u_nov ON u_nov.id = n.created_by AND u_nov.tenant_id = io.tenant_id
             WHERE io.tenant_id = $1
               AND (
                 UPPER(COALESCE(n.codigo, '')) = ANY($2::text[])
                 OR UPPER(COALESCE(n.tipo, '')) = ANY($2::text[])
                 OR UPPER(COALESCE(io.inbound_order_no, '')) = ANY($2::text[])
                 OR REGEXP_REPLACE(UPPER(COALESCE(n.codigo, '')), '[^A-Z0-9]', '', 'g') = $3
                 OR REGEXP_REPLACE(UPPER(COALESCE(n.tipo, '')), '[^A-Z0-9]', '', 'g') = $3
                 OR (
                   $6::boolean AND COALESCE($4::text, '') <> ''
                   AND (
                     REGEXP_REPLACE(UPPER(COALESCE(n.codigo, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                     OR REGEXP_REPLACE(UPPER(COALESCE(n.tipo, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   )
                 )
                 OR ($6::boolean AND n.codigo ILIKE ANY($5::text[]))
                 OR ($6::boolean AND n.tipo ILIKE ANY($5::text[]))
                 OR ($6::boolean AND io.inbound_order_no ILIKE ANY($5::text[]))
               )
           )
           SELECT *
           FROM recepcion_matches
           ORDER BY
             CASE match_type
               WHEN 'exact' THEN 1
               WHEN 'normalized' THEN 2
               WHEN 'base' THEN 3
               ELSE 4
             END,
             created_at DESC
           LIMIT ${resultLimit}`,
          flexibleSearchParams
        )
        const anormT = () => req.tQuery(
          `SELECT a.id, a.folio, a.codigo, a.descripcion, a.contenedor_orden,
                 a.nombre, a.proceso, a.cliente, a.almacen, a.sku, a.ubicacion,
                 ac.codigo AS codigo_anormalidad, ac.nombre_es AS tipo_anormalidad,
                 a.estado, a.fecha_ocurrencia, a.created_at,
                  CASE
                    WHEN UPPER(COALESCE(a.folio, '')) = ANY($2::text[])
                      OR UPPER(COALESCE(a.codigo, '')) = ANY($2::text[])
                      OR UPPER(COALESCE(a.contenedor_orden, '')) = ANY($2::text[])
                      OR REGEXP_REPLACE(UPPER(COALESCE(a.folio, '')), '[^A-Z0-9]', '', 'g') = $3
                      OR REGEXP_REPLACE(UPPER(COALESCE(a.codigo, '')), '[^A-Z0-9]', '', 'g') = $3
                      OR REGEXP_REPLACE(UPPER(COALESCE(a.contenedor_orden, '')), '[^A-Z0-9]', '', 'g') = $3 THEN 'exact'
                    WHEN $6::boolean AND COALESCE($4::text, '') <> ''
                      AND (
                        REGEXP_REPLACE(UPPER(COALESCE(a.folio, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                        OR REGEXP_REPLACE(UPPER(COALESCE(a.codigo, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                        OR REGEXP_REPLACE(UPPER(COALESCE(a.contenedor_orden, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                        OR REGEXP_REPLACE(UPPER(COALESCE(a.sku, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                      ) THEN 'base'
                    WHEN $6::boolean AND a.descripcion ILIKE ANY($5::text[]) THEN 'partial'
                    ELSE 'partial'
                  END AS match_type
            FROM anormalidades a
           LEFT JOIN anormalidades_codigos ac ON ac.id = a.codigo_id
           WHERE a.tenant_id = $1
             AND (
               UPPER(COALESCE(a.folio, '')) = ANY($2::text[])
               OR UPPER(COALESCE(a.codigo, '')) = ANY($2::text[])
               OR UPPER(COALESCE(a.nombre, '')) = ANY($2::text[])
               OR UPPER(COALESCE(a.proceso, '')) = ANY($2::text[])
               OR UPPER(COALESCE(a.cliente, '')) = ANY($2::text[])
               OR UPPER(COALESCE(a.almacen, '')) = ANY($2::text[])
               OR UPPER(COALESCE(a.contenedor_orden, '')) = ANY($2::text[])
               OR UPPER(COALESCE(a.sku, '')) = ANY($2::text[])
               OR UPPER(COALESCE(a.ubicacion, '')) = ANY($2::text[])
               OR UPPER(COALESCE(ac.codigo, '')) = ANY($2::text[])
               OR UPPER(COALESCE(ac.nombre_es, '')) = ANY($2::text[])
               OR UPPER(COALESCE(ac.descripcion, '')) = ANY($2::text[])
               OR REGEXP_REPLACE(UPPER(COALESCE(a.folio, '')), '[^A-Z0-9]', '', 'g') = $3
               OR REGEXP_REPLACE(UPPER(COALESCE(a.codigo, '')), '[^A-Z0-9]', '', 'g') = $3
               OR REGEXP_REPLACE(UPPER(COALESCE(a.nombre, '')), '[^A-Z0-9]', '', 'g') = $3
               OR REGEXP_REPLACE(UPPER(COALESCE(a.proceso, '')), '[^A-Z0-9]', '', 'g') = $3
               OR REGEXP_REPLACE(UPPER(COALESCE(a.cliente, '')), '[^A-Z0-9]', '', 'g') = $3
               OR REGEXP_REPLACE(UPPER(COALESCE(a.almacen, '')), '[^A-Z0-9]', '', 'g') = $3
               OR REGEXP_REPLACE(UPPER(COALESCE(a.contenedor_orden, '')), '[^A-Z0-9]', '', 'g') = $3
               OR REGEXP_REPLACE(UPPER(COALESCE(a.sku, '')), '[^A-Z0-9]', '', 'g') = $3
               OR REGEXP_REPLACE(UPPER(COALESCE(a.ubicacion, '')), '[^A-Z0-9]', '', 'g') = $3
               OR REGEXP_REPLACE(UPPER(COALESCE(ac.codigo, '')), '[^A-Z0-9]', '', 'g') = $3
               OR (
                 $6::boolean AND COALESCE($4::text, '') <> ''
                 AND (
                   REGEXP_REPLACE(UPPER(COALESCE(a.folio, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.codigo, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.nombre, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.proceso, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.cliente, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.almacen, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.contenedor_orden, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.sku, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.ubicacion, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(ac.codigo, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                 )
               )
               OR ($6::boolean AND a.descripcion ILIKE ANY($5::text[]))
             )
           ORDER BY
             CASE
               WHEN UPPER(COALESCE(a.folio, '')) = ANY($2::text[])
                 OR UPPER(COALESCE(a.codigo, '')) = ANY($2::text[])
                 OR UPPER(COALESCE(a.contenedor_orden, '')) = ANY($2::text[])
                 OR REGEXP_REPLACE(UPPER(COALESCE(a.folio, '')), '[^A-Z0-9]', '', 'g') = $3
                 OR REGEXP_REPLACE(UPPER(COALESCE(a.codigo, '')), '[^A-Z0-9]', '', 'g') = $3
                 OR REGEXP_REPLACE(UPPER(COALESCE(a.contenedor_orden, '')), '[^A-Z0-9]', '', 'g') = $3 THEN 1
               WHEN $6::boolean AND COALESCE($4::text, '') <> ''
                 AND (
                   REGEXP_REPLACE(UPPER(COALESCE(a.folio, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.codigo, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.contenedor_orden, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(a.sku, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                 ) THEN 2
               ELSE 3
             END,
             a.created_at DESC
           LIMIT ${resultLimit}`,
          flexibleSearchParams
        )
        const despT = () => req.tQuery(
          `SELECT dos.id, dos.codigo_caja, dos.matched_order_no, dos.created_at,
                  df.folio_numero,
                  dfo.outbound_order_no, dfo.cliente, dfo.destinatario,
                  CASE
                    WHEN UPPER(COALESCE(dos.codigo_caja, '')) = ANY($2::text[])
                      OR UPPER(COALESCE(df.folio_numero, '')) = ANY($2::text[])
                      OR UPPER(COALESCE(dfo.outbound_order_no, '')) = ANY($2::text[]) THEN 'exact'
                    WHEN REGEXP_REPLACE(UPPER(COALESCE(dos.codigo_caja, '')), '[^A-Z0-9]', '', 'g') = $3 THEN 'normalized'
                    WHEN $6::boolean AND COALESCE($4::text, '') <> ''
                      AND (
                        REGEXP_REPLACE(UPPER(COALESCE(dos.codigo_caja, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                        OR REGEXP_REPLACE(UPPER(COALESCE(df.folio_numero, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                        OR REGEXP_REPLACE(UPPER(COALESCE(dfo.outbound_order_no, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                      ) THEN 'base'
                    ELSE 'partial'
                  END AS match_type
           FROM dispatch_order_scans dos
           JOIN dispatch_folios df ON df.id = dos.folio_id
           LEFT JOIN dispatch_folio_orders dfo ON dfo.id = dos.folio_order_id
           WHERE dos.tenant_id = $1
             AND (
               UPPER(COALESCE(dos.codigo_caja, '')) = ANY($2::text[])
               OR REGEXP_REPLACE(UPPER(COALESCE(dos.codigo_caja, '')), '[^A-Z0-9]', '', 'g') = $3
               OR ($6::boolean AND dos.codigo_caja ILIKE ANY($5::text[]))
               OR UPPER(COALESCE(df.folio_numero, '')) = ANY($2::text[])
               OR UPPER(COALESCE(dfo.outbound_order_no, '')) = ANY($2::text[])
               OR REGEXP_REPLACE(UPPER(COALESCE(dfo.outbound_order_no, '')), '[^A-Z0-9]', '', 'g') = $3
               OR (
                 $6::boolean AND COALESCE($4::text, '') <> ''
                 AND (
                   REGEXP_REPLACE(UPPER(COALESCE(dos.codigo_caja, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(df.folio_numero, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(dfo.outbound_order_no, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                 )
               )
               OR ($6::boolean AND dfo.outbound_order_no ILIKE ANY($5::text[]))
            )
           ORDER BY
             CASE
               WHEN UPPER(COALESCE(dos.codigo_caja, '')) = ANY($2::text[])
                 OR UPPER(COALESCE(dfo.outbound_order_no, '')) = ANY($2::text[]) THEN 1
               WHEN REGEXP_REPLACE(UPPER(COALESCE(dos.codigo_caja, '')), '[^A-Z0-9]', '', 'g') = $3 THEN 2
               WHEN $6::boolean AND COALESCE($4::text, '') <> ''
                 AND (
                   REGEXP_REPLACE(UPPER(COALESCE(dos.codigo_caja, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                   OR REGEXP_REPLACE(UPPER(COALESCE(dfo.outbound_order_no, '')), '[^A-Z0-9]', '', 'g') LIKE $4::text || '%'
                 ) THEN 3
               ELSE 4
             END,
             dos.created_at DESC
           LIMIT ${resultLimit}`,
          flexibleSearchParams
        )
        const despOrdenesT = () => req.tQuery(
          `SELECT dfo.id, dfo.outbound_order_no, dfo.cliente, dfo.destinatario, dfo.bultos, dfo.peso_kg,
                  dfo.estado AS orden_estado, dfo.notas, dfo.created_at,
                  df.folio_numero, df.estado AS folio_estado, df.fecha_salida,
                  ${buildMatchCase(['dfo.outbound_order_no', 'df.folio_numero'], matchParams)} AS match_type
           FROM dispatch_folio_orders dfo
           JOIN dispatch_folios df ON df.id = dfo.folio_id
           WHERE dfo.tenant_id = $1
             AND ${despOrdenesWhere}
           ORDER BY
             CASE ${buildMatchCase(['dfo.outbound_order_no', 'df.folio_numero'], matchParams)}
               WHEN 'exact' THEN 1
               WHEN 'normalized' THEN 2
               WHEN 'base' THEN 3
               ELSE 4
             END,
             dfo.created_at DESC
           LIMIT ${resultLimit}`,
          searchParams
        )
      // Run the independent datasets in parallel with bounded concurrency so
      // one slow scan doesn't serialize the whole search, while leaving pool
      // headroom for other concurrent requests (deletes, etc.).
      const [invRes, invRegRes, pickRes, pickStatusRes, rastreoRes, inboundRes, anormRes, despRes, despOrdenesRes] =
        await runLimited(
          [invT, invRegT, pickT, pickStatusT, rastreoT, inboundT, anormT, despT, despOrdenesT],
          3
        )

      const pickRows = dedupeRows(pickRes.rows, row => [
        canonicalCodeKey(row.normalized_code || row.scanned_code || row.matched_box_type),
        normalizeCode(row.outbound_order_no),
        row.scan_result || '',
      ].join('|'))
      const pickStatusRows = dedupeRows(pickStatusRes.rows, row => [
        canonicalCodeKey(row.normalized_code || row.scanned_code || row.matched_box_type),
        normalizeCode(row.outbound_order_no),
        row.box_status || row.scan_result || '',
      ].join('|'))
      const pickEventKeys = new Set(pickRows.map(row => [
        canonicalCodeKey(row.normalized_code || row.scanned_code || row.matched_box_type),
        normalizeCode(row.outbound_order_no),
        row.scan_result || '',
      ].join('|')))
      const filteredPickStatusRows = pickStatusRows.filter(row => {
        if (row.box_status === 'rastreo') return false
        return !pickEventKeys.has([
          canonicalCodeKey(row.normalized_code || row.scanned_code || row.matched_box_type),
          normalizeCode(row.outbound_order_no),
          row.scan_result || '',
        ].join('|'))
      })
      const datasets = [
        ...invRes.rows,
        ...invRegRes.rows,
        ...pickRows,
        ...filteredPickStatusRows,
        ...rastreoRes.rows,
        ...inboundRes.rows,
        ...anormRes.rows,
        ...despRes.rows,
        ...(despOrdenesRes?.rows || []),
      ]
      const usedBaseCode = datasets.some(row => row.match_type === 'base')

      res.json({
        success: true,
        data: {
          inventario_escaneo: invRes.rows,
          inventario_registros: invRegRes.rows,
          surtido_validacion: pickRows,
          surtido_validacion_estado: filteredPickStatusRows,
          rastreo: rastreoRes.rows,
          recepcion: inboundRes.rows,
          anormalidades: anormRes.rows,
          despacho: despRes.rows,
          despacho_ordenes: despOrdenesRes?.rows || [],
          meta: {
            query: q,
            mode,
            normalized_query: tokens.normalized,
            base_code: tokens.baseCode || null,
            used_base_code: usedBaseCode,
          },
        },
      })
    } catch (err) {
      console.error('[rastreo.buscar]', err.message)
      res.status(500).json({ error: 'Error en la búsqueda' })
    }
  }
)

// ── GET /api/rastreo/usuarios/asignables — solo usuarios con acceso inventario
router.get('/usuarios/asignables',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'ver'),
  async (req, res) => {
    try {
      const rows = await req.tQuery(
        `SELECT u.id, u.nombre_completo, u.codigo, u.email, u.es_admin_tenant,
                u.permisos_override, r.nombre AS rol_nombre, r.permisos AS rol_permisos
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id AND r.tenant_id = u.tenant_id
         WHERE u.tenant_id = $1
           AND u.estado = 'ACTIVO'
         ORDER BY u.nombre_completo`,
        [req.tenantId]
      )
      const data = rows.rows
        .filter((user) => {
          if (user.es_admin_tenant === true) return true
          const permisos = user.permisos_override || user.rol_permisos || {}
          return getPermissionLevel(permisos, 'inventario.escaneo') !== 'sin_acceso' ||
            getPermissionLevel(permisos, 'inventario.registros') !== 'sin_acceso' ||
            getPermissionLevel(permisos, 'inventario.rastreo') !== 'sin_acceso'
        })
        .map(({ id, nombre_completo, codigo, email }) => ({ id, nombre_completo, codigo, email }))
      res.json({ success: true, data })
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
        estado_caja,
        sort = 'created_at', dir = 'DESC',
      } = req.query

      const offset = (parseInt(page) - 1) * parseInt(limit)
      const SORT_COLUMNS = {
        created_at: 'ro.created_at',
        updated_at: 'ro.updated_at',
        folio: 'ro.folio',
        outbound_order_no: 'ro.outbound_order_no',
        customer_code: 'ro.customer_code',
        estado: 'ro.estado',
        total_cajas: 'total_cajas',
        cajas_localizadas: 'cajas_localizadas',
        cajas_no_encontradas: 'cajas_no_encontradas',
        asignado_nombre: 'asignado_nombre',
      }
      const sortCol = SORT_COLUMNS[sort] || 'ro.created_at'
      const sortDir = dir === 'ASC' ? 'ASC' : 'DESC'

      let where = 'WHERE ro.tenant_id = $1'
      const params = [req.tenantId]
      let p = 2

      if (search) {
        // Box codes can be scanned/stored with either separator ("64942255/156" vs
        // "64942255-156"), and this list search previously only matched order-level
        // fields (folio/outbound_order_no/customer_code) — box codes weren't searched
        // at all. Match box codes too, comparing on a separator-stripped form so "-"
        // and "/" are interchangeable.
        const searchCompact = search.replace(/[^A-Za-z0-9]/g, '')
        where += ` AND (
          ro.folio ILIKE $${p} OR ro.outbound_order_no ILIKE $${p} OR ro.customer_code ILIKE $${p}
          OR EXISTS (
            SELECT 1 FROM rastreo_cajas rc
            WHERE rc.rastreo_orden_id = ro.id
              AND rc.tenant_id = ro.tenant_id
              AND (
                rc.box_code ILIKE $${p}
                OR rc.box_code_normalized ILIKE $${p}
                OR (
                  $${p + 1} <> ''
                  AND REGEXP_REPLACE(UPPER(COALESCE(rc.box_code_normalized, rc.box_code, '')), '[^A-Z0-9]', '', 'g') LIKE '%' || $${p + 1} || '%'
                )
              )
          )
        )`
        params.push(`%${search}%`, searchCompact.toUpperCase())
        p += 2
      }

      // Support comma-separated estados
      if (estado) {
        const estados = estado.split(',').map(e => normalizeEstado(e.trim())).filter(Boolean)
        if (estados.length === 1) {
          const variants = expandEstadoValues(estados[0])
          if (variants.length === 1) {
            where += ` AND ro.estado = $${p++}`
            params.push(variants[0])
          } else {
            const placeholders = variants.map(() => `$${p++}`).join(',')
            where += ` AND ro.estado IN (${placeholders})`
            params.push(...variants)
          }
        } else if (estados.length > 1) {
          const variants = [...new Set(estados.flatMap(expandEstadoValues))]
          const placeholders = variants.map(() => `$${p++}`).join(',')
          where += ` AND ro.estado IN (${placeholders})`
          params.push(...variants)
        }
      }

      if (asignado_a) {
        if (asignado_a === 'ninguno') {
          where += ` AND ro.asignado_a IS NULL`
        } else {
          // Support comma-separated
          const ids = asignado_a.split(',').map(id => id.trim()).filter(Boolean)
          if (ids.length === 1) {
            where += ` AND ro.asignado_a = $${p++}`
            params.push(ids[0])
          } else {
            const placeholders = ids.map(() => `$${p++}`).join(',')
            where += ` AND ro.asignado_a IN (${placeholders})`
            params.push(...ids)
          }
        }
      }

      // Filter by caja estado
      if (estado_caja) {
        const estadosCaja = estado_caja.split(',').map(v => v.trim()).filter(Boolean)
        if (estadosCaja.length === 1) {
          where += ` AND EXISTS (
            SELECT 1 FROM rastreo_cajas rc2
            WHERE rc2.rastreo_orden_id = ro.id AND rc2.estado_caja = $${p++}
          )`
          params.push(estadosCaja[0])
        } else if (estadosCaja.length > 1) {
          const placeholders = estadosCaja.map(() => `$${p++}`).join(',')
          where += ` AND EXISTS (
            SELECT 1 FROM rastreo_cajas rc2
            WHERE rc2.rastreo_orden_id = ro.id AND rc2.estado_caja IN (${placeholders})
          )`
          params.push(...estadosCaja)
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

      const normalizedRows = rowsRes.rows.map((row) => ({
        ...row,
        estado: normalizeEstado(row.estado),
      }))

      res.json({
        success: true,
        data: normalizedRows,
        meta: {
          total: parseInt(countRes.rows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)) || 1,
        },
      })
    } catch (err) {
      console.error('[rastreo.list]', err.message)
      res.status(500).json({ error: 'Error al obtener órdenes de rastreo' })
    }
  }
)

// ── POST /api/rastreo/bulk/estado — cambio masivo de estado ──────────────────
router.post('/bulk/estado',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { ids, estado } = req.body
      const normalizedEstado = normalizeEstado(estado)
      if (!ids?.length || !VALID_ESTADOS.includes(normalizedEstado) || normalizedEstado === 'abierta') {
        return res.status(400).json({ error: 'Datos inválidos' })
      }
      const userId = req.fullUser.id
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(',')
      const currentRes = await req.tQuery(
        `SELECT id, estado FROM rastreo_ordenes
         WHERE tenant_id = $1 AND id IN (${placeholders})`,
        [req.tenantId, ...ids]
      )
      for (const row of currentRes.rows) {
        if (!canTransitionEstado(row.estado, normalizedEstado)) {
          return res.status(400).json({ error: `Transición inválida para la orden ${row.id}` })
        }
      }
      await req.tQuery(
        `UPDATE rastreo_ordenes SET estado = $1, updated_at = now()
         WHERE tenant_id = $2 AND id IN (${ids.map((_, i) => `$${i + 3}`).join(',')})`,
        [persistEstado(normalizedEstado), req.tenantId, ...ids]
      )
      for (const id of ids) {
        await req.tQuery(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'estado_cambiado',$3,$4)`,
          [req.tenantId, id, `Cambio masivo de estado a: ${ESTADO_LABELS[normalizedEstado] || normalizedEstado}`, userId]
        )
      }
      res.json({ success: true, updated: ids.length })
    } catch (err) {
      console.error('[rastreo.bulk.estado]', err.message)
      res.status(500).json({ error: 'Error al actualizar estados' })
    }
  }
)

// ── POST /api/rastreo/bulk/responsable — asignación masiva ───────────────────
router.post('/bulk/responsable',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { ids, asignado_a } = req.body
      if (!ids?.length) return res.status(400).json({ error: 'IDs requeridos' })
      const userId = req.fullUser?.id || req.user?.id
      if (!userId) {
        return res.status(401).json({ error: 'Usuario no válido para crear rastreo' })
      }
      const newVal = asignado_a ? parseInt(asignado_a) : null
      const placeholders = ids.map((_, i) => `$${i + 3}`).join(',')
      await req.tQuery(
        `UPDATE rastreo_ordenes SET asignado_a = $1, updated_at = now()
         WHERE tenant_id = $2 AND id IN (${placeholders})`,
        [newVal, req.tenantId, ...ids]
      )
      for (const id of ids) {
        await req.tQuery(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'asignada',$3,$4)`,
          [req.tenantId, id, `Responsable asignado masivo`, userId]
        )
      }
      res.json({ success: true, updated: ids.length })
    } catch (err) {
      console.error('[rastreo.bulk.responsable]', err.message)
      res.status(500).json({ error: 'Error al asignar responsable' })
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
          `SELECT rc.*, a.folio AS anormalidad_folio,
                  ct.descripcion AS causa_descripcion, ct.area AS causa_area
           FROM rastreo_cajas rc
           LEFT JOIN anormalidades a ON a.id = rc.anormalidad_id
           LEFT JOIN rastreo_causa_tipos ct ON ct.id = rc.causa_rastreo_id
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
      const orden = ordenRes.rows[0]
      let surtidoTracking = null
      let cajasWithSurtido = cajasRes.rows

      if (orden.outbound_order_no) {
        const [trackingRes, cajaSurtidoRes] = await Promise.all([
          req.tQuery(
            `SELECT ot.*, s.nombre AS surtidor_nombre_actual
               FROM pick_order_tracking ot
               LEFT JOIN pick_surtidores s ON s.id = ot.surtidor_id AND s.tenant_id = ot.tenant_id
              WHERE ot.tenant_id = $1 AND ot.outbound_order_no = $2
              LIMIT 1`,
            [req.tenantId, orden.outbound_order_no]
          ),
          cajasRes.rows.length > 0
            ? req.tQuery(
              `WITH boxes AS (
                 SELECT *
                   FROM jsonb_to_recordset($3::jsonb)
                     AS b(id uuid, box_code text, box_type text)
               )
               SELECT DISTINCT ON (b.id)
                      b.id AS rastreo_caja_id,
                      pe.scan_result AS surtido_scan_result,
                      pe.scanned_at AS surtido_validated_at,
                      pe.scanned_code AS surtido_scanned_code,
                      pe.normalized_code AS surtido_normalized_code,
                      pe.matched_box_type AS surtido_matched_box_type,
                      pe.manual_notes AS surtido_manual_notes,
                      ps.id AS surtido_session_id,
                      ps.status AS surtido_session_status,
                      ps.operator_id AS surtido_operator_id,
                      u.nombre_completo AS surtido_operator_nombre
                 FROM boxes b
                 JOIN pick_sessions ps
                   ON ps.tenant_id = $1
                  AND ps.outbound_order_no = $2
                 JOIN pick_events pe
                   ON pe.session_id = ps.id
                  AND pe.scan_result = 'ok'
                 LEFT JOIN usuarios u
                   ON u.id = ps.operator_id
                  AND u.tenant_id = ps.tenant_id
                WHERE (
                    REGEXP_REPLACE(UPPER(COALESCE(pe.scanned_code, '')), '[^A-Z0-9]', '', 'g') IN (
                      REGEXP_REPLACE(UPPER(COALESCE(b.box_code, '')), '[^A-Z0-9]', '', 'g'),
                      REGEXP_REPLACE(UPPER(COALESCE(b.box_type, '')), '[^A-Z0-9]', '', 'g')
                    )
                 OR REGEXP_REPLACE(UPPER(COALESCE(pe.normalized_code, '')), '[^A-Z0-9]', '', 'g') IN (
                      REGEXP_REPLACE(UPPER(COALESCE(b.box_code, '')), '[^A-Z0-9]', '', 'g'),
                      REGEXP_REPLACE(UPPER(COALESCE(b.box_type, '')), '[^A-Z0-9]', '', 'g')
                    )
                 OR REGEXP_REPLACE(UPPER(COALESCE(pe.matched_box_type, '')), '[^A-Z0-9]', '', 'g') IN (
                      REGEXP_REPLACE(UPPER(COALESCE(b.box_code, '')), '[^A-Z0-9]', '', 'g'),
                      REGEXP_REPLACE(UPPER(COALESCE(b.box_type, '')), '[^A-Z0-9]', '', 'g')
                    )
                )
                ORDER BY b.id, pe.scanned_at DESC NULLS LAST, pe.id DESC`,
              [
                req.tenantId,
                orden.outbound_order_no,
                JSON.stringify(cajasRes.rows.map(c => ({
                  id: c.id,
                  box_code: c.box_code,
                  box_type: c.box_type || null,
                }))),
              ]
            )
            : Promise.resolve({ rows: [] }),
        ])

        const rawTracking = trackingRes.rows[0] || null
        const cajaSurtidoRows = cajaSurtidoRes.rows || []
        const cajaSurtidoMap = new Map(cajaSurtidoRows.map(row => [row.rastreo_caja_id, row]))
        cajasWithSurtido = cajasRes.rows.map(caja => {
          const surtidoValidacion = cajaSurtidoMap.get(caja.id) || null
          return {
            ...caja,
            validada_en_surtido: !!surtidoValidacion,
            surtido_validacion: surtidoValidacion,
          }
        })

        const latestValidatedRow = [...cajaSurtidoRows].sort((a, b) => {
          const aTs = a?.surtido_validated_at ? new Date(a.surtido_validated_at).getTime() : 0
          const bTs = b?.surtido_validated_at ? new Date(b.surtido_validated_at).getTime() : 0
          return bTs - aTs
        })[0] || null
        const validatedCount = cajasWithSurtido.filter(caja => caja.validada_en_surtido).length
        const totalBoxes = cajasWithSurtido.length
        const derivedStatus = validatedCount > 0
          ? (totalBoxes > 0 && validatedCount >= totalBoxes ? 'complete' : 'partial')
          : null

        surtidoTracking = rawTracking || latestValidatedRow
          ? {
              ...(rawTracking || {}),
              surtidor_nombre: rawTracking?.surtidor_nombre || rawTracking?.surtidor_nombre_actual || null,
              status: rawTracking?.status || derivedStatus || null,
              validation_completed_at: latestValidatedRow?.surtido_validated_at || rawTracking?.validation_completed_at || null,
              validated_by: latestValidatedRow?.surtido_operator_nombre || rawTracking?.validated_by || null,
              validated_count: validatedCount,
              total_boxes: totalBoxes,
            }
          : null
      }

      res.json({
        success: true,
        data: {
          orden: {
            ...orden,
            estado: normalizeEstado(orden.estado),
          },
          cajas: cajasWithSurtido,
          historial: histRes.rows,
          surtido_tracking: surtidoTracking,
        },
      })
    } catch (err) {
      console.error('[rastreo.detail]', err.message)
      res.status(500).json({ error: 'Error al obtener detalle' })
    }
  }
)

// ── POST /api/rastreo/resolver — completar orden en una transacción ──────────
router.post('/resolver',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { orden_id, target_estado, updates } = req.body
      // updates: [{ caja_id, found, causa_rastreo_id? }]
      if (!orden_id || !target_estado || !Array.isArray(updates)) {
        return res.status(400).json({ error: 'orden_id, target_estado y updates son requeridos' })
      }
      const normalizedEstado = normalizeEstado(target_estado)
      if (!normalizedEstado) return res.status(400).json({ error: 'Estado inválido' })

      const userId = req.user.id
      const userName = req.fullUser.nombre_completo

      await req.tTransaction(async (client) => {
        const ordenRes = await client.query(
          `SELECT id, folio, outbound_order_no FROM rastreo_ordenes WHERE id = $1 AND tenant_id = $2`,
          [orden_id, req.tenantId]
        )
        if (!ordenRes.rows.length) throw Object.assign(new Error('Orden no encontrada'), { status: 404 })
        const orden = ordenRes.rows[0]

        const cajaIds = updates.map(u => u.caja_id)
        const cajasRes = await client.query(
          `SELECT id, box_code, anormalidad_id FROM rastreo_cajas WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
          [cajaIds, req.tenantId]
        )
        const cajaMap = new Map(cajasRes.rows.map(c => [c.id, c]))

        // Identify not-found boxes that still need an anormalidad
        const notFoundNewIds = updates
          .filter(u => !u.found)
          .map(u => cajaMap.get(u.caja_id))
          .filter(c => c && !c.anormalidad_id)

        let sharedAnormId = null
        if (notFoundNewIds.length > 0) {
          sharedAnormId = await crearAnormalidadRastreoConsolidada(
            (sql, params) => client.query(sql, params),
            req.tenantId,
            {
              boxCodes: notFoundNewIds.map(c => c.box_code),
              ordenFolio: orden.folio,
              outboundOrderNo: orden.outbound_order_no,
              userId,
              userName,
            }
          )
        }

        for (const u of updates) {
          const caja = cajaMap.get(u.caja_id)
          if (!caja) continue
          const nextEstado = u.found ? 'localizada' : 'no_encontrada'
          const setAnorm = !u.found && sharedAnormId && !caja.anormalidad_id
          const setCausa = u.causa_rastreo_id !== undefined ? u.causa_rastreo_id || null : undefined

          const fields = [`estado_caja = '${nextEstado}'`, `updated_at = now()`]
          const params = [u.caja_id, req.tenantId]
          let p = 3
          if (setAnorm) { fields.push(`anormalidad_id = $${p++}`); params.splice(p - 2, 0, sharedAnormId) }
          if (setCausa !== undefined) { fields.push(`causa_rastreo_id = $${p++}`); params.splice(p - 2, 0, setCausa) }

          await client.query(
            `UPDATE rastreo_cajas SET ${fields.join(', ')} WHERE id = $1 AND tenant_id = $2`,
            params
          )
        }

        const totalFound = updates.filter(u => u.found).length
        const totalMissing = updates.length - totalFound
        // Every box passed through this resolver gets an explicit final state
        // (localizada or no_encontrada, with an anormalidad raised for the
        // missing ones above) — the order itself should close as whatever the
        // user explicitly chose, even if some boxes ended up not found.
        // Silently downgrading to 'parcial' here left orders with any missing
        // box stuck in a non-terminal state forever, since a resolve here is
        // the terminal action for every candidate box.
        const finalEstado = normalizedEstado

        await client.query(
          `UPDATE rastreo_ordenes SET estado = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
          [persistEstado(finalEstado), orden_id, req.tenantId]
        )

        const desc = `Orden marcada como ${ESTADO_LABELS[finalEstado] || finalEstado}. Localizadas: ${totalFound}, No encontradas: ${totalMissing}`
        await client.query(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'resuelta',$3,$4)`,
          [req.tenantId, orden_id, desc, userId]
        )

        res.locals.finalEstado = finalEstado
      })

      res.json({ success: true, data: { final_estado: res.locals.finalEstado || normalizedEstado } })
    } catch (err) {
      console.error('[rastreo.resolver]', err.message)
      res.status(err.status || 500).json({ error: err.message || 'Error al resolver orden' })
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
        receiver_name,
        logistics_track_no,
        third_order_no,
        logistics_channel,
        outbound_delivery_at,
        asignado_a,
        notas,
        cajas = [],
        force = false,
      } = req.body

      if (!Array.isArray(cajas) || !cajas.length) {
        return res.status(400).json({ error: 'Debe incluir al menos una caja' })
      }
      if (!asignado_a) {
        return res.status(400).json({ error: 'Debe asignar un responsable' })
      }

      const [hasRastreoBoxType, hasRastreoMedidas, rastreoOrdenColumns] = await Promise.all([
        hasTableColumn(req.tQuery, 'rastreo_cajas', 'box_type'),
        hasTableColumn(req.tQuery, 'rastreo_cajas', 'medidas'),
        getTableColumns(req.tQuery, 'rastreo_ordenes'),
      ])

      const userId = req.fullUser?.id || req.user?.id
      if (!userId) {
        return res.status(401).json({ error: 'Usuario no válido para crear rastreo' })
      }

      let asignadoId = null
      if (asignado_a) {
        const uRes = await req.tQuery(
          `SELECT id FROM usuarios WHERE id = $1 AND tenant_id = $2 AND estado = 'ACTIVO'`,
          [asignado_a, req.tenantId]
        )
        if (uRes.rows.length) asignadoId = parseInt(asignado_a)
      }
      if (!asignadoId) {
        return res.status(400).json({ error: 'Responsable inválido o inactivo' })
      }

      const cajasData = []
      for (const c of cajas) {
        const cajaData = buildCajaData(c)
        if (!cajaData) continue
        cajaData.validada_en_surtido = await isCajaValidadaEnSurtido(req.tQuery, req.tenantId, outbound_order_no, cajaData)
        cajasData.push(cajaData)
      }

      if (!cajasData.length) {
        return res.status(400).json({ error: 'Debe incluir al menos una caja con código válido' })
      }

      const duplicates = await findRastreoDuplicates(req.tQuery, req.tenantId, {
        outboundOrderNo: outbound_order_no || null,
        cajasData,
      })
      if (duplicates.length && !force) {
        return res.status(409).json({
          error: 'La orden o una caja ya existe en rastreo',
          code: 'RASTREO_DUPLICADO',
          duplicates,
        })
      }

      let ordenId
      let folio

      await req.tTransaction(async (client) => {
        folio = await generateRastreoFolioForClient(client, req.tenantId)

        const ordenFields = ['tenant_id', 'folio', 'outbound_order_no', 'customer_code']
        const ordenValues = [
          req.tenantId,
          folio,
          normalizeOptionalText(outbound_order_no),
          normalizeOptionalText(customer_code),
        ]

        const optionalSnapshotFields = [
          ['receiver_name', normalizeOptionalText(receiver_name)],
          ['logistics_track_no', normalizeOptionalText(logistics_track_no)],
          ['third_order_no', normalizeOptionalText(third_order_no)],
          ['logistics_channel', normalizeOptionalText(logistics_channel)],
          ['outbound_delivery_at', normalizeOptionalText(outbound_delivery_at)],
        ]

        for (const [field, value] of optionalSnapshotFields) {
          if (rastreoOrdenColumns.has(field)) {
            ordenFields.push(field)
            ordenValues.push(value)
          }
        }

        ordenFields.push('asignado_a', 'creado_por', 'notas')
        ordenValues.push(asignadoId, userId, normalizeOptionalText(notas))

        const placeholders = ordenValues.map((_, index) => `$${index + 1}`).join(',')
        const ordenRes = await client.query(
          `INSERT INTO rastreo_ordenes
             (${ordenFields.join(', ')})
           VALUES (${placeholders})
           RETURNING id`,
          ordenValues
        )
        ordenId = ordenRes.rows[0].id

        for (const c of cajasData) {
          await insertRastreoCajaSnapshot(client, req.tenantId, ordenId, c, {
            hasBoxType: hasRastreoBoxType,
            hasMedidas: hasRastreoMedidas,
          })
        }

        await client.query(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'creada',$3,$4)`,
          [req.tenantId, ordenId, `Orden creada con ${cajasData.length} caja(s)`, userId]
        )
      })

      res.status(201).json({ success: true, data: { folio, id: ordenId } })
    } catch (err) {
      console.error('[rastreo.create]', err.message, err.code || '', err.detail || '')
      const debug = process.env.NODE_ENV !== 'production'
        ? { message: err.message, code: err.code, detail: err.detail }
        : {}
      res.status(500).json({ error: 'Error al crear orden de rastreo', ...debug })
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
      const normalizedEstado = estado !== undefined ? normalizeEstado(estado) : undefined

      const existing = await req.tQuery(
        `SELECT ro.id, ro.estado, ro.asignado_a, ro.folio, ro.notas,
                u.nombre_completo AS asignado_nombre
         FROM rastreo_ordenes ro
         LEFT JOIN usuarios u ON u.id = ro.asignado_a AND u.tenant_id = ro.tenant_id
         WHERE ro.id = $1 AND ro.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })

      const row = existing.rows[0]
      const currentEstado = normalizeEstado(row.estado)
      const updates = []
      const values = []
      const historyEntries = []
      let nextAsignadoId = row.asignado_a
      let nextAsignadoNombre = row.asignado_nombre || null

      if (normalizedEstado && normalizedEstado !== currentEstado) {
        if (!VALID_ESTADOS.includes(normalizedEstado) || !canTransitionEstado(currentEstado, normalizedEstado)) {
          return res.status(400).json({ error: 'Transición de estado no permitida' })
        }
        values.push(persistEstado(normalizedEstado))
        updates.push(`estado = $${values.length + 2}`)
        historyEntries.push({
          accion: 'estado_cambiado',
          descripcion: `Cambio de estado: ${ESTADO_LABELS[currentEstado] || currentEstado} -> ${ESTADO_LABELS[normalizedEstado] || normalizedEstado}`,
        })
      }
      if (asignado_a !== undefined) {
        nextAsignadoId = asignado_a ? parseInt(asignado_a) : null
        if ((row.asignado_a || null) !== (nextAsignadoId || null)) {
          if (nextAsignadoId) {
            const userRes = await req.tQuery(
              `SELECT nombre_completo
               FROM usuarios
               WHERE id = $1 AND tenant_id = $2 AND estado = 'ACTIVO'
               LIMIT 1`,
              [nextAsignadoId, req.tenantId]
            )
            nextAsignadoNombre = userRes.rows[0]?.nombre_completo || null
          } else {
            nextAsignadoNombre = null
          }
          historyEntries.push({
            accion: 'asignada',
            descripcion: `Responsable: ${row.asignado_nombre || 'Sin responsable'} -> ${nextAsignadoNombre || 'Sin responsable'}`,
          })
        }
        values.push(nextAsignadoId)
        updates.push(`asignado_a = $${values.length + 2}`)
      }
      if (notas !== undefined) {
        values.push(notas)
        updates.push(`notas = $${values.length + 2}`)
        if ((row.notas || '') !== (notas || '')) {
          historyEntries.push({
            accion: 'actualizada',
            descripcion: 'Notas generales actualizadas',
          })
        }
      }

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
        [req.params.id, req.tenantId, ...values]
      )

      for (const entry of historyEntries) {
        await req.tQuery(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [req.tenantId, req.params.id, entry.accion, entry.descripcion, userId]
        )
      }

      res.json({ success: true })
    } catch (err) {
      console.error('[rastreo.update]', err.message, err.code || '', err.detail || '')
      res.status(500).json({ error: 'Error al actualizar orden' })
    }
  }
)

// ── POST /api/rastreo/cajas/add — agregar caja a orden existente ─────────────
router.post('/cajas/add',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'crear'),
  async (req, res) => {
    try {
      const { orden_id, box_code, box_type, ubicacion, medidas, producto, cantidad_disponible } = req.body
      if (!orden_id || !box_code) return res.status(400).json({ error: 'orden_id y box_code requeridos' })
      const [hasRastreoBoxType, hasRastreoMedidas] = await Promise.all([
        hasTableColumn(req.tQuery, 'rastreo_cajas', 'box_type'),
        hasTableColumn(req.tQuery, 'rastreo_cajas', 'medidas'),
      ])
      const cajaData = buildCajaData({ box_code, box_type, ubicacion, medidas, producto, cantidad_disponible })
      if (!cajaData) return res.status(400).json({ error: 'box_code requerido' })

      const ordenRes = await req.tQuery(
        'SELECT id, outbound_order_no FROM rastreo_ordenes WHERE id = $1 AND tenant_id = $2',
        [orden_id, req.tenantId]
      )
      if (!ordenRes.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })
      const orden = ordenRes.rows[0]

      // Check duplicate
      const dupParams = [orden_id, cajaData.box_code, req.tenantId]
      if (hasRastreoBoxType) dupParams.push(cajaData.box_type)
      const dupRes = await req.tQuery(
        `SELECT id
           FROM rastreo_cajas
          WHERE rastreo_orden_id = $1
            AND tenant_id = $3
            AND (
              UPPER(box_code) = UPPER($2)
              ${hasRastreoBoxType ? "OR UPPER(COALESCE(box_type, '')) = UPPER($2) OR ($4::text IS NOT NULL AND UPPER(COALESCE(box_type, '')) = UPPER($4::text))" : ''}
            )`,
        dupParams
      )
      if (dupRes.rows.length) return res.status(409).json({ error: 'La caja ya existe en esta orden' })

      const validada = await isCajaValidadaEnSurtido(req.tQuery, req.tenantId, orden.outbound_order_no, cajaData)

      cajaData.validada_en_surtido = validada
      const cajaRes = await insertRastreoCajaSnapshot(req.tQuery, req.tenantId, orden_id, cajaData, {
        hasBoxType: hasRastreoBoxType,
        hasMedidas: hasRastreoMedidas,
      })

      await req.tQuery(
        `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, rastreo_caja_id, accion, descripcion, actor_id)
         VALUES ($1,$2,$3,'creada',$4,$5)`,
        [req.tenantId, orden_id, cajaRes.rows[0].id, `Registro agregado: ${cajaData.box_code}`, req.fullUser.id]
      )

      res.status(201).json({ success: true, data: { id: cajaRes.rows[0].id } })
    } catch (err) {
      console.error('[rastreo.caja.add]', err.message)
      res.status(500).json({ error: 'Error al agregar caja' })
    }
  }
)

// ── PATCH /api/rastreo/cajas/:id — cambiar estado caja ──────────────────────
router.patch('/cajas/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'editar'),
  async (req, res) => {
    try {
      const { estado_caja, notas, causa_rastreo_id } = req.body
      const userId = req.fullUser.id

      const cajaRes = await req.tQuery(
        `SELECT rc.*, ro.folio AS orden_folio, ro.outbound_order_no, ro.id AS orden_id, ro.estado AS orden_estado
         FROM rastreo_cajas rc
         JOIN rastreo_ordenes ro ON ro.id = rc.rastreo_orden_id
         WHERE rc.id = $1 AND rc.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (!cajaRes.rows.length) return res.status(404).json({ error: 'Caja no encontrada' })

      const caja = cajaRes.rows[0]
      const currentOrdenEstado = normalizeEstado(caja.orden_estado)

      // causa-only update (no estado_caja change)
      if (causa_rastreo_id !== undefined && estado_caja === undefined) {
        await req.tQuery(
          `UPDATE rastreo_cajas SET causa_rastreo_id = $3, updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [req.params.id, req.tenantId, causa_rastreo_id || null]
        )
        return res.json({ success: true })
      }

      const updates = [`estado_caja = $3`, `updated_at = now()`]
      const params = [req.params.id, req.tenantId, estado_caja]
      let p = 4

      if (notas !== undefined) {
        updates.push(`notas = $${p++}`)
        params.push(notas)
      }

      if (causa_rastreo_id !== undefined) {
        updates.push(`causa_rastreo_id = $${p++}`)
        params.push(causa_rastreo_id || null)
      }

      let anormalidadId = null
      if (estado_caja === 'no_encontrada' && !caja.anormalidad_id) {
        anormalidadId = await crearAnormalidadRastreo(req.tQuery, req.tenantId, {
          boxCode: caja.box_code,
          ordenFolio: caja.orden_folio,
          outboundOrderNo: caja.outbound_order_no,
          userId,
          userName: req.fullUser.nombre_completo,
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

      if (currentOrdenEstado === 'abierta') {
        await req.tQuery(
          `UPDATE rastreo_ordenes
           SET estado = 'en_proceso', updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [caja.orden_id, req.tenantId]
        )
        await req.tQuery(
          `INSERT INTO rastreo_historial
             (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
           VALUES ($1,$2,'estado_cambiado',$3,$4)`,
          [req.tenantId, caja.orden_id, 'Cambio de estado: Abierta -> En proceso', userId]
        )
      }

      const accion = estado_caja === 'localizada' ? 'caja_localizada'
        : estado_caja === 'no_encontrada' ? 'caja_no_encontrada'
        : 'estado_cambiado'

      await req.tQuery(
        `INSERT INTO rastreo_historial
           (tenant_id, rastreo_orden_id, rastreo_caja_id, accion, descripcion, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.tenantId, caja.orden_id, caja.id, accion,
         `Caja ${caja.box_code}: ${estado_caja}`, userId]
      )

      res.json({ success: true, anormalidad_id: anormalidadId })
    } catch (err) {
      console.error('[rastreo.caja.update]', err.message)
      res.status(500).json({ error: 'Error al actualizar caja' })
    }
  }
)

// ── DELETE /api/rastreo/cajas/:id — eliminar caja ────────────────────────────
router.delete('/cajas/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.rastreo', 'eliminar'),
  async (req, res) => {
    try {
      const cajaRes = await req.tQuery(
        `SELECT rc.*, ro.id AS orden_id
         FROM rastreo_cajas rc
         JOIN rastreo_ordenes ro ON ro.id = rc.rastreo_orden_id
         WHERE rc.id = $1 AND rc.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (!cajaRes.rows.length) return res.status(404).json({ error: 'Caja no encontrada' })
      const caja = cajaRes.rows[0]

      // Check if has estado changes in historial (preserve traceability)
      const histRes = await req.tQuery(
        `SELECT COUNT(*) FROM rastreo_historial
         WHERE rastreo_caja_id = $1 AND accion IN ('caja_localizada','caja_no_encontrada','estado_cambiado')`,
        [req.params.id]
      )
      const hasHistory = parseInt(histRes.rows[0].count) > 0

      if (hasHistory) {
        // Mark as cancelled instead of deleting
        await req.tQuery(
          `UPDATE rastreo_cajas SET estado_caja = 'cancelada', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
          [req.params.id, req.tenantId]
        )
        await req.tQuery(
          `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, rastreo_caja_id, accion, descripcion, actor_id)
           VALUES ($1,$2,$3,'actualizada',$4,$5)`,
          [req.tenantId, caja.orden_id, caja.id, `Registro cancelado: ${caja.box_code} (con historial previo)`, req.fullUser.id]
        )
        return res.json({ success: true, cancelled: true })
      }

      await req.tQuery(
        `INSERT INTO rastreo_historial (tenant_id, rastreo_orden_id, accion, descripcion, actor_id)
         VALUES ($1,$2,'actualizada',$3,$4)`,
        [req.tenantId, caja.orden_id, `Registro eliminado: ${caja.box_code}`, req.fullUser.id]
      )

      await req.tQuery(
        'DELETE FROM rastreo_cajas WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      res.json({ success: true, deleted: true })
    } catch (err) {
      console.error('[rastreo.caja.delete]', err.message)
      res.status(500).json({ error: 'Error al eliminar caja' })
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
        'SELECT id, folio FROM rastreo_ordenes WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })

      await req.tTransaction(async (client) => {
        await client.query(
          `DELETE FROM rastreo_historial
           WHERE rastreo_orden_id = $1 AND tenant_id = $2`,
          [req.params.id, req.tenantId]
        )

        await client.query(
          `DELETE FROM rastreo_cajas
           WHERE rastreo_orden_id = $1 AND tenant_id = $2`,
          [req.params.id, req.tenantId]
        )

        await client.query(
          `DELETE FROM rastreo_ordenes
           WHERE id = $1 AND tenant_id = $2`,
          [req.params.id, req.tenantId]
        )
      })

      res.json({ success: true })
    } catch (err) {
      console.error('[rastreo.delete]', req.params.id, err.message)
      res.status(500).json({ error: 'Error al eliminar orden' })
    }
  }
)

export default router

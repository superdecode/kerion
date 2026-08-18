import { Router } from 'express'
import crypto from 'crypto'
import { isDatabaseUnavailableError, UUID_RE } from '../../../config/database.js'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { requirePermission, getPermissionLevel, resolvePermission } from '../../../shared/middleware/permissions.js'
import { getToday, instantDateInTZ } from '../../../shared/utils/dateUtils.js'
import { normalizeScanCode } from '../../../shared/utils/codeNormalization.js'
import { checkModuleLimitForUpdate } from '../../middleware/usageGuard.js'
import {
  compactCanonicalCode, normalizeExpectedBoxes, matchExpectedBox,
  normalizeOptionalText, parsePositiveInt,
} from '../utils/pickBoxes.js'
import { getPublicTableColumns, upsertOrderTrackingSnapshot } from '../utils/orderTracking.js'

const SURTIDO_COUNT_QUERY = `SELECT COUNT(*) FROM pick_order_tracking WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`

const router = Router()
const DEFAULT_TZ = 'America/Mexico_City'
const PICK_SESSION_STATUSES = new Set(['open', 'complete', 'with_discrepancies'])
const PICK_SCAN_RESULTS = new Set(['ok', 'unexpected', 'duplicate', 'not_found'])
const INV_SCAN_STATUSES = new Set(['ok', 'blocked', 'nowms'])
const ORDER_TRACKING_STATUSES = new Set(['pending_assignment', 'assigned', 'sorting', 'pending_validation', 'validating', 'complete', 'partial', 'cancelled'])
const CLOSED_ORDER_TRACKING_STATUSES = new Set(['complete', 'partial'])

// ── Sheet CSV cache (per tenant+url, stale-while-revalidate) ───────────────
const _csvCache = new Map()
const _inFlight = new Map()
const CSV_CACHE_TTL = 5 * 60 * 1000 // 5 min
const CSV_MAX_ENTRY_BYTES = parseInt(process.env.CSV_MAX_ENTRY_BYTES, 10) || 1_500_000
const CSV_MAX_TOTAL_BYTES = parseInt(process.env.CSV_MAX_TOTAL_BYTES, 10) || 6_000_000
const CSV_DB_CACHE_MAX_BYTES = parseInt(process.env.CSV_DB_CACHE_MAX_BYTES, 10) || 1_500_000
const CSV_MAX_LIMIT_ROWS = parseInt(process.env.CSV_MAX_LIMIT_ROWS, 10) || 3000
const WMS_PREWARM_SHEETS = process.env.WMS_PREWARM_SHEETS === 'true'

function getLastNRows(text, n) {
  if (!n || n <= 0) return text
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let headerEnd = normalized.indexOf('\n')
  if (headerEnd === -1) return normalized

  let rowsSeen = 0
  let cutIndex = -1
  for (let i = normalized.length - 1; i > headerEnd; i--) {
    if (normalized[i] === '\n') {
      rowsSeen += 1
      if (rowsSeen > n) {
        cutIndex = i
        break
      }
    }
  }
  if (cutIndex === -1) return normalized
  return normalized.slice(0, headerEnd + 1) + normalized.slice(cutIndex + 1)
}

function getTextBytes(text) {
  return Buffer.byteLength(String(text || ''), 'utf8')
}

function getCsvCacheTotalBytes() {
  let total = 0
  for (const entry of _csvCache.values()) total += entry.bytes || 0
  return total
}

function pruneCsvCache() {
  const now = Date.now()
  for (const [key, entry] of _csvCache.entries()) {
    if (now - entry.fetchedAt > CSV_CACHE_TTL) _csvCache.delete(key)
  }

  let total = getCsvCacheTotalBytes()
  if (total <= CSV_MAX_TOTAL_BYTES) return

  const entries = [..._csvCache.entries()]
    .sort((a, b) => (a[1].lastAccessedAt || a[1].fetchedAt) - (b[1].lastAccessedAt || b[1].fetchedAt))
  for (const [key, entry] of entries) {
    if (total <= CSV_MAX_TOTAL_BYTES) break
    _csvCache.delete(key)
    total -= entry.bytes || 0
  }
}

function setCsvCache(cacheKey, text, rowCount) {
  const bytes = getTextBytes(text)
  if (bytes > CSV_MAX_ENTRY_BYTES) {
    _csvCache.delete(cacheKey)
    return false
  }
  _csvCache.set(cacheKey, {
    text,
    rowCount,
    bytes,
    fetchedAt: Date.now(),
    lastAccessedAt: Date.now(),
    refreshing: false,
  })
  pruneCsvCache()
  return true
}

async function fetchAndCacheSheet(tenantId, url, dbWriter = null) {
  const cacheKey = `${tenantId}:${url}`

  // In-flight dedupe: if a concurrent fetch is already running, wait for it
  const pending = _inFlight.get(cacheKey)
  if (pending) return pending

  const existing = _csvCache.get(cacheKey)
  if (existing) existing.refreshing = true

  const fetchPromise = (async () => {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/csv,text/plain' },
        signal: AbortSignal.timeout(25000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const rowCount = (text.match(/\n/g) || []).length
      setCsvCache(cacheKey, text, rowCount)
      if (dbWriter) dbWriter(text, rowCount).catch(() => {})
      return text
    } catch (err) {
      if (existing) existing.refreshing = false
      throw err
    }
  })()

  _inFlight.set(cacheKey, fetchPromise)
  // Catch on this derived .finally() promise separately from the returned
  // fetchPromise — callers catching the returned reference does not stop the
  // .finally() chain's own rejection from going unhandled and crashing the process.
  fetchPromise.finally(() => _inFlight.delete(cacheKey)).catch(() => {})
  return fetchPromise
}

function tenantLockKey(tenantId, suffix = '') {
  const buf = crypto.createHash('sha256').update(`${tenantId}:${suffix}`).digest()
  const val = buf.readBigUInt64BE(0) & BigInt('0x7FFFFFFFFFFFFFFF')
  return val.toString()
}

function getTimezone(req) {
  return req.fullUser?.zona_horaria || DEFAULT_TZ
}

function dateKeyInTZ(value, tz = DEFAULT_TZ) {
  const date = new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) return getToday(tz).replace(/-/g, '')
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date).replace(/-/g, '')
}




function requireAnyPermission(requirements) {
  return (req, res, next) => {
    const user = req.fullUser
    if (!user) return res.status(401).json({ error: 'No autenticado' })
    if (user.rol_nombre === 'Administrador') return next()

    const hasAny = requirements.some(({ modulePath, action }) => {
      const level = getPermissionLevel(user.permisos, modulePath)
      return resolvePermission(level, action)
    })

    if (!hasAny) return res.status(403).json({ error: 'No tienes permisos para esta acción' })
    next()
  }
}

function isValidSectionCode(code) {
  return /^SEC-\d{8}M\d{2,}$/.test(String(code || '').trim())
}





export function buildOrderTrackingStatusSql() {
  return `CASE
        WHEN ot.status = 'cancelled' THEN 'cancelled'
        WHEN ot.status = 'complete' THEN 'complete'
        WHEN COALESCE(stats.total_expected, 0) > 0 AND COALESCE(stats.total_scanned, 0) >= COALESCE(stats.total_expected, 0) THEN 'complete'
        ELSE COALESCE(ot.status, 'validating')
      END`
}

function buildPickOrderTrackingSelectWithStats(columns) {
  const preferred = [
    'id', 'tenant_id', 'outbound_order_no', 'third_order_no',
    'receiver_name', 'logistics_track_no', 'logistics_channel', 'outbound_delivery_at', 'outbound_box_count',
    'surtidor_id', 'surtidor_nombre', 'status', 'notes',
    'assigned_at', 'assigned_by',
    'sorting_started_at', 'sorting_completed_at',
    'validation_started_at', 'validation_completed_at', 'validated_by',
    'tiene_faltantes', 'tiene_anormalidades', 'tiene_reparacion', 'tiene_rastreo',
    'created_at', 'updated_at',
  ]
  const selected = preferred.filter((column) => columns.has(column))
  if (selected.length === 0) {
    return 'ot.*, stats.tenant_id AS tenant_id, stats.outbound_order_no AS outbound_order_no'
  }
  return selected.map((column) => {
    if (column === 'tenant_id') return 'COALESCE(ot.tenant_id, stats.tenant_id) AS tenant_id'
    if (column === 'outbound_order_no') return 'COALESCE(ot.outbound_order_no, stats.outbound_order_no) AS outbound_order_no'
    if (column === 'third_order_no') return 'COALESCE(ot.third_order_no, stats.third_order_no) AS third_order_no'
    if (column === 'receiver_name') return 'COALESCE(ot.receiver_name, stats.receiver_name) AS receiver_name'
    if (column === 'logistics_track_no') return 'COALESCE(ot.logistics_track_no, stats.logistics_track_no) AS logistics_track_no'
    if (column === 'logistics_channel') return 'COALESCE(ot.logistics_channel, stats.logistics_channel) AS logistics_channel'
    if (column === 'outbound_delivery_at') return 'COALESCE(ot.outbound_delivery_at, stats.outbound_delivery_at) AS outbound_delivery_at'
    if (column === 'outbound_box_count') return 'COALESCE(ot.outbound_box_count, stats.outbound_box_count) AS outbound_box_count'
    // Counts may promote an active/partial order once all boxes are scanned, but an
    // explicit closure must stay closed. In particular, /force-validate deliberately
    // stores `complete` with fewer scans than expected. Demoting that row back to
    // `validating` made the UI editable while the write endpoint still (correctly)
    // treated it as closed, so the next save failed with 409.
    if (column === 'status') return `${buildOrderTrackingStatusSql()} AS status`
    if (column === 'validation_started_at') return 'COALESCE(ot.validation_started_at, stats.first_session_at) AS validation_started_at'
    if (column === 'validation_completed_at') return 'COALESCE(ot.validation_completed_at, stats.last_session_at) AS validation_completed_at'
    if (column === 'updated_at') return 'COALESCE(ot.updated_at, stats.last_session_at) AS updated_at'
    if (column === 'created_at') return 'COALESCE(ot.created_at, stats.first_session_at) AS created_at'
    // Computed live from pick_box_status rather than trusting these cached columns —
    // refreshOrderFlags() doesn't run on every write path that can set estado, so the
    // cache can drift stale and silently hide orders that do have an anormalidad box.
    if (column === 'tiene_faltantes' || column === 'tiene_anormalidades') {
      const estado = column === 'tiene_faltantes' ? 'faltante' : 'anormalidad'
      return `EXISTS (
        SELECT 1 FROM pick_box_status pbs
        WHERE pbs.tenant_id = COALESCE(ot.tenant_id, stats.tenant_id)
          AND pbs.outbound_order_no = COALESCE(ot.outbound_order_no, stats.outbound_order_no)
          AND pbs.estado = '${estado}'
      ) AS ${column}`
    }
    return `ot.${column}`
  }).join(', ')
}

function buildPickSessionsStatsSubquery(sessionColumns, includeSessionCount = false) {
  const aggregates = []
  if (includeSessionCount) aggregates.push('COUNT(*) as session_count')
  aggregates.push(
    sessionColumns.has('total_scanned')
      ? 'SUM(COALESCE(total_scanned, 0)) as total_scanned'
      : '0::bigint as total_scanned'
  )
  aggregates.push(
    sessionColumns.has('total_expected')
      ? 'MAX(COALESCE(total_expected, 0)) as total_expected'
      : '0::bigint as total_expected'
  )
  aggregates.push('SUM(COALESCE(rejected_stats.total_rejected, 0)) as total_rejected')
  aggregates.push(sessionColumns.has('third_order_no') ? 'MAX(third_order_no) as third_order_no' : 'NULL::text as third_order_no')
  aggregates.push(sessionColumns.has('receiver_name') ? 'MAX(receiver_name) as receiver_name' : 'NULL::text as receiver_name')
  aggregates.push(sessionColumns.has('logistics_track_no') ? 'MAX(logistics_track_no) as logistics_track_no' : 'NULL::text as logistics_track_no')
  aggregates.push(sessionColumns.has('logistics_channel') ? 'MAX(logistics_channel) as logistics_channel' : 'NULL::text as logistics_channel')
  aggregates.push(sessionColumns.has('outbound_delivery_at') ? 'MAX(outbound_delivery_at) as outbound_delivery_at' : 'NULL::text as outbound_delivery_at')
  aggregates.push(sessionColumns.has('total_expected') ? 'MAX(COALESCE(total_expected, 0)) as outbound_box_count' : '0::bigint as outbound_box_count')
  aggregates.push(sessionColumns.has('ubicacion_nota') ? 'MAX(ubicacion_nota) as ubicacion_nota' : 'NULL::text as ubicacion_nota')
  aggregates.push(sessionColumns.has('started_at') ? 'MIN(started_at) as first_session_at' : 'NULL as first_session_at')
  aggregates.push(sessionColumns.has('updated_at') ? 'MAX(updated_at) as last_session_at' : sessionColumns.has('completed_at') ? 'MAX(completed_at) as last_session_at' : 'NULL as last_session_at')
  return `
    SELECT s.outbound_order_no, s.tenant_id,
           ${aggregates.join(',\n           ')}
    FROM pick_sessions s
    LEFT JOIN (
      SELECT session_id, COUNT(*) AS total_rejected
      FROM pick_events
      WHERE tenant_id = $1
        AND scan_result <> 'ok'
      GROUP BY session_id
    ) rejected_stats ON rejected_stats.session_id = s.id
    WHERE s.tenant_id = $1
    GROUP BY s.outbound_order_no, s.tenant_id
  `
}


async function generateInventorySectionCode(client, tenantId, tz, referenceDate = null) {
  const dayKey = dateKeyInTZ(referenceDate || Date.now(), tz)
  const seqRes = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(tarima_code FROM 14) AS INTEGER)), 0) + 1 AS n
     FROM inv_sessions
     WHERE tenant_id = $1
       AND tarima_code LIKE $2
       AND tarima_code ~ '^SEC-[0-9]{8}M[0-9]+$'`,
    [tenantId, `SEC-${dayKey}M%`]
  )
  return `SEC-${dayKey}M${String(seqRes.rows[0].n).padStart(2, '0')}`
}

function generatedTarimaCode(sectionCode, index) {
  const dayMatch = String(sectionCode || '').match(/^SEC-(\d{8})M\d+$/)
  const dayKey = dayMatch ? dayMatch[1] : getToday().replace(/-/g, '')
  return `PAL-${dayKey}-${String(index + 1).padStart(2, '0')}`
}

// ── Inventory scan batch helpers (shared by session create and session append) ──

// Stamps every scan with a valid ISO scanned_at and reports the batch's own span.
// activeSeconds is the span of THIS batch alone — when the batch is appended to an
// existing tarima, only this span is added to the tarima's active time, never the idle
// gap since the previous batch closed.
function normalizeInventoryScanBatch(scans = []) {
  const normalizedScans = scans.map((scan) => {
    const scannedAt = scan?.scanned_at ? new Date(scan.scanned_at) : new Date()
    return {
      ...scan,
      scanned_at: Number.isNaN(scannedAt.getTime()) ? new Date().toISOString() : scannedAt.toISOString(),
    }
  })
  const times = normalizedScans
    .map((scan) => new Date(scan.scanned_at).getTime())
    .filter((value) => Number.isFinite(value))
  const firstMs = times.length > 0 ? Math.min(...times) : Date.now()
  const lastMs = times.length > 0 ? Math.max(...times) : Date.now()
  return {
    normalizedScans,
    startedAt: new Date(firstMs).toISOString(),
    completedAt: new Date(lastMs).toISOString(),
    activeSeconds: Math.max(0, Math.floor((lastMs - firstMs) / 1000)),
  }
}

function prepareInventoryScanRows(scans, fallbackAt) {
  return scans.map((scan, index) => {
    const scannedCode = normalizeOptionalText(
      scan.scanned_code || scan.raw || scan.code || scan.normalized_code || scan.code2
    )
    const normalizedCode = normalizeScanCode(
      scan.normalized_code || scan.code || scan.scanned_code || scan.raw || scan.code2
    )
    const scanStatus = String(scan.scan_status || '').trim()

    if (!scannedCode || !normalizedCode || !INV_SCAN_STATUSES.has(scanStatus)) {
      throw new Error(`Datos de escaneo inválidos en posición ${index + 1}`)
    }

    return {
      ...scan,
      scanned_code: scannedCode,
      normalized_code: normalizedCode,
      scan_status: scanStatus,
      code2: normalizeOptionalText(scan.code2),
      sku: normalizeOptionalText(scan.sku),
      product_name: normalizeOptionalText(scan.product_name),
      cell_no: normalizeOptionalText(scan.cell_no),
      group_assignment: normalizeOptionalText(scan.group_assignment) || 'auto',
      scanned_at: scan.scanned_at || fallbackAt,
      was_swapped: Boolean(scan.was_swapped),
    }
  })
}

async function insertInventoryScanRows(client, { sessionId, tenantId, operatorId, rows, fallbackAt }) {
  if (rows.length === 0) return
  const COLS = 13
  const values = rows.map((_, i) => {
    const b = i * COLS
    return `(${Array.from({ length: COLS }, (_, k) => `$${b + k + 1}`).join(',')})`
  }).join(',')
  const params = rows.flatMap(s => [
    sessionId, tenantId, s.scanned_code, s.normalized_code, s.code2 || null,
    s.was_swapped || false, s.scan_status, s.sku || null,
    s.product_name || null, s.cell_no || null, s.group_assignment || 'auto',
    s.scanned_at || fallbackAt, operatorId || null,
  ])
  await client.query(
    `INSERT INTO inv_scans
       (session_id, tenant_id, scanned_code, normalized_code, code2, was_swapped,
        scan_status, sku, product_name, cell_no, group_assignment, scanned_at, operator_id)
     VALUES ${values}`,
    params
  )
}

async function recordInventoryContribution(client, { sessionId, tenantId, operatorId, scansAdded, firstScanAt, lastScanAt, activeSeconds }) {
  const seqRes = await client.query(
    'SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM inv_session_contributions WHERE session_id = $1',
    [sessionId]
  )
  await client.query(
    `INSERT INTO inv_session_contributions
       (tenant_id, session_id, operator_id, sequence, scans_added, first_scan_at, last_scan_at, active_seconds)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tenantId, sessionId, operatorId || null, seqRes.rows[0].n, scansAdded, firstScanAt, lastScanAt, activeSeconds]
  )
  return seqRes.rows[0].n
}

function inventoryContributionsQuery(sessionIdParam) {
  return `SELECT c.id, c.session_id, c.sequence, c.operator_id, c.scans_added,
                 c.first_scan_at, c.last_scan_at, c.active_seconds, c.created_at,
                 u.nombre_completo AS operator_nombre
            FROM inv_session_contributions c
            LEFT JOIN usuarios u ON u.id = c.operator_id
           WHERE c.session_id = ${sessionIdParam} AND c.tenant_id = $2
           ORDER BY c.sequence ASC`
}

async function assertSessionOwnership(req, sessionId) {
  const sessionRes = await req.tQuery(
    'SELECT * FROM pick_sessions WHERE id = $1 AND tenant_id = $2',
    [sessionId, req.tenantId]
  )
  if (sessionRes.rows.length === 0) return null
  const session = sessionRes.rows[0]
  const isAdmin = req.fullUser.es_admin_tenant === true ||
    (req.fullUser.es_admin_tenant === undefined && req.fullUser.rol_nombre === 'Administrador')
  if (session.operator_id !== req.user.id && !isAdmin) {
    return false
  }
  return session
}

async function refreshPickSessionTotals(req, sessionId) {
  await req.tQuery(
    `UPDATE pick_sessions s
     SET total_scanned = COALESCE(stats.total_scanned, 0),
         updated_at = now()
     FROM (
       SELECT session_id,
              COALESCE(SUM(COALESCE(quantity, 1)), 0) AS total_scanned
       FROM pick_events
       WHERE session_id = $1
         AND scan_result = 'ok'
       GROUP BY session_id
     ) stats
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [sessionId, req.tenantId]
  )
  await req.tQuery(
    `UPDATE pick_sessions
     SET total_scanned = 0, updated_at = now()
     WHERE id = $1
       AND tenant_id = $2
       AND NOT EXISTS (SELECT 1 FROM pick_events WHERE session_id = $1 AND scan_result = 'ok')`,
    [sessionId, req.tenantId]
  )

  await req.tQuery(
    `UPDATE pick_sessions s
     SET ubicacion_nota = dominant.ubicacion_nota,
         updated_at = now()
     FROM (
       SELECT ubicacion_nota
       FROM pick_events
       WHERE session_id = $1
         AND tenant_id = $2
         AND scan_result = 'ok'
         AND NULLIF(TRIM(ubicacion_nota), '') IS NOT NULL
       GROUP BY ubicacion_nota
       ORDER BY COUNT(*) DESC, MIN(scanned_at) ASC NULLS LAST, ubicacion_nota ASC
       LIMIT 1
     ) dominant
     WHERE s.id = $1
       AND s.tenant_id = $2`,
    [sessionId, req.tenantId]
  )

  const sessionRes = await req.tQuery(
    `SELECT id, outbound_order_no, third_order_no, status, total_expected, total_scanned
     FROM pick_sessions
     WHERE id = $1 AND tenant_id = $2`,
    [sessionId, req.tenantId]
  )
  const session = sessionRes.rows[0]
  if (!session) return

  const expected = parsePositiveInt(session.total_expected, 0)
  const scanned = parsePositiveInt(session.total_scanned, 0)
  if (session.status !== 'open' || expected <= 0 || scanned < expected) return

  const completedRes = await req.tQuery(
    `UPDATE pick_sessions
     SET status = 'complete',
         completed_at = COALESCE(completed_at, now()),
         updated_at = now()
     WHERE id = $1
       AND tenant_id = $2
       AND status = 'open'
     RETURNING *`,
    [sessionId, req.tenantId]
  )
  const completedSession = completedRes.rows[0]
  if (!completedSession?.outbound_order_no) return

  const userNombre = req.fullUser?.nombre_completo || req.user?.email || String(req.user?.id || '')
  await req.tQuery(
    `INSERT INTO pick_order_tracking
       (tenant_id, outbound_order_no, third_order_no, status, validation_completed_at, validated_by)
     VALUES ($1, $2, $3, 'complete', now(), $4)
     ON CONFLICT (tenant_id, outbound_order_no)
     DO UPDATE SET
       third_order_no = COALESCE(EXCLUDED.third_order_no, pick_order_tracking.third_order_no),
       status = 'complete',
       validation_completed_at = now(),
       validated_by = EXCLUDED.validated_by,
       updated_at = now()`,
    [req.tenantId, completedSession.outbound_order_no, completedSession.third_order_no || null, userNombre]
  )
}

async function findExistingOkEvent(queryFn, { tenantId, sessionId, normalizedCode, matchedBoxType, scannedCode, excludeEventId = null }) {
  const candidates = [...new Set([
    compactCanonicalCode(matchedBoxType || ''),
    compactCanonicalCode(normalizedCode || ''),
    compactCanonicalCode(scannedCode || ''),
  ].filter(Boolean))]
  if (!candidates.length) return null

  const params = [sessionId, tenantId, candidates]
  let excludeSql = ''
  if (excludeEventId) {
    params.push(excludeEventId)
    excludeSql = 'AND e.id <> $4'
  }

  const result = await queryFn(
    `SELECT e.id, e.scan_result, e.normalized_code, e.matched_box_type, e.scanned_code,
            COALESCE(SUM(COALESCE(e.quantity, 1)) OVER (), 0) AS existing_count
       FROM pick_events e
      WHERE e.session_id = $1
        AND e.tenant_id = $2
        AND e.scan_result = 'ok'
        ${excludeSql}
        AND REGEXP_REPLACE(
          UPPER(COALESCE(NULLIF(e.matched_box_type, ''), NULLIF(e.normalized_code, ''), NULLIF(e.scanned_code, ''))),
          '[^A-Z0-9]', '', 'g'
        ) = ANY($3::text[])
      ORDER BY e.scanned_at ASC NULLS LAST, e.id ASC
      LIMIT 1`,
    params
  )
  return result.rows[0] || null
}

const BOX_STATUS_TRANSITIONS = {
  pendiente:   new Set(['faltante', 'anormalidad', 'reparacion', 'rastreo']),
  validada:    new Set([]),
  faltante:    new Set(['pendiente', 'anormalidad', 'reparacion', 'rastreo']),
  anormalidad: new Set(['pendiente', 'faltante', 'reparacion', 'rastreo']),
  reparacion:  new Set(['pendiente', 'faltante', 'anormalidad', 'rastreo']),
  rastreo:     new Set(['pendiente', 'faltante', 'anormalidad', 'reparacion']),
}

async function refreshOrderFlags(req, obc) {
  await req.tQuery(
    `UPDATE pick_order_tracking
     SET tiene_faltantes = EXISTS(
           SELECT 1 FROM pick_box_status
           WHERE tenant_id = $1 AND outbound_order_no = $2 AND estado = 'faltante'
         ),
         tiene_anormalidades = EXISTS(
           SELECT 1 FROM pick_box_status
           WHERE tenant_id = $1 AND outbound_order_no = $2 AND estado = 'anormalidad'
         ),
         tiene_reparacion = EXISTS(
           SELECT 1 FROM pick_box_status
           WHERE tenant_id = $1 AND outbound_order_no = $2 AND estado = 'reparacion'
         ),
         tiene_rastreo = EXISTS(
           SELECT 1 FROM pick_box_status
           WHERE tenant_id = $1 AND outbound_order_no = $2 AND estado = 'rastreo'
         ),
         updated_at = now()
     WHERE tenant_id = $1 AND outbound_order_no = $2`,
    [req.tenantId, obc]
  )
}

async function refreshInventorySessionTotals(req, sessionId) {
  await req.tQuery(
    `UPDATE inv_sessions s
     SET total_scans = COALESCE(stats.total_scans, 0),
         total_ok = COALESCE(stats.total_ok, 0),
         total_blocked = COALESCE(stats.total_blocked, 0),
         total_nowms = COALESCE(stats.total_nowms, 0),
         updated_at = now()
     FROM (
       SELECT session_id,
              COUNT(*) AS total_scans,
              COUNT(*) FILTER (WHERE scan_status = 'ok') AS total_ok,
              COUNT(*) FILTER (WHERE scan_status = 'blocked') AS total_blocked,
              COUNT(*) FILTER (WHERE scan_status = 'nowms') AS total_nowms
       FROM inv_scans
       WHERE session_id = $1
       GROUP BY session_id
     ) stats
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [sessionId, req.tenantId]
  )
  await req.tQuery(
    `UPDATE inv_sessions
     SET total_scans = 0, total_ok = 0, total_blocked = 0, total_nowms = 0, updated_at = now()
     WHERE id = $1
       AND tenant_id = $2
       AND NOT EXISTS (SELECT 1 FROM inv_scans WHERE session_id = $1)`,
    [sessionId, req.tenantId]
  )
}

// ── Config ─────────────────────────────────────────────────────────────────

// GET /api/wmshub/sheets-urls — sheet URLs only, accessible to all authenticated users
// Used by googleSheetsService across all modules (Inventario, Surtido, etc.)
router.get('/sheets-urls',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'sistema.wms', action: 'ver' },
    { modulePath: 'surtido.ordenes', action: 'ver' },
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'inventario.escaneo', action: 'ver' },
    { modulePath: 'despacho.folios', action: 'ver' },
    { modulePath: 'despacho.ordenes', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT sheet_inventory_url, sheet_outbound_url
         FROM wms_config WHERE tenant_id = $1 AND is_active = true ORDER BY id DESC LIMIT 1`,
        [req.tenantId]
      )
      const row = result.rows[0] || {}
      res.json({
        success: true,
        data: {
          sheet_inventory_url: row.sheet_inventory_url || null,
          sheet_outbound_url:  row.sheet_outbound_url  || null,
        },
      })
    } catch (err) {
      console.error('GET wmshub/sheets-urls error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo URLs de hojas' })
    }
  }
)

// GET /api/wmshub/config
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
      console.error('GET wmshub/config error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo configuración WMS' })
    }
  }
)

// POST /api/wmshub/config/sheets — save Google Sheets URLs
router.post('/config/sheets',
  authenticateToken, loadFullUser,
  requirePermission('sistema.wms', 'actualizar'),
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
      // Keep production memory predictable; pre-warm can load large Sheets into a Nano instance.
      if (WMS_PREWARM_SHEETS) {
        if (sheet_inventory_url) fetchAndCacheSheet(req.tenantId, sheet_inventory_url).catch(() => {})
        if (sheet_outbound_url)  fetchAndCacheSheet(req.tenantId, sheet_outbound_url).catch(() => {})
      }
    } catch (err) {
      console.error('PUT wmshub/config/sheets error:', err.message)
      res.status(500).json({ success: false, error: 'Error guardando URLs de hojas' })
    }
  }
)

// GET /api/wmshub/proxy/sheet?url=&limit=N — CORS proxy with server-side cache
// limit=0 (or omitted) returns all rows; limit=N returns header + last N data rows.
router.get('/proxy/sheet',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'sistema.wms', action: 'ver' },
    { modulePath: 'surtido.ordenes', action: 'ver' },
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'surtido.registros', action: 'ver' },
    { modulePath: 'inventario.escaneo', action: 'ver' },
    { modulePath: 'despacho.folios', action: 'ver' },
    { modulePath: 'despacho.ordenes', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const { url, limit } = req.query
      if (!url || !url.startsWith('https://docs.google.com/')) {
        return res.status(400).json({ success: false, error: 'URL inválida: debe ser una hoja de Google' })
      }

      const configRes = await req.tQuery(
        `SELECT sheet_inventory_url, sheet_outbound_url
         FROM wms_config
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY id DESC
         LIMIT 1`,
        [req.tenantId]
      )
      const allowedUrls = new Set(
        [configRes.rows[0]?.sheet_inventory_url, configRes.rows[0]?.sheet_outbound_url]
          .filter(Boolean)
          .map(value => String(value).trim())
      )
      const normalizedUrl = String(url).trim()
      if (!allowedUrls.has(normalizedUrl)) {
        return res.status(403).json({ success: false, error: 'URL no autorizada para este tenant' })
      }

      const requestedLimit = parseInt(limit) || 0
      const limitNum = requestedLimit > 0 ? Math.min(requestedLimit, CSV_MAX_LIMIT_ROWS) : 0
      const cacheKey = `${req.tenantId}:${normalizedUrl}`
      const pgKey = `csv:proxy:${crypto.createHash('sha256').update(normalizedUrl).digest('hex').slice(0, 24)}`
      const cached = _csvCache.get(cacheKey)
      const now = Date.now()

      const send = (text, cacheStatus, rowCount) => {
        const payload = limitNum > 0 ? getLastNRows(text, limitNum) : text
        res.set('Content-Type', 'text/plain; charset=utf-8')
          .set('X-Sheet-Cache', cacheStatus)
          .set('X-Sheet-Total-Rows', String(rowCount || 0))
          .send(payload)
      }

      // DB writer: persist to wms_cache after a Google fetch so it survives restarts
      const dbWriter = async (text, rowCount) => {
        if (getTextBytes(text) > CSV_DB_CACHE_MAX_BYTES) return
        await req.tQuery(
          `INSERT INTO wms_cache (key, data, expires_at, tenant_id)
           VALUES ($1, $2, now() + interval '360 seconds', $3)
           ON CONFLICT (tenant_id, key) DO UPDATE
             SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at, created_at = now()`,
          [pgKey, JSON.stringify({ text, rowCount }), req.tenantId]
        )
      }

      if (cached) {
        cached.lastAccessedAt = now
        const age = now - cached.fetchedAt
        if (age < CSV_CACHE_TTL) {
          return send(cached.text, 'hit', cached.rowCount)
        }
        // Stale — respond immediately with old data + refresh in background
        send(cached.text, 'stale', cached.rowCount)
        if (!cached.refreshing) {
          fetchAndCacheSheet(req.tenantId, normalizedUrl, dbWriter).catch(() => {})
        }
        return
      }

      // In-memory miss: check Postgres (survives server restarts)
      try {
        const pgResult = await req.tQuery(
          `SELECT data FROM wms_cache WHERE key = $1 AND tenant_id = $2 AND expires_at > now()`,
          [pgKey, req.tenantId]
        )
        if (pgResult.rows.length > 0) {
          const { text, rowCount } = pgResult.rows[0].data
          setCsvCache(cacheKey, text, rowCount)
          return send(text, 'pg-hit', rowCount)
        }
      } catch { /* non-fatal: fall through to Google fetch */ }

      // Full miss — fetch from Google, cache in memory + DB
      try {
        const text = await fetchAndCacheSheet(req.tenantId, normalizedUrl, dbWriter)
        const entry = _csvCache.get(cacheKey)
        return send(text, 'miss', entry?.rowCount || 0)
      } catch (fetchErr) {
        // Google Sheets is down/slow/timing out and there's no fresh cache —
        // fall back to the last known-good snapshot in Postgres even if it's
        // expired, instead of a hard 502. Stale inventory/outbound data is far
        // more useful to warehouse staff mid-shift than an outright failure.
        const staleRes = await req.tQuery(`SELECT data FROM wms_cache WHERE key = $1 AND tenant_id = $2`, [pgKey, req.tenantId]).catch(() => null)
        if (staleRes?.rows?.length > 0) {
          const { text, rowCount } = staleRes.rows[0].data
          setCsvCache(cacheKey, text, rowCount)
          return send(text, 'stale-error', rowCount)
        }
        throw fetchErr
      }
    } catch (err) {
      console.error('GET wmshub/proxy/sheet error:', err.message)
      res.status(502).json({ success: false, error: 'No se pudo obtener la hoja de cálculo' })
    }
  }
)

// ── Scan Sessions ──────────────────────────────────────────────────────────

// POST /api/wmshub/scan-session — create new scan session
router.post('/scan-session',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'crear'),
  async (req, res) => {
    try {
      const { outbound_order_no, third_order_no, total_expected, expected_boxes, force, receiver_name, logistics_track_no, logistics_channel, outbound_delivery_at } = req.body
      if (!outbound_order_no) return res.status(400).json({ success: false, error: 'outbound_order_no es requerido' })

      // An order must always map to exactly one pick_sessions record. Look up
      // ANY existing session for this order — not just an 'open' one. The old
      // 'open'-only lookup left a gap: the unique index only enforces
      // uniqueness while status='open' (see pick_sessions_open_per_order), so
      // a session that went stale-complete (a scan failed to persist right as
      // the count hit total_expected, or a box got reset afterward) fell
      // through to creating a brand new session — fragmenting the same
      // order's progress across two rows instead of resuming the real one.
      const existing = await req.tQuery(
        `SELECT s.*, u.nombre_completo as operator_nombre
         FROM pick_sessions s
         LEFT JOIN usuarios u ON u.id = s.operator_id
         WHERE s.tenant_id = $1 AND s.outbound_order_no = $2
         ORDER BY s.updated_at DESC
         LIMIT 1`,
        [req.tenantId, outbound_order_no]
      )

      if (existing.rows.length > 0) {
        const s = existing.rows[0]
        const sameOperator = Number(s.operator_id) === Number(req.user.id)

        if (s.status === 'open' && !sameOperator && !force) {
          return res.status(409).json({
            success: false,
            error: 'Esta orden ya está siendo validada',
            details: {
              session_id: s.id,
              operator_id: s.operator_id,
              operator: s.operator_nombre || 'Desconocido',
              started_at: s.started_at,
              status: s.status
            }
          })
        }

        // Genuinely finished (not just stale) — hand it back as-is, don't reopen it.
        const genuinelyComplete = s.status !== 'open' &&
          Number(s.total_expected) > 0 && Number(s.total_scanned) >= Number(s.total_expected)
        if (genuinelyComplete) {
          return res.json({ success: true, data: s, reused: true })
        }

        // Reopen and reuse the single existing record — whether it's this operator
        // resuming, a takeover (force / picking up an abandoned non-open session),
        // or continuing one that had gone stale-complete short of total_expected.
        const needsTakeoverNote = !sameOperator
        const takeoverNote = needsTakeoverNote
          ? `Retomada por ${req.fullUser?.nombre_completo || req.user.email || 'otro operador'}`
          : null
        const nextNotes = takeoverNote ? (s.notes ? `${s.notes} | ${takeoverNote}` : takeoverNote) : s.notes
        const updated = await req.tQuery(
          `UPDATE pick_sessions
           SET operator_id = $1,
               status = 'open',
               completed_at = NULL,
               total_expected = GREATEST(total_expected, $2),
               notes = $3,
               receiver_name = COALESCE(receiver_name, $6),
               logistics_track_no = COALESCE(logistics_track_no, $7),
               logistics_channel = COALESCE(logistics_channel, $8),
               outbound_delivery_at = COALESCE(outbound_delivery_at, $9),
               expected_boxes = CASE WHEN jsonb_array_length($10::jsonb) > 0 THEN $10::jsonb ELSE expected_boxes END,
               updated_at = now()
           WHERE id = $4 AND tenant_id = $5
           RETURNING *`,
          [req.user.id, total_expected || 0, nextNotes, s.id, req.tenantId,
           receiver_name || null, logistics_track_no || null, logistics_channel || null, outbound_delivery_at || null,
           JSON.stringify(normalizeExpectedBoxes(expected_boxes))]
        )
        await upsertOrderTrackingSnapshot(req, req.tenantId, outbound_order_no, {
          third_order_no,
          receiver_name,
          logistics_track_no,
          logistics_channel,
          outbound_delivery_at,
          outbound_box_count: total_expected,
        })
        return res.json({ success: true, data: updated.rows[0], reused: true })
      }

      try {
        const result = await req.tQuery(
          `INSERT INTO pick_sessions
             (tenant_id, outbound_order_no, third_order_no, operator_id, status, total_expected, total_scanned,
              receiver_name, logistics_track_no, logistics_channel, outbound_delivery_at, expected_boxes)
           VALUES ($1, $2, $3, $4, 'open', $5, 0, $6, $7, $8, $9, $10::jsonb)
           RETURNING *`,
          [req.tenantId, outbound_order_no, third_order_no || null, req.user.id, total_expected || 0,
           receiver_name || null, logistics_track_no || null, logistics_channel || null, outbound_delivery_at || null,
           JSON.stringify(normalizeExpectedBoxes(expected_boxes))]
        )
        await upsertOrderTrackingSnapshot(req, req.tenantId, outbound_order_no, {
          third_order_no,
          receiver_name,
          logistics_track_no,
          logistics_channel,
          outbound_delivery_at,
          outbound_box_count: total_expected,
        })
        return res.status(201).json({ success: true, data: result.rows[0] })
      } catch (insertErr) {
        // Unique index race: another request created the open session first — reuse it.
        if (insertErr.code === '23505') {
          const retry = await req.tQuery(
            `SELECT s.*, u.nombre_completo as operator_nombre
             FROM pick_sessions s
             LEFT JOIN usuarios u ON u.id = s.operator_id
             WHERE s.tenant_id = $1 AND s.outbound_order_no = $2 AND s.status = 'open'
             LIMIT 1`,
            [req.tenantId, outbound_order_no]
          )
          if (retry.rows.length > 0) return res.json({ success: true, data: retry.rows[0], reused: true })
        }
        throw insertErr
      }
    } catch (err) {
      console.error('POST wmshub/scan-session error:', err.message)
      res.status(500).json({ success: false, error: 'Error creando sesión de escaneo' })
    }
  }
)

// GET /api/wmshub/scan-sessions — list with pagination
router.get('/scan-sessions',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'surtido.registros', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const { page = 1, pageSize = 20, status, operator_id, operator_ids, fecha_inicio, fecha_fin, outbound_order_no, sort, dir, anormalidad } = req.query
      const tz = getTimezone(req)
      const limit = Math.min(parseInt(pageSize) || 20, 500)
      const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit

      const SORT_COLUMNS = {
        outbound_order_no: 's.outbound_order_no',
        operator_nombre: 'u.nombre_completo',
        started_at: 's.started_at',
        duration: '(COALESCE(scan_times.last_scan_at, s.completed_at) - scan_times.first_scan_at)',
        total_expected: 's.total_expected',
        total_scanned: 'stats.total_scanned',
        status: 's.status',
      }
      const sortCol = SORT_COLUMNS[sort] || 's.started_at'
      const sortDir = String(dir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

      // A session row is created as soon as an operator opens "Validar" for an order (see
      // POST /scan-session), before they scan anything — so orders that were opened but
      // never actually scanned would otherwise clutter this list forever as 0/0 rows.
      // Only surface sessions once they have at least one successful scan.
      const conditions = [
        's.tenant_id = $1',
        `EXISTS (SELECT 1 FROM pick_events pe WHERE pe.session_id = s.id AND pe.tenant_id = s.tenant_id AND pe.scan_result = 'ok')`,
      ]
      const params = [req.tenantId]
      let p = 2

      if (status) {
        // Filter on the same effective status the frontend displays (see
        // effectiveSessionStatus in Registros.jsx), not the raw s.status column —
        // otherwise filtering by "En Proceso" could still show orders that read as
        // "Completado" on screen (and vice versa) whenever the session's status
        // column never got flipped even though the scanned count matches/exceeds
        // total_expected.
        //
        // Reuses stats.total_scanned (joined below) rather than recomputing the
        // scanned count with its own correlated subquery — an earlier version did
        // that and ran the pick_events aggregate 1000+ times per request (once per
        // session row) on top of the identical aggregate the stats join already
        // computes once, which is what actually caused the slowdown.
        const effectiveStatusExpr = `(CASE
          WHEN s.total_expected > 0 AND COALESCE(stats.total_scanned, 0) >= s.total_expected THEN 'complete'
          WHEN s.status = 'complete' AND s.total_expected > 0 THEN 'open'
          ELSE s.status
        END)`
        conditions.push(`${effectiveStatusExpr} = $${p++}`)
        params.push(status)
      }
      if (anormalidad === 'con' || anormalidad === 'sin') {
        // "Anormalidad" here means anything abnormal — not just the literal
        // estado='anormalidad' value, but any non-normal box status (faltante,
        // anormalidad, reparacion, rastreo). Query pick_box_status directly
        // rather than the cached pick_order_tracking.tiene_* flags — those are
        // only refreshed by refreshOrderFlags() on specific write paths and can
        // go stale, silently missing orders that do have an incident box.
        const existsClause = `EXISTS (
          SELECT 1 FROM pick_box_status pbs
          WHERE pbs.tenant_id = s.tenant_id AND pbs.outbound_order_no = s.outbound_order_no
            AND pbs.estado IN ('anormalidad', 'faltante', 'reparacion', 'rastreo')
        )`
        conditions.push(anormalidad === 'con' ? existsClause : `NOT ${existsClause}`)
      }
      const opIds = operator_ids
        ? operator_ids.split(',').map(Number).filter(Boolean)
        : operator_id ? [parseInt(operator_id)] : []
      if (opIds.length === 1) { conditions.push(`s.operator_id = $${p++}`); params.push(opIds[0]) }
      else if (opIds.length > 1) { conditions.push(`s.operator_id = ANY($${p++})`); params.push(opIds) }
      if (fecha_inicio) { conditions.push(`${instantDateInTZ('s.started_at', tz)} >= $${p++}`); params.push(fecha_inicio) }
      if (fecha_fin) { conditions.push(`${instantDateInTZ('s.started_at', tz)} <= $${p++}`); params.push(fecha_fin) }
      if (outbound_order_no) {
        const searchTerm = `%${outbound_order_no}%`
        const normalizedSearch = normalizeScanCode(outbound_order_no)
        const compactSearch = compactCanonicalCode(normalizedSearch || outbound_order_no)
        const searchConditions = [`s.outbound_order_no ILIKE $${p++}`]
        params.push(searchTerm)

        if (normalizedSearch) {
          if (compactSearch) {
            searchConditions.push(`REGEXP_REPLACE(UPPER(COALESCE(s.outbound_order_no, '')), '[^A-Z0-9]', '', 'g') = $${p++}`)
            params.push(compactSearch)
          }
          searchConditions.push(`EXISTS (
            SELECT 1
            FROM pick_events e
            WHERE e.session_id = s.id
              AND e.tenant_id = s.tenant_id
              AND (
                e.scanned_code ILIKE $${p}
                OR e.normalized_code ILIKE $${p}
                OR e.normalized_code = $${p + 1}
                OR REGEXP_REPLACE(
                  UPPER(COALESCE(NULLIF(e.matched_box_type, ''), NULLIF(e.normalized_code, ''), NULLIF(e.scanned_code, ''))),
                  '[^A-Z0-9]', '', 'g'
                ) = $${p + 2}
              )
          )`)
          params.push(searchTerm, normalizedSearch, compactSearch || normalizedSearch)
          p += 3
        }

        conditions.push(`(${searchConditions.join(' OR ')})`)
      }

      const where = conditions.join(' AND ')
      const statsSubquery = `(
        SELECT session_id,
               COALESCE(SUM(COALESCE(quantity, 1)), 0) AS total_scanned
        FROM pick_events
        WHERE tenant_id = $1
          AND scan_result = 'ok'
        GROUP BY session_id
      ) stats`
      // The count query only needs the stats join when the effective-status filter
      // above references stats.total_scanned — skip it otherwise.
      const countStatsJoin = status ? `LEFT JOIN ${statsSubquery} ON stats.session_id = s.id` : ''
      const [sessionsRes, countRes] = await Promise.all([
        req.tQuery(
          `SELECT s.*,
                  COALESCE(stats.total_scanned, 0) AS total_scanned,
                  COALESCE(rejected_stats.total_rejected, 0) AS total_rejected,
                  scan_times.first_scan_at,
                  scan_times.last_scan_at,
                  u.nombre_completo as operator_nombre,
                  EXISTS (
                    SELECT 1 FROM pick_box_status pbs
                    WHERE pbs.tenant_id = s.tenant_id AND pbs.outbound_order_no = s.outbound_order_no
                      AND pbs.estado = 'faltante'
                  ) AS tiene_faltantes,
                  EXISTS (
                    SELECT 1 FROM pick_box_status pbs
                    WHERE pbs.tenant_id = s.tenant_id AND pbs.outbound_order_no = s.outbound_order_no
                      AND pbs.estado = 'anormalidad'
                  ) AS tiene_anormalidades,
                  EXISTS (
                    SELECT 1 FROM pick_box_status pbs
                    WHERE pbs.tenant_id = s.tenant_id AND pbs.outbound_order_no = s.outbound_order_no
                      AND pbs.estado = 'reparacion'
                  ) AS tiene_reparacion,
                  EXISTS (
                    SELECT 1 FROM pick_box_status pbs
                    WHERE pbs.tenant_id = s.tenant_id AND pbs.outbound_order_no = s.outbound_order_no
                      AND pbs.estado = 'rastreo'
                  ) AS tiene_rastreo
           FROM pick_sessions s
           LEFT JOIN ${statsSubquery} ON stats.session_id = s.id
           LEFT JOIN (
             SELECT session_id, COUNT(*) AS total_rejected
             FROM pick_events
             WHERE tenant_id = $1
               AND scan_result <> 'ok'
             GROUP BY session_id
           ) rejected_stats ON rejected_stats.session_id = s.id
           LEFT JOIN (
             SELECT session_id, MIN(scanned_at) AS first_scan_at, MAX(scanned_at) AS last_scan_at
             FROM pick_events
             WHERE tenant_id = $1
             GROUP BY session_id
           ) scan_times ON scan_times.session_id = s.id
           LEFT JOIN usuarios u ON u.id = s.operator_id
           WHERE ${where}
           ORDER BY ${sortCol} ${sortDir} NULLS LAST, s.id DESC
           LIMIT $${p} OFFSET $${p + 1}`,
          [...params, limit, offset]
        ),
        req.tQuery(
          `SELECT COUNT(*) as total FROM pick_sessions s ${countStatsJoin} WHERE ${where}`,
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
      console.error('GET wmshub/scan-sessions error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo sesiones' })
    }
  }
)

// GET /api/wmshub/scan-session/:id
router.get('/scan-session/:id',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'surtido.registros', action: 'ver' },
  ]),
  async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ success: false, error: 'ID de sesión inválido' })
    }
    try {
      const [sessionRes, eventsRes] = await Promise.all([
        req.tQuery(
          `SELECT s.*,
                  COALESCE(stats.total_scanned, 0) AS total_scanned,
                  COALESCE(rejected_stats.total_rejected, 0) AS total_rejected,
                  scan_times.first_scan_at,
                  scan_times.last_scan_at,
                  u.nombre_completo as operator_nombre
           FROM pick_sessions s
           LEFT JOIN (
             SELECT session_id,
                    COALESCE(SUM(COALESCE(quantity, 1)), 0) AS total_scanned
             FROM pick_events
             WHERE tenant_id = $2
               AND scan_result = 'ok'
             GROUP BY session_id
           ) stats ON stats.session_id = s.id
           LEFT JOIN (
             SELECT session_id, COUNT(*) AS total_rejected
             FROM pick_events
             WHERE tenant_id = $2
               AND scan_result <> 'ok'
             GROUP BY session_id
           ) rejected_stats ON rejected_stats.session_id = s.id
           LEFT JOIN (
             SELECT session_id, MIN(scanned_at) AS first_scan_at, MAX(scanned_at) AS last_scan_at
             FROM pick_events
             WHERE tenant_id = $2
             GROUP BY session_id
           ) scan_times ON scan_times.session_id = s.id
           LEFT JOIN usuarios u ON u.id = s.operator_id
           WHERE s.id = $1 AND s.tenant_id = $2`,
          [req.params.id, req.tenantId]
        ),
        req.tQuery(
          // tenant_id is defense-in-depth: RLS is currently inert (app connects as a
          // BYPASSRLS role), and this runs in Promise.all alongside the session check —
          // without it, another tenant's session_id would fetch that tenant's events
          // (they're discarded by the 404 gate below today, but the filter must not
          // depend on that ordering).
          'SELECT * FROM pick_events WHERE session_id = $1 AND tenant_id = $2 ORDER BY scanned_at ASC',
          [req.params.id, req.tenantId]
        ),
      ])

      if (sessionRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
      res.json({
        success: true,
        data: { session: sessionRes.rows[0], events: eventsRes.rows },
      })
    } catch (err) {
      console.error('GET wmshub/scan-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo sesión' })
    }
  }
)

const SURTIDO_EXPORT_MAX_SESSIONS = 300

// POST /api/wmshub/scan-sessions/export-detail — batched session+event detail for the
// Registros and Ordenes bulk exports. Replaces the old Promise.all(getScanSession)
// fan-out on the frontend, which fired one query pair per selected row directly against
// the production pool (max: 4 connections) — selecting more than a handful of rows
// exhausted the pool and surfaced as a wall of 500s.
// Gated at 'actualizar' (not 'ver') to match the two export buttons that call this: both
// Registros' canExport (surtido.registros:actualizar) and Ordenes' canExportOrders
// (surtido.ordenes:actualizar) require that level before the button even renders.
router.post('/scan-sessions/export-detail',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.registros', action: 'actualizar' },
    { modulePath: 'surtido.ordenes', action: 'actualizar' },
  ]),
  async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids)] : []
      if (ids.length === 0) {
        return res.status(400).json({ success: false, error: 'Selecciona al menos una orden' })
      }
      if (ids.length > SURTIDO_EXPORT_MAX_SESSIONS) {
        return res.status(400).json({
          success: false,
          error: `Máximo ${SURTIDO_EXPORT_MAX_SESSIONS} órdenes por exportación`,
        })
      }
      if (!ids.every((id) => UUID_RE.test(id))) {
        return res.status(400).json({ success: false, error: 'Identificador de sesión inválido' })
      }

      const [sessionsRes, eventsRes] = await Promise.all([
        req.tQuery(
          `SELECT s.*,
                  COALESCE(stats.total_scanned, 0) AS total_scanned,
                  COALESCE(rejected_stats.total_rejected, 0) AS total_rejected,
                  scan_times.first_scan_at,
                  scan_times.last_scan_at,
                  u.nombre_completo as operator_nombre
           FROM pick_sessions s
           LEFT JOIN (
             SELECT session_id,
                    COALESCE(SUM(COALESCE(quantity, 1)), 0) AS total_scanned
             FROM pick_events
             WHERE tenant_id = $2 AND session_id = ANY($1::uuid[]) AND scan_result = 'ok'
             GROUP BY session_id
           ) stats ON stats.session_id = s.id
           LEFT JOIN (
             SELECT session_id, COUNT(*) AS total_rejected
             FROM pick_events
             WHERE tenant_id = $2 AND session_id = ANY($1::uuid[]) AND scan_result <> 'ok'
             GROUP BY session_id
           ) rejected_stats ON rejected_stats.session_id = s.id
           LEFT JOIN (
             SELECT session_id, MIN(scanned_at) AS first_scan_at, MAX(scanned_at) AS last_scan_at
             FROM pick_events
             WHERE tenant_id = $2 AND session_id = ANY($1::uuid[])
             GROUP BY session_id
           ) scan_times ON scan_times.session_id = s.id
           LEFT JOIN usuarios u ON u.id = s.operator_id
           WHERE s.id = ANY($1::uuid[]) AND s.tenant_id = $2`,
          [ids, req.tenantId]
        ),
        req.tQuery(
          'SELECT * FROM pick_events WHERE session_id = ANY($1::uuid[]) AND tenant_id = $2 ORDER BY session_id, scanned_at ASC',
          [ids, req.tenantId]
        ),
      ])

      res.json({
        success: true,
        data: { sessions: sessionsRes.rows, events: eventsRes.rows },
      })
    } catch (err) {
      console.error('POST wmshub/scan-sessions/export-detail error:', err.message)
      if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({ success: false, error: 'Servicio no disponible, intenta de nuevo en unos segundos' })
      }
      res.status(500).json({ success: false, error: 'Error preparando exportación de registros' })
    }
  }
)

// PUT /api/wmshub/scan-session/:id — update (complete, add notes, update counts)
router.put('/scan-session/:id',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.validacion', action: 'actualizar' },
    { modulePath: 'surtido.registros', action: 'actualizar' },
  ]),
  async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ success: false, error: 'ID de sesión inválido' })
    }
    try {
      const { status, notes, total_scanned, ubicacion_id, ubicacion_nota } = req.body
      if (status !== undefined && !PICK_SESSION_STATUSES.has(String(status))) {
        return res.status(400).json({ success: false, error: 'Estado de sesión inválido' })
      }
      const sessionRes = await req.tQuery(
        'SELECT * FROM pick_sessions WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (sessionRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })

      const session = sessionRes.rows[0]
      const isAdmin = req.fullUser.es_admin_tenant === true ||
        (req.fullUser.es_admin_tenant === undefined && req.fullUser.rol_nombre === 'Administrador')
      // Editing only the ubicacion is allowed for anyone with 'actualizar' permission on this
      // module, regardless of who ran the session or its status — it's a location correction,
      // not scan data. Any other field (status/notes/total_scanned) still requires ownership.
      const onlyUbicacionEdit = status === undefined && notes === undefined && total_scanned === undefined &&
        (ubicacion_id !== undefined || ubicacion_nota !== undefined)
      if (!onlyUbicacionEdit && session.operator_id !== req.user.id && !isAdmin) {
        return res.status(403).json({ success: false, error: 'No autorizado para modificar esta sesión' })
      }

      const fields = []
      const params = []
      let p = 1
      if (status !== undefined) { fields.push(`status = $${p++}`); params.push(status) }
      if (notes !== undefined) { fields.push(`notes = $${p++}`); params.push(normalizeOptionalText(notes)) }
      if (total_scanned !== undefined) { fields.push(`total_scanned = $${p++}`); params.push(parsePositiveInt(total_scanned, 0)) }
      if (ubicacion_id !== undefined) { fields.push(`ubicacion_id = $${p++}`); params.push(ubicacion_id || null) }
      if (ubicacion_nota !== undefined) { fields.push(`ubicacion_nota = $${p++}`); params.push(normalizeOptionalText(ubicacion_nota)) }
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
      const updatedSession = result.rows[0]

      // Editing the order-level location means moving the validation record as a whole.
      // Keep every event aligned; otherwise refreshPickSessionTotals immediately derives
      // the old dominant event location and silently reverts the value just saved.
      if (ubicacion_nota !== undefined) {
        await req.tQuery(
          `UPDATE pick_events
           SET ubicacion_nota = $1
           WHERE session_id = $2
             AND tenant_id = $3`,
          [normalizeOptionalText(ubicacion_nota), req.params.id, req.tenantId]
        )
        await refreshPickSessionTotals(req, req.params.id)
      }

      if (status === 'complete' || status === 'with_discrepancies') {
        const scanned = total_scanned !== undefined
          ? parsePositiveInt(total_scanned, 0)
          : parsePositiveInt(updatedSession.total_scanned, 0)
        const expected = parsePositiveInt(updatedSession.total_expected, 0)
        const orderStatus = expected > 0 && scanned >= expected ? 'complete' : 'partial'
        const userNombre = req.fullUser?.nombre_completo || null
        await req.tQuery(
          `INSERT INTO pick_order_tracking
             (tenant_id, outbound_order_no, third_order_no, status, validation_completed_at, validated_by)
           VALUES ($1, $2, $3, $4, now(), $5)
           ON CONFLICT (tenant_id, outbound_order_no)
           DO UPDATE SET
             status = EXCLUDED.status,
             validation_completed_at = now(),
             validated_by = EXCLUDED.validated_by,
             updated_at = now()`,
          [req.tenantId, updatedSession.outbound_order_no, updatedSession.third_order_no || null, orderStatus, userNombre]
        )
      }
      const sessionChanges = {}
      if (status !== undefined && status !== session.status) sessionChanges.status = { from: session.status, to: status }
      if (ubicacion_nota !== undefined) {
        const fromUbicacion = session.ubicacion_nota || null
        const toUbicacion = normalizeOptionalText(ubicacion_nota) || null
        if (fromUbicacion !== toUbicacion) sessionChanges.ubicacion_nota = { from: fromUbicacion, to: toUbicacion }
      }
      if (Object.keys(sessionChanges).length > 0) {
        auditLog(req, 'SURTIDO_SESSION_UPDATE', 'pick_session', req.params.id, {
          outbound_order_no: session.outbound_order_no,
          ...sessionChanges,
        })
      }
      res.json({ success: true, data: updatedSession })
    } catch (err) {
      console.error('PUT wmshub/scan-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error actualizando sesión' })
    }
  }
)

router.delete('/scan-session/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'eliminar'),
  async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ success: false, error: 'ID de sesión inválido' })
    }
    const client = await req.tGetClient()
    try {
      await client.query('BEGIN')
      const sessionRes = await client.query(
        `SELECT id, outbound_order_no, status
         FROM pick_sessions
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [req.params.id, req.tenantId]
      )
      if (sessionRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
      }

      const session = sessionRes.rows[0]
      await client.query('DELETE FROM pick_events WHERE session_id = $1', [req.params.id])
      await client.query(
        'DELETE FROM pick_sessions WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      await client.query('COMMIT')
      res.json({ success: true, data: session })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('DELETE wmshub/scan-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error eliminando sesión de validación' })
    } finally {
      client.release()
    }
  }
)

// POST /api/wmshub/scan-event — add scan event
router.post('/scan-event',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'crear'),
  async (req, res) => {
    try {
      const {
        session_id,
        scanned_code,
        normalized_code,
        matched_sku,
        matched_box_type,
        scan_result,
        quantity,
        input_method,
        manual_reason_id,
        manual_reason_label,
        manual_notes,
        ubicacion_nota,
      } = req.body
      if (!session_id || !scanned_code || !scan_result) {
        return res.status(400).json({ success: false, error: 'session_id, scanned_code y scan_result son requeridos' })
      }
      // An offline client can replay a queued scan whose session was never created,
      // so session_id may still be a temp id like "offline-<uuid>". Reject it as 400:
      // a 500 from the uuid cast would make the client retry this forever.
      if (!UUID_RE.test(String(session_id))) {
        return res.status(400).json({ success: false, error: 'ID de sesión inválido' })
      }
      if (!PICK_SCAN_RESULTS.has(String(scan_result))) {
        return res.status(400).json({ success: false, error: 'Resultado de escaneo inválido' })
      }

      const sessionCheck = await req.tQuery(
        'SELECT id, operator_id, outbound_order_no, expected_boxes, status FROM pick_sessions WHERE id = $1 AND tenant_id = $2',
        [session_id, req.tenantId]
      )
      if (sessionCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
      }
      // A browser can submit the final scan immediately after its optimistic UI has
      // requested completion. Accept a late event for an already-complete session:
      // expected-box and duplicate validation below still prevent extra boxes, while
      // the legitimate final request is no longer lost to a timing race.
      if (!['open', 'complete'].includes(sessionCheck.rows[0].status)) {
        return res.status(409).json({ success: false, error: 'La sesión ya no admite más escaneos' })
      }

      const normCode = normalizeScanCode(normalized_code || scanned_code)
      let effectiveScanResult = scan_result
      let serverMatchedBoxType = normalizeOptionalText(matched_box_type)
      if (scan_result === 'ok') {
        const expectedBoxes = normalizeExpectedBoxes(sessionCheck.rows[0].expected_boxes)
        const expectedMatch = matchExpectedBox(expectedBoxes, normCode)
        if (expectedMatch?.ambiguous) {
          return res.status(422).json({
            success: false,
            code: 'AMBIGUOUS_BOX_CODE',
            error: 'El código escaneado no identifica una caja única de esta orden',
          })
        }
        if (!expectedMatch) {
          return res.status(422).json({
            success: false,
            code: expectedBoxes.length ? 'BOX_NOT_IN_ORDER' : 'ORDER_BOX_SNAPSHOT_REQUIRED',
            error: expectedBoxes.length
              ? 'La caja no pertenece a esta orden de salida'
              : 'La orden no tiene un snapshot de cajas válido; vuelve a abrirla desde Validación',
          })
        }
        serverMatchedBoxType = expectedMatch.canonical
        const existingOk = await findExistingOkEvent(
          (sql, params) => req.tQuery(sql, params),
          {
            tenantId: req.tenantId,
            sessionId: session_id,
            normalizedCode: normCode,
            matchedBoxType: serverMatchedBoxType,
            scannedCode: scanned_code,
          }
        )
        const allowedCount = parsePositiveInt(expectedMatch.quantity, 1)
        const existingCount = Number(existingOk?.existing_count ?? 0)
        if (existingCount >= allowedCount) effectiveScanResult = 'duplicate'
      }
      const result = await req.tQuery(
        `INSERT INTO pick_events
           (session_id, tenant_id, scanned_code, normalized_code, matched_sku, matched_box_type, scan_result, quantity,
            input_method, manual_reason_id, manual_reason_label, manual_notes, ubicacion_nota, operator_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          session_id,
          req.tenantId,
          String(scanned_code).trim(),
          normCode,
          normalizeOptionalText(matched_sku),
          serverMatchedBoxType,
          effectiveScanResult,
          parsePositiveInt(quantity, 1),
          input_method || 'scanner',
          manual_reason_id || null,
          normalizeOptionalText(manual_reason_label),
          normalizeOptionalText(manual_notes),
          normalizeOptionalText(ubicacion_nota),
          req.fullUser?.id || null,
        ]
      )

      await refreshPickSessionTotals(req, session_id)

      if (effectiveScanResult === 'ok') {
        const obc = sessionCheck.rows[0].outbound_order_no
        if (obc && normCode) {
          const updatedBy = req.user.email || String(req.user.id)
          const codeVariants = new Set([normCode])
          if (normCode.includes('-')) codeVariants.add(normCode.replace(/-/g, '/'))
          if (normCode.includes('/')) codeVariants.add(normCode.replace(/\//g, '-'))
          for (const variant of codeVariants) {
            await req.tQuery(
              `INSERT INTO pick_box_status (tenant_id, outbound_order_no, box_code, estado, updated_by)
               VALUES ($1, $2, $3, 'validada', $4)
               ON CONFLICT (tenant_id, outbound_order_no, box_code) DO NOTHING`,
              [req.tenantId, obc, variant, updatedBy]
            )
          }
        }
      }

      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('POST wmshub/scan-event error:', err.message)
      res.status(500).json({ success: false, error: 'Error registrando evento de escaneo' })
    }
  }
)

router.post('/scan-event/manual',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'actualizar'),
  async (req, res) => {
    try {
      const {
        session_id,
        scanned_code,
        normalized_code,
        matched_sku,
        matched_box_type,
        quantity,
        manual_reason_id,
        manual_reason_label,
        manual_notes,
        ubicacion_nota,
      } = req.body

      if (!session_id || !scanned_code || !manual_reason_id) {
        return res.status(400).json({ success: false, error: 'session_id, scanned_code y manual_reason_id son requeridos' })
      }
      if (!UUID_RE.test(String(session_id))) {
        return res.status(400).json({ success: false, error: 'ID de sesión inválido' })
      }

      const ownedSession = await assertSessionOwnership(req, session_id)
      let session = ownedSession
      if (ownedSession === null) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
      if (ownedSession === false) {
        const fallbackSession = await req.tQuery(
          'SELECT * FROM pick_sessions WHERE id = $1 AND tenant_id = $2',
          [session_id, req.tenantId]
        )
        if (fallbackSession.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
        }
        session = fallbackSession.rows[0]
      }
      const reasonRes = await req.tQuery(
        'SELECT id, nombre FROM pick_manual_reasons WHERE id = $1 AND tenant_id = $2 AND activo = true',
        [manual_reason_id, req.tenantId]
      )
      if (reasonRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Motivo de ingreso manual no encontrado' })
      }

      const reason = reasonRes.rows[0]
      const normCodeManual = normalizeScanCode(normalized_code || scanned_code)
      const expectedBoxes = normalizeExpectedBoxes(session.expected_boxes)
      const expectedMatch = matchExpectedBox(expectedBoxes, normCodeManual)
      if (expectedMatch?.ambiguous) {
        return res.status(422).json({
          success: false,
          code: 'AMBIGUOUS_BOX_CODE',
          error: 'El código capturado no identifica una caja única de esta orden',
        })
      }
      if (!expectedMatch) {
        return res.status(422).json({
          success: false,
          code: expectedBoxes.length ? 'BOX_NOT_IN_ORDER' : 'ORDER_BOX_SNAPSHOT_REQUIRED',
          error: expectedBoxes.length
            ? 'La caja no pertenece a esta orden de salida'
            : 'La orden no tiene un snapshot de cajas válido; vuelve a abrirla desde Validación',
        })
      }
      let effectiveManualResult = 'ok'
      const existingOk = await findExistingOkEvent(
        (sql, params) => req.tQuery(sql, params),
        {
          tenantId: req.tenantId,
          sessionId: session_id,
          normalizedCode: normCodeManual,
          matchedBoxType: expectedMatch.canonical,
          scannedCode: scanned_code,
        }
      )
      const allowedManualCount = parsePositiveInt(expectedMatch.quantity, 1)
      const existingManualCount = Number(existingOk?.existing_count ?? 0)
      if (existingManualCount >= allowedManualCount) effectiveManualResult = 'duplicate'
      const result = await req.tQuery(
        `INSERT INTO pick_events
           (session_id, tenant_id, scanned_code, normalized_code, matched_sku, matched_box_type, scan_result, quantity,
            input_method, manual_reason_id, manual_reason_label, manual_notes, ubicacion_nota, operator_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual', $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          session_id,
          req.tenantId,
          String(scanned_code).trim(),
          normCodeManual,
          normalizeOptionalText(matched_sku),
          expectedMatch.canonical,
          effectiveManualResult,
          parsePositiveInt(quantity, 1),
          reason.id,
          reason.nombre,
          normalizeOptionalText(manual_notes),
          normalizeOptionalText(ubicacion_nota),
          req.fullUser?.id || null,
        ]
      )
      await refreshPickSessionTotals(req, session_id)
      if (effectiveManualResult === 'ok' && session.outbound_order_no && normCodeManual) {
        const updatedByManual = req.user.email || String(req.user.id)
        const manualVariants = new Set([normCodeManual])
        if (normCodeManual.includes('-')) manualVariants.add(normCodeManual.replace(/-/g, '/'))
        if (normCodeManual.includes('/')) manualVariants.add(normCodeManual.replace(/\//g, '-'))
        for (const variant of manualVariants) {
          await req.tQuery(
            `INSERT INTO pick_box_status (tenant_id, outbound_order_no, box_code, estado, updated_by)
             VALUES ($1, $2, $3, 'validada', $4)
             ON CONFLICT (tenant_id, outbound_order_no, box_code) DO NOTHING`,
            [req.tenantId, session.outbound_order_no, variant, updatedByManual]
          )
        }
      }
      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('POST wmshub/scan-event/manual error:', err.message)
      res.status(500).json({ success: false, error: 'Error registrando ingreso manual' })
    }
  }
)

router.put('/scan-event/:id',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.validacion', action: 'actualizar' },
    { modulePath: 'surtido.registros', action: 'actualizar' },
  ]),
  async (req, res) => {
    try {
      const eventRes = await req.tQuery(
        `SELECT e.*, s.tenant_id, s.status, s.operator_id, s.outbound_order_no, s.expected_boxes
         FROM pick_events e
         JOIN pick_sessions s ON s.id = e.session_id
         WHERE e.id = $1 AND s.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (eventRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Registro no encontrado' })
      const event = eventRes.rows[0]

      const {
        scanned_code,
        normalized_code,
        matched_sku,
        matched_box_type,
        scan_result,
        quantity,
        manual_reason_id,
        manual_reason_label,
        manual_notes,
        ubicacion_nota,
      } = req.body
      if (scan_result !== undefined && !PICK_SCAN_RESULTS.has(String(scan_result))) {
        return res.status(400).json({ success: false, error: 'Resultado de escaneo inválido' })
      }

      // Registros is the correction surface for validation history. Once the user has the
      // module-level update permission, allow code/metadata fixes even if the session is no
      // longer open — totals and effective status are recalculated immediately afterward.
      let resolvedReasonId = manual_reason_id ?? event.manual_reason_id
      let resolvedReasonLabel = manual_reason_label ?? event.manual_reason_label
      if (resolvedReasonId) {
        const reasonRes = await req.tQuery(
          'SELECT id, nombre FROM pick_manual_reasons WHERE id = $1 AND tenant_id = $2 AND activo = true',
          [resolvedReasonId, req.tenantId]
        )
        if (reasonRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Motivo de ingreso manual no encontrado' })
        }
        resolvedReasonLabel = reasonRes.rows[0].nombre
      }

      const nextNormalizedCode = normalizeOptionalText(normalized_code) || event.normalized_code || scanned_code || event.scanned_code
      let nextMatchedBoxType = matched_box_type !== undefined ? normalizeOptionalText(matched_box_type) : event.matched_box_type
      const nextScannedCode = normalizeOptionalText(scanned_code) || event.scanned_code
      let nextScanResult = scan_result || event.scan_result

      if (nextScanResult === 'ok') {
        const expectedBoxes = normalizeExpectedBoxes(event.expected_boxes)
        const expectedMatch = matchExpectedBox(expectedBoxes, nextNormalizedCode || nextScannedCode)
        if (expectedMatch?.ambiguous) {
          return res.status(422).json({
            success: false,
            code: 'AMBIGUOUS_BOX_CODE',
            error: 'El código capturado no identifica una caja única de esta orden',
          })
        }
        if (!expectedMatch) {
          return res.status(422).json({
            success: false,
            code: expectedBoxes.length ? 'BOX_NOT_IN_ORDER' : 'ORDER_BOX_SNAPSHOT_REQUIRED',
            error: expectedBoxes.length
              ? 'La caja no pertenece a esta orden de salida'
              : 'La orden no tiene un snapshot de cajas válido; vuelve a abrirla desde Validación',
          })
        }
        nextMatchedBoxType = expectedMatch.canonical
        const existingOk = await findExistingOkEvent(
          (sql, params) => req.tQuery(sql, params),
          {
            tenantId: req.tenantId,
            sessionId: event.session_id,
            normalizedCode: nextNormalizedCode,
            matchedBoxType: nextMatchedBoxType,
            scannedCode: nextScannedCode,
            excludeEventId: req.params.id,
          }
        )
        const allowedEditCount = parsePositiveInt(expectedMatch.quantity, 1)
        const existingEditCount = Number(existingOk?.existing_count ?? 0)
        if (existingEditCount >= allowedEditCount) nextScanResult = 'duplicate'
      }

      const result = await req.tQuery(
        `UPDATE pick_events
         SET scanned_code = COALESCE($1, scanned_code),
             normalized_code = COALESCE($2, normalized_code),
             matched_sku = $3,
             matched_box_type = $4,
             scan_result = COALESCE($5, scan_result),
             quantity = COALESCE($6, quantity),
             manual_reason_id = $7,
             manual_reason_label = $8,
             manual_notes = $9,
             ubicacion_nota = $10,
             edited_at = now(),
             edited_by = $11
         WHERE id = $12
         RETURNING *`,
        [
          normalizeOptionalText(scanned_code),
          normalizeOptionalText(normalized_code),
          matched_sku !== undefined ? normalizeOptionalText(matched_sku) : event.matched_sku ?? null,
          matched_box_type !== undefined ? normalizeOptionalText(matched_box_type) : event.matched_box_type ?? null,
          nextScanResult || null,
          quantity !== undefined ? parsePositiveInt(quantity, 1) : null,
          resolvedReasonId || null,
          resolvedReasonLabel || null,
          manual_notes !== undefined ? normalizeOptionalText(manual_notes) : event.manual_notes ?? null,
          ubicacion_nota !== undefined ? normalizeOptionalText(ubicacion_nota) : event.ubicacion_nota ?? null,
          req.user.id,
          req.params.id,
        ]
      )
      await refreshPickSessionTotals(req, event.session_id)
      const eventChanges = {}
      if (ubicacion_nota !== undefined) {
        const fromUbicacion = event.ubicacion_nota || null
        const toUbicacion = normalizeOptionalText(ubicacion_nota) || null
        if (fromUbicacion !== toUbicacion) eventChanges.ubicacion_nota = { from: fromUbicacion, to: toUbicacion }
      }
      const codeChanged = (scanned_code !== undefined && normalizeOptionalText(scanned_code) !== event.scanned_code) ||
        (normalized_code !== undefined && normalizeOptionalText(normalized_code) !== event.normalized_code)
      if (codeChanged) {
        eventChanges.code = {
          from: event.normalized_code || event.scanned_code,
          to: result.rows[0].normalized_code || result.rows[0].scanned_code,
        }
      }
      if (Object.keys(eventChanges).length > 0) {
        auditLog(req, 'SURTIDO_EVENT_UPDATE', 'pick_event', req.params.id, {
          outbound_order_no: event.outbound_order_no,
          box_code: event.normalized_code || event.scanned_code,
          ...eventChanges,
        })
      }
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('PUT wmshub/scan-event/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error actualizando registro' })
    }
  }
)

router.delete('/scan-event/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'eliminar'),
  async (req, res) => {
    try {
      const eventRes = await req.tQuery(
        `SELECT e.id, e.session_id, s.status
         FROM pick_events e
         JOIN pick_sessions s ON s.id = e.session_id
         WHERE e.id = $1 AND s.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (eventRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Registro no encontrado' })
      const event = eventRes.rows[0]
      await req.tQuery('DELETE FROM pick_events WHERE id = $1', [req.params.id])
      await refreshPickSessionTotals(req, event.session_id)
      res.json({ success: true })
    } catch (err) {
      console.error('DELETE wmshub/scan-event/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error eliminando registro' })
    }
  }
)

// ── Inventory Sessions (Inventario WMS) ────────────────────────────────────

// POST /api/wmshub/inventory-session — create session with all scans (batch save)
router.post('/inventory-session',
  authenticateToken, loadFullUser,
  requirePermission('inventario.escaneo', 'crear'),
  async (req, res) => {
    const client = await req.tGetClient()
    try {
      const { scan_type, scans = [], notes, ubicacion_id, tarima_code, origin_location } = req.body
      if (!scan_type || !['unificado', 'clasificacion'].includes(scan_type)) {
        return res.status(400).json({ success: false, error: 'scan_type inválido' })
      }
      const tz = getTimezone(req)

      const { normalizedScans, startedAt, completedAt, activeSeconds } = normalizeInventoryScanBatch(scans)

      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [tenantLockKey(req.tenantId, 'inventory-section')])
      const sectionCode = isValidSectionCode(tarima_code)
        ? String(tarima_code).trim()
        : await generateInventorySectionCode(client, req.tenantId, tz, startedAt)

      const groupCodeMap = new Map()
      normalizedScans.forEach(s => {
        const key = String(s.group_assignment || 'auto').trim()
        if (!groupCodeMap.has(key)) {
          groupCodeMap.set(key, generatedTarimaCode(sectionCode, groupCodeMap.size))
        }
      })
      const scansWithGroups = normalizedScans.map(s => ({
        ...s,
        group_assignment: groupCodeMap.get(String(s.group_assignment || 'auto').trim()) || sectionCode,
      }))

      const totals = scansWithGroups.reduce((acc, s) => {
        acc.total++
        if (s.scan_status === 'ok') acc.ok++
        else if (s.scan_status === 'blocked') acc.blocked++
        else acc.nowms++
        return acc
      }, { total: 0, ok: 0, blocked: 0, nowms: 0 })

      const normalizedNotes = scan_type === 'clasificacion'
        ? JSON.stringify({ section_code: sectionCode, tarimas: Object.fromEntries(groupCodeMap), previous_notes: notes || null })
        : notes || null

      const sessionRes = await client.query(
        `INSERT INTO inv_sessions
           (tenant_id, operator_id, scan_type, status, started_at, completed_at, notes, ubicacion_id,
            tarima_code, origin_location, total_scans, total_ok, total_blocked, total_nowms, active_seconds)
         VALUES ($1,$2,$3,'saved',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [req.tenantId, req.user.id, scan_type, startedAt, completedAt, normalizedNotes, ubicacion_id || null,
         sectionCode, origin_location || null, totals.total, totals.ok, totals.blocked, totals.nowms, activeSeconds]
      )
      const session = sessionRes.rows[0]

      const preparedScans = prepareInventoryScanRows(scansWithGroups, startedAt)
      await insertInventoryScanRows(client, {
        sessionId: session.id, tenantId: req.tenantId, operatorId: req.user.id,
        rows: preparedScans, fallbackAt: startedAt,
      })

      await recordInventoryContribution(client, {
        sessionId: session.id, tenantId: req.tenantId, operatorId: req.user.id,
        scansAdded: preparedScans.length, firstScanAt: startedAt, lastScanAt: completedAt,
        activeSeconds,
      })

      await client.query('COMMIT')
      res.status(201).json({ success: true, data: session })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('POST wmshub/inventory-session error:', err)
      const message = err?.message || 'Error guardando sesión de inventario'
      const status = /Datos de escaneo inválidos/i.test(message) ? 400 : 500
      res.status(status).json({
        success: false,
        error: status === 400 ? message : 'Error guardando sesión de inventario',
      })
    } finally {
      client.release()
    }
  }
)

// GET /api/wmshub/inventory-sessions
router.get('/inventory-sessions',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'ver'),
  async (req, res) => {
    try {
      const { page = 1, pageSize = 20, scan_type, date_from, date_to, q } = req.query
      const tz = getTimezone(req)
      const limit = Math.min(parseInt(pageSize) || 20, 500)
      const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit

      const filters = ['s.tenant_id = $1', "s.status = 'saved'"]
      const params = [req.tenantId]
      if (scan_type && ['unificado', 'clasificacion'].includes(scan_type)) {
        filters.push(`s.scan_type = $${params.push(scan_type)}`)
      }
      if (q?.trim()) {
        const term = `%${String(q).trim()}%`
        filters.push(`(
          s.tarima_code ILIKE $${params.push(term)}
          OR EXISTS (
            SELECT 1 FROM usuarios u2
            WHERE u2.id = s.operator_id
              AND u2.nombre_completo ILIKE $${params.push(term)}
          )
          OR COALESCE(s.notes, '') ILIKE $${params.push(term)}
        )`)
      }
      if (date_from) filters.push(`${instantDateInTZ('s.completed_at', tz)} >= $${params.push(date_from)}`)
      if (date_to)   filters.push(`${instantDateInTZ('s.completed_at', tz)} <= $${params.push(date_to)}`)
      const where = filters.join(' AND ')

      const [rows, countRes] = await Promise.all([
        req.tQuery(
          `SELECT s.*, u.nombre_completo as operator_nombre,
                  ub.codigo as ubicacion_codigo, ub.nombre as ubicacion_nombre
           FROM inv_sessions s
           LEFT JOIN usuarios u ON u.id = s.operator_id
           LEFT JOIN dev_ubicaciones ub ON ub.id = s.ubicacion_id
           WHERE ${where}
           ORDER BY s.completed_at DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset]
        ),
        req.tQuery(
          `SELECT COUNT(*) as total FROM inv_sessions s WHERE ${where}`,
          params
        ),
      ])
      res.json({
        success: true,
        data: { records: rows.rows, total: parseInt(countRes.rows[0].total), page: parseInt(page), pageSize: limit },
      })
    } catch (err) {
      console.error('GET wmshub/inventory-sessions error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo sesiones de inventario' })
    }
  }
)

// GET /api/wmshub/inventory-session/:id — with all scans
router.get('/inventory-session/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'ver'),
  async (req, res) => {
    try {
      // Uses the no-timeout export pool: a session's scan list can run into the tens of
      // thousands of rows, which routinely exceeded the main pool's 12s statement_timeout.
      const result = await req.tExportTransaction(async (client) => {
        const [sessionRes, scansRes, contribRes] = await Promise.all([
          client.query(
            `SELECT s.*, u.nombre_completo as operator_nombre,
                    ub.codigo as ubicacion_codigo, ub.nombre as ubicacion_nombre
             FROM inv_sessions s
             LEFT JOIN usuarios u ON u.id = s.operator_id
             LEFT JOIN dev_ubicaciones ub ON ub.id = s.ubicacion_id
             WHERE s.id = $1 AND s.tenant_id = $2`,
            [req.params.id, req.tenantId]
          ),
          client.query(
            // Defense-in-depth tenant_id — RLS is inert under the current BYPASSRLS
            // role, and this runs in parallel with the session check above.
            'SELECT sc.*, u.nombre_completo AS operator_nombre FROM inv_scans sc LEFT JOIN usuarios u ON u.id = sc.operator_id WHERE sc.session_id = $1 AND sc.tenant_id = $2 ORDER BY sc.scanned_at ASC',
            [req.params.id, req.tenantId]
          ),
          client.query(inventoryContributionsQuery('$1'), [req.params.id, req.tenantId]),
        ])
        return { sessionRes, scansRes, contribRes }
      })
      if (result.sessionRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
      res.json({
        success: true,
        data: {
          session: result.sessionRes.rows[0],
          scans: result.scansRes.rows,
          contributions: result.contribRes.rows,
        },
      })
    } catch (err) {
      console.error('GET wmshub/inventory-session/:id error:', err.message)
      if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({ success: false, error: 'Servicio no disponible, intenta de nuevo en unos segundos' })
      }
      res.status(500).json({ success: false, error: 'Error obteniendo sesión' })
    }
  }
)

const INVENTORY_EXPORT_MAX_SESSIONS = 300

// POST /api/wmshub/inventory-sessions/export-detail — full scan-level detail for a bulk
// selection of sessions (replaces the old summary-only bulk export in Registros).
router.post('/inventory-sessions/export-detail',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'editar'),
  async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids)] : []
      if (ids.length === 0) {
        return res.status(400).json({ success: false, error: 'Selecciona al menos una sección' })
      }
      if (ids.length > INVENTORY_EXPORT_MAX_SESSIONS) {
        return res.status(400).json({
          success: false,
          error: `Máximo ${INVENTORY_EXPORT_MAX_SESSIONS} secciones por exportación`,
        })
      }
      if (!ids.every((id) => UUID_RE.test(id))) {
        return res.status(400).json({ success: false, error: 'Identificador de sección inválido' })
      }

      // Uses the no-timeout export pool: many sessions combined can run into the tens
      // of thousands of scan rows, same as the single-session export above.
      const result = await req.tExportTransaction(async (client) => {
        const [sessionsRes, scansRes] = await Promise.all([
          client.query(
            `SELECT s.*, u.nombre_completo as operator_nombre,
                    ub.codigo as ubicacion_codigo, ub.nombre as ubicacion_nombre
             FROM inv_sessions s
             LEFT JOIN usuarios u ON u.id = s.operator_id
             LEFT JOIN dev_ubicaciones ub ON ub.id = s.ubicacion_id
             WHERE s.id = ANY($1::uuid[]) AND s.tenant_id = $2`,
            [ids, req.tenantId]
          ),
          client.query(
            'SELECT * FROM inv_scans WHERE session_id = ANY($1::uuid[]) AND tenant_id = $2 ORDER BY session_id, scanned_at ASC',
            [ids, req.tenantId]
          ),
        ])
        return { sessionsRes, scansRes }
      })

      res.json({
        success: true,
        data: { sessions: result.sessionsRes.rows, scans: result.scansRes.rows },
      })
    } catch (err) {
      console.error('POST wmshub/inventory-sessions/export-detail error:', err.message)
      if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({ success: false, error: 'Servicio no disponible, intenta de nuevo en unos segundos' })
      }
      res.status(500).json({ success: false, error: 'Error preparando exportación detallada' })
    }
  }
)

// PATCH /api/wmshub/inventory-session/:id — update session metadata (origen/destino)
router.patch('/inventory-session/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'actualizar'),
  async (req, res) => {
    try {
      const { origin_location, ubicacion_id } = req.body
      const sessionRes = await req.tQuery(
        'SELECT id FROM inv_sessions WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (sessionRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })

      const fields = []
      const params = []
      let p = 1
      if (origin_location !== undefined) { fields.push(`origin_location = $${p++}`); params.push(normalizeOptionalText(origin_location)) }
      if (ubicacion_id !== undefined) {
        const parsed = ubicacion_id === null || ubicacion_id === '' ? null : parseInt(ubicacion_id, 10)
        fields.push(`ubicacion_id = $${p++}`)
        params.push(Number.isInteger(parsed) ? parsed : null)
      }
      if (fields.length === 0) return res.status(400).json({ success: false, error: 'Sin cambios' })
      fields.push(`updated_at = now()`)
      params.push(req.params.id, req.tenantId)

      await req.tQuery(
        `UPDATE inv_sessions SET ${fields.join(', ')} WHERE id = $${p++} AND tenant_id = $${p}`,
        params
      )
      const enriched = await req.tQuery(
        `SELECT s.*, u.nombre_completo as operator_nombre,
                ub.codigo as ubicacion_codigo, ub.nombre as ubicacion_nombre
         FROM inv_sessions s
         LEFT JOIN usuarios u ON u.id = s.operator_id
         LEFT JOIN dev_ubicaciones ub ON ub.id = s.ubicacion_id
         WHERE s.id = $1 AND s.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      res.json({ success: true, data: enriched.rows[0] })
    } catch (err) {
      console.error('PATCH wmshub/inventory-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error actualizando sesión' })
    }
  }
)

// GET /api/wmshub/inventory-ubicacion-activity?ubicacion_id=&scan_type=
// "¿Esta ubicación ya tiene tarima registrada hoy?" — answered BEFORE saving so the
// operator gets the choice (append vs. new tarima) instead of a blocked save or a
// silent second tarima for boxes that fit in the first one.
//
// Registered under its own path, not /inventory-session/<something>, because
// GET /inventory-session/:id would capture it as an id.
router.get('/inventory-ubicacion-activity',
  authenticateToken, loadFullUser,
  requirePermission('inventario.escaneo', 'crear'),
  async (req, res) => {
    try {
      const ubicacionId = parseInt(req.query.ubicacion_id, 10)
      if (!Number.isInteger(ubicacionId)) {
        return res.status(400).json({ success: false, error: 'ubicacion_id inválido' })
      }
      const tz = getTimezone(req)
      const today = getToday(tz)
      const params = [req.tenantId, ubicacionId, today]
      let scanTypeFilter = ''
      if (req.query.scan_type) {
        if (!['unificado', 'clasificacion'].includes(String(req.query.scan_type))) {
          return res.status(400).json({ success: false, error: 'scan_type inválido' })
        }
        params.push(String(req.query.scan_type))
        scanTypeFilter = ` AND s.scan_type = $${params.length}`
      }

      const sessionsRes = await req.tQuery(
        `SELECT s.id, s.tarima_code, s.scan_type, s.started_at, s.completed_at, s.active_seconds,
                s.total_scans, s.total_ok, s.total_blocked, s.total_nowms,
                s.operator_id, s.origin_location, s.notes,
                u.nombre_completo AS operator_nombre,
                ub.codigo AS ubicacion_codigo, ub.nombre AS ubicacion_nombre
           FROM inv_sessions s
           LEFT JOIN usuarios u ON u.id = s.operator_id
           LEFT JOIN dev_ubicaciones ub ON ub.id = s.ubicacion_id
          WHERE s.tenant_id = $1
            AND s.ubicacion_id = $2
            AND s.status = 'saved'
            AND ${instantDateInTZ('s.started_at', tz)} = $3${scanTypeFilter}
          ORDER BY s.started_at DESC
          LIMIT 10`,
        params
      )

      const sessions = sessionsRes.rows
      if (sessions.length === 0) {
        return res.json({ success: true, data: { date: today, sessions: [] } })
      }

      const sessionIds = sessions.map(s => s.id)
      const [contribRes, groupsRes] = await Promise.all([
        req.tQuery(
          `SELECT c.session_id, c.sequence, c.operator_id, c.scans_added,
                  c.first_scan_at, c.last_scan_at, c.active_seconds,
                  u.nombre_completo AS operator_nombre
             FROM inv_session_contributions c
             LEFT JOIN usuarios u ON u.id = c.operator_id
            WHERE c.tenant_id = $1 AND c.session_id = ANY($2::uuid[])
            ORDER BY c.session_id, c.sequence ASC`,
          [req.tenantId, sessionIds]
        ),
        // Per-tarima breakdown. A clasificación section holds one tarima per
        // classification bucket, and an appended batch may only join the tarima of its
        // OWN bucket — the client needs these counts to show which tarima it is about to
        // grow (or to say that this bucket does not exist in the section yet).
        req.tQuery(
          `SELECT session_id, group_assignment,
                  COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE scan_status = 'ok') AS total_ok,
                  COUNT(*) FILTER (WHERE scan_status = 'blocked') AS total_blocked,
                  COUNT(*) FILTER (WHERE scan_status = 'nowms') AS total_nowms
             FROM inv_scans
            WHERE tenant_id = $1 AND session_id = ANY($2::uuid[])
            GROUP BY session_id, group_assignment`,
          [req.tenantId, sessionIds]
        ),
      ])

      const contribBySession = new Map()
      contribRes.rows.forEach((row) => {
        if (!contribBySession.has(row.session_id)) contribBySession.set(row.session_id, [])
        contribBySession.get(row.session_id).push(row)
      })
      const groupsBySession = new Map()
      groupsRes.rows.forEach((row) => {
        if (!groupsBySession.has(row.session_id)) groupsBySession.set(row.session_id, [])
        groupsBySession.get(row.session_id).push(row)
      })

      res.json({
        success: true,
        data: {
          date: today,
          sessions: sessions.map((s) => {
            const groups = groupsBySession.get(s.id) || []
            // bucket key (ok/blocked/nowms) → tarima code, as written at create time.
            let bucketMap = {}
            if (s.scan_type === 'clasificacion') {
              try {
                const parsed = JSON.parse(s.notes || 'null')
                if (parsed?.tarimas && typeof parsed.tarimas === 'object') bucketMap = parsed.tarimas
              } catch { /* plain-text notes */ }
            }
            return {
              ...s,
              contributions: contribBySession.get(s.id) || [],
              groups: groups.map(g => ({
                ...g,
                total: Number(g.total),
                total_ok: Number(g.total_ok),
                total_blocked: Number(g.total_blocked),
                total_nowms: Number(g.total_nowms),
              })),
              bucket_map: bucketMap,
            }
          }),
        },
      })
    } catch (err) {
      console.error('GET wmshub/inventory-ubicacion-activity error:', err.message)
      res.status(500).json({ success: false, error: 'Error consultando actividad de la ubicación' })
    }
  }
)

// POST /api/wmshub/inventory-session/:id/append — add boxes to an existing tarima.
//
// Any operator with escaneo.crear may append to any tarima of the tenant, including one
// opened by somebody else: two people working the same ubicación at the same time is the
// normal case this exists for. Attribution stays exact — the new boxes carry the
// appending operator on inv_scans.operator_id and the stretch is logged as its own row in
// inv_session_contributions, while the session keeps its original operator as owner.
router.post('/inventory-session/:id/append',
  authenticateToken, loadFullUser,
  requirePermission('inventario.escaneo', 'crear'),
  async (req, res) => {
    if (!UUID_RE.test(String(req.params.id))) {
      return res.status(400).json({ success: false, error: 'ID de sesión inválido' })
    }
    const client = await req.tGetClient()
    try {
      const { scans = [], target_group, target_group_key, scan_type } = req.body
      if (!Array.isArray(scans) || scans.length === 0) {
        return res.status(400).json({ success: false, error: 'No hay registros para agregar' })
      }
      if (scan_type && !['unificado', 'clasificacion'].includes(String(scan_type))) {
        return res.status(400).json({ success: false, error: 'scan_type inválido' })
      }

      await client.query('BEGIN')
      // Serializes concurrent appends to the SAME tarima (two operators finishing at the
      // same second): totals and active_seconds are read-modify-write.
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [tenantLockKey(req.tenantId, `inv-session-${req.params.id}`)])

      const sessionRes = await client.query(
        'SELECT * FROM inv_sessions WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (sessionRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ success: false, error: 'Tarima no encontrada' })
      }
      const session = sessionRes.rows[0]
      if (session.status !== 'saved') {
        await client.query('ROLLBACK')
        return res.status(409).json({ success: false, error: 'La tarima no está disponible para agregar cajas' })
      }

      // A unificado batch and a clasificación section are not the same kind of tarima —
      // merging across them would put boxes under a classification they were never
      // sorted into. The client already filters by scan_type; this covers a stale modal
      // whose candidate list was fetched before the tab's type changed.
      if (scan_type && String(scan_type) !== session.scan_type) {
        await client.query('ROLLBACK')
        return res.status(409).json({
          success: false,
          error: `La tarima es de tipo ${session.scan_type} y el registro es ${scan_type}`,
        })
      }

      const tz = getTimezone(req)
      const sessionDay = dateKeyInTZ(session.started_at, tz)
      if (sessionDay !== dateKeyInTZ(Date.now(), tz)) {
        await client.query('ROLLBACK')
        return res.status(409).json({ success: false, error: 'Solo se pueden agregar cajas a tarimas del día en curso' })
      }

      // active_seconds is backfilled for every pre-existing row by migration 107, but a
      // row whose completed_at was NULL keeps it NULL — falling back to 0 there would
      // silently erase the tarima's original worked time on the first append.
      const priorActiveSeconds = session.active_seconds !== null && session.active_seconds !== undefined
        ? Number(session.active_seconds)
        : (session.started_at && session.completed_at
          ? Math.max(0, Math.floor((new Date(session.completed_at) - new Date(session.started_at)) / 1000))
          : 0)

      const before = {
        total_scans: session.total_scans || 0,
        total_ok: session.total_ok || 0,
        total_blocked: session.total_blocked || 0,
        total_nowms: session.total_nowms || 0,
        active_seconds: priorActiveSeconds,
        completed_at: session.completed_at,
      }

      const { normalizedScans, startedAt, completedAt, activeSeconds } = normalizeInventoryScanBatch(scans)

      // Clasificación sections hold one PAL-… tarima per bucket (ok/blocked/nowms), and
      // the bucket → PAL mapping lives in the session's notes JSON, written at create
      // time. Resolving through it is what makes the appended boxes land on the SAME
      // pallet instead of spawning a new one next to it — the whole point of merging.
      // A bucket the section never had yet becomes a new PAL code, and the mapping is
      // persisted so Registros and later appends resolve it too.
      let groupAssignment = 'unificado'
      let nextNotes = null
      let groupIsNew = false
      if (session.scan_type === 'clasificacion') {
        const existingRes = await client.query(
          'SELECT DISTINCT group_assignment FROM inv_scans WHERE session_id = $1 AND tenant_id = $2',
          [session.id, req.tenantId]
        )
        const existing = existingRes.rows.map(r => r.group_assignment).filter(Boolean)

        let notes = null
        try {
          const parsed = JSON.parse(session.notes || 'null')
          if (parsed && typeof parsed === 'object') notes = parsed
        } catch { /* unificado-style plain-text notes — no mapping to read */ }
        const tarimaMap = notes?.tarimas && typeof notes.tarimas === 'object' ? notes.tarimas : {}

        const requestedCode = normalizeOptionalText(target_group)
        const bucketKey = normalizeOptionalText(target_group_key)
        const mappedCode = bucketKey ? tarimaMap[bucketKey] : null

        if (requestedCode && existing.includes(requestedCode)) {
          groupAssignment = requestedCode
        } else if (mappedCode) {
          groupAssignment = mappedCode
        } else {
          let index = existing.length
          let candidate = generatedTarimaCode(session.tarima_code, index)
          while (existing.includes(candidate)) {
            index += 1
            candidate = generatedTarimaCode(session.tarima_code, index)
          }
          groupAssignment = candidate
          groupIsNew = true
          if (notes && bucketKey) {
            nextNotes = JSON.stringify({ ...notes, tarimas: { ...tarimaMap, [bucketKey]: groupAssignment } })
          }
        }
      }

      const preparedScans = prepareInventoryScanRows(
        normalizedScans.map(s => ({ ...s, group_assignment: groupAssignment })),
        startedAt
      )

      await insertInventoryScanRows(client, {
        sessionId: session.id, tenantId: req.tenantId, operatorId: req.user.id,
        rows: preparedScans, fallbackAt: startedAt,
      })

      const sequence = await recordInventoryContribution(client, {
        sessionId: session.id, tenantId: req.tenantId, operatorId: req.user.id,
        scansAdded: preparedScans.length, firstScanAt: startedAt, lastScanAt: completedAt,
        activeSeconds,
      })

      // Only this batch's own span is added. The idle gap since the previous batch closed
      // is deliberately excluded — the tarima was not being worked during it, and charging
      // it would understate productivity for work that is genuinely one tarima.
      const nextActiveSeconds = before.active_seconds + activeSeconds

      const updatedRes = await client.query(
        `UPDATE inv_sessions s
            SET total_scans = stats.total_scans,
                total_ok = stats.total_ok,
                total_blocked = stats.total_blocked,
                total_nowms = stats.total_nowms,
                active_seconds = $3,
                completed_at = s.started_at + ($3::int * interval '1 second'),
                notes = COALESCE($4, s.notes),
                updated_at = now()
           FROM (
             SELECT COUNT(*) AS total_scans,
                    COUNT(*) FILTER (WHERE scan_status = 'ok') AS total_ok,
                    COUNT(*) FILTER (WHERE scan_status = 'blocked') AS total_blocked,
                    COUNT(*) FILTER (WHERE scan_status = 'nowms') AS total_nowms
               FROM inv_scans WHERE session_id = $1
           ) stats
          WHERE s.id = $1 AND s.tenant_id = $2
          RETURNING s.*`,
        [session.id, req.tenantId, nextActiveSeconds, nextNotes]
      )
      const updated = updatedRes.rows[0]

      await client.query('COMMIT')

      auditLog(req, 'INVENTARIO_TARIMA_APPEND', 'inv_session', session.id, {
        tarima_code: session.tarima_code,
        ubicacion_id: session.ubicacion_id,
        owner_operator_id: session.operator_id,
        appended_by: req.user.id,
        sequence,
        scans_added: preparedScans.length,
        batch_active_seconds: activeSeconds,
        total_before: before.total_scans,
        total_after: updated.total_scans,
      })

      res.json({
        success: true,
        data: {
          session: updated,
          summary: {
            scans_before: before.total_scans,
            scans_added: preparedScans.length,
            scans_after: updated.total_scans,
            active_seconds_before: before.active_seconds,
            active_seconds_added: activeSeconds,
            active_seconds_after: updated.active_seconds,
            batch_started_at: startedAt,
            batch_completed_at: completedAt,
            sequence,
            group_assignment: groupAssignment,
            group_is_new: groupIsNew,
          },
        },
      })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('POST wmshub/inventory-session/:id/append error:', err)
      const message = err?.message || 'Error agregando cajas a la tarima'
      const status = /Datos de escaneo inválidos/i.test(message) ? 400 : 500
      res.status(status).json({
        success: false,
        error: status === 400 ? message : 'Error agregando cajas a la tarima',
      })
    } finally {
      client.release()
    }
  }
)

router.post('/inventory-duplicates/check',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'inventario.escaneo', action: 'crear' },
    { modulePath: 'inventario.registros', action: 'actualizar' },
  ]),
  async (req, res) => {
    try {
      const codes = Array.isArray(req.body?.codes)
        ? [...new Set(req.body.codes.map((value) => String(value || '').trim()).filter(Boolean))]
        : []

      if (codes.length === 0) {
        return res.json({ success: true, data: { date: getToday(getTimezone(req)), matches: [] } })
      }

      const tz = getTimezone(req)
      const today = getToday(tz)
      const result = await req.tQuery(
        `SELECT sc.id,
                sc.session_id,
                sc.scanned_code,
                sc.normalized_code,
                sc.code2,
                sc.was_swapped,
                sc.scan_status,
                sc.group_assignment,
                sc.scanned_at,
                sess.tarima_code,
                sess.scan_type,
                sess.operator_id,
                u.nombre_completo AS operator_nombre
           FROM inv_scans sc
           JOIN inv_sessions sess ON sess.id = sc.session_id
           LEFT JOIN usuarios u ON u.id = sess.operator_id
          WHERE sess.tenant_id = $1
            AND ${instantDateInTZ('sc.scanned_at', tz)} = $2
            AND (
              sc.normalized_code = ANY($3::text[])
              OR COALESCE(sc.code2, '') = ANY($3::text[])
            )
          ORDER BY sc.scanned_at DESC
          LIMIT 50`,
        [req.tenantId, today, codes]
      )

      res.json({ success: true, data: { date: today, matches: result.rows } })
    } catch (err) {
      console.error('POST wmshub/inventory-duplicates/check error:', err.message)
      res.status(500).json({ success: false, error: 'Error validando duplicados de inventario' })
    }
  }
)

router.post('/inventory-scan',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'actualizar'),
  async (req, res) => {
    try {
      const {
        session_id,
        scanned_code,
        normalized_code,
        code2,
        was_swapped,
        scan_status,
        sku,
        product_name,
        cell_no,
        group_assignment,
        manual_notes,
      } = req.body

      if (!session_id || !scanned_code || !scan_status) {
        return res.status(400).json({ success: false, error: 'session_id, scanned_code y scan_status son requeridos' })
      }
      if (!UUID_RE.test(String(session_id))) {
        return res.status(400).json({ success: false, error: 'ID de sesión inválido' })
      }
      if (!INV_SCAN_STATUSES.has(String(scan_status))) {
        return res.status(400).json({ success: false, error: 'Estado de inventario inválido' })
      }

      const sessionRes = await req.tQuery(
        'SELECT id FROM inv_sessions WHERE id = $1 AND tenant_id = $2',
        [session_id, req.tenantId]
      )
      if (sessionRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })

      const result = await req.tQuery(
        `INSERT INTO inv_scans
           (session_id, tenant_id, scanned_code, normalized_code, code2, was_swapped, scan_status, sku, product_name,
            cell_no, group_assignment, input_method, manual_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual',$12)
         RETURNING *`,
        [
          session_id,
          req.tenantId,
          String(scanned_code).trim(),
          normalizeScanCode(normalized_code || scanned_code),
          normalizeOptionalText(code2),
          !!was_swapped,
          scan_status,
          normalizeOptionalText(sku),
          normalizeOptionalText(product_name),
          normalizeOptionalText(cell_no),
          normalizeOptionalText(group_assignment) || 'auto',
          normalizeOptionalText(manual_notes),
        ]
      )
      await refreshInventorySessionTotals(req, session_id)
      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('POST wmshub/inventory-scan error:', err.message)
      res.status(500).json({ success: false, error: 'Error agregando registro de inventario' })
    }
  }
)

router.put('/inventory-scan/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'actualizar'),
  async (req, res) => {
    try {
      const scanRes = await req.tQuery(
        `SELECT s.id, s.session_id, s.code2, s.sku, s.product_name, s.cell_no, s.group_assignment, s.manual_notes
         FROM inv_scans s
         JOIN inv_sessions sess ON sess.id = s.session_id
         WHERE s.id = $1 AND sess.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (scanRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Registro no encontrado' })
      const current = scanRes.rows[0]
      const {
        scanned_code,
        normalized_code,
        code2,
        was_swapped,
        scan_status,
        sku,
        product_name,
        cell_no,
        group_assignment,
        manual_notes,
      } = req.body
      if (scan_status !== undefined && !INV_SCAN_STATUSES.has(String(scan_status))) {
        return res.status(400).json({ success: false, error: 'Estado de inventario inválido' })
      }

      const result = await req.tQuery(
        `UPDATE inv_scans
         SET scanned_code = COALESCE($1, scanned_code),
             normalized_code = COALESCE($2, normalized_code),
             code2 = $3,
             was_swapped = COALESCE($4, was_swapped),
             scan_status = COALESCE($5, scan_status),
             sku = $6,
             product_name = $7,
             cell_no = $8,
             group_assignment = COALESCE($9, group_assignment),
             manual_notes = $10,
             edited_at = now(),
             edited_by = $11
         WHERE id = $12
         RETURNING *`,
        [
          normalizeOptionalText(scanned_code),
          normalizeOptionalText(normalized_code),
          code2 !== undefined ? normalizeOptionalText(code2) : current.code2 ?? null,
          typeof was_swapped === 'boolean' ? was_swapped : null,
          scan_status || null,
          sku !== undefined ? normalizeOptionalText(sku) : current.sku ?? null,
          product_name !== undefined ? normalizeOptionalText(product_name) : current.product_name ?? null,
          cell_no !== undefined ? normalizeOptionalText(cell_no) : current.cell_no ?? null,
          group_assignment !== undefined ? normalizeOptionalText(group_assignment) : current.group_assignment ?? null,
          manual_notes !== undefined ? normalizeOptionalText(manual_notes) : current.manual_notes ?? null,
          req.user.id,
          req.params.id,
        ]
      )
      await refreshInventorySessionTotals(req, current.session_id)
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('PUT wmshub/inventory-scan/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error actualizando registro de inventario' })
    }
  }
)

router.get('/inventory-code-search',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'inventario.escaneo', action: 'ver' },
    { modulePath: 'inventario.registros', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const q = normalizeOptionalText(req.query?.q)
      if (!q) {
        return res.json({ success: true, data: { matches: [], sessions: [] } })
      }

      const term = `%${q}%`
      const matchesRes = await req.tQuery(
        `SELECT sc.id,
                sc.session_id,
                sc.scanned_code,
                sc.normalized_code,
                sc.code2,
                sc.scan_status,
                sc.sku,
                sc.product_name,
                sc.cell_no,
                sc.group_assignment,
                sc.scanned_at,
                sess.tarima_code,
                sess.scan_type,
                sess.origin_location,
                ub.codigo AS ubicacion_destino_codigo,
                ub.nombre AS ubicacion_destino_nombre,
                sess.completed_at,
                u.nombre_completo AS operator_nombre
           FROM inv_scans sc
           JOIN inv_sessions sess ON sess.id = sc.session_id
           LEFT JOIN usuarios u ON u.id = sess.operator_id
           LEFT JOIN dev_ubicaciones ub ON ub.id = sess.ubicacion_id AND ub.tenant_id = sess.tenant_id
          WHERE sess.tenant_id = $1
            AND (
              sc.scanned_code ILIKE $2
              OR sc.normalized_code ILIKE $2
              OR COALESCE(sc.code2, '') ILIKE $2
              OR COALESCE(sc.sku, '') ILIKE $2
              OR COALESCE(sc.product_name, '') ILIKE $2
            )
          ORDER BY sc.scanned_at DESC
          LIMIT 100`,
        [req.tenantId, term]
      )

      const sessionsMap = new Map()
      for (const row of matchesRes.rows) {
        if (sessionsMap.has(row.session_id)) continue
        sessionsMap.set(row.session_id, {
          session_id: row.session_id,
          tarima_code: row.tarima_code,
          scan_type: row.scan_type,
          completed_at: row.completed_at,
          operator_nombre: row.operator_nombre,
        })
      }

      res.json({
        success: true,
        data: {
          matches: matchesRes.rows,
          sessions: [...sessionsMap.values()],
        },
      })
    } catch (err) {
      console.error('GET wmshub/inventory-code-search error:', err.message)
      res.status(500).json({ success: false, error: 'Error buscando código en inventario' })
    }
  }
)

// POST /api/wmshub/box-locations — batch lookup of box locations from inv_scans
// Primary source: Google Sheets inventory (handled client-side).
// This endpoint is a secondary DB fallback using cell_no stored per scan from WMS.
// Search order: scanned_code → normalized_code → code2.
router.post('/box-locations',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.ordenes', action: 'ver' },
    { modulePath: 'inventario.registros', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const { codes } = req.body
      if (!Array.isArray(codes) || codes.length === 0) {
        return res.json({ success: true, data: {} })
      }

      const normalized = [...new Set(codes.map(c => String(c).trim().toLowerCase()).filter(Boolean))]
      if (normalized.length === 0) return res.json({ success: true, data: {} })

      // Limit to 2000 codes per call
      const batch = normalized.slice(0, 2000)

      const byScannedCode = await req.tQuery(
        `SELECT DISTINCT ON (LOWER(sc.scanned_code))
                LOWER(sc.scanned_code) AS code,
                sc.cell_no AS location,
                sc.scanned_at
           FROM inv_scans sc
           JOIN inv_sessions sess ON sess.id = sc.session_id
          WHERE sess.tenant_id = $1
            AND sc.cell_no IS NOT NULL
            AND sc.cell_no <> ''
            AND LOWER(sc.scanned_code) = ANY($2::text[])
          ORDER BY LOWER(sc.scanned_code), sc.scanned_at DESC`,
        [req.tenantId, batch]
      )

      const foundCodes = new Set(byScannedCode.rows.map(r => r.code))
      const rem1 = batch.filter(c => !foundCodes.has(c))

      let byNormalizedCode = { rows: [] }
      if (rem1.length > 0) {
        byNormalizedCode = await req.tQuery(
          `SELECT DISTINCT ON (LOWER(sc.normalized_code))
                  LOWER(sc.normalized_code) AS code,
                  sc.cell_no AS location,
                  sc.scanned_at
             FROM inv_scans sc
             JOIN inv_sessions sess ON sess.id = sc.session_id
            WHERE sess.tenant_id = $1
              AND sc.cell_no IS NOT NULL
              AND sc.cell_no <> ''
              AND LOWER(sc.normalized_code) = ANY($2::text[])
            ORDER BY LOWER(sc.normalized_code), sc.scanned_at DESC`,
          [req.tenantId, rem1]
        )
      }

      const foundAfterNorm = new Set([...foundCodes, ...byNormalizedCode.rows.map(r => r.code)])
      const rem2 = batch.filter(c => !foundAfterNorm.has(c))

      let byCode2 = { rows: [] }
      if (rem2.length > 0) {
        byCode2 = await req.tQuery(
          `SELECT DISTINCT ON (LOWER(sc.code2))
                  LOWER(sc.code2) AS code,
                  sc.cell_no AS location,
                  sc.scanned_at
             FROM inv_scans sc
             JOIN inv_sessions sess ON sess.id = sc.session_id
            WHERE sess.tenant_id = $1
              AND sc.code2 IS NOT NULL
              AND sc.cell_no IS NOT NULL
              AND sc.cell_no <> ''
              AND LOWER(sc.code2) = ANY($2::text[])
            ORDER BY LOWER(sc.code2), sc.scanned_at DESC`,
          [req.tenantId, rem2]
        )
      }

      const locationMap = {}
      for (const row of [...byScannedCode.rows, ...byNormalizedCode.rows, ...byCode2.rows]) {
        if (row.code && row.location && !locationMap[row.code]) {
          locationMap[row.code] = row.location
        }
      }

      res.json({ success: true, data: locationMap })
    } catch (err) {
      console.error('POST wmshub/box-locations error:', err.message)
      res.status(500).json({ success: false, error: 'Error buscando ubicaciones de cajas' })
    }
  }
)

router.delete('/inventory-scan/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'eliminar'),
  async (req, res) => {
    try {
      const scanRes = await req.tQuery(
        `SELECT s.id, s.session_id
         FROM inv_scans s
         JOIN inv_sessions sess ON sess.id = s.session_id
         WHERE s.id = $1 AND sess.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (scanRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Registro no encontrado' })
      const current = scanRes.rows[0]
      await req.tQuery('DELETE FROM inv_scans WHERE id = $1', [req.params.id])
      await refreshInventorySessionTotals(req, current.session_id)
      res.json({ success: true })
    } catch (err) {
      console.error('DELETE wmshub/inventory-scan/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error eliminando registro de inventario' })
    }
  }
)

// DELETE /api/wmshub/inventory-session/:id
router.delete('/inventory-session/:id',
  authenticateToken, loadFullUser,
  requirePermission('inventario.registros', 'eliminar'),
  async (req, res) => {
    const client = await req.tGetClient()
    try {
      await client.query('BEGIN')
      const sessionRes = await client.query(
        `SELECT id, tarima_code, scan_type, status
         FROM inv_sessions
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [req.params.id, req.tenantId]
      )
      if (sessionRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
      }

      await client.query('DELETE FROM inv_scans WHERE session_id = $1', [req.params.id])
      await client.query(
        'DELETE FROM inv_sessions WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      await client.query('COMMIT')
      res.json({ success: true, data: sessionRes.rows[0] })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('DELETE wmshub/inventory-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error eliminando sesión' })
    } finally {
      client.release()
    }
  }
)

// ── Surtidores ─────────────────────────────────────────────────────────────

router.get('/manual-entry-reasons',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.ordenes', action: 'ver' },
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'surtido.registros', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const rows = await req.tQuery(
        `SELECT id, nombre, activo, created_at, updated_at
         FROM pick_manual_reasons
         WHERE tenant_id = $1 AND activo = true
         ORDER BY nombre ASC`,
        [req.tenantId]
      )
      res.json({ success: true, data: rows.rows })
    } catch (err) {
      console.error('GET manual-entry-reasons error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo motivos de ingreso manual' })
    }
  }
)

router.post('/manual-entry-reasons',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      const nombre = String(req.body?.nombre || '').trim()
      if (!nombre) return res.status(400).json({ success: false, error: 'Nombre requerido' })
      const result = await req.tQuery(
        `INSERT INTO pick_manual_reasons (tenant_id, nombre)
         VALUES ($1, $2)
         RETURNING *`,
        [req.tenantId, nombre]
      )
      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Ya existe un motivo con ese nombre' })
      }
      console.error('POST manual-entry-reasons error:', err.message)
      res.status(500).json({ success: false, error: 'Error creando motivo' })
    }
  }
)

router.put('/manual-entry-reasons/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      const nombre = String(req.body?.nombre || '').trim()
      if (!nombre) return res.status(400).json({ success: false, error: 'Nombre requerido' })
      const result = await req.tQuery(
        `UPDATE pick_manual_reasons
         SET nombre = $1, updated_at = now()
         WHERE id = $2 AND tenant_id = $3
         RETURNING *`,
        [nombre, req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Motivo no encontrado' })
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Ya existe un motivo con ese nombre' })
      }
      console.error('PUT manual-entry-reasons error:', err.message)
      res.status(500).json({ success: false, error: 'Error actualizando motivo' })
    }
  }
)

router.delete('/manual-entry-reasons/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'eliminar'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `UPDATE pick_manual_reasons
         SET activo = false, updated_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING id`,
        [req.params.id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Motivo no encontrado' })
      res.json({ success: true })
    } catch (err) {
      console.error('DELETE manual-entry-reasons error:', err.message)
      res.status(500).json({ success: false, error: 'Error eliminando motivo' })
    }
  }
)

router.get('/scan-operators',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.registros', action: 'ver' },
    { modulePath: 'surtido.validacion', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const rows = await req.tQuery(
        `SELECT DISTINCT s.operator_id as id, u.nombre_completo as nombre
         FROM pick_sessions s
         LEFT JOIN usuarios u ON u.id = s.operator_id
         WHERE s.tenant_id = $1 AND s.operator_id IS NOT NULL AND u.nombre_completo IS NOT NULL
         ORDER BY u.nombre_completo ASC`,
        [req.tenantId]
      )
      res.json({ success: true, data: rows.rows })
    } catch (err) {
      res.status(500).json({ success: false, error: 'Error obteniendo operadores' })
    }
  }
)

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
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      const { nombre } = req.body
      if (!nombre?.trim()) return res.status(400).json({ success: false, error: 'Nombre requerido' })
      const normalizedNombre = nombre.trim().toLocaleUpperCase('es-MX')
      const result = await req.tQuery(
        'INSERT INTO pick_surtidores (tenant_id, nombre) VALUES ($1, $2) RETURNING *',
        [req.tenantId, normalizedNombre]
      )
      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, error: 'Ya existe un surtidor con ese nombre' })
      res.status(500).json({ success: false, error: 'Error creando surtidor' })
    }
  }
)

router.put('/surtidores/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      const { nombre } = req.body
      if (!nombre?.trim()) return res.status(400).json({ success: false, error: 'Nombre requerido' })
      const normalizedNombre = nombre.trim().toLocaleUpperCase('es-MX')
      const result = await req.tQuery(
        `UPDATE pick_surtidores
            SET nombre = $3
          WHERE id = $1 AND tenant_id = $2 AND activo = true
        RETURNING *`,
        [req.params.id, req.tenantId, normalizedNombre]
      )
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Surtidor no encontrado' })
      }
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, error: 'Ya existe un surtidor con ese nombre' })
      res.status(500).json({ success: false, error: 'Error actualizando surtidor' })
    }
  }
)

router.delete('/surtidores/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'eliminar'),
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
  requireAnyPermission([
    { modulePath: 'surtido.ordenes', action: 'ver' },
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'surtido.registros', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const [trackingColumns, sessionColumns] = await Promise.all([
        getPublicTableColumns(req, 'pick_order_tracking'),
        getPublicTableColumns(req, 'pick_sessions'),
      ])
      const rows = await req.tQuery(
        `WITH stats AS (${buildPickSessionsStatsSubquery(sessionColumns, true)})
         SELECT ${buildPickOrderTrackingSelectWithStats(trackingColumns)}, s.nombre as surtidor_nombre_actual,
                COALESCE(stats.session_count, 0) as session_count,
                COALESCE(stats.total_scanned, 0) as total_scanned,
                COALESCE(stats.total_expected, 0) as total_expected,
                COALESCE(stats.total_rejected, 0) as total_rejected,
                stats.first_session_at,
                stats.last_session_at,
                stats.ubicacion_nota
         FROM stats
         FULL JOIN pick_order_tracking ot
           ON stats.outbound_order_no = ot.outbound_order_no AND stats.tenant_id = ot.tenant_id
         LEFT JOIN pick_surtidores s ON s.id = ot.surtidor_id
         WHERE COALESCE(ot.tenant_id, stats.tenant_id) = $1
         ORDER BY COALESCE(ot.updated_at, stats.last_session_at, stats.first_session_at) DESC NULLS LAST`,
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
  requireAnyPermission([
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'surtido.validacion', action: 'actualizar' },
    { modulePath: 'surtido.ordenes', action: 'ver' },
    { modulePath: 'surtido.ordenes', action: 'actualizar' },
    { modulePath: 'surtido.registros', action: 'ver' },
    { modulePath: 'surtido.registros', action: 'actualizar' },
  ]),
  async (req, res) => {
    try {
      const [trackingColumns, sessionColumns] = await Promise.all([
        getPublicTableColumns(req, 'pick_order_tracking'),
        getPublicTableColumns(req, 'pick_sessions'),
      ])
      const row = await req.tQuery(
        `WITH stats AS (${buildPickSessionsStatsSubquery(sessionColumns, true)})
         SELECT ${buildPickOrderTrackingSelectWithStats(trackingColumns)}, s.nombre as surtidor_nombre_actual,
                COALESCE(stats.session_count, 0) as session_count,
                COALESCE(stats.total_scanned, 0) as total_scanned,
                COALESCE(stats.total_expected, 0) as total_expected,
                COALESCE(stats.total_rejected, 0) as total_rejected,
                stats.first_session_at,
                stats.last_session_at,
                stats.ubicacion_nota
         FROM stats
         FULL JOIN pick_order_tracking ot
           ON stats.outbound_order_no = ot.outbound_order_no AND stats.tenant_id = ot.tenant_id
         LEFT JOIN pick_surtidores s ON s.id = ot.surtidor_id
         WHERE COALESCE(ot.tenant_id, stats.tenant_id) = $1
           AND COALESCE(ot.outbound_order_no, stats.outbound_order_no) = $2`,
        [req.tenantId, req.params.obc]
      )
      res.json({ success: true, data: row.rows[0] || null })
    } catch (err) {
      console.error('GET order-tracking by obc error:', err.message, '| obc:', req.params.obc)
      res.status(500).json({ success: false, error: 'Error obteniendo seguimiento' })
    }
  }
)

router.post('/order-tracking/bulk',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      const { obcs, surtidor_id, status, notes } = req.body
      if (!Array.isArray(obcs) || obcs.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de órdenes (obcs) es requerida' })
      }
      if (status !== undefined && !ORDER_TRACKING_STATUSES.has(String(status))) {
        return res.status(400).json({ success: false, error: 'Estado de orden inválido' })
      }
      const requestedStatus = status !== undefined ? String(status) : undefined
      const normalizedNotes = normalizeOptionalText(notes)

      let surtidorNombre = null
      if (surtidor_id) {
        const s = await req.tQuery('SELECT nombre FROM pick_surtidores WHERE id = $1 AND tenant_id = $2', [surtidor_id, req.tenantId])
        if (s.rows.length > 0) surtidorNombre = s.rows[0].nombre
      }

      const results = await req.tTransaction(async (client) => {
        const txTrackingColumns = await getPublicTableColumns(client, 'pick_order_tracking')
        const userNombre = req.fullUser?.nombre_completo || null

        // 1. Fetch all existing rows in one query (eliminates N SELECTs)
        const existingRows = await client.query(
          `SELECT outbound_order_no, status
           FROM pick_order_tracking
           WHERE tenant_id = $1 AND outbound_order_no = ANY($2::text[])`,
          [req.tenantId, obcs]
        )
        const existingMap = new Map(existingRows.rows.map(r => [r.outbound_order_no, r]))

        // 2. Detect closed orders that cannot be modified — skip them instead of aborting
        const needsCancelNote = obcs.some(obc => {
          const row = existingMap.get(obc)
          return row?.status === 'complete' && requestedStatus === 'cancelled'
        })
        if (needsCancelNote && !normalizedNotes) {
          const err = new Error('La nota es requerida para cancelar una orden completada')
          err.statusCode = 400
          throw err
        }

        const closedObcs = new Set(obcs.filter(obc => {
          const row = existingMap.get(obc)
          if (!row) return false
          if (!CLOSED_ORDER_TRACKING_STATUSES.has(row.status)) return false
          if (row.status === 'complete' && requestedStatus === 'cancelled' && normalizedNotes) return false
          return surtidor_id !== undefined ||
            (requestedStatus !== undefined && requestedStatus !== row.status)
        }))
        const processableObcs = obcs.filter(obc => !closedObcs.has(obc))

        const newObcs = processableObcs.filter(obc => !existingMap.has(obc))
        const updateObcs = processableObcs.filter(obc => existingMap.has(obc))

        // 3. Check module limit once for all new OBCs
        if (newObcs.length > 0) {
          const limitCheck = await checkModuleLimitForUpdate(
            client,
            req.tenantId,
            'surtido_limit',
            SURTIDO_COUNT_QUERY,
            newObcs.length
          )
          if (limitCheck.limited) {
            const err = new Error('Límite mensual de órdenes surtido alcanzado.')
            err.statusCode = 402
            err.code = 'SURTIDO_LIMIT_REACHED'
            err.used = limitCheck.used
            err.limit = limitCheck.limit
            throw err
          }
        }

        const inserted = []
        const updated = []

        // 4. INSERT all new OBCs in one UNNEST query
        if (newObcs.length > 0) {
          const insertColumns = ['tenant_id', 'outbound_order_no']
          const insertValues = [req.tenantId, newObcs]
          if (txTrackingColumns.has('surtidor_id')) {
            insertColumns.push('surtidor_id')
            insertValues.push(surtidor_id || null)
          }
          if (txTrackingColumns.has('surtidor_nombre')) {
            insertColumns.push('surtidor_nombre')
            insertValues.push(surtidorNombre)
          }
          if (txTrackingColumns.has('status')) {
            insertColumns.push('status')
            insertValues.push(status || 'pending_assignment')
          }
          if (txTrackingColumns.has('notes')) {
            insertColumns.push('notes')
            insertValues.push(normalizedNotes)
          }
          if (txTrackingColumns.has('assigned_at')) {
            insertColumns.push('assigned_at')
            insertValues.push(surtidor_id ? new Date() : null)
          }
          const selectExpressions = insertColumns.map((column, index) => {
            const paramRef = `$${index + 1}`
            return column === 'outbound_order_no' ? `unnest(${paramRef}::text[])` : paramRef
          }).join(', ')
          const resInsert = await client.query(
            `INSERT INTO pick_order_tracking (${insertColumns.join(', ')})
             SELECT ${selectExpressions} RETURNING *`,
            insertValues
          )
          inserted.push(...resInsert.rows)
        }

        // 5. UPDATE all existing OBCs in one ANY query
        if (updateObcs.length > 0) {
          const fields = txTrackingColumns.has('updated_at') ? ['updated_at = now()'] : []
          const params = []
          let p = 1
          if (status !== undefined && txTrackingColumns.has('status')) {
            fields.push(`status = $${p++}`); params.push(requestedStatus)
            if (status === 'assigned') {
              if (txTrackingColumns.has('assigned_at')) fields.push(`assigned_at = now()`)
              if (txTrackingColumns.has('assigned_by')) { fields.push(`assigned_by = $${p++}`); params.push(userNombre) }
            }
            if (status === 'sorting' && txTrackingColumns.has('sorting_started_at'))            fields.push(`sorting_started_at = now()`)
            if (status === 'pending_validation' && txTrackingColumns.has('sorting_completed_at')) fields.push(`sorting_completed_at = now()`)
            if (status === 'validating' && txTrackingColumns.has('validation_started_at'))         fields.push(`validation_started_at = now()`)
            if (status === 'complete') {
              if (txTrackingColumns.has('validation_completed_at')) fields.push(`validation_completed_at = now()`)
              if (txTrackingColumns.has('validated_by')) { fields.push(`validated_by = $${p++}`); params.push(userNombre) }
            }
          }
          if (surtidor_id !== undefined && txTrackingColumns.has('surtidor_id')) {
            fields.push(`surtidor_id = $${p++}`); params.push(surtidor_id || null)
            if (txTrackingColumns.has('surtidor_nombre')) {
              fields.push(`surtidor_nombre = $${p++}`); params.push(surtidorNombre)
            }
            if (surtidor_id && txTrackingColumns.has('assigned_at')) fields.push(`assigned_at = COALESCE(assigned_at, now())`)
          }
          if (notes !== undefined && txTrackingColumns.has('notes')) {
            if (requestedStatus === 'cancelled' && normalizedNotes) {
              fields.push(`notes = CASE WHEN COALESCE(notes, '') <> '' THEN notes || E'\n' || $${p} ELSE $${p} END`)
              p++
              params.push(normalizedNotes)
            } else {
              fields.push(`notes = $${p++}`); params.push(normalizedNotes)
            }
          }
          if (fields.length === 0) {
            return [...inserted]
          }

          params.push(req.tenantId, updateObcs)
          const resUpdate = await client.query(
            `UPDATE pick_order_tracking SET ${fields.join(', ')}
             WHERE tenant_id = $${p++} AND outbound_order_no = ANY($${p}::text[]) RETURNING *`,
            params
          )
          updated.push(...resUpdate.rows)
        }

        if (requestedStatus !== undefined) {
          for (const obc of updateObcs) {
            const from = existingMap.get(obc)?.status
            if (from !== requestedStatus) {
              auditLog(req, 'SURTIDO_ORDER_STATUS_CHANGE', 'pick_order_tracking', obc, {
                outbound_order_no: obc, from, to: requestedStatus, bulk: true,
              })
            }
          }
        }
        if (surtidor_id !== undefined) {
          for (const obc of [...newObcs, ...updateObcs]) {
            auditLog(req, 'SURTIDO_ORDER_ASSIGNED', 'pick_order_tracking', obc, {
              outbound_order_no: obc, surtidor_id: surtidor_id || null, surtidor_nombre: surtidorNombre, bulk: true,
            })
          }
        }

        return { rows: [...inserted, ...updated], skipped: closedObcs.size }
      })

      res.json({ success: true, data: results.rows, skipped: results.skipped })
    } catch (err) {
      console.error('POST order-tracking/bulk error:', err.message)
      const status = err.statusCode || 500
      res.status(status).json({
        success: false,
        error: err.statusCode ? err.message : 'Error en actualización masiva',
        code: err.code || undefined,
        used: err.used ?? undefined,
        limit: err.limit ?? undefined,
      })
    }
  }
)

router.put('/order-tracking/:obc',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      const {
        surtidor_id, status, notes, third_order_no,
        receiver_name, logistics_track_no, logistics_channel, outbound_delivery_at, outbound_box_count,
      } = req.body
      const trackingColumns = await getPublicTableColumns(req, 'pick_order_tracking')
      if (status !== undefined && !ORDER_TRACKING_STATUSES.has(String(status))) {
        return res.status(400).json({ success: false, error: 'Estado de orden inválido' })
      }
      const requestedStatus = status !== undefined ? String(status) : undefined
      const normalizedNotes = normalizeOptionalText(notes)
      const existing = await req.tQuery(
        'SELECT id, status FROM pick_order_tracking WHERE tenant_id = $1 AND outbound_order_no = $2',
        [req.tenantId, req.params.obc]
      )

      let surtidorNombre = null
      if (surtidor_id) {
        const s = await req.tQuery('SELECT nombre FROM pick_surtidores WHERE id = $1 AND tenant_id = $2', [surtidor_id, req.tenantId])
        if (s.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Surtidor no encontrado' })
        }
        surtidorNombre = s.rows[0]?.nombre || null
      }

      if (existing.rows.length === 0) {
        const created = await req.tTransaction(async (client) => {
          const txTrackingColumns = await getPublicTableColumns(client, 'pick_order_tracking')
          const limitCheck = await checkModuleLimitForUpdate(
            client,
            req.tenantId,
            'surtido_limit',
            SURTIDO_COUNT_QUERY,
            1
          )
          if (limitCheck.limited) {
            const err = new Error('Límite mensual de órdenes surtido alcanzado.')
            err.statusCode = 402
            err.code = 'SURTIDO_LIMIT_REACHED'
            err.used = limitCheck.used
            err.limit = limitCheck.limit
            throw err
          }

          const insertColumns = ['tenant_id', 'outbound_order_no']
          const insertValues = [req.tenantId, req.params.obc]
          let ip = 3
          if (txTrackingColumns.has('third_order_no')) {
            insertColumns.push('third_order_no')
            insertValues.push(normalizeOptionalText(third_order_no))
          }
          if (txTrackingColumns.has('receiver_name')) {
            insertColumns.push('receiver_name')
            insertValues.push(normalizeOptionalText(receiver_name))
          }
          if (txTrackingColumns.has('logistics_track_no')) {
            insertColumns.push('logistics_track_no')
            insertValues.push(normalizeOptionalText(logistics_track_no))
          }
          if (txTrackingColumns.has('logistics_channel')) {
            insertColumns.push('logistics_channel')
            insertValues.push(normalizeOptionalText(logistics_channel))
          }
          if (txTrackingColumns.has('outbound_delivery_at')) {
            insertColumns.push('outbound_delivery_at')
            insertValues.push(normalizeOptionalText(outbound_delivery_at))
          }
          if (txTrackingColumns.has('outbound_box_count')) {
            insertColumns.push('outbound_box_count')
            insertValues.push(Number.isFinite(Number(outbound_box_count)) ? Number(outbound_box_count) : null)
          }
          if (txTrackingColumns.has('surtidor_id')) {
            insertColumns.push('surtidor_id')
            insertValues.push(surtidor_id || null)
          }
          if (txTrackingColumns.has('surtidor_nombre')) {
            insertColumns.push('surtidor_nombre')
            insertValues.push(surtidorNombre)
          }
          if (txTrackingColumns.has('status')) {
            insertColumns.push('status')
            insertValues.push(status || 'pending_assignment')
          }
          if (txTrackingColumns.has('notes')) {
            insertColumns.push('notes')
            insertValues.push(normalizeOptionalText(notes))
          }
          if (txTrackingColumns.has('assigned_at')) {
            insertColumns.push('assigned_at')
            insertValues.push(surtidor_id ? new Date() : null)
          }
          const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ')
          const result = await client.query(
            `INSERT INTO pick_order_tracking (${insertColumns.join(', ')})
             VALUES (${placeholders}) RETURNING *`,
            insertValues
          )
          return result.rows[0]
        })
        if (created.status || created.surtidor_id) {
          auditLog(req, 'SURTIDO_ORDER_STATUS_CHANGE', 'pick_order_tracking', req.params.obc, {
            outbound_order_no: req.params.obc,
            to: created.status || null,
            surtidor_nombre: surtidorNombre,
          })
        }
        return res.json({ success: true, data: created })
      }

      const existingStatus = existing.rows[0].status
      const isCompletedCancellation = existingStatus === 'complete' && requestedStatus === 'cancelled'
      if (isCompletedCancellation && !normalizedNotes) {
        return res.status(400).json({ success: false, error: 'La nota es requerida para cancelar una orden completada' })
      }
      if (CLOSED_ORDER_TRACKING_STATUSES.has(existingStatus) && (
        surtidor_id !== undefined ||
        (requestedStatus !== undefined && requestedStatus !== existingStatus && !isCompletedCancellation)
      )) {
        return res.status(409).json({ success: false, error: 'No se puede modificar surtidor o estatus en órdenes completadas o parciales' })
      }

      const fields = trackingColumns.has('updated_at') ? ['updated_at = now()'] : []
      const params = []
      let p = 1
      if (status !== undefined && trackingColumns.has('status')) {
        fields.push(`status = $${p++}`); params.push(requestedStatus)
        const userNombre = req.fullUser?.nombre_completo || null
        if (status === 'assigned') {
          if (trackingColumns.has('assigned_at')) fields.push(`assigned_at = now()`)
          if (trackingColumns.has('assigned_by')) { fields.push(`assigned_by = $${p++}`); params.push(userNombre) }
        }
        if (status === 'sorting' && trackingColumns.has('sorting_started_at'))            fields.push(`sorting_started_at = now()`)
        if (status === 'pending_validation' && trackingColumns.has('sorting_completed_at')) fields.push(`sorting_completed_at = now()`)
        if (status === 'validating' && trackingColumns.has('validation_started_at'))         fields.push(`validation_started_at = now()`)
        if (status === 'complete') {
          if (trackingColumns.has('validation_completed_at')) fields.push(`validation_completed_at = now()`)
          if (trackingColumns.has('validated_by')) { fields.push(`validated_by = $${p++}`); params.push(userNombre) }
        }
      }
      if (surtidor_id !== undefined && trackingColumns.has('surtidor_id')) {
        fields.push(`surtidor_id = $${p++}`); params.push(surtidor_id || null)
        if (trackingColumns.has('surtidor_nombre')) {
          fields.push(`surtidor_nombre = $${p++}`); params.push(surtidorNombre)
        }
        if (surtidor_id && trackingColumns.has('assigned_at')) fields.push(`assigned_at = COALESCE(assigned_at, now())`)
      }
      if (third_order_no !== undefined && trackingColumns.has('third_order_no')) { fields.push(`third_order_no = $${p++}`); params.push(normalizeOptionalText(third_order_no)) }
      if (receiver_name !== undefined && trackingColumns.has('receiver_name')) { fields.push(`receiver_name = $${p++}`); params.push(normalizeOptionalText(receiver_name)) }
      if (logistics_track_no !== undefined && trackingColumns.has('logistics_track_no')) { fields.push(`logistics_track_no = $${p++}`); params.push(normalizeOptionalText(logistics_track_no)) }
      if (logistics_channel !== undefined && trackingColumns.has('logistics_channel')) { fields.push(`logistics_channel = $${p++}`); params.push(normalizeOptionalText(logistics_channel)) }
      if (outbound_delivery_at !== undefined && trackingColumns.has('outbound_delivery_at')) { fields.push(`outbound_delivery_at = $${p++}`); params.push(normalizeOptionalText(outbound_delivery_at)) }
      if (outbound_box_count !== undefined && trackingColumns.has('outbound_box_count')) { fields.push(`outbound_box_count = $${p++}`); params.push(Number.isFinite(Number(outbound_box_count)) ? Number(outbound_box_count) : null) }
      if (notes !== undefined && trackingColumns.has('notes')) {
        if (requestedStatus === 'cancelled' && normalizedNotes) {
          fields.push(`notes = CASE WHEN COALESCE(notes, '') <> '' THEN notes || E'\n' || $${p} ELSE $${p} END`)
          p++
          params.push(normalizedNotes)
        } else {
          fields.push(`notes = $${p++}`); params.push(normalizedNotes)
        }
      }
      if (fields.length === 0) {
        return res.status(200).json({ success: true, data: existing.rows[0] || null })
      }
      params.push(req.tenantId, req.params.obc)

      const result = await req.tQuery(
        `UPDATE pick_order_tracking SET ${fields.join(', ')}
         WHERE tenant_id = $${p++} AND outbound_order_no = $${p} RETURNING *`,
        params
      )
      if (requestedStatus !== undefined && requestedStatus !== existingStatus) {
        auditLog(req, 'SURTIDO_ORDER_STATUS_CHANGE', 'pick_order_tracking', req.params.obc, {
          outbound_order_no: req.params.obc,
          from: existingStatus,
          to: requestedStatus,
        })
      }
      if (surtidor_id !== undefined) {
        auditLog(req, 'SURTIDO_ORDER_ASSIGNED', 'pick_order_tracking', req.params.obc, {
          outbound_order_no: req.params.obc,
          surtidor_id: surtidor_id || null,
          surtidor_nombre: surtidorNombre,
        })
      }
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('PUT order-tracking error:', err.message, '| obc:', req.params.obc, '| body:', JSON.stringify(req.body), '\n', err.stack)
      const status = err.statusCode || 500
      res.status(status).json({ success: false, error: err.statusCode ? err.message : 'Error actualizando seguimiento', code: err.code })
    }
  }
)

// POST /force-validate/bulk — admin only, force-complete many orders in one query
router.post('/force-validate/bulk',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      if (req.fullUser.rol_nombre !== 'Administrador') {
        return res.status(403).json({ success: false, error: 'Solo administradores pueden forzar la validación' })
      }
      const { obcs, reason } = req.body
      if (!Array.isArray(obcs) || obcs.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de órdenes (obcs) es requerida' })
      }
      if (!reason?.trim()) {
        return res.status(400).json({ success: false, error: 'Se requiere un motivo para forzar la validación' })
      }
      const operatorName = req.fullUser.nombre_completo || req.user.email || 'Admin'
      const auditNote = `[Forzado por ${operatorName} - ${new Date().toISOString().slice(0,19).replace('T',' ')}]: ${reason.trim()}`

      const result = await req.tQuery(
        `INSERT INTO pick_order_tracking
           (tenant_id, outbound_order_no, status, validation_completed_at, notes, validated_by)
         SELECT $1, unnest($2::text[]), 'complete', now(), $3, $4
         ON CONFLICT (tenant_id, outbound_order_no) DO UPDATE SET
           status = 'complete',
           validation_completed_at = now(),
           notes = CASE
             WHEN pick_order_tracking.notes IS NOT NULL THEN pick_order_tracking.notes || E'\\n' || EXCLUDED.notes
             ELSE EXCLUDED.notes
           END,
           validated_by = EXCLUDED.validated_by,
           updated_at = now()
         RETURNING *`,
        [req.tenantId, obcs, auditNote, operatorName]
      )
      res.json({ success: true, count: result.rows.length, data: result.rows })
    } catch (err) {
      console.error('POST force-validate/bulk error:', err.message)
      res.status(500).json({ success: false, error: 'Error forzando validación masiva' })
    }
  }
)

// POST /force-validate/:obc — admin only, force-complete an order with audit trail
router.post('/force-validate/:obc',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      if (req.fullUser.rol_nombre !== 'Administrador') {
        return res.status(403).json({ success: false, error: 'Solo administradores pueden forzar la validación' })
      }
      const { reason } = req.body
      if (!reason?.trim()) {
        return res.status(400).json({ success: false, error: 'Se requiere un motivo para forzar la validación' })
      }
      const operatorName = req.fullUser.nombre_completo || req.user.email || 'Admin'
      const auditNote = `[Forzado por ${operatorName} - ${new Date().toISOString().slice(0,19).replace('T',' ')}]: ${reason.trim()}`

      const existing = await req.tQuery(
        'SELECT * FROM pick_order_tracking WHERE tenant_id = $1 AND outbound_order_no = $2',
        [req.tenantId, req.params.obc]
      )

      let result
      if (existing.rows.length === 0) {
        result = await req.tQuery(
          `INSERT INTO pick_order_tracking
             (tenant_id, outbound_order_no, status, validation_completed_at, notes, validated_by)
           VALUES ($1, $2, 'complete', now(), $3, $4) RETURNING *`,
          [req.tenantId, req.params.obc, auditNote, operatorName]
        )
      } else {
        const prev = existing.rows[0].notes
        const newNotes = prev ? `${prev}\n${auditNote}` : auditNote
        result = await req.tQuery(
          `UPDATE pick_order_tracking
           SET status = 'complete', validation_completed_at = now(), notes = $1,
               validated_by = $2, updated_at = now()
           WHERE tenant_id = $3 AND outbound_order_no = $4 RETURNING *`,
          [newNotes, operatorName, req.tenantId, req.params.obc]
        )
      }
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('POST force-validate error:', err.message)
      res.status(500).json({ success: false, error: 'Error forzando validación' })
    }
  }
)

// DELETE scan session events (for recount)
router.delete('/scan-session/:id/events',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'eliminar'),
  async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ success: false, error: 'ID de sesión inválido' })
    }
    try {
      const session = await assertSessionOwnership(req, req.params.id)
      if (session === null || session?.status !== 'open') {
        return res.status(404).json({ success: false, error: 'Sesión no encontrada o cerrada' })
      }
      if (session === false) {
        return res.status(403).json({ success: false, error: 'No autorizado para reiniciar esta sesión' })
      }

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

// GET /api/wmshub/ubicaciones?modulo= — shared ubicaciones for Inventario and Surtido
router.get('/ubicaciones',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'inventario.escaneo', action: 'crear' },
    { modulePath: 'inventario.registros', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const { modulo, full, q, limit } = req.query
      const params = [req.tenantId]
      let filter = ''
      if (modulo && modulo !== 'todos') {
        filter = ` AND (modulo_uso @> ARRAY['todos'] OR modulo_uso @> ARRAY[$${params.length + 1}])`
        params.push(modulo)
      }

      // Optional server-side search by codigo/nombre. Always cap the result set:
      // the catalog can hold thousands of rows, so the client never loads it all.
      const search = normalizeOptionalText(q)
      const cap = Math.min(Math.max(parseInt(limit, 10) || (full ? 300 : 20), 1), 1000)

      if (full) {
        let searchClause = ''
        if (search) {
          params.push(`%${search}%`)
          searchClause = ` AND (u.codigo ILIKE $${params.length} OR u.nombre ILIKE $${params.length})`
        }
        const sql = `SELECT u.*,
                            COALESCE(SUM(i.cantidad_disponible), 0) AS pcs_stock
                       FROM dev_ubicaciones u
                       LEFT JOIN dev_inventario i
                         ON i.ubicacion_id = u.id
                        AND i.tenant_id = u.tenant_id
                        AND i.cantidad_disponible > 0
                      WHERE u.tenant_id = $1${filter}${searchClause}
                      GROUP BY u.id
                      ORDER BY u.activo DESC, u.codigo ASC
                      LIMIT ${cap}`
        const result = await req.tQuery(sql, params)
        return res.json({ success: true, data: result.rows })
      }

      let searchClause = ''
      let orderExtra = ''
      if (search) {
        params.push(`%${search}%`)
        searchClause = ` AND (codigo ILIKE $${params.length} OR nombre ILIKE $${params.length})`
        orderExtra = `(codigo ILIKE $${params.length}) DESC, `
      }
      const sql = `SELECT id, codigo, nombre
                     FROM dev_ubicaciones
                    WHERE tenant_id = $1 AND activo = true${filter}${searchClause}
                    ORDER BY ${orderExtra}codigo ASC
                    LIMIT ${cap}`
      const result = await req.tQuery(sql, params)
      res.json({ success: true, data: result.rows })
    } catch (err) {
      console.error('GET wmshub/ubicaciones error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo ubicaciones' })
    }
  }
)

router.post('/ubicaciones',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'inventario.escaneo', action: 'crear' },
    { modulePath: 'inventario.registros', action: 'actualizar' },
    { modulePath: 'sistema.wms', action: 'actualizar' },
  ]),
  async (req, res) => {
    try {
      const codigo = normalizeOptionalText(req.body?.codigo)
      const nombre = normalizeOptionalText(req.body?.nombre) || codigo
      const descripcion = normalizeOptionalText(req.body?.descripcion)
      const activo = req.body?.activo !== false
      const areaInput = normalizeOptionalText(req.body?.area)
      const area = ['devoluciones', 'inventario'].includes(areaInput) ? areaInput : 'inventario'

      if (!codigo || !nombre) {
        return res.status(400).json({ success: false, error: 'codigo y nombre son requeridos' })
      }

      const result = await req.tQuery(
        `INSERT INTO dev_ubicaciones (codigo, nombre, descripcion, activo, area, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, codigo)
         DO UPDATE
           SET nombre = EXCLUDED.nombre,
               descripcion = COALESCE(EXCLUDED.descripcion, dev_ubicaciones.descripcion),
               activo = EXCLUDED.activo,
               updated_at = now()
         RETURNING *`,
        [codigo, nombre, descripcion, Boolean(activo), area, req.tenantId]
      )

      res.status(201).json({ success: true, ubicacion: result.rows[0] })
    } catch (err) {
      console.error('POST wmshub/ubicaciones error:', err.message)
      res.status(500).json({ success: false, error: 'Error creando ubicacion' })
    }
  }
)

router.put('/ubicaciones/:id',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'inventario.registros', action: 'actualizar' },
    { modulePath: 'sistema.wms', action: 'actualizar' },
  ]),
  async (req, res) => {
    try {
      const codigo = normalizeOptionalText(req.body?.codigo)
      const nombre = normalizeOptionalText(req.body?.nombre) || codigo
      const descripcion = normalizeOptionalText(req.body?.descripcion)
      const activo = req.body?.activo !== false
      const areaInput = normalizeOptionalText(req.body?.area)
      const area = ['devoluciones', 'inventario'].includes(areaInput) ? areaInput : null

      if (!codigo || !nombre) {
        return res.status(400).json({ success: false, error: 'codigo y nombre son requeridos' })
      }

      const result = await req.tQuery(
        `UPDATE dev_ubicaciones
            SET codigo = $1,
                nombre = $2,
                descripcion = $3,
                activo = $4,
                area = COALESCE($5, area),
                updated_at = now()
          WHERE id = $6 AND tenant_id = $7
          RETURNING *`,
        [codigo, nombre, descripcion, Boolean(activo), area, req.params.id, req.tenantId]
      )

      if (!result.rows.length) {
        return res.status(404).json({ success: false, error: 'Ubicacion no encontrada' })
      }

      res.json({ success: true, ubicacion: result.rows[0] })
    } catch (err) {
      console.error('PUT wmshub/ubicaciones/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error actualizando ubicacion' })
    }
  }
)

router.delete('/ubicaciones/:id',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'inventario.registros', action: 'eliminar' },
    { modulePath: 'sistema.wms', action: 'actualizar' },
  ]),
  async (req, res) => {
    try {
      const stockRes = await req.tQuery(
        `SELECT COUNT(*) AS count
           FROM dev_inventario
          WHERE ubicacion_id = $1 AND tenant_id = $2 AND cantidad_disponible > 0`,
        [req.params.id, req.tenantId]
      )

      if (Number.parseInt(stockRes.rows[0].count, 10) > 0) {
        return res.status(409).json({ success: false, error: 'La ubicacion tiene inventario activo; solo se puede desactivar' })
      }

      await req.tQuery(
        'DELETE FROM dev_ubicaciones WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      res.json({ success: true })
    } catch (err) {
      if (err.code === '23503') {
        return res.status(409).json({ success: false, error: 'No se puede eliminar: la ubicación tiene registros históricos asociados. Desactívala en su lugar.' })
      }
      console.error('DELETE wmshub/ubicaciones/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error eliminando ubicacion' })
    }
  }
)

// ── Box status per caja ──────────────────────────────────────────────────────

// GET /wmshub/box-status/:obc — returns { [boxCode]: estado }
router.get('/box-status/:obc',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.ordenes', action: 'ver' },
    { modulePath: 'surtido.validacion', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT box_code, estado FROM pick_box_status
         WHERE tenant_id = $1 AND outbound_order_no = $2`,
        [req.tenantId, req.params.obc]
      )
      const data = {}
      for (const row of result.rows) data[row.box_code] = row.estado
      res.json({ success: true, data })
    } catch (err) {
      console.error('GET box-status error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo estado de cajas' })
    }
  }
)

// PATCH /wmshub/box-status/:obc/:code — update box estado with transition validation
router.patch('/box-status/:obc/:code',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      const { estado, notas } = req.body
      const validEstados = ['pendiente', 'validada', 'faltante', 'anormalidad', 'reparacion', 'rastreo']
      if (!estado || !validEstados.includes(estado)) {
        return res.status(400).json({ success: false, error: 'Estado inválido' })
      }
      const obc = req.params.obc
      const boxCode = req.params.code

      const existing = await req.tQuery(
        `SELECT estado FROM pick_box_status
         WHERE tenant_id = $1 AND outbound_order_no = $2 AND box_code = $3`,
        [req.tenantId, obc, boxCode]
      )

      const currentEstado = existing.rows[0]?.estado ?? 'pendiente'
      const allowed = BOX_STATUS_TRANSITIONS[currentEstado]
      if (!allowed || !allowed.has(estado)) {
        return res.status(409).json({
          success: false,
          error: currentEstado === 'validada'
            ? 'Las cajas validadas no pueden cambiar de estado'
            : `Transición no permitida: ${currentEstado} → ${estado}`,
        })
      }

      const operator = req.fullUser.nombre_completo || req.user.email || String(req.user.id)
      const result = await req.tQuery(
        `INSERT INTO pick_box_status (tenant_id, outbound_order_no, box_code, estado, notas, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (tenant_id, outbound_order_no, box_code) DO UPDATE SET
           estado = EXCLUDED.estado,
           notas = EXCLUDED.notas,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING *`,
        [req.tenantId, obc, boxCode, estado, normalizeOptionalText(notas), operator]
      )

      await refreshOrderFlags(req, obc)
      auditLog(req, 'SURTIDO_BOX_STATUS_CHANGE', 'pick_box_status', `${obc}:${boxCode}`, {
        outbound_order_no: obc,
        box_code: boxCode,
        from: currentEstado,
        to: estado,
        notas: normalizeOptionalText(notas) || undefined,
      })
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('PATCH box-status error:', err.message)
      res.status(500).json({ success: false, error: 'Error actualizando estado de caja' })
    }
  }
)

// GET /wmshub/box-status-incidents/:obc — returns incident records (non-normal estados) with date/user
router.get('/box-status-incidents/:obc',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.ordenes', action: 'ver' },
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'surtido.registros', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT box_code, estado, updated_by, updated_at
         FROM pick_box_status
         WHERE tenant_id = $1 AND outbound_order_no = $2
           AND estado NOT IN ('pendiente', 'validada')
         ORDER BY updated_at DESC`,
        [req.tenantId, req.params.obc]
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      console.error('GET box-status-incidents error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo incidencias' })
    }
  }
)

const SURTIDO_LOG_ACTIONS = [
  'SURTIDO_ORDER_STATUS_CHANGE',
  'SURTIDO_ORDER_ASSIGNED',
  'SURTIDO_BOX_STATUS_CHANGE',
  'SURTIDO_SESSION_UPDATE',
  'SURTIDO_EVENT_UPDATE',
]

// GET /wmshub/order-logs/:obc — general (non per-caja) audit trail for one order's surtido
// lifecycle: status/assignment changes, anomaly marks, ubicacion edits, plus a computed
// validation-start/end entry per operator who scanned this order (from pick_events, not
// a discrete log write — avoids one audit row per scan).
router.get('/order-logs/:obc',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.ordenes', action: 'ver' },
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'surtido.registros', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const obc = req.params.obc
      const [eventsRes, periodsRes] = await Promise.all([
        req.tQuery(
          `SELECT al.id, al.action, al.details, al.created_at AS at,
                  al.user_id, al.user_email, u.nombre_completo AS actor_name
           FROM audit_log al
           LEFT JOIN usuarios u ON u.id = al.user_id
           WHERE al.tenant_id = $1
             AND al.action = ANY($2::text[])
             AND al.details->>'outbound_order_no' = $3
           ORDER BY al.created_at DESC`,
          [req.tenantId, SURTIDO_LOG_ACTIONS, obc]
        ),
        req.tQuery(
          `SELECT COALESCE(pe.operator_id, ps.operator_id) AS operator_id,
                  u.nombre_completo AS operator_name,
                  MIN(pe.scanned_at) AS started_at,
                  MAX(pe.scanned_at) AS ended_at,
                  COUNT(*) AS scan_count
           FROM pick_events pe
           JOIN pick_sessions ps ON ps.id = pe.session_id
           LEFT JOIN usuarios u ON u.id = COALESCE(pe.operator_id, ps.operator_id)
           WHERE ps.tenant_id = $1 AND ps.outbound_order_no = $2
           GROUP BY COALESCE(pe.operator_id, ps.operator_id), u.nombre_completo
           ORDER BY started_at ASC`,
          [req.tenantId, obc]
        ),
      ])

      const events = eventsRes.rows.map(row => ({
        type: 'event',
        action: row.action,
        actor_name: row.actor_name || row.user_email || null,
        at: row.at,
        details: row.details || {},
      }))
      const periods = periodsRes.rows.map(row => ({
        type: 'validation_period',
        actor_name: row.operator_name || null,
        started_at: row.started_at,
        ended_at: row.ended_at,
        scan_count: parseInt(row.scan_count, 10),
        at: row.started_at,
      }))

      const timeline = [...events, ...periods].sort((a, b) => new Date(b.at) - new Date(a.at))
      res.json({ success: true, data: timeline })
    } catch (err) {
      console.error('GET order-logs error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo bitácora de la orden' })
    }
  }
)

// GET /wmshub/box-status-detail/:obc — full status rows (incl. validada) with date/user, for a single box lookup
router.get('/box-status-detail/:obc',
  authenticateToken, loadFullUser,
  requireAnyPermission([
    { modulePath: 'surtido.ordenes', action: 'ver' },
    { modulePath: 'surtido.validacion', action: 'ver' },
    { modulePath: 'surtido.registros', action: 'ver' },
  ]),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT pbs.box_code, pbs.estado, pbs.updated_by, pbs.updated_at,
                COALESCE(u.nombre_completo, pbs.updated_by) AS updated_by_nombre
         FROM pick_box_status pbs
         LEFT JOIN usuarios u
           ON u.tenant_id = pbs.tenant_id
          AND lower(u.email) = lower(pbs.updated_by)
         WHERE pbs.tenant_id = $1 AND pbs.outbound_order_no = $2`,
        [req.tenantId, req.params.obc]
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      console.error('GET box-status-detail error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo detalle de estado de cajas' })
    }
  }
)

export default router

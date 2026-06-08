import { Router } from 'express'
import crypto from 'crypto'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission, getPermissionLevel, resolvePermission } from '../../../shared/middleware/permissions.js'
import { getToday, instantDateInTZ } from '../../../shared/utils/dateUtils.js'

const router = Router()
const DEFAULT_TZ = 'America/Mexico_City'
const PICK_SESSION_STATUSES = new Set(['open', 'complete', 'with_discrepancies'])
const PICK_SCAN_RESULTS = new Set(['ok', 'unexpected', 'duplicate', 'not_found'])
const INV_SCAN_STATUSES = new Set(['ok', 'blocked', 'nowms'])
const ORDER_TRACKING_STATUSES = new Set(['pending_assignment', 'assigned', 'sorting', 'pending_validation', 'validating', 'complete'])

// ── Sheet CSV cache (per tenant+url, stale-while-revalidate) ───────────────
const _csvCache = new Map()
const CSV_CACHE_TTL = 5 * 60 * 1000 // 5 min

function getLastNRows(text, n) {
  if (!n || n <= 0) return text
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const newlines = []
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === '\n') newlines.push(i)
  }
  if (newlines.length <= n) return normalized
  const cutLine = newlines[newlines.length - n - 1] // keep last n data rows + header
  return normalized.slice(0, newlines[0] + 1) + normalized.slice(cutLine + 1)
}

async function fetchAndCacheSheet(tenantId, url) {
  const cacheKey = `${tenantId}:${url}`
  const existing = _csvCache.get(cacheKey)
  if (existing) existing.refreshing = true
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/csv,text/plain' },
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const rowCount = (text.match(/\n/g) || []).length
    _csvCache.set(cacheKey, { text, rowCount, fetchedAt: Date.now(), refreshing: false })
    return text
  } catch (err) {
    if (existing) existing.refreshing = false
    throw err
  }
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

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

function parsePositiveInt(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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

async function assertSessionOwnership(req, sessionId) {
  const sessionRes = await req.tQuery(
    'SELECT * FROM pick_sessions WHERE id = $1 AND tenant_id = $2',
    [sessionId, req.tenantId]
  )
  if (sessionRes.rows.length === 0) return null
  const session = sessionRes.rows[0]
  if (session.operator_id !== req.user.id && req.fullUser.rol_nombre !== 'Administrador') {
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
       SELECT session_id, COALESCE(SUM(quantity), 0) AS total_scanned
       FROM pick_events
       WHERE session_id = $1 AND scan_result = 'ok'
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
  authenticateToken,
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
      // Pre-warm CSV cache in background so first real user gets a cache hit
      if (sheet_inventory_url) fetchAndCacheSheet(req.tenantId, sheet_inventory_url).catch(() => {})
      if (sheet_outbound_url)  fetchAndCacheSheet(req.tenantId, sheet_outbound_url).catch(() => {})
    } catch (err) {
      console.error('PUT wmshub/config/sheets error:', err.message)
      res.status(500).json({ success: false, error: 'Error guardando URLs de hojas' })
    }
  }
)

// GET /api/wmshub/proxy/sheet?url=&limit=N — CORS proxy with server-side cache
// limit=0 (or omitted) returns all rows; limit=N returns header + last N data rows.
router.get('/proxy/sheet',
  authenticateToken,
  async (req, res) => {
    try {
      const { url, limit } = req.query
      if (!url || !url.startsWith('https://docs.google.com/')) {
        return res.status(400).json({ success: false, error: 'URL inválida: debe ser una hoja de Google' })
      }
      const limitNum = parseInt(limit) || 0
      const cacheKey = `${req.tenantId}:${url}`
      const cached = _csvCache.get(cacheKey)
      const now = Date.now()

      const send = (text, cacheStatus, rowCount) => {
        const payload = limitNum > 0 ? getLastNRows(text, limitNum) : text
        res.set('Content-Type', 'text/plain; charset=utf-8')
          .set('X-Sheet-Cache', cacheStatus)
          .set('X-Sheet-Total-Rows', String(rowCount || 0))
          .send(payload)
      }

      if (cached) {
        const age = now - cached.fetchedAt
        if (age < CSV_CACHE_TTL) {
          // Fresh cache hit — respond immediately
          return send(cached.text, 'hit', cached.rowCount)
        }
        // Stale — respond immediately with old data + refresh in background
        send(cached.text, 'stale', cached.rowCount)
        if (!cached.refreshing) {
          fetchAndCacheSheet(req.tenantId, url).catch(() => {})
        }
        return
      }

      // Cache miss — fetch, cache, respond
      const text = await fetchAndCacheSheet(req.tenantId, url)
      const entry = _csvCache.get(cacheKey)
      send(text, 'miss', entry?.rowCount || 0)
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
      const { page = 1, pageSize = 20, status, operator_id, fecha_inicio, fecha_fin, outbound_order_no } = req.query
      const tz = getTimezone(req)
      const limit = Math.min(parseInt(pageSize) || 20, 100)
      const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit

      const conditions = ['s.tenant_id = $1']
      const params = [req.tenantId]
      let p = 2

      if (status) { conditions.push(`s.status = $${p++}`); params.push(status) }
      if (operator_id) { conditions.push(`s.operator_id = $${p++}`); params.push(parseInt(operator_id)) }
      if (fecha_inicio) { conditions.push(`${instantDateInTZ('s.started_at', tz)} >= $${p++}`); params.push(fecha_inicio) }
      if (fecha_fin) { conditions.push(`${instantDateInTZ('s.started_at', tz)} <= $${p++}`); params.push(fecha_fin) }
      if (outbound_order_no) { conditions.push(`s.outbound_order_no ILIKE $${p++}`); params.push(`%${outbound_order_no}%`) }

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
      console.error('GET wmshub/scan-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo sesión' })
    }
  }
)

// PUT /api/wmshub/scan-session/:id — update (complete, add notes, update counts)
router.put('/scan-session/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'actualizar'),
  async (req, res) => {
    try {
      const { status, notes, total_scanned, ubicacion_id } = req.body
      if (status !== undefined && !PICK_SESSION_STATUSES.has(String(status))) {
        return res.status(400).json({ success: false, error: 'Estado de sesión inválido' })
      }
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
      if (notes !== undefined) { fields.push(`notes = $${p++}`); params.push(normalizeOptionalText(notes)) }
      if (total_scanned !== undefined) { fields.push(`total_scanned = $${p++}`); params.push(parsePositiveInt(total_scanned, 0)) }
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
      console.error('PUT wmshub/scan-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error actualizando sesión' })
    }
  }
)

router.delete('/scan-session/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'eliminar'),
  async (req, res) => {
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
      } = req.body
      if (!session_id || !scanned_code || !scan_result) {
        return res.status(400).json({ success: false, error: 'session_id, scanned_code y scan_result son requeridos' })
      }
      if (!PICK_SCAN_RESULTS.has(String(scan_result))) {
        return res.status(400).json({ success: false, error: 'Resultado de escaneo inválido' })
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
           (session_id, scanned_code, normalized_code, matched_sku, matched_box_type, scan_result, quantity,
            input_method, manual_reason_id, manual_reason_label, manual_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          session_id,
          String(scanned_code).trim(),
          normalizeOptionalText(normalized_code) || String(scanned_code).trim(),
          normalizeOptionalText(matched_sku),
          normalizeOptionalText(matched_box_type),
          scan_result,
          parsePositiveInt(quantity, 1),
          input_method || 'scanner',
          manual_reason_id || null,
          normalizeOptionalText(manual_reason_label),
          normalizeOptionalText(manual_notes),
        ]
      )

      await refreshPickSessionTotals(req, session_id)

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
      } = req.body

      if (!session_id || !scanned_code || !manual_reason_id) {
        return res.status(400).json({ success: false, error: 'session_id, scanned_code y manual_reason_id son requeridos' })
      }

      const session = await assertSessionOwnership(req, session_id)
      if (session === null) return res.status(404).json({ success: false, error: 'Sesión no encontrada' })
      if (session === false) return res.status(403).json({ success: false, error: 'No autorizado para modificar esta sesión' })
      if (session.status !== 'open') {
        return res.status(409).json({ success: false, error: 'La sesión ya no está activa' })
      }

      const reasonRes = await req.tQuery(
        'SELECT id, nombre FROM pick_manual_reasons WHERE id = $1 AND tenant_id = $2 AND activo = true',
        [manual_reason_id, req.tenantId]
      )
      if (reasonRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Motivo de ingreso manual no encontrado' })
      }

      const reason = reasonRes.rows[0]
      const result = await req.tQuery(
        `INSERT INTO pick_events
           (session_id, scanned_code, normalized_code, matched_sku, matched_box_type, scan_result, quantity,
            input_method, manual_reason_id, manual_reason_label, manual_notes)
         VALUES ($1, $2, $3, $4, $5, 'ok', $6, 'manual', $7, $8, $9)
         RETURNING *`,
        [
          session_id,
          String(scanned_code).trim(),
          normalizeOptionalText(normalized_code) || String(scanned_code).trim(),
          normalizeOptionalText(matched_sku),
          normalizeOptionalText(matched_box_type),
          parsePositiveInt(quantity, 1),
          reason.id,
          reason.nombre,
          normalizeOptionalText(manual_notes),
        ]
      )
      await refreshPickSessionTotals(req, session_id)
      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('POST wmshub/scan-event/manual error:', err.message)
      res.status(500).json({ success: false, error: 'Error registrando ingreso manual' })
    }
  }
)

router.put('/scan-event/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'actualizar'),
  async (req, res) => {
    try {
      const eventRes = await req.tQuery(
        `SELECT e.*, s.tenant_id, s.status, s.operator_id
         FROM pick_events e
         JOIN pick_sessions s ON s.id = e.session_id
         WHERE e.id = $1 AND s.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (eventRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Registro no encontrado' })
      const event = eventRes.rows[0]
      if (event.status !== 'open') return res.status(409).json({ success: false, error: 'La sesión ya no está activa' })
      if (event.operator_id !== req.user.id && req.fullUser.rol_nombre !== 'Administrador') {
        return res.status(403).json({ success: false, error: 'No autorizado para modificar este registro' })
      }

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
      } = req.body
      if (scan_result !== undefined && !PICK_SCAN_RESULTS.has(String(scan_result))) {
        return res.status(400).json({ success: false, error: 'Resultado de escaneo inválido' })
      }

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
             edited_at = now(),
             edited_by = $10
         WHERE id = $11
         RETURNING *`,
        [
          normalizeOptionalText(scanned_code),
          normalizeOptionalText(normalized_code),
          matched_sku !== undefined ? normalizeOptionalText(matched_sku) : event.matched_sku ?? null,
          matched_box_type !== undefined ? normalizeOptionalText(matched_box_type) : event.matched_box_type ?? null,
          scan_result || null,
          quantity !== undefined ? parsePositiveInt(quantity, 1) : null,
          resolvedReasonId || null,
          resolvedReasonLabel || null,
          manual_notes !== undefined ? normalizeOptionalText(manual_notes) : event.manual_notes ?? null,
          req.user.id,
          req.params.id,
        ]
      )
      await refreshPickSessionTotals(req, event.session_id)
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
        `SELECT e.id, e.session_id, s.status, s.operator_id
         FROM pick_events e
         JOIN pick_sessions s ON s.id = e.session_id
         WHERE e.id = $1 AND s.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (eventRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Registro no encontrado' })
      const event = eventRes.rows[0]
      if (event.status !== 'open') return res.status(409).json({ success: false, error: 'La sesión ya no está activa' })
      if (event.operator_id !== req.user.id && req.fullUser.rol_nombre !== 'Administrador') {
        return res.status(403).json({ success: false, error: 'No autorizado para eliminar este registro' })
      }

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
      const { scan_type, scans = [], notes, ubicacion_id, tarima_code } = req.body
      if (!scan_type || !['unificado', 'clasificacion'].includes(scan_type)) {
        return res.status(400).json({ success: false, error: 'scan_type inválido' })
      }
      const tz = getTimezone(req)

      const normalizedScans = scans.map((scan) => {
        const scannedAt = scan?.scanned_at ? new Date(scan.scanned_at) : new Date()
        return {
          ...scan,
          scanned_at: Number.isNaN(scannedAt.getTime()) ? new Date().toISOString() : scannedAt.toISOString(),
        }
      })
      const scanTimes = normalizedScans
        .map((scan) => new Date(scan.scanned_at).getTime())
        .filter((value) => Number.isFinite(value))
      const startedAt = new Date(scanTimes.length > 0 ? Math.min(...scanTimes) : Date.now()).toISOString()
      const completedAt = new Date(scanTimes.length > 0 ? Math.max(...scanTimes) : Date.now()).toISOString()

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
            tarima_code, total_scans, total_ok, total_blocked, total_nowms)
         VALUES ($1,$2,$3,'saved',$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [req.tenantId, req.user.id, scan_type, startedAt, completedAt, normalizedNotes, ubicacion_id || null,
         sectionCode, totals.total, totals.ok, totals.blocked, totals.nowms]
      )
      const session = sessionRes.rows[0]

      if (scansWithGroups.length > 0) {
        const preparedScans = scansWithGroups.map((scan, index) => {
          const scannedCode = normalizeOptionalText(
            scan.scanned_code || scan.raw || scan.code || scan.normalized_code || scan.code2
          )
          const normalizedCode = normalizeOptionalText(
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
            scanned_at: scan.scanned_at || startedAt,
            was_swapped: Boolean(scan.was_swapped),
          }
        })

        const values = preparedScans.map((_, i) => {
          const b = i * 11
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11})`
        }).join(',')
        const params = preparedScans.flatMap(s => [
          session.id, s.scanned_code, s.normalized_code, s.code2 || null,
          s.was_swapped || false, s.scan_status, s.sku || null,
          s.product_name || null, s.cell_no || null, s.group_assignment || 'auto',
          s.scanned_at || startedAt,
        ])
        await client.query(
          `INSERT INTO inv_scans
             (session_id, scanned_code, normalized_code, code2, was_swapped,
              scan_status, sku, product_name, cell_no, group_assignment, scanned_at)
           VALUES ${values}`,
          params
        )
      }

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
      const limit = Math.min(parseInt(pageSize) || 20, 100)
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
          `SELECT s.*, u.nombre_completo as operator_nombre
           FROM inv_sessions s
           LEFT JOIN usuarios u ON u.id = s.operator_id
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
      console.error('GET wmshub/inventory-session/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo sesión' })
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
           (session_id, scanned_code, normalized_code, code2, was_swapped, scan_status, sku, product_name,
            cell_no, group_assignment, input_method, manual_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual',$11)
         RETURNING *`,
        [
          session_id,
          String(scanned_code).trim(),
          normalizeOptionalText(normalized_code) || String(scanned_code).trim(),
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
    { modulePath: 'inventario.escaneo', action: 'crear' },
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
                sess.completed_at,
                u.nombre_completo AS operator_nombre
           FROM inv_scans sc
           JOIN inv_sessions sess ON sess.id = sc.session_id
           LEFT JOIN usuarios u ON u.id = sess.operator_id
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
  requirePermission('surtido.ordenes', 'actualizar'),
  async (req, res) => {
    try {
      const { surtidor_id, status, notes, third_order_no } = req.body
      if (status !== undefined && !ORDER_TRACKING_STATUSES.has(String(status))) {
        return res.status(400).json({ success: false, error: 'Estado de orden inválido' })
      }
      const existing = await req.tQuery(
        'SELECT id FROM pick_order_tracking WHERE tenant_id = $1 AND outbound_order_no = $2',
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
        const result = await req.tQuery(
          `INSERT INTO pick_order_tracking
             (tenant_id, outbound_order_no, third_order_no, surtidor_id, surtidor_nombre, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [req.tenantId, req.params.obc, normalizeOptionalText(third_order_no), surtidor_id || null,
           surtidorNombre, status || 'pending_assignment', normalizeOptionalText(notes)]
        )
        return res.json({ success: true, data: result.rows[0] })
      }

      const fields = ['updated_at = now()']
      const params = []
      let p = 1
      if (status !== undefined) {
        fields.push(`status = $${p++}`); params.push(status)
        const userNombre = req.fullUser?.nombre_completo || null
        if (status === 'assigned') {
          fields.push(`assigned_at = now()`)
          fields.push(`assigned_by = $${p++}`); params.push(userNombre)
        }
        if (status === 'sorting')            fields.push(`sorting_started_at = now()`)
        if (status === 'pending_validation') fields.push(`sorting_completed_at = now()`)
        if (status === 'validating')         fields.push(`validation_started_at = now()`)
        if (status === 'complete') {
          fields.push(`validation_completed_at = now()`)
          fields.push(`validated_by = $${p++}`); params.push(userNombre)
        }
      }
      if (surtidor_id !== undefined) {
        fields.push(`surtidor_id = $${p++}`); params.push(surtidor_id || null)
        fields.push(`surtidor_nombre = $${p++}`); params.push(surtidorNombre)
      }
      if (third_order_no !== undefined) { fields.push(`third_order_no = $${p++}`); params.push(normalizeOptionalText(third_order_no)) }
      if (notes !== undefined) { fields.push(`notes = $${p++}`); params.push(normalizeOptionalText(notes)) }
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
  requirePermission('surtido.validacion', 'eliminar'),
  async (req, res) => {
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
      const { modulo, full } = req.query
      const params = [req.tenantId]
      let filter = ''
      if (modulo && modulo !== 'todos') {
        filter = ` AND (modulo_uso @> ARRAY['todos'] OR modulo_uso @> ARRAY[$2])`
        params.push(modulo)
      }
      const sql = full
        ? `SELECT u.*,
                  COALESCE(SUM(i.cantidad_disponible), 0) AS pcs_stock
             FROM dev_ubicaciones u
             LEFT JOIN dev_inventario i
               ON i.ubicacion_id = u.id
              AND i.tenant_id = u.tenant_id
              AND i.cantidad_disponible > 0
            WHERE u.tenant_id = $1${filter}
            GROUP BY u.id
            ORDER BY u.activo DESC, u.codigo ASC`
        : `SELECT id, codigo, nombre
             FROM dev_ubicaciones
            WHERE tenant_id = $1 AND activo = true${filter}
            ORDER BY codigo ASC`
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

      if (!codigo || !nombre) {
        return res.status(400).json({ success: false, error: 'codigo y nombre son requeridos' })
      }

      const result = await req.tQuery(
        `INSERT INTO dev_ubicaciones (codigo, nombre, descripcion, activo, tenant_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, codigo)
         DO UPDATE
           SET nombre = EXCLUDED.nombre,
               descripcion = COALESCE(EXCLUDED.descripcion, dev_ubicaciones.descripcion),
               activo = EXCLUDED.activo,
               updated_at = now()
         RETURNING *`,
        [codigo, nombre, descripcion, Boolean(activo), req.tenantId]
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

      if (!codigo || !nombre) {
        return res.status(400).json({ success: false, error: 'codigo y nombre son requeridos' })
      }

      const result = await req.tQuery(
        `UPDATE dev_ubicaciones
            SET codigo = $1,
                nombre = $2,
                descripcion = $3,
                activo = $4,
                updated_at = now()
          WHERE id = $5 AND tenant_id = $6
          RETURNING *`,
        [codigo, nombre, descripcion, Boolean(activo), req.params.id, req.tenantId]
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

export default router

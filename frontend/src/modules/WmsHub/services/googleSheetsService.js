import api from '../../../core/services/api'
import { normalizeCodeFast } from '../../Shared/Wms/normalizeCode'

// ── Cache ──────────────────────────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000
const OUTBOUND_RECORD_CACHE_KEY = 'kirion_wmshub_outbound_recent_v1'
const OUTBOUND_RECORD_CACHE_TTL = 30 * 60 * 1000
const OUTBOUND_RECORD_CACHE_LIMIT = 1000

// Full raw CSV rows for the outbound sheet, persisted so Surtido validation still has
// package/quantity data to match scans against after a page reload with no connection —
// the in-memory `cache` below is otherwise wiped on reload and getOutboundDetail() has
// nothing to fall back to. Generous TTL: this is a last-resort fallback used only when a
// live fetch fails, not a substitute for it, so staleness just means "yesterday's data
// is better than none" rather than something served under normal conditions.
const OUTBOUND_ROWS_CACHE_KEY = 'kirion_wmshub_outbound_rows_v1'
const OUTBOUND_ROWS_CACHE_TTL = 24 * 60 * 60 * 1000

function readOutboundRowsCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(OUTBOUND_ROWS_CACHE_KEY) || 'null')
    if (!cached?.rows?.length || Date.now() - cached.ts > OUTBOUND_ROWS_CACHE_TTL) return null
    return cached.rows
  } catch {
    return null
  }
}

function writeOutboundRowsCache(rows) {
  try {
    localStorage.setItem(OUTBOUND_ROWS_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows }))
  } catch {
    // Storage quota should never block live WMS data — offline fallback is best-effort.
  }
}

const cache = {
  inventory: { data: null, ts: 0, partial: false },
  outbound:  { data: null, ts: 0, partial: false },
}

const sheetListeners = new Set()

function notifySheetCache(type) {
  sheetListeners.forEach((listener) => {
    try { listener(type, getCacheStatus(type)) } catch {}
  })
}

// ── CSV Parser (RFC 4180) ──────────────────────────────────────────────────
function parseCSV(text) {
  const rows = []
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let i = 0
  const len = normalized.length

  while (i < len) {
    const row = []

    while (i < len) {
      if (normalized[i] === '"') {
        let field = ''
        i++
        while (i < len) {
          if (normalized[i] === '"') {
            if (normalized[i + 1] === '"') { field += '"'; i += 2 }
            else { i++; break }
          } else {
            field += normalized[i++]
          }
        }
        row.push(field)
      } else {
        let field = ''
        while (i < len && normalized[i] !== ',' && normalized[i] !== '\n') {
          field += normalized[i++]
        }
        row.push(field.trim())
      }

      if (i < len && normalized[i] === ',') { i++; continue }
      break
    }

    if (i < len && normalized[i] === '\n') i++

    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
      rows.push(row)
    }
  }

  return rows
}

// ── Header normalization ───────────────────────────────────────────────────
function normalizeHeader(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip combining diacritics
    .toLowerCase()
    .trim()
    .replace(/[.\s\-\/]+/g, '_')       // replace ., spaces, hyphens, slashes
    .replace(/_+/g, '_')               // deduplicate underscores
    .replace(/^_|_$/g, '')             // trim leading/trailing _
}

// ── Column alias tables ────────────────────────────────────────────────────
// Each list starts with the exact WMS-exported column name (normalized),
// followed by generic fallback aliases.

const INVENTORY_ALIASES = {
  // "Customize Barcode/自定义箱条码"
  customizeBarcode: [
    'customize_barcode_自定义箱条码',
    'custom_box_barcode_自定义箱条码',
    'customize_barcode', 'custom_box_barcode', 'custom_barcode',
    'barcode', 'codigo_barras', 'caja', 'box_code', 'box_barcode',
  ],
  // "Available stock/可用库存"
  availableAmount: [
    'available_stock_可用库存',
    'available_inventory_可用库存',
    'available_amount', 'available_stock', 'available_inventory',
    'available', 'disponible', 'qty_available',
  ],
  // "Locked Inventory/锁定库存"
  lockAmount: [
    'locked_inventory_锁定库存',
    'locked_stock_锁定库存',
    'lock_amount', 'locked_inventory', 'locked_stock', 'locked', 'bloqueado',
  ],
  // "sku"
  customizeCode: [
    'sku',
    'customize_code', 'codigo', 'item_code', 'product_code',
  ],
  // "Box type No./箱类型号"
  boxType: [
    'box_type_no_箱类型号',
    'box_type', 'tipo_caja', 'tipo', 'type',
  ],
  // "Product name/产品名称"
  productName: [
    'product_name_产品名称',
    'product_name', 'nombre', 'name', 'descripcion',
  ],
  cellNo: [
    'cell_no_库位',
    '库位',
    'cellno',
    'cell_no',
    'location_code',
    'location',
    'ubicacion',
    'ubicacion_codigo',
    'bin_code',
    'bin',
    'rack',
  ],
  measures: [
    'measures',
    'measure',
    'dimensions',
    'dimension',
    'size',
    'spec',
    'specification',
    'medidas',
    'medida',
    'dimensiones',
    'dimension_caja',
    'box_dimensions',
    'box_dimension',
    'box_size',
    'package_size',
    '尺寸',
    '规格',
  ],
  length: [
    'length',
    'largo',
    '长',
  ],
  width: [
    'width',
    'ancho',
    '宽',
  ],
  height: [
    'height',
    'alto',
    '高',
  ],
  measureUnit: [
    'measure_unit',
    'dimension_unit',
    'size_unit',
    'unidad_medida',
    'unidad',
  ],
}

const OUTBOUND_ALIASES = {
  // "Outbound_出库单号"
  outboundOrderNo: [
    'outbound_出库单号',
    'outbound_order_no', 'obc', 'orden', 'order_no', 'outbound_no',
  ],
  // "Shipping service_物流渠道"
  logisticsChannel: [
    'shipping_service_物流渠道',
    'logistics_channel', 'shipping_service', 'channel', 'canal', 'carrier',
  ],
  // "货件追踪码/Reference ID"
  logisticsTrackNo: [
    '货件追踪码_reference_id',
    'logistics_track_no', 'tracking', 'guia', 'track_no', 'reference_id',
  ],
  // "Reference order No._参考单号"
  thirdOrderNo: [
    'reference_order_no_参考单号',
    'third_order_no', 'reference_order_no', 'reference', 'referencia', 'ref',
  ],
  // (no customerCode column in the exported sheet)
  customerCode: [
    'customer_code', 'cliente', 'customer', 'client_code',
  ],
  // "Recipient_收件人"
  receiverName: [
    'recipient_收件人',
    'receiver_name', 'recipient', 'destinatario', 'destino', 'destination', 'receiver', 'consignee',
  ],
  // (no orderCreateTime in the exported sheet — kept for other sheet variants)
  orderCreateTime: [
    'order_create_time', 'created_at', 'fecha_creacion', 'create_time',
  ],
  // "Expected Arrival Time _ 期望到仓时间"
  outboundTime: [
    'expected_arrival_time_期望到仓时间',
    'outbound_time', 'expected_arrival_time', 'fecha_salida', 'delivery_time',
  ],
  // (computed from row count; kept for sheets that do export it)
  outboundBoxCount: [
    'outbound_box_count', 'box_count', 'cajas', 'total_cajas', 'total_boxes',
  ],
  // (no warehouse column in the exported sheet)
  whCode: ['wh_code', 'warehouse', 'almacen'],
  // (no status column in the exported sheet)
  status: ['status', 'estado'],
  // "Box type No_箱类型号"
  boxType: [
    'box_type_no_箱类型号',
    'box_type', 'tipo_caja', 'tipo',
  ],
  // "Custom box barcode_自定义箱条码"
  customizeCode: [
    'custom_box_barcode_自定义箱条码',
    'customize_code', 'custom_box_barcode', 'sku', 'codigo',
  ],
  // (no explicit quantity column; each row = 1 box)
  quantity: ['quantity', 'qty', 'cantidad'],
}

function buildHeaderMap(headers, aliases) {
  const normed = headers.map(h => normalizeHeader(h))
  const map = {}
  for (const [field, aliasList] of Object.entries(aliases)) {
    for (const alias of aliasList) {
      const idx = normed.indexOf(normalizeHeader(alias))
      if (idx !== -1) { map[field] = idx; break }
    }
  }
  if (map.cellNo === undefined) {
    map.cellNo = normed.findIndex(h => /(cell|location|ubicacion|库位|rack|bin)/.test(h))
    if (map.cellNo === -1) delete map.cellNo
  }
  if (map.measures === undefined) {
    map.measures = normed.findIndex(h => /(measure|dimension|spec|size|medid|dimens|尺寸|规格)/.test(h))
    if (map.measures === -1) delete map.measures
  }
  return map
}

function getField(row, map, field) {
  const idx = map[field]
  return idx !== undefined ? (row[idx] ?? '') : ''
}

function composeMeasures(row, map) {
  const direct = getField(row, map, 'measures')
  if (direct) return direct

  const length = getField(row, map, 'length')
  const width = getField(row, map, 'width')
  const height = getField(row, map, 'height')
  const unit = getField(row, map, 'measureUnit')
  const parts = [length, width, height].map(v => String(v || '').trim()).filter(Boolean)
  if (!parts.length) return ''
  return `${parts.join(' × ')}${unit ? ` ${String(unit).trim()}` : ''}`.trim()
}

function readOutboundRecordCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(OUTBOUND_RECORD_CACHE_KEY) || 'null')
    if (!cached?.records || Date.now() - cached.ts > OUTBOUND_RECORD_CACHE_TTL) return null
    return cached
  } catch {
    return null
  }
}

function writeOutboundRecordCache(records) {
  try {
    localStorage.setItem(OUTBOUND_RECORD_CACHE_KEY, JSON.stringify({
      ts: Date.now(),
      records: records.slice(0, OUTBOUND_RECORD_CACHE_LIMIT),
    }))
  } catch {
    // Storage quota should never block live WMS data.
  }
}

// ── Row mappers ────────────────────────────────────────────────────────────
function mapRowToInventory(row, map) {
  const available = parseInt(getField(row, map, 'availableAmount')) || 0
  const locked    = parseInt(getField(row, map, 'lockAmount'))      || 0
  const sku       = getField(row, map, 'customizeCode')
  const name      = getField(row, map, 'productName')
  const cellNo    = getField(row, map, 'cellNo')
  const measures  = composeMeasures(row, map)
  return {
    customizeBarcode: getField(row, map, 'customizeBarcode'),
    availableAmount:  available,
    lockAmount:       locked,
    customizeCode:    sku,
    boxType:          getField(row, map, 'boxType'),
    productName:      name,
    cellNo,
    measures,
    isAvailable:      available > 0,
    isBlocked:        locked > 0 && available === 0,
    // Mimic xlwms skuList shape
    skuList: sku ? [{ skuCode: sku, skuName: name, availableAmount: available }] : [],
  }
}

function mapRowToOutbound(row, map) {
  const outboundTime = getField(row, map, 'outboundTime')
  return {
    outboundOrderNo:  getField(row, map, 'outboundOrderNo'),
    logisticsChannel: getField(row, map, 'logisticsChannel'),
    logisticsTrackNo: getField(row, map, 'logisticsTrackNo'),
    thirdOrderNo:     getField(row, map, 'thirdOrderNo'),
    customerCode:     getField(row, map, 'customerCode'),
    receiverName:     getField(row, map, 'receiverName'),
    orderCreateTime:  getField(row, map, 'orderCreateTime'),
    outboundTime,
    expectedTime:     outboundTime,
    outboundBoxCount: parseInt(getField(row, map, 'outboundBoxCount')) || null,
    whCode:           getField(row, map, 'whCode'),
    status:           getField(row, map, 'status') || 'pending',
    boxType:          getField(row, map, 'boxType'),
    customizeCode:    getField(row, map, 'customizeCode'),
    quantity:         parseInt(getField(row, map, 'quantity')) || 1,
  }
}

// ── Sheet URL cache ────────────────────────────────────────────────────────
// TTL ensures all browser sessions pick up tenant config changes within 2 min.
const URL_TTL = 2 * 60 * 1000

let _sheetUrls = { inventory: null, outbound: null }
let _urlsFetchedAt = 0

async function loadSheetUrls() {
  const now = Date.now()
  if (_urlsFetchedAt > 0 && (now - _urlsFetchedAt) < URL_TTL) return _sheetUrls
  const res = await api.get('/wmshub/sheets-urls').then(r => r.data)
  _sheetUrls = {
    inventory: res?.data?.sheet_inventory_url || null,
    outbound:  res?.data?.sheet_outbound_url  || null,
  }
  _urlsFetchedAt = now
  return _sheetUrls
}

export function invalidateUrlCache() {
  _urlsFetchedAt = 0
}

export async function getSheetUrls() {
  return loadSheetUrls()
}

// ── Fetch raw CSV via backend proxy (handles CORS + server-side cache) ─────
async function fetchSheetAsCSV(url, limit = 0) {
  const params = { url }
  if (limit > 0) params.limit = limit
  try {
    const res = await api.get('/wmshub/proxy/sheet', { params, timeout: 25000 })
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
  } catch (err) {
    const status = err?.response?.status
    if (err?.code === 'ERR_BACKEND_UNAVAILABLE') {
      const next = new Error('El backend de Kirion no esta disponible temporalmente')
      next.code = 'BACKEND_UNAVAILABLE'
      next.cause = err
      throw next
    }
    if (status === 503) {
      const next = new Error('El proxy de Google Sheets no esta disponible temporalmente')
      next.code = 'SHEET_PROXY_UNAVAILABLE'
      next.cause = err
      throw next
    }
    if (err?.code === 'ECONNABORTED') {
      const next = new Error('La consulta a Google Sheets excedio el tiempo limite')
      next.code = 'SHEET_TIMEOUT'
      next.cause = err
      throw next
    }
    throw err
  }
}

// ── Background full-sheet warmer ───────────────────────────────────────────
async function warmFullSheet(type) {
  const entry = cache[type]
  if (entry._bgLoading) return
  entry._bgLoading = true
  try {
    const urls = await loadSheetUrls()
    const url = type === 'inventory' ? urls.inventory : urls.outbound
    if (!url) return
    const text = await fetchSheetAsCSV(url, 0)
    const rows = parseCSV(text)
    if (rows.length >= 2) {
      cache[type] = { data: rows, ts: Date.now(), partial: false }
      // This background warm is the normal way the full outbound dataset gets loaded
      // (triggered right after the fast partial fetch) — it must persist to localStorage
      // too, not just loadSheet's own forceRefresh path, otherwise a cold reload while
      // offline has nothing in OUTBOUND_ROWS_CACHE_KEY to fall back to even though the
      // full sheet was already fetched once this session.
      if (type === 'outbound') writeOutboundRowsCache(rows)
      notifySheetCache(type)
    }
  } catch {
    // Keep partial data on background failure
  } finally {
    // Always clear the in-flight flag, including the empty-sheet path where cache[type]
    // is neither replaced nor caught — otherwise _bgLoading stays true forever and blocks
    // every future warm, permanently pinning search to the partial dataset.
    const e = cache[type]
    if (e) e._bgLoading = false
  }
}

// Force the background full-sheet warm for the outbound dataset. Idempotent via the
// _bgLoading guard. Used by Órdenes to guarantee a search covers the complete dataset
// even when the fast partial slice is all that has loaded so far.
export function warmOutboundFull() {
  return warmFullSheet('outbound')
}

function isSameDayAsNow(ts) {
  if (!ts) return false
  const d = new Date(ts)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

// ── Load and cache (two-phase: fast partial → background full) ─────────────
async function loadSheet(type, forceRefresh = false) {
  const entry = cache[type]
  const now = Date.now()
  const requiresFullDataset = type === 'inventory'

  // Fresh full cache hit — also require same calendar day so overnight sessions don't serve stale data
  if (!forceRefresh && entry.data && !entry.partial && (now - entry.ts) < CACHE_TTL && isSameDayAsNow(entry.ts)) {
    return entry.data
  }

  // Fresh partial data — return immediately, ensure bg full load is running
  if (!requiresFullDataset && !forceRefresh && entry.data && entry.partial && (now - entry.ts) < CACHE_TTL && isSameDayAsNow(entry.ts)) {
    warmFullSheet(type)
    return entry.data
  }

  try {
    const urls = await loadSheetUrls()
    const url = type === 'inventory' ? urls.inventory : urls.outbound
    if (!url) {
      const err = new Error(`URL de hoja no configurada: ${type}`)
      err.code = 'SHEET_NOT_CONFIGURED'
      throw err
    }

    // Inventory lookups must always be exhaustive; partial data causes false NoWMS.
    const limit = (forceRefresh || requiresFullDataset) ? 0 : 3000
    const text = await fetchSheetAsCSV(url, limit)
    const rows = parseCSV(text)
    if (rows.length < 2) {
      const err = new Error('La hoja parece vacía (menos de 2 filas)')
      err.code = 'SHEET_EMPTY'
      throw err
    }
    const partial = !forceRefresh && !requiresFullDataset
    cache[type] = { data: rows, ts: now, partial }
    if (partial) warmFullSheet(type)
    else if (type === 'outbound') writeOutboundRowsCache(rows)
    notifySheetCache(type)
    return rows
  } catch (err) {
    if (entry.data) return entry.data // in-memory stale fallback (loaded earlier this tab)
    // loadSheetUrls() itself needs the network, so a cold offline reload never even
    // reaches fetchSheetAsCSV — fall back to the persisted rows from the last
    // successful full load instead of hard-failing with nothing to match scans against.
    if (type === 'outbound') {
      const persisted = readOutboundRowsCache()
      if (persisted) {
        cache.outbound = { data: persisted, ts: 0, partial: false }
        return persisted
      }
    }
    throw err
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function refreshSheet(type) {
  cache[type] = { data: null, ts: 0, partial: false }
  if (type === 'outbound') {
    try { localStorage.removeItem(OUTBOUND_RECORD_CACHE_KEY) } catch {}
  }
  invalidateUrlCache()
  return loadSheet(type, true)
}

export function getCacheTimestamp(type) {
  return cache[type].ts || null
}

export function getCacheStatus(type) {
  const e = cache[type]
  return {
    ts:      e.ts || null,
    partial: !!e.partial,
    loading: !!e._bgLoading,
    rows:    e.data ? e.data.length - 1 : 0,
  }
}

export function subscribeSheetCache(listener) {
  sheetListeners.add(listener)
  return () => sheetListeners.delete(listener)
}

export async function testSheetUrl(url, type = 'outbound') {
  const text = await fetchSheetAsCSV(url, 0)
  const rows = parseCSV(text)
  if (rows.length < 2) throw new Error('La hoja está vacía')
  const aliases = type === 'inventory' ? INVENTORY_ALIASES : OUTBOUND_ALIASES
  const headerMap = buildHeaderMap(rows[0], aliases)
  return {
    rowCount: rows.length - 1,
    mappedFields: Object.keys(headerMap),
    headers: rows[0],
  }
}

export async function getInventoryList() {
  const rows = await loadSheet('inventory')
  const [headerRow, ...dataRows] = rows
  const map = buildHeaderMap(headerRow, INVENTORY_ALIASES)
  const records = dataRows
    .map(row => mapRowToInventory(row, map))
    .filter(r => r.customizeBarcode || r.customizeCode)
  const { partial } = getCacheStatus('inventory')
  return { success: true, data: { records, total: records.length, partial } }
}

export async function getOutboundList() {
  if (!cache.outbound.data) {
    const cached = readOutboundRecordCache()
    if (cached?.records?.length) {
      loadSheet('outbound').catch(() => {})
      return {
        success: true,
        data: {
          records: cached.records,
          total: cached.records.length,
          partial: true,
          fromPersistentCache: true,
        },
      }
    }
  }

  const rows = await loadSheet('outbound')
  const [headerRow, ...dataRows] = rows
  const map = buildHeaderMap(headerRow, OUTBOUND_ALIASES)

  // Group rows by OBC; box count = number of rows (each row = one box)
  const orderMap = new Map()
  const boxCountMap = new Map()

  const SPARSE_FIELDS = ['thirdOrderNo', 'logisticsTrackNo', 'logisticsChannel', 'receiverName', 'outboundTime', 'whCode']

  const boxCodesMap = new Map()

  for (const row of dataRows) {
    const r = mapRowToOutbound(row, map)
    if (!r.outboundOrderNo) continue
    boxCountMap.set(r.outboundOrderNo, (boxCountMap.get(r.outboundOrderNo) || 0) + 1)
    if (!orderMap.has(r.outboundOrderNo)) {
      orderMap.set(r.outboundOrderNo, { ...r })
      boxCodesMap.set(r.outboundOrderNo, [])
    } else {
      const existing = orderMap.get(r.outboundOrderNo)
      SPARSE_FIELDS.forEach(f => { if (!existing[f] && r[f]) existing[f] = r[f] })
    }
    if (r.customizeCode) {
      const codes = boxCodesMap.get(r.outboundOrderNo)
      if (!codes.includes(r.customizeCode)) codes.push(r.customizeCode)
    }
  }

  const records = Array.from(orderMap.values()).map(r => ({
    ...r,
    allCustomizeCodes: boxCodesMap.get(r.outboundOrderNo) || [],
    outboundBoxCount: r.outboundBoxCount || boxCountMap.get(r.outboundOrderNo) || 0,
  }))
  const { partial } = getCacheStatus('outbound')
  writeOutboundRecordCache(records)
  return { success: true, data: { records, total: records.length, partial } }
}

export async function findOrderByBarcode(barcode) {
  const normQ = normalizeCodeFast((barcode || '').trim())
  if (!normQ) return null

  const matchRecord = r =>
    normalizeCodeFast(r.outboundOrderNo || '') === normQ ||
    normalizeCodeFast(r.logisticsTrackNo || '') === normQ ||
    normalizeCodeFast(r.thirdOrderNo || '') === normQ ||
    normalizeCodeFast(r.customizeCode || '') === normQ ||
    (r.allCustomizeCodes || []).some(c => normalizeCodeFast(c) === normQ)

  // Fast path: search aggregated cache records first
  const cached = readOutboundRecordCache()
  if (cached?.records?.length) {
    const found = cached.records.find(matchRecord)
    if (found) return found
  }

  // Full sheet scan — each row is one box so per-box customizeCode is accurate
  try {
    const rows = await loadSheet('outbound')
    const [headerRow, ...dataRows] = rows
    const map = buildHeaderMap(headerRow, OUTBOUND_ALIASES)
    const matchRow = r =>
      normalizeCodeFast(r.outboundOrderNo || '') === normQ ||
      normalizeCodeFast(r.logisticsTrackNo || '') === normQ ||
      normalizeCodeFast(r.thirdOrderNo || '') === normQ ||
      normalizeCodeFast(r.customizeCode || '') === normQ
    const match = dataRows.map(row => mapRowToOutbound(row, map)).find(matchRow)
    return match ?? null
  } catch {
    return null
  }
}

export async function findAllOrdersByBarcode(barcode) {
  const normQ = normalizeCodeFast((barcode || '').trim())
  if (!normQ) return []

  const matchRecord = r =>
    normalizeCodeFast(r.outboundOrderNo || '') === normQ ||
    normalizeCodeFast(r.logisticsTrackNo || '') === normQ ||
    normalizeCodeFast(r.thirdOrderNo || '') === normQ ||
    normalizeCodeFast(r.customizeCode || '') === normQ ||
    (r.allCustomizeCodes || []).some(c => normalizeCodeFast(c) === normQ)

  // Fast path: aggregated cache — records already have outboundBoxCount
  const cached = readOutboundRecordCache()
  if (cached?.records?.length) {
    const hits = cached.records.filter(matchRecord)
    if (hits.length > 0) return hits
  }

  // Full sheet scan — deduplicate by outboundOrderNo, compute box count
  try {
    const rows = await loadSheet('outbound')
    const [headerRow, ...dataRows] = rows
    const map = buildHeaderMap(headerRow, OUTBOUND_ALIASES)
    const matchRow = r =>
      normalizeCodeFast(r.outboundOrderNo || '') === normQ ||
      normalizeCodeFast(r.logisticsTrackNo || '') === normQ ||
      normalizeCodeFast(r.thirdOrderNo || '') === normQ ||
      normalizeCodeFast(r.customizeCode || '') === normQ
    const orderMap = new Map()
    const boxCountMap = new Map()
    const SPARSE = ['thirdOrderNo', 'logisticsTrackNo', 'logisticsChannel', 'receiverName', 'outboundTime', 'whCode']
    for (const row of dataRows) {
      const r = mapRowToOutbound(row, map)
      if (!r.outboundOrderNo) continue
      boxCountMap.set(r.outboundOrderNo, (boxCountMap.get(r.outboundOrderNo) || 0) + 1)
      if (!matchRow(r)) continue
      if (!orderMap.has(r.outboundOrderNo)) {
        orderMap.set(r.outboundOrderNo, { ...r })
      } else {
        const existing = orderMap.get(r.outboundOrderNo)
        SPARSE.forEach(f => { if (!existing[f] && r[f]) existing[f] = r[f] })
      }
    }
    return Array.from(orderMap.values()).map(r => ({
      ...r,
      outboundBoxCount: r.outboundBoxCount || boxCountMap.get(r.outboundOrderNo) || 0,
    }))
  } catch {
    return []
  }
}

export async function getOutboundDetail(orderNo) {
  async function findRows(forceRefresh = false) {
    const rows = await loadSheet('outbound', forceRefresh)
    const [headerRow, ...dataRows] = rows
    const map = buildHeaderMap(headerRow, OUTBOUND_ALIASES)
    const normOrderNo = normalizeCodeFast(orderNo || '')

    const mappedRows = dataRows
      .map(row => mapRowToOutbound(row, map))
      .filter(r => r.outboundOrderNo)

    let orderRows = mappedRows
      .filter(r => normalizeCodeFast(r.outboundOrderNo || '') === normOrderNo)

    if (orderRows.length === 0 && normOrderNo) {
      const matched = mappedRows.find(r =>
        normalizeCodeFast(r.logisticsTrackNo || '') === normOrderNo ||
        normalizeCodeFast(r.thirdOrderNo || '') === normOrderNo ||
        normalizeCodeFast(r.customizeCode || '') === normOrderNo
      )
      if (matched?.outboundOrderNo) {
        const matchedOrderNo = normalizeCodeFast(matched.outboundOrderNo)
        orderRows = mappedRows.filter(r => normalizeCodeFast(r.outboundOrderNo || '') === matchedOrderNo)
      }
    }

    return orderRows
  }

  let orderRows = await findRows(false)
  // Whenever the cache is only the partial (fast) slice, we cannot trust that
  // every box row of a found order is present. A truncated packageList makes
  // detail validation reject boxes that legitimately belong to the order
  // ("codigo no corresponde"). Force a full fetch when partial, both when the
  // order was missing entirely and when it was found from an incomplete slice.
  if (getCacheStatus('outbound').partial) {
    const fullRows = await findRows(true)
    if (fullRows.length > orderRows.length) orderRows = fullRows
  }

  if (orderRows.length === 0) return { success: true, data: null }

  const base = { ...orderRows[0] }
  const SPARSE_FIELDS = ['thirdOrderNo', 'logisticsTrackNo', 'logisticsChannel', 'receiverName', 'outboundTime', 'whCode']
  SPARSE_FIELDS.forEach(f => {
    if (!base[f]) {
      const found = orderRows.find(r => r[f])
      if (found) base[f] = found[f]
    }
  })
  const packageList = orderRows.map(r => ({
    boxType:           r.boxType,
    customizeCode:     r.customizeCode,
    quantity:          r.quantity,
    boxSkuQueryVOList: [],
  }))

  return {
    success: true,
    data: {
      ...base,
      outboundBoxCount: base.outboundBoxCount || orderRows.length,
      packageList,
      outboundBoxList: packageList,
    },
  }
}

/**
 * Pool de órdenes para la validación por lote.
 *
 * Una sola pasada sobre las filas ya cargadas del sheet — cada fila es una
 * caja, así que el packageList de cada orden sale del mismo agrupado y no hace
 * falta una llamada de detalle por orden.
 *
 * Fuerza el fetch completo cuando el cache está en su slice parcial: un pool
 * truncado rechazaría cajas que sí pertenecen al lote.
 *
 * Devuelve TODAS las órdenes del sheet; el filtrado por fecha lo hace
 * buildLotePool (utils/lotePool.js), que es donde está probado.
 */
export async function getOutboundBatchByDate(dateKey) {
  const rows = await loadSheet('outbound', getCacheStatus('outbound').partial)
  const [headerRow, ...dataRows] = rows
  const map = buildHeaderMap(headerRow, OUTBOUND_ALIASES)

  const orderMap = new Map()
  const SPARSE_FIELDS = ['thirdOrderNo', 'logisticsTrackNo', 'logisticsChannel', 'receiverName', 'outboundTime', 'whCode']

  for (const row of dataRows) {
    const r = mapRowToOutbound(row, map)
    if (!r.outboundOrderNo) continue
    let entry = orderMap.get(r.outboundOrderNo)
    if (!entry) {
      entry = { ...r, packageList: [] }
      orderMap.set(r.outboundOrderNo, entry)
    } else {
      SPARSE_FIELDS.forEach(f => { if (!entry[f] && r[f]) entry[f] = r[f] })
    }
    entry.packageList.push({ boxType: r.boxType, customizeCode: r.customizeCode, quantity: r.quantity })
  }

  const orders = [...orderMap.values()].map(o => ({
    ...o,
    outboundBoxCount: o.outboundBoxCount || o.packageList.length,
  }))
  return { success: true, data: { dateKey, orders } }
}

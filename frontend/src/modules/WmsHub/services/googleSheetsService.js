import api from '../../../core/services/api'

// ── Cache ──────────────────────────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000

const cache = {
  inventory: { data: null, ts: 0, partial: false },
  outbound:  { data: null, ts: 0, partial: false },
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
    'customize_barcode', 'barcode', 'codigo_barras', 'caja', 'box_code', 'box_barcode',
  ],
  // "Available stock/可用库存"
  availableAmount: [
    'available_stock_可用库存',
    'available_amount', 'available_stock', 'available', 'disponible', 'qty_available',
  ],
  // "Locked Inventory/锁定库存"
  lockAmount: [
    'locked_inventory_锁定库存',
    'lock_amount', 'locked_inventory', 'locked', 'bloqueado',
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
    'receiver_name', 'recipient', 'destinatario', 'receiver', 'consignee',
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
  return map
}

function getField(row, map, field) {
  const idx = map[field]
  return idx !== undefined ? (row[idx] ?? '') : ''
}

// ── Row mappers ────────────────────────────────────────────────────────────
function mapRowToInventory(row, map) {
  const available = parseInt(getField(row, map, 'availableAmount')) || 0
  const locked    = parseInt(getField(row, map, 'lockAmount'))      || 0
  const sku       = getField(row, map, 'customizeCode')
  const name      = getField(row, map, 'productName')
  return {
    customizeBarcode: getField(row, map, 'customizeBarcode'),
    availableAmount:  available,
    lockAmount:       locked,
    customizeCode:    sku,
    boxType:          getField(row, map, 'boxType'),
    productName:      name,
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
  const res = await api.get('/upapex/sheets-urls').then(r => r.data)
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

// ── Fetch raw CSV via backend proxy (handles CORS + server-side cache) ─────
async function fetchSheetAsCSV(url, limit = 0) {
  const params = { url }
  if (limit > 0) params.limit = limit
  const res = await api.get('/upapex/proxy/sheet', { params, timeout: 25000 })
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
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
    }
  } catch {
    // Keep partial data on background failure
    const e = cache[type]
    if (e) e._bgLoading = false
  }
}

// ── Load and cache (two-phase: fast partial → background full) ─────────────
async function loadSheet(type, forceRefresh = false) {
  const entry = cache[type]
  const now = Date.now()

  // Fresh full cache hit
  if (!forceRefresh && entry.data && !entry.partial && (now - entry.ts) < CACHE_TTL) {
    return entry.data
  }

  // Fresh partial data — return immediately, ensure bg full load is running
  if (!forceRefresh && entry.data && entry.partial && (now - entry.ts) < CACHE_TTL) {
    warmFullSheet(type)
    return entry.data
  }

  const urls = await loadSheetUrls()
  const url = type === 'inventory' ? urls.inventory : urls.outbound
  if (!url) {
    const err = new Error(`URL de hoja no configurada: ${type}`)
    err.code = 'SHEET_NOT_CONFIGURED'
    throw err
  }

  try {
    // forceRefresh → load all rows at once; normal → load last 300 for speed
    const limit = forceRefresh ? 0 : 300
    const text = await fetchSheetAsCSV(url, limit)
    const rows = parseCSV(text)
    if (rows.length < 2) {
      const err = new Error('La hoja parece vacía (menos de 2 filas)')
      err.code = 'SHEET_EMPTY'
      throw err
    }
    const partial = !forceRefresh
    cache[type] = { data: rows, ts: now, partial }
    if (partial) warmFullSheet(type)
    return rows
  } catch (err) {
    if (entry.data) return entry.data // stale fallback
    throw err
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function refreshSheet(type) {
  cache[type] = { data: null, ts: 0, partial: false }
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
    rows:    e.data ? e.data.length - 1 : 0,
  }
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
    .filter(r => r.customizeBarcode)
  const { partial } = getCacheStatus('inventory')
  return { success: true, data: { records, total: records.length, partial } }
}

export async function getOutboundList() {
  const rows = await loadSheet('outbound')
  const [headerRow, ...dataRows] = rows
  const map = buildHeaderMap(headerRow, OUTBOUND_ALIASES)

  // Group rows by OBC; box count = number of rows (each row = one box)
  const orderMap = new Map()
  const boxCountMap = new Map()

  const SPARSE_FIELDS = ['thirdOrderNo', 'logisticsTrackNo', 'logisticsChannel', 'receiverName', 'outboundTime', 'whCode']

  for (const row of dataRows) {
    const r = mapRowToOutbound(row, map)
    if (!r.outboundOrderNo) continue
    boxCountMap.set(r.outboundOrderNo, (boxCountMap.get(r.outboundOrderNo) || 0) + 1)
    if (!orderMap.has(r.outboundOrderNo)) {
      orderMap.set(r.outboundOrderNo, { ...r })
    } else {
      const existing = orderMap.get(r.outboundOrderNo)
      SPARSE_FIELDS.forEach(f => { if (!existing[f] && r[f]) existing[f] = r[f] })
    }
  }

  const records = Array.from(orderMap.values()).map(r => ({
    ...r,
    outboundBoxCount: r.outboundBoxCount || boxCountMap.get(r.outboundOrderNo) || 0,
  }))
  const { partial } = getCacheStatus('outbound')
  return { success: true, data: { records, total: records.length, partial } }
}

export async function getOutboundDetail(orderNo) {
  const rows = await loadSheet('outbound')
  const [headerRow, ...dataRows] = rows
  const map = buildHeaderMap(headerRow, OUTBOUND_ALIASES)

  const orderRows = dataRows
    .map(row => mapRowToOutbound(row, map))
    .filter(r => r.outboundOrderNo === orderNo)

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

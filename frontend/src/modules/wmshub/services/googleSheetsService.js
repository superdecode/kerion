import api from '../../../core/services/api'

// ── Cache ──────────────────────────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000

const cache = {
  inventory: { data: null, ts: 0 },
  outbound:  { data: null, ts: 0 },
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
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, '_')
}

// ── Column alias tables ────────────────────────────────────────────────────
const INVENTORY_ALIASES = {
  customizeBarcode: ['customize_barcode', 'barcode', 'codigo_barras', '条形码', '自定义条码', 'caja', 'box_code', 'box_barcode'],
  availableAmount:  ['available_amount', 'available', 'disponible', '可用数量', '库存数量', 'cantidad_disponible', 'qty_available'],
  lockAmount:       ['lock_amount', 'locked', 'bloqueado', '锁定数量', 'cantidad_bloqueada', 'qty_locked'],
  customizeCode:    ['customize_code', 'sku', 'codigo', '物品编码', 'item_code', 'product_code'],
  boxType:          ['box_type', 'tipo_caja', '箱型', 'tipo', 'type'],
  productName:      ['product_name', 'nombre', '品名', 'descripcion', 'name'],
}

const OUTBOUND_ALIASES = {
  outboundOrderNo:  ['outbound_order_no', 'obc', '出库单号', 'orden', 'order_no', 'outbound_no'],
  logisticsChannel: ['logistics_channel', 'channel', 'canal', '物流渠道', 'canal_logistico', 'carrier'],
  logisticsTrackNo: ['logistics_track_no', 'tracking', 'guia', '物流单号', 'tracking_no', 'track_no'],
  thirdOrderNo:     ['third_order_no', 'reference', 'referencia', '参考号', '第三方单号', 'ref', 'po_number'],
  customerCode:     ['customer_code', 'cliente', '客户编码', '客户', 'customer', 'client_code'],
  receiverName:     ['receiver_name', 'recipient', 'destinatario', '收件人', 'receiver', 'consignee'],
  orderCreateTime:  ['order_create_time', 'created_at', 'fecha_creacion', '创建时间', 'fecha', 'create_time'],
  outboundTime:     ['outbound_time', 'fecha_salida', '出库时间', 'delivery_time', 'shipped_at'],
  outboundBoxCount: ['outbound_box_count', 'box_count', 'cajas', '箱数', 'total_cajas', 'total_boxes'],
  whCode:           ['wh_code', 'warehouse', 'almacen', '仓库代码', 'warehouse_code'],
  status:           ['status', 'estado', '状态'],
  boxType:          ['box_type', 'tipo_caja', '箱型', 'tipo'],
  customizeCode:    ['customize_code', 'sku', 'codigo', '物品编码'],
  quantity:         ['quantity', 'qty', 'cantidad', '数量'],
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
  return {
    outboundOrderNo:  getField(row, map, 'outboundOrderNo'),
    logisticsChannel: getField(row, map, 'logisticsChannel'),
    logisticsTrackNo: getField(row, map, 'logisticsTrackNo'),
    thirdOrderNo:     getField(row, map, 'thirdOrderNo'),
    customerCode:     getField(row, map, 'customerCode'),
    receiverName:     getField(row, map, 'receiverName'),
    orderCreateTime:  getField(row, map, 'orderCreateTime'),
    outboundTime:     getField(row, map, 'outboundTime'),
    outboundBoxCount: parseInt(getField(row, map, 'outboundBoxCount')) || null,
    whCode:           getField(row, map, 'whCode'),
    status:           getField(row, map, 'status') || 'pending',
    boxType:          getField(row, map, 'boxType'),
    customizeCode:    getField(row, map, 'customizeCode'),
    quantity:         parseInt(getField(row, map, 'quantity')) || 1,
  }
}

// ── Sheet URL cache ────────────────────────────────────────────────────────
let _sheetUrls = { inventory: null, outbound: null }
let _urlsFetched = false

async function loadSheetUrls() {
  if (_urlsFetched) return _sheetUrls
  const res = await api.get('/upapex/config').then(r => r.data)
  _sheetUrls = {
    inventory: res?.data?.sheet_inventory_url || null,
    outbound:  res?.data?.sheet_outbound_url  || null,
  }
  _urlsFetched = true
  return _sheetUrls
}

export function invalidateUrlCache() {
  _urlsFetched = false
}

// ── Fetch raw CSV ──────────────────────────────────────────────────────────
async function fetchSheetAsCSV(url) {
  try {
    const res = await fetch(url, {
      mode: 'cors',
      headers: { Accept: 'text/csv,text/plain,*/*' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch {
    // Backend CORS proxy fallback
    const res = await api.get('/upapex/proxy/sheet', { params: { url }, timeout: 20000 })
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
  }
}

// ── Load and cache ─────────────────────────────────────────────────────────
async function loadSheet(type, forceRefresh = false) {
  const entry = cache[type]
  const now = Date.now()

  if (!forceRefresh && entry.data && (now - entry.ts) < CACHE_TTL) {
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
    const text = await fetchSheetAsCSV(url)
    const rows = parseCSV(text)
    if (rows.length < 2) {
      const err = new Error('La hoja parece vacía (menos de 2 filas)')
      err.code = 'SHEET_EMPTY'
      throw err
    }
    cache[type] = { data: rows, ts: now }
    return rows
  } catch (err) {
    if (entry.data) return entry.data // stale fallback
    throw err
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function refreshSheet(type) {
  cache[type] = { data: null, ts: 0 }
  return loadSheet(type, true)
}

export function getCacheTimestamp(type) {
  return cache[type].ts || null
}

export async function testSheetUrl(url, type = 'outbound') {
  const text = await fetchSheetAsCSV(url)
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
  return { success: true, data: { records, total: records.length } }
}

export async function getOutboundList() {
  const rows = await loadSheet('outbound')
  const [headerRow, ...dataRows] = rows
  const map = buildHeaderMap(headerRow, OUTBOUND_ALIASES)

  // Group rows by OBC; accumulate box count from package rows when not explicit
  const orderMap = new Map()
  for (const row of dataRows) {
    const r = mapRowToOutbound(row, map)
    if (!r.outboundOrderNo) continue
    if (!orderMap.has(r.outboundOrderNo)) {
      orderMap.set(r.outboundOrderNo, { ...r })
    } else if (!r.outboundBoxCount) {
      const existing = orderMap.get(r.outboundOrderNo)
      orderMap.set(r.outboundOrderNo, {
        ...existing,
        outboundBoxCount: (existing.outboundBoxCount || 0) + (r.quantity || 0),
      })
    }
  }

  const records = Array.from(orderMap.values())
  return { success: true, data: { records, total: records.length } }
}

export async function getOutboundDetail(orderNo) {
  const rows = await loadSheet('outbound')
  const [headerRow, ...dataRows] = rows
  const map = buildHeaderMap(headerRow, OUTBOUND_ALIASES)

  const orderRows = dataRows
    .map(row => mapRowToOutbound(row, map))
    .filter(r => r.outboundOrderNo === orderNo)

  if (orderRows.length === 0) return { success: true, data: null }

  const base = orderRows[0]
  const packageList = orderRows.map(r => ({
    boxType:       r.boxType,
    customizeCode: r.customizeCode,
    quantity:      r.quantity,
    boxSkuQueryVOList: [],
  }))

  return {
    success: true,
    data: {
      ...base,
      packageList,
      outboundBoxList: packageList,
    },
  }
}

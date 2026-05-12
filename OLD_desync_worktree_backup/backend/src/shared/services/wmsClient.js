import { createHmac } from 'crypto'
import { query } from '../../config/database.js'
import { loadCredentials } from './wmsCredentials.js'

// In-memory credentials cache (5 min TTL — avoids a DB hit per scan)
let _credCache = null
let _credCacheAt = 0
const CRED_TTL_MS = 5 * 60 * 1000

async function getCreds() {
  if (_credCache && Date.now() - _credCacheAt < CRED_TTL_MS) return _credCache
  _credCache = await loadCredentials()
  _credCacheAt = Date.now()
  return _credCache
}

export function invalidateCredCache() {
  _credCache = null
}

/**
 * Build HmacSHA256 authcode per xlwms docs:
 * 1. Sort keys of each item in data array alphabetically (case-insensitive)
 * 2. Build param string: sort keys of {appKey, data, reqTime} alphabetically
 *    then concatenate as "key=value" pairs (no separator between pairs)
 * 3. HMAC-SHA256 with appSecret → lowercase hex
 */
function buildAuthCode(appKey, appSecret, dataPayload, reqTime) {
  // Sort inner data item keys
  const sortedData = Array.isArray(dataPayload)
    ? dataPayload.map(item =>
        item && typeof item === 'object'
          ? Object.fromEntries(
              Object.entries(item).sort(([a], [b]) =>
                a.toLowerCase().localeCompare(b.toLowerCase())
              )
            )
          : item
      )
    : dataPayload

  const params = {
    appKey,
    data: JSON.stringify(sortedData),
    reqTime: String(reqTime),
  }

  const paramStr = Object.keys(params)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(k => `${k}=${params[k]}`)
    .join('')

  return createHmac('sha256', appSecret).update(paramStr).digest('hex')
}

/**
 * Make a single authenticated POST request to the WMS API.
 * Throws 'WMS_NOT_CONFIGURED' error if credentials are missing.
 */
export async function wmsPost(endpoint, dataPayload) {
  const creds = await getCreds()
  if (!creds) {
    const err = new Error('WMS_NOT_CONFIGURED')
    err.code = 'WMS_NOT_CONFIGURED'
    throw err
  }

  const reqTime = String(Date.now())
  const authcode = buildAuthCode(creds.app_key, creds.app_secret, dataPayload, reqTime)
  const url = `${creds.base_url}${endpoint}?authcode=${authcode}`
  const body = JSON.stringify({ appKey: creds.app_key, reqTime, data: dataPayload })

  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`WMS HTTP ${res.status}: ${await res.text().catch(() => '')}`)
      return await res.json()
    } catch (err) {
      if (err.code === 'WMS_NOT_CONFIGURED') throw err
      lastErr = err
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 500))
    }
  }
  throw lastErr
}

/**
 * Fetch all pages of a WMS paginated endpoint.
 * Returns the combined array of all items across all pages.
 * Handles both { data: { records: [...], total: N } } and { data: [...] } shapes.
 */
export async function wmsPostAll(endpoint, baseData = {}, pageSize = 100) {
  const allItems = []
  let page = 1

  while (true) {
    const payload = [{ ...baseData, page, pageSize }]
    const res = await wmsPost(endpoint, payload)

    const records = res?.data?.records ?? res?.data ?? []
    const items = Array.isArray(records) ? records : []
    allItems.push(...items)

    const total = res?.data?.total ?? res?.total ?? items.length
    if (allItems.length >= total || items.length < pageSize) break
    page++
  }

  return allItems
}

// ── Cache helpers ──────────────────────────────────────────────────────────

export async function cacheGet(key) {
  const res = await query(
    `SELECT data FROM wms_cache WHERE key = $1 AND expires_at > now()`,
    [key]
  )
  return res.rows[0]?.data ?? null
}

export async function cacheSet(key, data, ttlSeconds) {
  await query(
    `INSERT INTO wms_cache (key, data, expires_at)
     VALUES ($1, $2, now() + ($3 || ' seconds')::INTERVAL)
     ON CONFLICT (key) DO UPDATE
       SET data = EXCLUDED.data,
           expires_at = EXCLUDED.expires_at,
           created_at = now()`,
    [key, JSON.stringify(data), String(ttlSeconds)]
  )
}

// ── Inventory-specific helper ──────────────────────────────────────────────

/**
 * Fetch WMS inventory with 10-minute cache.
 * Returns a plain object map: barcode/boxType → item for O(1) lookup.
 */
export async function getInventoryMap() {
  const CACHE_KEY = 'inventory:full'
  const cached = await cacheGet(CACHE_KEY)
  if (cached) return cached

  const items = await wmsPostAll('/integratedInventory/pageOpen', {})

  const map = {}
  for (const item of items) {
    const barcode = (item.customBarcode || item.boxBarcode || '').trim()
    const boxType = (item.boxTypeNo || '').trim()
    const entry = {
      barcode,
      boxType,
      sku: item.sku || item.skuCode || '',
      productName: item.productName || item.skuName || '',
      cellNo: item.cellNo || item.locationCode || '',
      availableStock: parseInt(item.availableQty ?? item.availableStock ?? 0),
    }
    if (barcode) map[barcode] = entry
    if (boxType && boxType !== barcode) map[boxType] = entry
  }

  await cacheSet(CACHE_KEY, map, 600) // 10 minutes
  return map
}

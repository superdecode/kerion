import { createHmac } from 'crypto'
import { query } from '../../../config/database.js'
import { decrypt } from '../../../shared/services/wmsCredentials.js'

const BASE_URL = 'https://api.xlwms.com/openapi'

// In-memory config cache per tenant (2 min TTL)
const _configCache = new Map()
const CONFIG_TTL_MS = 2 * 60 * 1000

// In-flight request deduplication (500ms window)
const _inFlight = new Map()

function makeReqTime() {
  // xlwms requires UNIX timestamp in seconds (10-digit)
  return String(Math.floor(Date.now() / 1000))
}

// Sort all object keys alphabetically (case-insensitive), recursively
function sortObjectKeys(obj) {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(sortObjectKeys)
  return Object.keys(obj)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .reduce((acc, k) => { acc[k] = sortObjectKeys(obj[k]); return acc }, {})
}

/**
 * HMAC-SHA256 authcode per xlwms docs:
 * 1. Sort data fields alphabetically (case-insensitive)
 * 2. Sort {appKey, data, reqTime} keys alphabetically
 * 3. Concatenate VALUES only (no key= prefix), then HMAC-SHA256 with appSecret
 */
function buildAuthCode(appKey, appSecret, data, reqTime) {
  const sortedData = sortObjectKeys(data)
  const params = {
    appKey,
    data: JSON.stringify(sortedData),
    reqTime: String(reqTime),
  }
  const paramStr = Object.keys(params)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(k => params[k])
    .join('')
  return createHmac('sha256', appSecret).update(paramStr).digest('hex')
}

async function getConfig(tenantId) {
  const cached = _configCache.get(tenantId)
  if (cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.config

  const res = await query(
    'SELECT app_key, app_secret_encrypted FROM wms_config WHERE tenant_id = $1 AND is_active = true ORDER BY id DESC LIMIT 1',
    [tenantId]
  )
  const row = res.rows[0] || null
  const config = row
    ? {
        app_key: row.app_key,
        app_secret: row.app_secret_encrypted ? decrypt(row.app_secret_encrypted) : null,
      }
    : null
  _configCache.set(tenantId, { config, at: Date.now() })
  return config
}

export function invalidateConfigCache(tenantId) {
  if (tenantId) _configCache.delete(tenantId)
  else _configCache.clear()
}

async function upapexPost(tenantId, endpoint, data) {
  const config = await getConfig(tenantId)
  if (!config) {
    const err = new Error('Upapex WMS no configurado')
    err.code = 'UPAPEX_NOT_CONFIGURED'
    throw err
  }

  const reqTime = makeReqTime()
  const body = JSON.stringify({ appKey: config.app_key, reqTime, data })

  let url = `${BASE_URL}${endpoint}`
  if (config.app_secret) {
    const authcode = buildAuthCode(config.app_key, config.app_secret, data, reqTime)
    url += `?authcode=${authcode}`
  }

  let lastErr
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) throw new Error(`WMS HTTP ${res.status}`)
      const json = await res.json()
      if (json.code !== 200) {
        const err = new Error(json.msg || `WMS error code ${json.code}`)
        err.wmsCode = json.code
        err.wmsMsg = json.msg
        throw err
      }
      return json.data
    } catch (err) {
      if (err.code === 'UPAPEX_NOT_CONFIGURED' || err.wmsCode) throw err
      lastErr = err
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000))
    }
  }
  throw lastErr
}

function dedupKey(tenantId, endpoint, data) {
  return `${tenantId}:${endpoint}:${JSON.stringify(data)}`
}

async function upapexPostDedup(tenantId, endpoint, data) {
  const key = dedupKey(tenantId, endpoint, data)
  const existing = _inFlight.get(key)
  if (existing) return existing

  const promise = upapexPost(tenantId, endpoint, data).finally(() => {
    _inFlight.delete(key)
  })
  _inFlight.set(key, promise)
  setTimeout(() => _inFlight.delete(key), 500)
  return promise
}

// ── Public API functions ───────────────────────────────────────────────────

export async function testConnection(tenantId) {
  return upapexPost(tenantId, '/v1/integratedInventory/pageOpen', { page: 1, pageSize: 1 })
}

export async function getBoxStock(tenantId, params = {}) {
  const { page = 1, pageSize = 25, ...rest } = params
  return upapexPostDedup(tenantId, '/v1/boxStock/page', { page, pageSize, ...rest })
}

export async function getIntegratedInventory(tenantId, params = {}) {
  const { page = 1, pageSize = 25, ...rest } = params
  return upapexPostDedup(tenantId, '/v1/integratedInventory/pageOpen', {
    page,
    pageSize,
    timeType: 'operateTime',
    ...rest,
  })
}

export async function getBigOutboundList(tenantId, params = {}) {
  const { page = 1, pageSize = 25, ...rest } = params
  return upapexPostDedup(tenantId, '/v1/outboundOrder/big/pageList', {
    page,
    pageSize,
    timeType: 'orderCreateTime',
    ...rest,
  })
}

export async function getBigOutboundDetail(tenantId, outboundOrderNoList) {
  const list = Array.isArray(outboundOrderNoList) ? outboundOrderNoList : [outboundOrderNoList]
  return upapexPost(tenantId, '/v1/outboundOrder/big/detail', { outboundOrderNoList: list })
}

export { getConfig as _getConfig }

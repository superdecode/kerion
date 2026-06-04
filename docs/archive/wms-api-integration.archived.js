/**
 * ARCHIVED: xlwms OpenAPI Integration
 * =====================================
 * Status: Archived — replaced by Google Sheets CSV data source (2026-06-04)
 *
 * What was built:
 *   Full backend integration with the xlwms warehouse management system
 *   (https://api.xlwms.com/openapi). Implemented request signing (HMAC-SHA256),
 *   per-tenant credential storage (AES-256-CBC encrypted app_secret), in-flight
 *   deduplication, retry logic, and in-memory config cache per tenant.
 *
 * Endpoints implemented:
 *   POST /v1/boxStock/page               — paginated box inventory
 *   POST /v1/integratedInventory/pageOpen — sku-level integrated inventory
 *   POST /v1/outboundOrder/big/pageList   — outbound order list
 *   POST /v1/outboundOrder/big/detail     — outbound order detail
 *
 * Authentication:
 *   HMAC-SHA256 authcode. Sort payload keys {appKey, data, reqTime} alphabetically
 *   (case-insensitive), concatenate VALUES only (no key= prefix), then
 *   HMAC-SHA256 with appSecret. Verified working: credentials and signing
 *   confirmed valid by xlwms API (returned code 200 on some endpoints).
 *
 * Why replaced:
 *   The xlwms account used lacked warehouse-level data permissions. The API
 *   returned code 200 on /boxStock but returned an empty records array because
 *   the tenant was not assigned any warehouse (whCode). The outbound list
 *   returned 502 for similar reasons. Re-activating this code would require
 *   the xlwms account to have whCode-level permissions assigned by the platform
 *   administrator. The appKey and appSecret themselves are valid.
 *
 * To re-activate:
 *   1. Ensure the xlwms account has warehouse permissions (whCode assigned)
 *   2. Restore this file to backend/src/modules/upapex/services/upapexApiClient.js
 *   3. Restore the WMS proxy routes in upapex.routes.js (box-stock, integrated-inventory,
 *      outbound-list, outbound-detail)
 *   4. Revert inventarioService.js getBoxStock and surtidoService.js getOutboundList/Detail
 *      to call the backend proxy routes instead of googleSheetsService
 */

// ── Dependencies ───────────────────────────────────────────────────────────

// import { createHmac } from 'crypto'
// import { query } from '../../../config/database.js'
// import { decrypt } from '../../../shared/services/wmsCredentials.js'

const BASE_URL = 'https://api.xlwms.com/openapi'

// ── Config cache ───────────────────────────────────────────────────────────

const _configCache = new Map()
const CONFIG_TTL_MS = 2 * 60 * 1000
const _inFlight = new Map()
const _fieldLogDone = new Set()

function makeReqTime() {
  return String(Math.floor(Date.now() / 1000))
}

/**
 * HMAC-SHA256 authcode per xlwms docs:
 * Sort {appKey, data, reqTime} keys alphabetically, concatenate VALUES only
 * (no key= prefix), then HMAC-SHA256 with appSecret.
 */
function buildAuthCode(appKey, appSecret, data, reqTime) {
  const params = {
    appKey,
    data: JSON.stringify(data),
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
  let authcode = null
  if (config.app_secret) {
    authcode = buildAuthCode(config.app_key, config.app_secret, data, reqTime)
    url += `?authcode=${authcode}`
  }

  console.log(`[xlwms] POST ${endpoint} appKey=****${config.app_key.slice(-4)} reqTime=${reqTime} authcode=${authcode ? authcode.slice(0,8) + '...' : 'NONE'}`)

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
        console.error(`[xlwms] FULL_RESPONSE=${JSON.stringify(json)} endpoint=${endpoint}`)
        const rawMsg = json.msg || json.message || json.errmsg || json.error || ''
        const msg = rawMsg ? `[${json.code}] ${rawMsg}` : `WMS error code ${json.code}`
        const err = new Error(msg)
        err.wmsCode = json.code
        err.wmsMsg = msg
        throw err
      }
      if (json.data && !_fieldLogDone.has(endpoint)) {
        _fieldLogDone.add(endpoint)
        const sample = json.data?.records?.[0] ?? json.data?.[0] ?? json.data
        console.log(`[xlwms] FIELDS ${endpoint}: ${JSON.stringify(sample)}`)
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

// ── Public API ─────────────────────────────────────────────────────────────

export async function testConnection(tenantId) {
  return upapexPost(tenantId, '/v1/boxStock/page', { page: 1, pageSize: 1 })
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


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Backend proxy routes — upapex.routes.js (WMS API portions)
// Original file: backend/src/modules/upapex/routes/upapex.routes.js
// These routes forwarded browser requests to the xlwms OpenAPI.
// ═══════════════════════════════════════════════════════════════════════════

/*
// Archived imports (were at top of upapex.routes.js):
import { encrypt } from '../../../shared/services/wmsCredentials.js'
import {
  testConnection,
  getBoxStock,
  getIntegratedInventory,
  getBigOutboundList,
  getBigOutboundDetail,
  invalidateConfigCache,
} from '../services/upapexApiClient.js'

// POST /api/upapex/config — save or update WMS API credentials
router.post('/config',
  authenticateToken, loadFullUser,
  requirePermission('sistema.wms', 'editar'),
  async (req, res) => {
    try {
      const { app_key, app_secret } = req.body
      if (!app_key || !app_key.trim()) {
        return res.status(400).json({ success: false, error: 'app_key es requerido' })
      }
      if (!app_secret || !app_secret.trim()) {
        return res.status(400).json({ success: false, error: 'app_secret es requerido' })
      }
      const key = app_key.trim()
      const secretEncrypted = encrypt(app_secret.trim())

      const existing = await req.tQuery(
        'SELECT id FROM wms_config WHERE tenant_id = $1 LIMIT 1',
        [req.tenantId]
      )
      if (existing.rows.length > 0) {
        await req.tQuery(
          'UPDATE wms_config SET app_key = $1, app_secret_encrypted = $2, updated_at = now() WHERE tenant_id = $3',
          [key, secretEncrypted, req.tenantId]
        )
      } else {
        await req.tQuery(
          'INSERT INTO wms_config (tenant_id, app_key, app_secret_encrypted) VALUES ($1, $2, $3)',
          [req.tenantId, key, secretEncrypted]
        )
      }

      invalidateConfigCache(req.tenantId)
      await auditLog(req, 'UPAPEX_CONFIG_UPDATED', 'wms_config', null, { app_key_tail: key.slice(-4) })
      res.json({ success: true })
    } catch (err) {
      console.error('POST upapex/config error:', err.message)
      const userMsg = err.message.includes('WMS_ENCRYPTION_KEY')
        ? 'El servidor no tiene configurada la clave de encriptación WMS. Contacta al administrador.'
        : 'Error guardando configuración Upapex'
      res.status(500).json({ success: false, error: userMsg })
    }
  }
)

// POST /api/upapex/test-connection
router.post('/test-connection',
  authenticateToken, loadFullUser,
  requirePermission('sistema.wms', 'ver'),
  async (req, res) => {
    try {
      await testConnection(req.tenantId)
      await req.tQuery(
        'UPDATE wms_config SET last_verified_at = now() WHERE tenant_id = $1',
        [req.tenantId]
      )
      invalidateConfigCache(req.tenantId)
      res.json({ success: true, message: 'Conexión Upapex WMS exitosa' })
    } catch (err) {
      if (err.code === 'UPAPEX_NOT_CONFIGURED') {
        return res.status(400).json({ success: false, error: 'Upapex WMS no configurado' })
      }
      console.error('Upapex test-connection error:', err.message)
      res.status(502).json({
        success: false,
        error: err.wmsMsg || err.message,
        wmsCode: err.wmsCode || null,
      })
    }
  }
)

// POST /api/upapex/debug-raw — returns raw xlwms response (admin only)
router.post('/debug-raw',
  authenticateToken, loadFullUser,
  requirePermission('sistema.wms', 'editar'),
  async (req, res) => {
    try {
      const cfg = await import('../services/upapexApiClient.js').then(m => m._getConfig(req.tenantId))
      if (!cfg) return res.json({ success: false, error: 'No config' })

      const { createHmac } = await import('crypto')
      const reqTime = String(Math.floor(Date.now() / 1000))
      const data = { page: 1, pageSize: 1 }

      let url = 'https://api.xlwms.com/openapi/v1/integratedInventory/pageOpen'
      if (cfg.app_secret) {
        const params = { appKey: cfg.app_key, data: JSON.stringify(data), reqTime }
        const paramStr = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(k => params[k]).join('')
        const authcode = createHmac('sha256', cfg.app_secret).update(paramStr).digest('hex')
        url += `?authcode=${authcode}`
        res.json({
          debug: {
            appKey: `****${cfg.app_key.slice(-4)}`,
            hasSecret: !!cfg.app_secret,
            reqTime,
            paramStr,
            authcode,
            url: url.replace(authcode, authcode.slice(0,8) + '...'),
          }
        })
      } else {
        res.json({ debug: { error: 'No secret configured' } })
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  }
)

// GET /api/upapex/box-stock
router.get('/box-stock',
  authenticateToken, loadFullUser,
  requirePermission('inventario.escaneo', 'ver'),
  async (req, res) => {
    try {
      const { page, pageSize, boxTypeList, skuList, isHideInventory, stockCountKind, startValue, endValue, whCodeList } = req.query
      const params = {
        page: parseInt(page) || 1,
        pageSize: Math.min(parseInt(pageSize) || 25, 100),
      }
      if (boxTypeList) params.boxTypeList = String(boxTypeList).split(',').filter(Boolean)
      if (skuList) params.skuList = String(skuList).split(',').filter(Boolean)
      if (whCodeList) params.whCodeList = String(whCodeList).split(',').filter(Boolean)
      if (isHideInventory !== undefined) params.isHideInventory = parseInt(isHideInventory)
      if (stockCountKind) params.stockCountKind = stockCountKind
      if (startValue !== undefined) params.startValue = parseInt(startValue)
      if (endValue !== undefined) params.endValue = parseInt(endValue)

      const data = await getBoxStock(req.tenantId, params)
      res.json({ success: true, data })
    } catch (err) {
      if (err.code === 'UPAPEX_NOT_CONFIGURED') return res.status(400).json({ success: false, error: 'Upapex WMS no configurado' })
      console.error('upapex/box-stock error:', err.message)
      res.status(502).json({ success: false, error: err.wmsMsg || err.message })
    }
  }
)

// GET /api/upapex/integrated-inventory
router.get('/integrated-inventory',
  authenticateToken, loadFullUser,
  requirePermission('inventario.escaneo', 'ver'),
  async (req, res) => {
    try {
      const { page, pageSize, skuList, whCodeList, startTime, endTime, stockType } = req.query
      const params = {
        page: parseInt(page) || 1,
        pageSize: Math.min(parseInt(pageSize) || 25, 100),
      }
      if (skuList) params.skuList = skuList
      if (whCodeList) params.whCodeList = whCodeList
      if (startTime) params.startTime = startTime
      if (endTime) params.endTime = endTime
      if (stockType !== undefined) params.stockType = parseInt(stockType)

      const data = await getIntegratedInventory(req.tenantId, params)
      res.json({ success: true, data })
    } catch (err) {
      if (err.code === 'UPAPEX_NOT_CONFIGURED') return res.status(400).json({ success: false, error: 'Upapex WMS no configurado' })
      console.error('upapex/integrated-inventory error:', err.message)
      res.status(502).json({ success: false, error: err.wmsMsg || err.message })
    }
  }
)

// GET /api/upapex/outbound-list
router.get('/outbound-list',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'ver'),
  async (req, res) => {
    try {
      const { page, pageSize, outboundOrderNos, startTime, endTime } = req.query
      const params = {
        page: parseInt(page) || 1,
        pageSize: Math.min(parseInt(pageSize) || 25, 100),
      }
      if (outboundOrderNos) {
        params.outboundOrderNos = String(outboundOrderNos).split(',').map(s => s.trim()).filter(Boolean)
      }
      if (startTime) params.startTime = startTime
      if (endTime) params.endTime = endTime

      const data = await getBigOutboundList(req.tenantId, params)
      res.json({ success: true, data })
    } catch (err) {
      if (err.code === 'UPAPEX_NOT_CONFIGURED') return res.status(400).json({ success: false, error: 'Upapex WMS no configurado' })
      console.error('upapex/outbound-list error:', err.message)
      res.status(502).json({ success: false, error: err.wmsMsg || err.message })
    }
  }
)

// GET /api/upapex/outbound-detail/:orderNo
router.get('/outbound-detail/:orderNo',
  authenticateToken, loadFullUser,
  requirePermission('surtido.ordenes', 'ver'),
  async (req, res) => {
    try {
      const { orderNo } = req.params
      const data = await getBigOutboundDetail(req.tenantId, [orderNo])
      res.json({ success: true, data })
    } catch (err) {
      if (err.code === 'UPAPEX_NOT_CONFIGURED') return res.status(400).json({ success: false, error: 'Upapex WMS no configurado' })
      console.error('upapex/outbound-detail error:', err.message)
      res.status(502).json({ success: false, error: err.wmsMsg || err.message })
    }
  }
)
*/


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: Frontend service functions — wmsHubService.js (API portions)
// Original file: frontend/src/modules/wmshub/services/wmsHubService.js
// ═══════════════════════════════════════════════════════════════════════════

/*
export const saveConfig = ({ app_key, app_secret }) =>
  api.post('/upapex/config', { app_key, app_secret }).then(r => r.data)

export const testConnection = () =>
  api.post('/upapex/test-connection').then(r => r.data)
*/


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Frontend store — wmsHubStore.js (API-specific state)
// Original file: frontend/src/modules/wmshub/stores/wmsHubStore.js
// The full store is still live. These fields tracked API connection state
// and are no longer populated with the Google Sheets source.
// ═══════════════════════════════════════════════════════════════════════════

/*
// Fields in the zustand store that were driven by WMS API:

lastTest: null,   // { ok: bool, testedAt: ISO string, latencyMs: number }
lastSync: null,   // { boxStock: ISO string, outbound: ISO string }

recordTest: (ok, latencyMs) => set({
  lastTest: { ok, testedAt: new Date().toISOString(), latencyMs },
}),

recordSync: (type) => set((state) => ({
  lastSync: {
    ...(state.lastSync || {}),
    [type]: new Date().toISOString(),
  },
})),
*/


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Configuracion.jsx — WMS API UI cards
// Original file: frontend/src/modules/wmshub/pages/Configuracion.jsx
// These four cards were replaced by a single Google Sheets card.
// ═══════════════════════════════════════════════════════════════════════════

/*
// ── Archived state variables ──────────────────────────────────────────────

const [appKey, setAppKey] = useState('')
const [appSecret, setAppSecret] = useState('')
const [showKey, setShowKey] = useState(false)
const [showSecret, setShowSecret] = useState(false)
const [confirmOpen, setConfirmOpen] = useState(false)
const [testStart, setTestStart] = useState(null)

const { lastTest, lastSync, recordTest } = useWmsHubStore()
const isConnected = lastTest?.ok === true
const canSave = appKey.trim().length > 0 && appSecret.trim().length > 0

// ── Archived mutations ────────────────────────────────────────────────────

const saveMut = useMutation({
  mutationFn: () => saveConfig({ app_key: appKey, app_secret: appSecret }),
  onSuccess: () => {
    toast.success(t('wmshub.config.saved'))
    setAppKey(''); setAppSecret(''); setConfirmOpen(false)
    qc.invalidateQueries({ queryKey: ['upapex-config'] })
  },
  onError: (err) => toast.error(err.response?.data?.error || t('toast.error')),
})

const testMut = useMutation({
  mutationFn: () => { setTestStart(Date.now()); return testConnection() },
  onSuccess: () => {
    const latency = testStart ? Date.now() - testStart : null
    recordTest(true, latency)
    toast.success(t('wmshub.config.test_ok'))
    qc.invalidateQueries({ queryKey: ['upapex-config'] })
  },
  onError: (err) => {
    recordTest(false, null)
    toast.error(err.response?.data?.error || t('wmshub.config.test_fail'))
  },
})

// ── Archived JSX cards ────────────────────────────────────────────────────

// Status card — showed WMS connection status banner
<motion.div
  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
  className={`rounded-2xl p-5 text-white overflow-hidden relative ${
    config && isConnected     ? 'bg-gradient-to-r from-success-600 to-success-700' :
    config                   ? 'bg-gradient-to-r from-primary-600 to-primary-700' :
    'border border-red-300/55 bg-gradient-to-r from-red-700 via-rose-600 to-red-500 shadow-lg shadow-red-700/25'
  }`}>
  ...status, WiFi icon, last-test latency badge...
</motion.div>

// Credentials card — App Key / App Secret inputs with save button
<motion.div className="card">
  <div className="px-5 pt-5 pb-4 border-b border-warm-100 flex items-center gap-3">
    <Key className="w-4 h-4 text-primary-600" />
    <h2>{t('wmshub.config.credentials')}</h2>
  </div>
  <div className="p-5">
    ...app_key_masked display, App Key input, App Secret input, Save button...
  </div>
</motion.div>

// Connection test card — "Probar conexión" button with latency display
<motion.div className="card">
  <RefreshCw className="w-4 h-4 text-accent-600" />
  <h2>{t('wmshub.config.test_title')}</h2>
  ...test button, last_test timestamp, latency ms...
</motion.div>

// Sync status card — showed last boxStock / outbound sync timestamps
<motion.div className="card">
  <ArrowUpDown className="w-4 h-4 text-success-600" />
  <h2>{t('wmshub.config.sync_title')}</h2>
  ...sync_box_stock, sync_outbound, sync_never...
</motion.div>

// Confirm save modal — appeared before overwriting API credentials
<Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title={t('wmshub.config.confirm_title')} icon={Key}>
  <p>{t('wmshub.config.confirm_body')}</p>
</Modal>
*/

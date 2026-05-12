# WMS Hub + Inventory Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a centralized WMS credential hub (admin section) and a full Inventory scanning module to kerion, following the dropscan architecture exactly.

**Architecture:** WMS credentials are stored once in `wms_credentials` (AES-encrypted secret), and a shared `wmsClient.js` service handles HmacSHA256 signing + pagination + cache for all modules. The Inventory module (Escaneo / Historial / Reportes) mirrors dropscan's folder structure, route patterns, permission system, and visual style. All scan records persist to PostgreSQL — no Google Sheets dependency.

**Tech Stack:** Node.js/Express backend, PostgreSQL (via `pg`), Node.js built-in `crypto` (AES + HMAC), React 18 + Vite, TanStack Query v5, Zustand, Tailwind CSS, Framer Motion, Lucide React, Recharts.

---

## File Map

### New files — Backend
| Path | Responsibility |
|------|---------------|
| `backend/src/shared/services/wmsClient.js` | HmacSHA256 signing, HTTP requests to WMS, cache read/write, paginated fetch |
| `backend/src/shared/services/wmsCredentials.js` | AES encrypt/decrypt, load/save credentials from DB |
| `backend/src/core/routes/wms.routes.js` | GET/PUT credentials, POST test-connection |
| `backend/src/modules/inventory/routes/scan.routes.js` | Session start/end, scan barcode (lookup WMS cache + persist) |
| `backend/src/modules/inventory/routes/history.routes.js` | Paginated scan history with filters |
| `backend/src/modules/inventory/routes/reports.routes.js` | Aggregated metrics by status / date / user |

### New files — Frontend
| Path | Responsibility |
|------|---------------|
| `frontend/src/pages/WmsHub.jsx` | Admin page: form for App Key + App Secret + test connection |
| `frontend/src/services/wmsHubService.js` | API calls for WMS credentials CRUD + test |
| `frontend/src/modules/inventory/services/inventoryService.js` | API calls for inventory scan, history, reports, WMS sync |
| `frontend/src/modules/inventory/pages/Escaneo.jsx` | Scan page: load WMS inventory, scan barcodes, classify OK/Bloqueado/NoWMS |
| `frontend/src/modules/inventory/pages/Historial.jsx` | Scan history with filters and export |
| `frontend/src/modules/inventory/pages/Reportes.jsx` | Bar/pie charts by status, user, date range |

### Modified files
| Path | Change |
|------|--------|
| `backend/src/server.js` | Import + register WMS and inventory routes; add DB migration steps |
| `backend/src/config/seed.js` | Add `inventory.*` + `global.wms` permissions to all roles |
| `frontend/src/App.jsx` | Add WMS Hub + inventory routes |
| `frontend/src/core/components/layout/Sidebar.jsx` | Add Inventory section to `getModuleNav` |
| `frontend/src/core/stores/i18nStore.js` | Add `inventory.*` + `wms.*` translation keys to both `zh` and `es` |
| `frontend/src/pages/Administracion.jsx` | Add `inventory.*` + `global.wms` to `MODULE_GROUPS` |

---

## Task 1: DB Migration Steps

**Files:**
- Modify: `backend/src/server.js` (add steps to `runMigrations()` array)

- [ ] **Step 1: Add migration SQL to `runMigrations()` in `server.js`**

Open `backend/src/server.js`. Inside `runMigrations()`, append these steps to the `steps` array after the last existing `ALTER TABLE` line:

```js
// ── WMS credentials ────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS wms_credentials (
  id SERIAL PRIMARY KEY,
  app_key TEXT NOT NULL,
  app_secret_encrypted TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT 'https://api.xlwms.com/openapi/v1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)`,

// ── WMS cache ──────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS wms_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
)`,
`CREATE INDEX IF NOT EXISTS idx_wms_cache_expires ON wms_cache(expires_at)`,

// ── Inventory sessions ─────────────────────────────────────
`CREATE TABLE IF NOT EXISTS inventory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
  origin_location TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','closed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
)`,
`CREATE INDEX IF NOT EXISTS idx_inv_sessions_user ON inventory_sessions(user_id)`,
`CREATE INDEX IF NOT EXISTS idx_inv_sessions_status ON inventory_sessions(status)`,

// ── Inventory scans ────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS inventory_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES inventory_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
  barcode TEXT NOT NULL,
  sku TEXT,
  product_name TEXT,
  cell_no TEXT,
  available_stock INTEGER,
  status TEXT NOT NULL CHECK (status IN ('OK','Bloqueado','NoWMS')),
  created_at TIMESTAMPTZ DEFAULT now()
)`,
`CREATE INDEX IF NOT EXISTS idx_inv_scans_session ON inventory_scans(session_id)`,
`CREATE INDEX IF NOT EXISTS idx_inv_scans_user ON inventory_scans(user_id)`,
`CREATE INDEX IF NOT EXISTS idx_inv_scans_barcode ON inventory_scans(barcode)`,
`CREATE INDEX IF NOT EXISTS idx_inv_scans_created ON inventory_scans(created_at)`,
`CREATE INDEX IF NOT EXISTS idx_inv_scans_status ON inventory_scans(status)`,
```

- [ ] **Step 2: Restart the backend and verify no migration errors**

```bash
cd /Users/quiron/CascadeProjects/kerion/backend
node src/server.js
```

Expected: Server starts with `🏭 WMS Backend` header and no `Migration step warning` lines for the new tables.

- [ ] **Step 3: Verify tables exist**

```bash
# In psql or via your DB client
\dt wms_credentials wms_cache inventory_sessions inventory_scans
```

Expected: 4 tables listed.

- [ ] **Step 4: Commit**

```bash
cd /Users/quiron/CascadeProjects/kerion
git add backend/src/server.js
git commit -m "feat(db): add wms_credentials, wms_cache, inventory_sessions, inventory_scans tables"
```

---

## Task 2: WMS Credentials Service (encrypt/decrypt)

**Files:**
- Create: `backend/src/shared/services/wmsCredentials.js`

- [ ] **Step 1: Create the service file**

```js
// backend/src/shared/services/wmsCredentials.js
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto'
import { query } from '../../config/database.js'

const ALGORITHM = 'aes-256-cbc'
const KEY_ENV = process.env.WMS_ENCRYPTION_KEY || ''

function getKey() {
  if (!KEY_ENV) throw new Error('WMS_ENCRYPTION_KEY env var is not set')
  // Derive a 32-byte key from the env var (pad or hash)
  return Buffer.from(KEY_ENV.padEnd(32, '0').slice(0, 32), 'utf8')
}

export function encrypt(plaintext) {
  const key = getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(stored) {
  const key = getKey()
  const [ivHex, encHex] = stored.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

export async function loadCredentials() {
  const res = await query(
    'SELECT * FROM wms_credentials WHERE is_active = true ORDER BY id DESC LIMIT 1'
  )
  if (res.rows.length === 0) return null
  const row = res.rows[0]
  return {
    id: row.id,
    app_key: row.app_key,
    app_secret: decrypt(row.app_secret_encrypted),
    base_url: row.base_url,
  }
}

export async function saveCredentials({ app_key, app_secret, base_url }) {
  const encrypted = encrypt(app_secret)
  const existing = await query('SELECT id FROM wms_credentials LIMIT 1')
  if (existing.rows.length > 0) {
    await query(
      `UPDATE wms_credentials
       SET app_key = $1, app_secret_encrypted = $2, base_url = $3, updated_at = now()
       WHERE id = $4`,
      [app_key, encrypted, base_url || 'https://api.xlwms.com/openapi/v1', existing.rows[0].id]
    )
  } else {
    await query(
      `INSERT INTO wms_credentials (app_key, app_secret_encrypted, base_url)
       VALUES ($1, $2, $3)`,
      [app_key, encrypted, base_url || 'https://api.xlwms.com/openapi/v1']
    )
  }
}
```

- [ ] **Step 2: Add `WMS_ENCRYPTION_KEY` to `.env.development`**

Open `backend/.env.development` (or create it if missing) and add:
```
WMS_ENCRYPTION_KEY=kirion_wms_dev_key_change_in_prod
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/services/wmsCredentials.js backend/.env.development
git commit -m "feat(wms): AES-256-CBC credentials encrypt/decrypt service"
```

---

## Task 3: WMS Client Service (signing + HTTP + cache + pagination)

**Files:**
- Create: `backend/src/shared/services/wmsClient.js`

- [ ] **Step 1: Create the WMS HTTP client**

```js
// backend/src/shared/services/wmsClient.js
import { createHmac } from 'crypto'
import { query } from '../../config/database.js'
import { loadCredentials } from './wmsCredentials.js'

// In-memory credentials cache (5 min TTL to avoid a DB hit per scan)
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
 * 1. Sort keys of `data` object alphabetically (if data is an object)
 * 2. Serialize request params: { appKey, data: JSON.stringify(dataObj), reqTime }
 * 3. Sort those keys alphabetically, concatenate as "key=value" pairs (no separator)
 * 4. HMAC-SHA256 with appSecret → lowercase hex
 */
function buildAuthCode(appKey, appSecret, dataPayload, reqTime) {
  // Step 1: sort inner data keys if it's an object
  let sortedData
  if (Array.isArray(dataPayload)) {
    sortedData = dataPayload.map(item =>
      typeof item === 'object' && item !== null
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase())))
        : item
    )
  } else {
    sortedData = dataPayload
  }

  // Step 2+3: build sorted param string
  const params = {
    appKey,
    data: JSON.stringify(sortedData),
    reqTime: String(reqTime),
  }
  const paramStr = Object.keys(params)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(k => `${k}=${params[k]}`)
    .join('')

  // Step 4: HMAC-SHA256
  return createHmac('sha256', appSecret).update(paramStr).digest('hex')
}

/**
 * Make a single authenticated POST request to the WMS API.
 * Throws if credentials are not configured.
 */
export async function wmsPost(endpoint, dataPayload) {
  const creds = await getCreds()
  if (!creds) throw new Error('WMS_NOT_CONFIGURED')

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
      if (!res.ok) throw new Error(`WMS HTTP ${res.status}`)
      const json = await res.json()
      return json
    } catch (err) {
      lastErr = err
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 500))
    }
  }
  throw lastErr
}

/**
 * Fetch all pages of a WMS paginated endpoint.
 * Returns the combined array of all items.
 * Assumes response shape: { data: { records: [...], total: N } } or { data: [...] }
 */
export async function wmsPostAll(endpoint, baseData = {}, pageSize = 100) {
  const allItems = []
  let page = 1

  while (true) {
    const payload = [{ ...baseData, page, pageSize }]
    const res = await wmsPost(endpoint, payload)

    // Handle both response shapes
    const records = res?.data?.records ?? res?.data ?? []
    const items = Array.isArray(records) ? records : []
    allItems.push(...items)

    const total = res?.data?.total ?? res?.total ?? items.length
    if (allItems.length >= total || items.length < pageSize) break
    page++
  }

  return allItems
}

/**
 * Read from wms_cache. Returns null if key not found or expired.
 */
export async function cacheGet(key) {
  const res = await query(
    `SELECT data FROM wms_cache WHERE key = $1 AND expires_at > now()`,
    [key]
  )
  return res.rows[0]?.data ?? null
}

/**
 * Write to wms_cache with a TTL in seconds.
 */
export async function cacheSet(key, data, ttlSeconds) {
  await query(
    `INSERT INTO wms_cache (key, data, expires_at)
     VALUES ($1, $2, now() + ($3 || ' seconds')::INTERVAL)
     ON CONFLICT (key) DO UPDATE
       SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at, created_at = now()`,
    [key, JSON.stringify(data), String(ttlSeconds)]
  )
}

/**
 * Fetch WMS inventory with 10-minute cache.
 * Returns Map<barcode, item> for O(1) lookup during scanning.
 * Exposed for use by inventory scan routes.
 */
export async function getInventoryMap() {
  const CACHE_KEY = 'inventory:full'
  const cached = await cacheGet(CACHE_KEY)
  if (cached) return cached // already a plain object; caller converts if needed

  const items = await wmsPostAll('/integratedInventory/pageOpen', {})
  // Build lookup map: both customBarcode and boxType → item
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
```

- [ ] **Step 2: Verify Node.js has built-in `fetch` (Node ≥ 18)**

```bash
node -e "console.log(typeof fetch)"
```

Expected: `function`

If `undefined`, the backend is on Node < 18. In that case add `node-fetch`:
```bash
npm install node-fetch
```
And at top of wmsClient.js add: `import fetch from 'node-fetch'`

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/services/wmsClient.js
git commit -m "feat(wms): HmacSHA256 client with cache, retry, pagination"
```

---

## Task 4: WMS Hub Backend Routes

**Files:**
- Create: `backend/src/core/routes/wms.routes.js`

- [ ] **Step 1: Create the routes file**

```js
// backend/src/core/routes/wms.routes.js
import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../shared/middleware/auth.js'
import { requirePermission } from '../../shared/middleware/permissions.js'
import { saveCredentials, loadCredentials } from '../../shared/services/wmsCredentials.js'
import { wmsPost, invalidateCredCache } from '../../shared/services/wmsClient.js'

const router = Router()

// GET /api/wms/credentials — return app_key and masked secret
router.get('/credentials',
  authenticateToken, loadFullUser,
  requirePermission('global.wms', 'ver'),
  async (_req, res) => {
    try {
      const creds = await loadCredentials()
      if (!creds) return res.json({ configured: false })
      res.json({
        configured: true,
        app_key: creds.app_key,
        base_url: creds.base_url,
        app_secret_masked: '••••••••',
      })
    } catch (err) {
      console.error('WMS get credentials error:', err)
      res.status(500).json({ error: 'Error obteniendo credenciales WMS' })
    }
  }
)

// PUT /api/wms/credentials — save (upsert) credentials
router.put('/credentials',
  authenticateToken, loadFullUser,
  requirePermission('global.wms', 'editar'),
  async (req, res) => {
    try {
      const { app_key, app_secret, base_url } = req.body
      if (!app_key || !app_secret) {
        return res.status(400).json({ error: 'app_key y app_secret son requeridos' })
      }
      await saveCredentials({ app_key, app_secret, base_url })
      invalidateCredCache()
      res.json({ success: true })
    } catch (err) {
      console.error('WMS save credentials error:', err)
      res.status(500).json({ error: 'Error guardando credenciales WMS' })
    }
  }
)

// POST /api/wms/test — test connection latency
router.post('/test',
  authenticateToken, loadFullUser,
  requirePermission('global.wms', 'ver'),
  async (_req, res) => {
    try {
      const start = Date.now()
      // Use outboundOrder/pageList with pageSize=1 as a lightweight ping
      await wmsPost('/outboundOrder/pageList', [{ page: 1, pageSize: 1 }])
      const latency = Date.now() - start
      res.json({ success: true, latency_ms: latency })
    } catch (err) {
      if (err.message === 'WMS_NOT_CONFIGURED') {
        return res.status(400).json({ error: 'Credenciales WMS no configuradas' })
      }
      res.status(502).json({ success: false, error: err.message })
    }
  }
)

export default router
```

- [ ] **Step 2: Register WMS routes in `backend/src/server.js`**

Add this import after the dropscan imports:
```js
import wmsRoutes from './core/routes/wms.routes.js'
```

Add this registration after the existing route registrations (before `runMigrations()`):
```js
app.use('/api/wms', wmsRoutes)
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/core/routes/wms.routes.js backend/src/server.js
git commit -m "feat(wms): credentials CRUD + test-connection endpoint"
```

---

## Task 5: WMS Hub Frontend

**Files:**
- Create: `frontend/src/services/wmsHubService.js`
- Create: `frontend/src/pages/WmsHub.jsx`

- [ ] **Step 1: Create the API service**

```js
// frontend/src/services/wmsHubService.js
import api from '../core/services/api'

export const getCredentials = () =>
  api.get('/wms/credentials').then(r => r.data)

export const saveCredentials = (payload) =>
  api.put('/wms/credentials', payload).then(r => r.data)

export const testConnection = () =>
  api.post('/wms/test').then(r => r.data)
```

- [ ] **Step 2: Create `WmsHub.jsx`**

```jsx
// frontend/src/pages/WmsHub.jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Header from '../core/components/layout/Header'
import LoadingSpinner from '../core/components/common/LoadingSpinner'
import { useToastStore } from '../core/stores/toastStore'
import { useI18nStore } from '../core/stores/i18nStore'
import { getCredentials, saveCredentials, testConnection } from '../services/wmsHubService'
import { Wifi, WifiOff, Save, TestTube, Link2, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react'

export default function WmsHub() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const qc = useQueryClient()

  const [form, setForm] = useState({ app_key: '', app_secret: '', base_url: 'https://api.xlwms.com/openapi/v1' })
  const [showSecret, setShowSecret] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['wms-credentials'],
    queryFn: getCredentials,
    onSuccess: (d) => {
      if (d?.configured) {
        setForm(prev => ({ ...prev, app_key: d.app_key, base_url: d.base_url }))
      }
    },
  })

  const saveMut = useMutation({
    mutationFn: saveCredentials,
    onSuccess: () => {
      toast.success(t('wms.savedOk'))
      qc.invalidateQueries({ queryKey: ['wms-credentials'] })
      setTestResult(null)
    },
    onError: () => toast.error(t('wms.saveError')),
  })

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testConnection()
      setTestResult({ ok: true, latency: res.latency_ms })
    } catch (err) {
      setTestResult({ ok: false, error: err.response?.data?.error || err.message })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.app_key || !form.app_secret) {
      toast.error(t('wms.requiredFields'))
      return
    }
    saveMut.mutate(form)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Header
        title={t('wms.title')}
        subtitle={t('wms.subtitle')}
        icon={Link2}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 bg-white rounded-2xl shadow-sm border border-warm-200 p-6"
        >
          {/* Status badge */}
          <div className="flex items-center gap-2 mb-6">
            {data?.configured ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-success-700 bg-success-50 px-3 py-1 rounded-full border border-success-200">
                <CheckCircle2 className="w-4 h-4" />
                {t('wms.connected')}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-medium text-warning-700 bg-warning-50 px-3 py-1 rounded-full border border-warning-200">
                <AlertTriangle className="w-4 h-4" />
                {t('wms.notConfigured')}
              </span>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            {/* App Key */}
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                {t('wms.appKey')}
              </label>
              <input
                type="text"
                value={form.app_key}
                onChange={e => setForm(p => ({ ...p, app_key: e.target.value }))}
                className="w-full px-3 py-2.5 border border-warm-300 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                placeholder="xxxxxxxxxxxxxxxx"
                autoComplete="off"
              />
            </div>

            {/* App Secret */}
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                {t('wms.appSecret')}
              </label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={form.app_secret}
                  onChange={e => setForm(p => ({ ...p, app_secret: e.target.value }))}
                  className="w-full px-3 py-2.5 pr-10 border border-warm-300 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                  placeholder={data?.configured ? t('wms.secretPlaceholder') : ''}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Base URL */}
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                {t('wms.baseUrl')}
              </label>
              <input
                type="text"
                value={form.base_url}
                onChange={e => setForm(p => ({ ...p, base_url: e.target.value }))}
                className="w-full px-3 py-2.5 border border-warm-300 rounded-xl text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              />
            </div>

            {/* Test result */}
            {testResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border
                  ${testResult.ok
                    ? 'bg-success-50 text-success-700 border-success-200'
                    : 'bg-danger-50 text-danger-700 border-danger-200'}`}
              >
                {testResult.ok
                  ? <><CheckCircle2 className="w-4 h-4 shrink-0" /> {t('wms.testOk', { ms: testResult.latency })}</>
                  : <><AlertTriangle className="w-4 h-4 shrink-0" /> {testResult.error}</>
                }
              </motion.div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-warm-300
                           text-sm font-medium text-warm-700 hover:bg-warm-50 disabled:opacity-50 transition"
              >
                {testing
                  ? <LoadingSpinner size="sm" />
                  : testResult?.ok ? <Wifi className="w-4 h-4" /> : <TestTube className="w-4 h-4" />}
                {t('wms.testBtn')}
              </button>
              <button
                type="submit"
                disabled={saveMut.isPending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                           bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold
                           disabled:opacity-50 transition shadow-sm"
              >
                <Save className="w-4 h-4" />
                {saveMut.isPending ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/wmsHubService.js frontend/src/pages/WmsHub.jsx
git commit -m "feat(wms): WMS Hub frontend – credentials form + test connection"
```

---

## Task 6: Inventory Backend — Scan Routes

**Files:**
- Create: `backend/src/modules/inventory/routes/scan.routes.js`

- [ ] **Step 1: Create scan routes**

```js
// backend/src/modules/inventory/routes/scan.routes.js
import { Router } from 'express'
import { query, getClient } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { getInventoryMap, cacheGet } from '../../../shared/services/wmsClient.js'

const router = Router()

// POST /api/inventory/sessions/start
router.post('/sessions/start',
  authenticateToken, loadFullUser,
  requirePermission('inventory.escaneo', 'crear'),
  async (req, res) => {
    try {
      const { origin_location } = req.body
      const result = await query(
        `INSERT INTO inventory_sessions (user_id, origin_location)
         VALUES ($1, $2) RETURNING *`,
        [req.user.id, origin_location || null]
      )
      res.status(201).json({ session: result.rows[0] })
    } catch (err) {
      console.error('inventory session start error:', err)
      res.status(500).json({ error: 'Error iniciando sesión de inventario' })
    }
  }
)

// POST /api/inventory/sessions/:id/end
router.post('/sessions/:id/end',
  authenticateToken, loadFullUser,
  async (req, res) => {
    try {
      const result = await query(
        `UPDATE inventory_sessions SET status = 'closed', ended_at = now()
         WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING *`,
        [req.params.id, req.user.id]
      )
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Sesión no encontrada' })
      }
      res.json({ session: result.rows[0] })
    } catch (err) {
      console.error('inventory session end error:', err)
      res.status(500).json({ error: 'Error cerrando sesión' })
    }
  }
)

// GET /api/inventory/sessions/active — active session for current user
router.get('/sessions/active',
  authenticateToken,
  async (req, res) => {
    try {
      const sesRes = await query(
        `SELECT s.*,
                COUNT(sc.id)::int AS total_scans,
                COUNT(sc.id) FILTER (WHERE sc.status='OK')::int AS ok_count,
                COUNT(sc.id) FILTER (WHERE sc.status='Bloqueado')::int AS bloqueado_count,
                COUNT(sc.id) FILTER (WHERE sc.status='NoWMS')::int AS nowms_count
         FROM inventory_sessions s
         LEFT JOIN inventory_scans sc ON sc.session_id = s.id
         WHERE s.user_id = $1 AND s.status = 'active'
         GROUP BY s.id
         ORDER BY s.started_at DESC
         LIMIT 1`,
        [req.user.id]
      )
      if (sesRes.rows.length === 0) return res.json({ session: null })
      res.json({ session: sesRes.rows[0] })
    } catch (err) {
      console.error('inventory active session error:', err)
      res.status(500).json({ error: 'Error obteniendo sesión activa' })
    }
  }
)

// POST /api/inventory/sessions/:id/scan — lookup + persist
router.post('/sessions/:id/scan',
  authenticateToken, loadFullUser,
  requirePermission('inventory.escaneo', 'crear'),
  async (req, res) => {
    try {
      const { barcode } = req.body
      if (!barcode?.trim()) return res.status(400).json({ error: 'barcode es requerido' })

      const code = barcode.trim()

      // Verify session belongs to user and is active
      const sesRes = await query(
        'SELECT * FROM inventory_sessions WHERE id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, req.user.id, 'active']
      )
      if (sesRes.rows.length === 0) {
        return res.status(404).json({ error: 'Sesión no encontrada o cerrada' })
      }

      // Lookup in WMS inventory (cached)
      let inventoryMap
      try {
        inventoryMap = await getInventoryMap()
      } catch (err) {
        if (err.message === 'WMS_NOT_CONFIGURED') {
          return res.status(503).json({ error: 'WMS_NOT_CONFIGURED' })
        }
        throw err
      }

      const item = inventoryMap[code] || null
      let status, sku, productName, cellNo, availableStock

      if (!item) {
        status = 'NoWMS'
        sku = null; productName = null; cellNo = null; availableStock = null
      } else if (item.availableStock > 0) {
        status = 'OK'
        sku = item.sku; productName = item.productName; cellNo = item.cellNo; availableStock = item.availableStock
      } else {
        status = 'Bloqueado'
        sku = item.sku; productName = item.productName; cellNo = item.cellNo; availableStock = 0
      }

      const scanRes = await query(
        `INSERT INTO inventory_scans
           (session_id, user_id, barcode, sku, product_name, cell_no, available_stock, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [req.params.id, req.user.id, code, sku, productName, cellNo, availableStock, status]
      )

      res.status(201).json({ scan: scanRes.rows[0], status, item })
    } catch (err) {
      console.error('inventory scan error:', err)
      res.status(500).json({ error: 'Error registrando escaneo' })
    }
  }
)

// GET /api/inventory/sessions/:id/scans — scans for a session
router.get('/sessions/:id/scans',
  authenticateToken,
  async (req, res) => {
    try {
      const result = await query(
        `SELECT * FROM inventory_scans WHERE session_id = $1 ORDER BY created_at DESC`,
        [req.params.id]
      )
      res.json({ scans: result.rows })
    } catch (err) {
      console.error('inventory get scans error:', err)
      res.status(500).json({ error: 'Error obteniendo escaneos' })
    }
  }
)

// POST /api/inventory/cache/refresh — force-clear inventory cache
router.post('/cache/refresh',
  authenticateToken, loadFullUser,
  requirePermission('inventory.escaneo', 'editar'),
  async (_req, res) => {
    try {
      await query(`DELETE FROM wms_cache WHERE key = 'inventory:full'`)
      res.json({ success: true, message: 'Cache de inventario limpiado. Se recargará en el próximo escaneo.' })
    } catch (err) {
      console.error('cache refresh error:', err)
      res.status(500).json({ error: 'Error limpiando cache' })
    }
  }
)

// GET /api/inventory/cache/status
router.get('/cache/status',
  authenticateToken,
  async (_req, res) => {
    try {
      const res2 = await query(
        `SELECT created_at, expires_at,
                jsonb_object_length(data) AS item_count
         FROM wms_cache WHERE key = 'inventory:full'`
      )
      if (res2.rows.length === 0) return res.json({ cached: false })
      const row = res2.rows[0]
      res.json({
        cached: true,
        item_count: row.item_count,
        created_at: row.created_at,
        expires_at: row.expires_at,
      })
    } catch (err) {
      res.status(500).json({ error: 'Error obteniendo estado de cache' })
    }
  }
)

export default router
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/inventory/routes/scan.routes.js
git commit -m "feat(inventory): scan session + barcode lookup + WMS cache routes"
```

---

## Task 7: Inventory Backend — History + Reports Routes

**Files:**
- Create: `backend/src/modules/inventory/routes/history.routes.js`
- Create: `backend/src/modules/inventory/routes/reports.routes.js`

- [ ] **Step 1: Create history routes**

```js
// backend/src/modules/inventory/routes/history.routes.js
import { Router } from 'express'
import { query } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// GET /api/inventory/scans — paginated history
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('inventory.historial', 'ver'),
  async (req, res) => {
    try {
      const {
        page = 1, limit = 50,
        fecha_inicio, fecha_fin,
        status, user_id,
        barcode,
      } = req.query

      const offset = (parseInt(page) - 1) * parseInt(limit)
      const conditions = []
      const params = []
      let pi = 1

      if (fecha_inicio) { conditions.push(`sc.created_at >= $${pi++}`); params.push(fecha_inicio) }
      if (fecha_fin) { conditions.push(`sc.created_at < ($${pi++}::date + interval '1 day')`); params.push(fecha_fin) }
      if (status) { conditions.push(`sc.status = $${pi++}`); params.push(status) }
      if (user_id) { conditions.push(`sc.user_id = $${pi++}`); params.push(parseInt(user_id)) }
      if (barcode) { conditions.push(`sc.barcode ILIKE $${pi++}`); params.push(`%${barcode}%`) }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const total = await query(
        `SELECT COUNT(*) FROM inventory_scans sc ${where}`,
        params
      )

      const result = await query(
        `SELECT sc.*, u.nombre_completo AS operador_nombre,
                s.origin_location
         FROM inventory_scans sc
         LEFT JOIN usuarios u ON sc.user_id = u.id
         LEFT JOIN inventory_sessions s ON sc.session_id = s.id
         ${where}
         ORDER BY sc.created_at DESC
         LIMIT $${pi++} OFFSET $${pi++}`,
        [...params, parseInt(limit), offset]
      )

      res.json({
        scans: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.rows[0].count),
          pages: Math.ceil(parseInt(total.rows[0].count) / parseInt(limit)),
        }
      })
    } catch (err) {
      console.error('inventory history error:', err)
      res.status(500).json({ error: 'Error obteniendo historial' })
    }
  }
)

export default router
```

- [ ] **Step 2: Create reports routes**

```js
// backend/src/modules/inventory/routes/reports.routes.js
import { Router } from 'express'
import { query } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// GET /api/inventory/reports/summary
router.get('/summary',
  authenticateToken, loadFullUser,
  requirePermission('inventory.reportes', 'ver'),
  async (req, res) => {
    try {
      const { fecha_inicio, fecha_fin } = req.query
      const params = []
      const dateFilter = fecha_inicio && fecha_fin
        ? `WHERE sc.created_at >= $1 AND sc.created_at < ($2::date + interval '1 day')`
        : ''
      if (fecha_inicio) params.push(fecha_inicio)
      if (fecha_fin) params.push(fecha_fin)

      const totales = await query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status='OK')::int AS ok,
           COUNT(*) FILTER (WHERE status='Bloqueado')::int AS bloqueado,
           COUNT(*) FILTER (WHERE status='NoWMS')::int AS nowms
         FROM inventory_scans sc ${dateFilter}`,
        params
      )

      const porDia = await query(
        `SELECT DATE(sc.created_at AT TIME ZONE 'America/Mexico_City') AS fecha,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status='OK')::int AS ok,
                COUNT(*) FILTER (WHERE status='Bloqueado')::int AS bloqueado,
                COUNT(*) FILTER (WHERE status='NoWMS')::int AS nowms
         FROM inventory_scans sc ${dateFilter}
         GROUP BY 1 ORDER BY 1 DESC LIMIT 30`,
        params
      )

      const porOperador = await query(
        `SELECT u.nombre_completo AS operador, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE sc.status='OK')::int AS ok,
                COUNT(*) FILTER (WHERE sc.status='Bloqueado')::int AS bloqueado,
                COUNT(*) FILTER (WHERE sc.status='NoWMS')::int AS nowms
         FROM inventory_scans sc
         JOIN usuarios u ON sc.user_id = u.id
         ${dateFilter}
         GROUP BY u.nombre_completo ORDER BY total DESC LIMIT 20`,
        params
      )

      res.json({
        totales: totales.rows[0],
        por_dia: porDia.rows,
        por_operador: porOperador.rows,
      })
    } catch (err) {
      console.error('inventory reports error:', err)
      res.status(500).json({ error: 'Error generando reportes' })
    }
  }
)

export default router
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/inventory/routes/history.routes.js backend/src/modules/inventory/routes/reports.routes.js
git commit -m "feat(inventory): history + reports endpoints"
```

---

## Task 8: Register Inventory Routes + Update Seed + Permissions

**Files:**
- Modify: `backend/src/server.js`
- Modify: `backend/src/config/seed.js`

- [ ] **Step 1: Register inventory routes in `server.js`**

Add imports after the wms import:
```js
import inventoryScanRoutes from './modules/inventory/routes/scan.routes.js'
import inventoryHistoryRoutes from './modules/inventory/routes/history.routes.js'
import inventoryReportsRoutes from './modules/inventory/routes/reports.routes.js'
```

Add route registrations:
```js
app.use('/api/inventory', inventoryScanRoutes)
app.use('/api/inventory/scans', inventoryHistoryRoutes)
app.use('/api/inventory/reports', inventoryReportsRoutes)
```

- [ ] **Step 2: Update `seed.js` — add inventory + wms permissions to all roles**

In each role's `permisos` object in `seed.js`, add the new keys:

For `Administrador`:
```js
permisos: {
  global: { inicio: 'eliminar', administracion: 'eliminar', wms: 'eliminar' },
  dropscan: { dashboard: 'eliminar', escaneo: 'eliminar', historial: 'eliminar', reportes: 'eliminar' },
  inventory: { escaneo: 'eliminar', historial: 'eliminar', reportes: 'eliminar' }
}
```

For `Jefe`:
```js
permisos: {
  global: { inicio: 'ver', administracion: 'sin_acceso', wms: 'ver' },
  dropscan: { dashboard: 'ver', escaneo: 'actualizar', historial: 'actualizar', reportes: 'crear' },
  inventory: { escaneo: 'actualizar', historial: 'actualizar', reportes: 'crear' }
}
```

For `Operador`:
```js
permisos: {
  global: { inicio: 'ver', administracion: 'sin_acceso', wms: 'sin_acceso' },
  dropscan: { dashboard: 'ver', escaneo: 'crear', historial: 'ver', reportes: 'sin_acceso' },
  inventory: { escaneo: 'crear', historial: 'ver', reportes: 'sin_acceso' }
}
```

For `Usuario`:
```js
permisos: {
  global: { inicio: 'ver', administracion: 'sin_acceso', wms: 'sin_acceso' },
  dropscan: { dashboard: 'ver', escaneo: 'sin_acceso', historial: 'ver', reportes: 'ver' },
  inventory: { escaneo: 'sin_acceso', historial: 'ver', reportes: 'ver' }
}
```

- [ ] **Step 3: Update existing roles in DB to add new permissions**

Run this in psql (one-time) to add the new permission keys to existing roles without resetting the DB:

```sql
-- Add wms permission to all roles
UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"eliminar"') WHERE nombre = 'Administrador';
UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"ver"') WHERE nombre = 'Jefe';
UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"sin_acceso"') WHERE nombre IN ('Operador','Usuario');

-- Add inventory permissions to all roles
UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}', '{"escaneo":"total","historial":"total","reportes":"total"}') WHERE nombre = 'Administrador';
UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}', '{"escaneo":"actualizar","historial":"actualizar","reportes":"crear"}') WHERE nombre = 'Jefe';
UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}', '{"escaneo":"crear","historial":"ver","reportes":"sin_acceso"}') WHERE nombre = 'Operador';
UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}', '{"escaneo":"sin_acceso","historial":"ver","reportes":"ver"}') WHERE nombre = 'Usuario';
```

- [ ] **Step 4: Restart backend and verify**

```bash
node src/server.js
# In another terminal:
curl -s http://localhost:3001/api/health | jq
```

Expected: `{"status":"ok", ...}`

- [ ] **Step 5: Commit**

```bash
git add backend/src/server.js backend/src/config/seed.js
git commit -m "feat(inventory): register routes, add inventory+wms permissions to roles"
```

---

## Task 9: i18n + Module Groups in Admin

**Files:**
- Modify: `frontend/src/core/stores/i18nStore.js`
- Modify: `frontend/src/pages/Administracion.jsx`

- [ ] **Step 1: Add translation keys to `i18nStore.js`**

In the `zh` translations object, add after the last `dropscan.*` key:
```js
// WMS Hub
'wms.title': 'WMS 连接配置',
'wms.subtitle': '配置仓库管理系统 API 凭据',
'wms.appKey': 'App Key',
'wms.appSecret': 'App Secret',
'wms.baseUrl': 'Base URL',
'wms.testBtn': '测试连接',
'wms.connected': '已连接',
'wms.notConfigured': '未配置',
'wms.savedOk': '凭据已保存',
'wms.saveError': '保存失败',
'wms.requiredFields': 'App Key 和 App Secret 必填',
'wms.secretPlaceholder': '输入新密钥以更新',
'wms.testOk': '连接成功 ({ms}ms)',
// Inventory
'inventory.title': '库存',
'inventory.escaneo': '扫描',
'inventory.historial': '历史',
'inventory.reportes': '报告',
'inventory.scan.placeholder': '扫描条形码...',
'inventory.scan.ok': '库存充足',
'inventory.scan.bloqueado': '已锁定',
'inventory.scan.nowms': '不在 WMS',
'inventory.scan.startSession': '开始会话',
'inventory.scan.endSession': '结束会话',
'inventory.scan.cacheStatus': '缓存状态',
'inventory.scan.refreshCache': '刷新缓存',
'inventory.wmsNotConfigured': 'WMS 未配置。请前往设置页面配置凭据。',
'inventory.wmsNotConfiguredBtn': '配置 WMS',
'inventory.noActiveSession': '无活跃会话',
```

In the `es` translations object (find the `else` branch or the second translations block), add the same keys in Spanish:
```js
'wms.title': 'Conexión WMS',
'wms.subtitle': 'Configura las credenciales de acceso al WMS',
'wms.appKey': 'App Key',
'wms.appSecret': 'App Secret',
'wms.baseUrl': 'URL Base',
'wms.testBtn': 'Probar conexión',
'wms.connected': 'Conectado',
'wms.notConfigured': 'No configurado',
'wms.savedOk': 'Credenciales guardadas',
'wms.saveError': 'Error al guardar',
'wms.requiredFields': 'App Key y App Secret son requeridos',
'wms.secretPlaceholder': 'Ingresa nuevo secret para actualizar',
'wms.testOk': 'Conexión exitosa ({ms}ms)',
'inventory.title': 'Inventario',
'inventory.escaneo': 'Escaneo',
'inventory.historial': 'Historial',
'inventory.reportes': 'Reportes',
'inventory.scan.placeholder': 'Escanea un código de barras...',
'inventory.scan.ok': 'Disponible',
'inventory.scan.bloqueado': 'Bloqueado',
'inventory.scan.nowms': 'No en WMS',
'inventory.scan.startSession': 'Iniciar sesión',
'inventory.scan.endSession': 'Cerrar sesión',
'inventory.scan.cacheStatus': 'Estado del caché',
'inventory.scan.refreshCache': 'Actualizar caché',
'inventory.wmsNotConfigured': 'WMS no configurado. Ve a Configuración > Conexión WMS para ingresar las credenciales.',
'inventory.wmsNotConfiguredBtn': 'Configurar WMS',
'inventory.noActiveSession': 'Sin sesión activa',
```

- [ ] **Step 2: Update `MODULE_GROUPS` in `Administracion.jsx`**

Replace the `'Módulos Futuros'` group with actual keys (and remove inventory from future):

```js
{
  group: 'WMS',
  modules: [
    { key: 'global.wms', label: 'WMS – Conexión y credenciales' },
  ]
},
{
  group: 'Inventario',
  modules: [
    { key: 'inventory.escaneo', label: 'Inventario – Escaneo' },
    { key: 'inventory.historial', label: 'Inventario – Historial' },
    { key: 'inventory.reportes', label: 'Inventario – Reportes' },
  ]
},
{
  group: 'Módulos Futuros',
  modules: [
    { key: 'despacho.ordenes', label: 'Despacho – Órdenes' },
    { key: 'despacho.validacion', label: 'Despacho – Validación' },
    { key: 'rastreo.consulta', label: 'Rastreo – Consulta' },
    { key: 'reportes.global', label: 'Reportes Globales' },
  ]
},
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/core/stores/i18nStore.js frontend/src/pages/Administracion.jsx
git commit -m "feat(i18n): add inventory.* and wms.* translation keys; update MODULE_GROUPS"
```

---

## Task 10: Wire Routes + Sidebar

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/core/components/layout/Sidebar.jsx`

- [ ] **Step 1: Add imports and routes to `App.jsx`**

Add imports at the top after the dropscan imports:
```js
import WmsHub from './pages/WmsHub'
import InventoryEscaneo from './modules/inventory/pages/Escaneo'
import InventoryHistorial from './modules/inventory/pages/Historial'
import InventoryReportes from './modules/inventory/pages/Reportes'
```

Add to `MODULE_ROUTES` array:
```js
{ module: 'inventory.escaneo', path: '/inventory/escaneo' },
{ module: 'inventory.historial', path: '/inventory/historial' },
{ module: 'inventory.reportes', path: '/inventory/reportes' },
{ module: 'global.wms', path: '/admin/wms' },
```

Add routes inside the protected `<Route>` block, after the dropscan routes:
```jsx
{/* Inventory Module */}
<Route path="/inventory/escaneo" element={
  <PermissionRoute module="inventory.escaneo"><ErrorBoundary><InventoryEscaneo /></ErrorBoundary></PermissionRoute>
} />
<Route path="/inventory/historial" element={
  <PermissionRoute module="inventory.historial"><ErrorBoundary><InventoryHistorial /></ErrorBoundary></PermissionRoute>
} />
<Route path="/inventory/reportes" element={
  <PermissionRoute module="inventory.reportes"><ErrorBoundary><InventoryReportes /></ErrorBoundary></PermissionRoute>
} />

{/* WMS Hub */}
<Route path="/admin/wms" element={
  <PermissionRoute module="global.wms"><ErrorBoundary><WmsHub /></ErrorBoundary></PermissionRoute>
} />
```

- [ ] **Step 2: Add Inventory section + WMS Hub link to `Sidebar.jsx`**

In `getModuleNav(t)`, add a new module group after the dropscan entry:
```js
{
  id: 'inventory',
  label: t('inventory.title'),
  icon: Package,
  items: [
    { path: '/inventory/escaneo', label: t('inventory.escaneo'), icon: ScanBarcode, permission: 'inventory.escaneo' },
    { path: '/inventory/historial', label: t('inventory.historial'), icon: History, permission: 'inventory.historial' },
    { path: '/inventory/reportes', label: t('inventory.reportes'), icon: BarChart3, permission: 'inventory.reportes' },
  ]
},
```

In `getAdminNav(t)`, add the WMS Hub link:
```js
const getAdminNav = (t) => [
  { path: '/admin', label: t('nav.administration'), icon: Settings2, permission: 'global.administracion' },
  { path: '/admin/wms', label: t('wms.title'), icon: Link2, permission: 'global.wms' },
]
```

Add `Link2` to the lucide import at the top of `Sidebar.jsx`:
```js
import {
  LayoutDashboard, ScanBarcode, History, BarChart3,
  ChevronLeft, ChevronRight,
  Package, Settings2, Settings, Link2
} from 'lucide-react'
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx frontend/src/core/components/layout/Sidebar.jsx
git commit -m "feat(routing): add inventory + wms-hub routes and sidebar nav items"
```

---

## Task 11: Inventory Frontend — `inventoryService.js`

**Files:**
- Create: `frontend/src/modules/inventory/services/inventoryService.js`

- [ ] **Step 1: Create service**

```js
// frontend/src/modules/inventory/services/inventoryService.js
import api from '../../../core/services/api'

// Sessions
export const startSession = (origin_location) =>
  api.post('/inventory/sessions/start', { origin_location }).then(r => r.data)

export const endSession = (id) =>
  api.post(`/inventory/sessions/${id}/end`).then(r => r.data)

export const getActiveSession = () =>
  api.get('/inventory/sessions/active').then(r => r.data)

export const scanBarcode = (sessionId, barcode) =>
  api.post(`/inventory/sessions/${sessionId}/scan`, { barcode }).then(r => r.data)

export const getSessionScans = (sessionId) =>
  api.get(`/inventory/sessions/${sessionId}/scans`).then(r => r.data)

// Cache
export const getCacheStatus = () =>
  api.get('/inventory/cache/status').then(r => r.data)

export const refreshCache = () =>
  api.post('/inventory/cache/refresh').then(r => r.data)

// History
export const getScans = (params) =>
  api.get('/inventory/scans', { params }).then(r => r.data)

// Reports
export const getSummary = (params) =>
  api.get('/inventory/reports/summary', { params }).then(r => r.data)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/inventory/services/inventoryService.js
git commit -m "feat(inventory): frontend API service"
```

---

## Task 12: Inventory Frontend — Escaneo Page

**Files:**
- Create: `frontend/src/modules/inventory/pages/Escaneo.jsx`

- [ ] **Step 1: Create Escaneo page**

```jsx
// frontend/src/modules/inventory/pages/Escaneo.jsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useAuthStore } from '../../../core/stores/authStore'
import { useToastStore } from '../../../core/stores/toastStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import * as inv from '../services/inventoryService'
import {
  ScanBarcode, Play, Square, Package, RefreshCw,
  CheckCircle, AlertTriangle, XCircle, Link2, Database,
  Clock, Barcode, ChevronDown
} from 'lucide-react'

const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination); gain.gain.value = 0.15
    if (type === 'ok') { osc.frequency.value = 880; osc.type = 'sine'; osc.start(); osc.stop(ctx.currentTime + 0.08) }
    else if (type === 'bloqueado') { osc.frequency.value = 440; osc.type = 'triangle'; osc.start(); osc.stop(ctx.currentTime + 0.2) }
    else if (type === 'nowms') { osc.frequency.value = 220; osc.type = 'square'; osc.start(); osc.stop(ctx.currentTime + 0.3) }
  } catch {}
}

const STATUS_CONFIG = {
  OK:        { color: 'text-success-700', bg: 'bg-success-50', border: 'border-success-200', icon: CheckCircle, sound: 'ok' },
  Bloqueado: { color: 'text-warning-700', bg: 'bg-warning-50', border: 'border-warning-200', icon: AlertTriangle, sound: 'bloqueado' },
  NoWMS:     { color: 'text-danger-700',  bg: 'bg-danger-50',  border: 'border-danger-200',  icon: XCircle,       sound: 'nowms' },
}

export default function Escaneo() {
  const { t } = useI18nStore()
  const toast = useToastStore.getState()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const inputRef = useRef(null)

  const [barcodeInput, setBarcodeInput] = useState('')
  const [lastScan, setLastScan] = useState(null)
  const [originLocation, setOriginLocation] = useState('')
  const [sessionScans, setSessionScans] = useState([])

  const { data: sessionData, isLoading: sessionLoading } = useQuery({
    queryKey: ['inventory-active-session'],
    queryFn: inv.getActiveSession,
    refetchInterval: 30000,
  })

  const { data: cacheData } = useQuery({
    queryKey: ['inventory-cache-status'],
    queryFn: inv.getCacheStatus,
    refetchInterval: 60000,
  })

  const session = sessionData?.session

  // Load scans for active session
  useEffect(() => {
    if (session?.id) {
      inv.getSessionScans(session.id).then(d => setSessionScans(d.scans || [])).catch(() => {})
    } else {
      setSessionScans([])
    }
  }, [session?.id])

  // Auto-focus scanner input
  useEffect(() => {
    if (session && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [session?.id])

  const startMut = useMutation({
    mutationFn: () => inv.startSession(originLocation || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-active-session'] })
      setSessionScans([])
    },
    onError: (err) => {
      if (err.response?.data?.error === 'WMS_NOT_CONFIGURED') {
        toast.error(t('inventory.wmsNotConfigured'))
      } else {
        toast.error('Error iniciando sesión')
      }
    },
  })

  const endMut = useMutation({
    mutationFn: () => inv.endSession(session.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-active-session'] })
      setLastScan(null)
      setSessionScans([])
      toast.success('Sesión cerrada')
    },
  })

  const refreshCacheMut = useMutation({
    mutationFn: inv.refreshCache,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-cache-status'] })
      toast.success('Caché actualizado')
    },
  })

  const scanMut = useMutation({
    mutationFn: (barcode) => inv.scanBarcode(session.id, barcode),
    onSuccess: (data) => {
      const { scan, status } = data
      setLastScan(scan)
      setSessionScans(prev => [scan, ...prev])
      playSound(status === 'OK' ? 'ok' : status === 'Bloqueado' ? 'bloqueado' : 'nowms')
    },
    onError: (err) => {
      if (err.response?.data?.error === 'WMS_NOT_CONFIGURED') {
        toast.error(t('inventory.wmsNotConfigured'))
      }
    },
  })

  const handleScan = useCallback((e) => {
    e.preventDefault()
    const code = barcodeInput.trim()
    if (!code || !session) return
    setBarcodeInput('')
    scanMut.mutate(code)
  }, [barcodeInput, session, scanMut])

  const counts = {
    ok: sessionScans.filter(s => s.status === 'OK').length,
    bloqueado: sessionScans.filter(s => s.status === 'Bloqueado').length,
    nowms: sessionScans.filter(s => s.status === 'NoWMS').length,
  }

  if (sessionLoading) return <div className="p-6"><LoadingSpinner /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Header
        title={t('inventory.escaneo')}
        subtitle={session ? `Sesión activa · ${sessionScans.length} escaneos` : t('inventory.noActiveSession')}
        icon={ScanBarcode}
      />

      {/* Cache status bar */}
      <div className="mt-4 flex items-center gap-3 text-xs text-warm-500">
        <Database className="w-3.5 h-3.5" />
        {cacheData?.cached
          ? `Caché WMS: ${cacheData.item_count?.toLocaleString()} artículos · Expira ${new Date(cacheData.expires_at).toLocaleTimeString()}`
          : 'Caché WMS: no cargado (se cargará al escanear)'}
        <button
          onClick={() => refreshCacheMut.mutate()}
          disabled={refreshCacheMut.isPending}
          className="flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
        >
          <RefreshCw className={`w-3 h-3 ${refreshCacheMut.isPending ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Session controls */}
      {!session ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 bg-white rounded-2xl border border-warm-200 shadow-sm p-6"
        >
          <h3 className="font-semibold text-warm-800 mb-4">{t('inventory.scan.startSession')}</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={originLocation}
              onChange={e => setOriginLocation(e.target.value)}
              placeholder="Ubicación de origen (opcional)"
              className="flex-1 px-3 py-2.5 border border-warm-300 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
            <button
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600
                         hover:bg-primary-700 text-white text-sm font-semibold transition"
            >
              <Play className="w-4 h-4" />
              {startMut.isPending ? <LoadingSpinner size="sm" /> : t('inventory.scan.startSession')}
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="mt-6 space-y-4">
          {/* Session header + end button */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-warm-200 shadow-sm px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
              <span className="text-sm font-medium text-warm-700">
                Sesión activa {session.origin_location ? `· ${session.origin_location}` : ''}
              </span>
            </div>
            <button
              onClick={() => endMut.mutate()}
              disabled={endMut.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-danger-200
                         text-danger-600 hover:bg-danger-50 text-sm font-medium transition"
            >
              <Square className="w-4 h-4" />
              {t('inventory.scan.endSession')}
            </button>
          </div>

          {/* Counters */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'OK',        count: counts.ok,        label: t('inventory.scan.ok'),        cfg: STATUS_CONFIG.OK },
              { key: 'Bloqueado', count: counts.bloqueado, label: t('inventory.scan.bloqueado'), cfg: STATUS_CONFIG.Bloqueado },
              { key: 'NoWMS',     count: counts.nowms,     label: t('inventory.scan.nowms'),     cfg: STATUS_CONFIG.NoWMS },
            ].map(({ key, count, label, cfg }) => (
              <div key={key} className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-4 text-center`}>
                <cfg.icon className={`w-5 h-5 ${cfg.color} mx-auto mb-1`} />
                <p className={`text-2xl font-bold ${cfg.color}`}>{count}</p>
                <p className={`text-xs font-medium ${cfg.color} opacity-75`}>{label}</p>
              </div>
            ))}
          </div>

          {/* Scanner input */}
          <form onSubmit={handleScan} className="bg-white rounded-2xl border border-warm-200 shadow-sm p-5">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  placeholder={t('inventory.scan.placeholder')}
                  className="w-full pl-10 pr-4 py-3 border border-warm-300 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary-300"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={scanMut.isPending || !barcodeInput.trim()}
                className="px-5 py-3 rounded-xl bg-primary-600 hover:bg-primary-700
                           text-white text-sm font-semibold disabled:opacity-50 transition"
              >
                {scanMut.isPending ? <LoadingSpinner size="sm" /> : 'Escanear'}
              </button>
            </div>
          </form>

          {/* Last scan result */}
          <AnimatePresence mode="popLayout">
            {lastScan && (
              <motion.div
                key={lastScan.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className={`rounded-2xl border ${STATUS_CONFIG[lastScan.status].border} ${STATUS_CONFIG[lastScan.status].bg} p-4`}
              >
                {(() => {
                  const cfg = STATUS_CONFIG[lastScan.status]
                  return (
                    <div className="flex items-start gap-3">
                      <cfg.icon className={`w-6 h-6 ${cfg.color} shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold ${cfg.color} text-sm`}>{lastScan.status}</p>
                        <p className="text-warm-800 font-mono text-xs truncate mt-0.5">{lastScan.barcode}</p>
                        {lastScan.product_name && (
                          <p className="text-warm-600 text-xs mt-1">{lastScan.product_name}</p>
                        )}
                        <div className="flex gap-4 mt-1 text-[11px] text-warm-500">
                          {lastScan.sku && <span>SKU: {lastScan.sku}</span>}
                          {lastScan.cell_no && <span>Ubic: {lastScan.cell_no}</span>}
                          {lastScan.available_stock != null && <span>Stock: {lastScan.available_stock}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scan log (last 10) */}
          {sessionScans.length > 0 && (
            <div className="bg-white rounded-2xl border border-warm-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-warm-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-warm-700">Últimos escaneos</h3>
                <span className="text-xs text-warm-400">{sessionScans.length} total</span>
              </div>
              <div className="divide-y divide-warm-50 max-h-64 overflow-y-auto">
                {sessionScans.slice(0, 50).map((sc) => {
                  const cfg = STATUS_CONFIG[sc.status]
                  return (
                    <div key={sc.id} className="flex items-center gap-3 px-4 py-2.5">
                      <cfg.icon className={`w-4 h-4 ${cfg.color} shrink-0`} />
                      <span className="font-mono text-xs text-warm-700 flex-1 truncate">{sc.barcode}</span>
                      {sc.product_name && (
                        <span className="text-xs text-warm-400 truncate max-w-[140px]">{sc.product_name}</span>
                      )}
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                        {sc.status}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/inventory/pages/Escaneo.jsx
git commit -m "feat(inventory): Escaneo page with scan session, WMS lookup, live scan log"
```

---

## Task 13: Inventory Frontend — Historial + Reportes Pages

**Files:**
- Create: `frontend/src/modules/inventory/pages/Historial.jsx`
- Create: `frontend/src/modules/inventory/pages/Reportes.jsx`

- [ ] **Step 1: Create Historial page**

```jsx
// frontend/src/modules/inventory/pages/Historial.jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useAuthStore } from '../../../core/stores/authStore'
import { useI18nStore } from '../../../core/stores/i18nStore'
import * as inv from '../services/inventoryService'
import { History, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, XCircle, Search } from 'lucide-react'
import { getToday, subtractDays } from '../../../core/utils/dateFormat'

const STATUS_CONFIG = {
  OK:        { color: 'text-success-700', bg: 'bg-success-50', border: 'border-success-200', icon: CheckCircle },
  Bloqueado: { color: 'text-warning-700', bg: 'bg-warning-50', border: 'border-warning-200', icon: AlertTriangle },
  NoWMS:     { color: 'text-danger-700',  bg: 'bg-danger-50',  border: 'border-danger-200',  icon: XCircle },
}

export default function Historial() {
  const { t } = useI18nStore()
  const today = getToday()
  const weekAgo = subtractDays(today, 7)

  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    fecha_inicio: weekAgo,
    fecha_fin: today,
    status: '',
    barcode: '',
  })
  const [inputBarcode, setInputBarcode] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-scans', page, filters],
    queryFn: () => inv.getScans({ ...filters, page, limit: 50 }),
    keepPreviousData: true,
  })

  const scans = data?.scans || []
  const pagination = data?.pagination

  const handleSearch = (e) => {
    e.preventDefault()
    setFilters(f => ({ ...f, barcode: inputBarcode }))
    setPage(1)
  }

  return (
    <div className="p-6">
      <Header title={t('inventory.historial')} subtitle="Registro completo de escaneos" icon={History} />

      {/* Filters */}
      <form onSubmit={handleSearch} className="mt-6 bg-white rounded-2xl border border-warm-200 shadow-sm p-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-warm-600">Desde</label>
          <input type="date" value={filters.fecha_inicio}
            onChange={e => { setFilters(f => ({ ...f, fecha_inicio: e.target.value })); setPage(1) }}
            className="px-3 py-2 border border-warm-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-warm-600">Hasta</label>
          <input type="date" value={filters.fecha_fin}
            onChange={e => { setFilters(f => ({ ...f, fecha_fin: e.target.value })); setPage(1) }}
            className="px-3 py-2 border border-warm-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
        </div>
        <select value={filters.status}
          onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1) }}
          className="px-3 py-2 border border-warm-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          <option value="">Todos los estados</option>
          <option value="OK">OK</option>
          <option value="Bloqueado">Bloqueado</option>
          <option value="NoWMS">NoWMS</option>
        </select>
        <div className="flex gap-2 flex-1 min-w-0">
          <input type="text" value={inputBarcode}
            onChange={e => setInputBarcode(e.target.value)}
            placeholder="Buscar código..."
            className="flex-1 px-3 py-2 border border-warm-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition">
            <Search className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="mt-4 bg-white rounded-2xl border border-warm-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8"><LoadingSpinner /></div>
        ) : scans.length === 0 ? (
          <div className="p-8 text-center text-warm-400 text-sm">Sin registros</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-warm-50 border-b border-warm-200">
                <tr>
                  {['Estado','Código','SKU','Producto','Ubicación','Stock','Operador','Fecha'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-warm-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {scans.map(sc => {
                  const cfg = STATUS_CONFIG[sc.status] || STATUS_CONFIG.NoWMS
                  return (
                    <tr key={sc.id} className="hover:bg-warm-25 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                          <cfg.icon className="w-3 h-3" />
                          {sc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-warm-700">{sc.barcode}</td>
                      <td className="px-4 py-3 text-warm-500 text-xs">{sc.sku || '—'}</td>
                      <td className="px-4 py-3 text-warm-600 text-xs max-w-[160px] truncate">{sc.product_name || '—'}</td>
                      <td className="px-4 py-3 text-warm-500 text-xs">{sc.cell_no || '—'}</td>
                      <td className="px-4 py-3 text-warm-500 text-xs">{sc.available_stock ?? '—'}</td>
                      <td className="px-4 py-3 text-warm-600 text-xs">{sc.operador_nombre || '—'}</td>
                      <td className="px-4 py-3 text-warm-400 text-xs whitespace-nowrap">
                        {new Date(sc.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-warm-100">
            <span className="text-xs text-warm-500">
              {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-warm-200 disabled:opacity-40 hover:bg-warm-50 transition">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages}
                className="p-1.5 rounded-lg border border-warm-200 disabled:opacity-40 hover:bg-warm-50 transition">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create Reportes page**

```jsx
// frontend/src/modules/inventory/pages/Reportes.jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import { useI18nStore } from '../../../core/stores/i18nStore'
import * as inv from '../services/inventoryService'
import { BarChart3, CheckCircle, AlertTriangle, XCircle, Package } from 'lucide-react'
import { getToday, subtractDays } from '../../../core/utils/dateFormat'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const PIE_COLORS = { OK: '#22c55e', Bloqueado: '#f59e0b', NoWMS: '#ef4444' }

export default function Reportes() {
  const { t } = useI18nStore()
  const today = getToday()
  const weekAgo = subtractDays(today, 7)
  const [fechaInicio, setFechaInicio] = useState(weekAgo)
  const [fechaFin, setFechaFin] = useState(today)

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-reports', fechaInicio, fechaFin],
    queryFn: () => inv.getSummary({ fecha_inicio: fechaInicio, fecha_fin: fechaFin }),
    enabled: !!fechaInicio && !!fechaFin,
  })

  const totales = data?.totales || {}
  const porDia = (data?.por_dia || []).slice().reverse()
  const porOperador = data?.por_operador || []

  const pieData = [
    { name: 'OK', value: totales.ok || 0 },
    { name: 'Bloqueado', value: totales.bloqueado || 0 },
    { name: 'NoWMS', value: totales.nowms || 0 },
  ].filter(d => d.value > 0)

  return (
    <div className="p-6">
      <Header title={t('inventory.reportes')} subtitle="Métricas de clasificación de inventario" icon={BarChart3} />

      {/* Date filters */}
      <div className="mt-6 flex gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-warm-600">Desde</label>
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
            className="px-3 py-2 border border-warm-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-warm-600">Hasta</label>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
            className="px-3 py-2 border border-warm-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
        </div>
      </div>

      {isLoading ? (
        <div className="mt-8"><LoadingSpinner /></div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total', value: totales.total, icon: Package, color: 'text-primary-700', bg: 'bg-primary-50', border: 'border-primary-200' },
              { label: 'OK', value: totales.ok, icon: CheckCircle, color: 'text-success-700', bg: 'bg-success-50', border: 'border-success-200' },
              { label: 'Bloqueado', value: totales.bloqueado, icon: AlertTriangle, color: 'text-warning-700', bg: 'bg-warning-50', border: 'border-warning-200' },
              { label: 'No WMS', value: totales.nowms, icon: XCircle, color: 'text-danger-700', bg: 'bg-danger-50', border: 'border-danger-200' },
            ].map(({ label, value, icon: Icon, color, bg, border }) => (
              <div key={label} className={`rounded-2xl border ${border} ${bg} p-4 flex items-center gap-3`}>
                <Icon className={`w-7 h-7 ${color} shrink-0`} />
                <div>
                  <p className={`text-2xl font-bold ${color}`}>{(value || 0).toLocaleString()}</p>
                  <p className={`text-xs ${color} opacity-70 font-medium`}>{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bar chart por día */}
            {porDia.length > 0 && (
              <div className="bg-white rounded-2xl border border-warm-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-warm-700 mb-4">Escaneos por día</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={porDia} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f0eb" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="ok" stackId="a" fill="#22c55e" name="OK" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="bloqueado" stackId="a" fill="#f59e0b" name="Bloqueado" />
                    <Bar dataKey="nowms" stackId="a" fill="#ef4444" name="NoWMS" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Pie por estado */}
            {pieData.length > 0 && (
              <div className="bg-white rounded-2xl border border-warm-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-warm-700 mb-4">Distribución por estado</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {pieData.map((d) => (
                        <Cell key={d.name} fill={PIE_COLORS[d.name]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Por operador */}
          {porOperador.length > 0 && (
            <div className="bg-white rounded-2xl border border-warm-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-warm-100">
                <h3 className="text-sm font-semibold text-warm-700">Por operador</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-warm-50">
                  <tr>
                    {['Operador','Total','OK','Bloqueado','NoWMS'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-warm-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {porOperador.map(op => (
                    <tr key={op.operador} className="hover:bg-warm-25">
                      <td className="px-4 py-2.5 font-medium text-warm-700">{op.operador}</td>
                      <td className="px-4 py-2.5 text-warm-600">{op.total}</td>
                      <td className="px-4 py-2.5 text-success-600 font-medium">{op.ok}</td>
                      <td className="px-4 py-2.5 text-warning-600 font-medium">{op.bloqueado}</td>
                      <td className="px-4 py-2.5 text-danger-600 font-medium">{op.nowms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/inventory/pages/Historial.jsx frontend/src/modules/inventory/pages/Reportes.jsx
git commit -m "feat(inventory): Historial + Reportes pages"
```

---

## Task 14: End-to-End Verification

- [ ] **Step 1: Start backend and verify all routes are registered**

```bash
cd /Users/quiron/CascadeProjects/kerion/backend
node src/server.js 2>&1 | head -20
```

Expected output includes: `🏭 WMS Backend v1.0.0` and no `Migration step warning` for new tables.

- [ ] **Step 2: Start frontend dev server**

```bash
cd /Users/quiron/CascadeProjects/kerion/frontend
npm run dev
```

Expected: Vite starts on `http://localhost:5173`

- [ ] **Step 3: Log in and verify sidebar**

- Login at `http://localhost:5173/login`
- Sidebar should show: DropScan section, **Inventory section** (Escaneo / Historial / Reportes)
- System section should show: Administración, **Conexión WMS**

- [ ] **Step 4: Configure WMS credentials**

- Go to `/admin/wms`
- Enter App Key and App Secret (use real xlwms credentials or test values)
- Click "Guardar" → toast "Credenciales guardadas"
- Click "Probar conexión" → result shows latency or error

- [ ] **Step 5: Test inventory scan flow**

- Go to `/inventory/escaneo`
- Click "Iniciar sesión"
- Enter a barcode → should get OK, Bloqueado, or NoWMS result
- Sound plays for each result type
- Counter increments correctly

- [ ] **Step 6: Verify Historial and Reportes show data**

- `/inventory/historial` → table shows scan records
- `/inventory/reportes` → KPI cards + bar chart populated

- [ ] **Step 7: Verify permissions in Administración**

- Go to `/admin`
- Open any role → new "WMS" and "Inventario" permission groups are visible

- [ ] **Step 8: Final commit**

```bash
cd /Users/quiron/CascadeProjects/kerion
git add -A
git commit -m "feat: WMS Hub + Inventory module complete"
```

---

## Self-Review Checklist

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| wms_credentials table with AES-encrypted secret | Task 1 + 2 |
| wmsClient.js as single source of HmacSHA256 signature | Task 3 |
| wms_cache table with TTL | Task 1 + 3 |
| Paginated fetch via wmsPostAll | Task 3 |
| wms.admin permission for credentials | Task 4 + 8 |
| Test connection button with latency | Task 4 + 5 |
| Inventory module mirrors dropscan structure | Tasks 6–13 |
| inventory.scan / inventory.history / inventory.reports permissions | Task 8 |
| WMS endpoint /integratedInventory/pageOpen | Task 3 |
| 10-minute cache for inventory data | Task 3 |
| NoWMS banner → link to WMS config | Task 12 (error handling) |
| OK = stock > 0, Bloqueado = stock = 0, NoWMS = not found | Task 6 |
| inventory_scans table | Task 1 |
| i18n keys inventory.* in es + zh | Task 9 |
| Sidebar Inventory section | Task 10 |
| Administracion.jsx MODULE_GROUPS updated | Task 9 |
| wmsClient designed for multiple endpoints (not just inventory) | Task 3 — wmsPost + wmsPostAll are generic |
| All dates in America/Mexico_City | Tasks 7, 13 — Historial uses toLocaleString with timezone |
| No duplicate HmacSHA256 logic anywhere | Only in wmsClient.js |
| No modification of existing tables/routes | All changes are additive |

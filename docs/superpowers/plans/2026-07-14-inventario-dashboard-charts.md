# Inventario Dashboard Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add causa/área/responsable×estatus/estatus-global charts to the RASTREO section and a responsable bar + adaptive trend chart to the ESCANEO section of the Inventario dashboard (removing the low-value OK/Sin-match KPI cards), per `docs/superpowers/specs/2026-07-14-inventario-dashboard-charts-design.md`.

**Architecture:** All changes are scoped strictly to the Inventario dashboard module — one backend route file (`backend/src/modules/inventory/routes/dashboard.routes.js`, extending its existing `Promise.all` with new queries under new `graficas` keys) and one frontend file (`frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx`), plus the two shared locale files. No other module's files are touched. The adaptive date-bucketing logic (day/week/month/year) needed for the new trend chart is defined locally inside `dashboard.routes.js` — it duplicates logic that also exists in `surtido.dashboard.routes.js` (a different module's dashboard), but per explicit direction this plan does not extract a cross-module shared util or modify any file outside the Inventario dashboard; this matches the codebase's existing convention of each dashboard route file self-containing its own bucket-size helper.

**Tech Stack:** Express + `pg` (raw SQL via `req.tQuery`), React + Recharts, Vitest for the one pure-function unit test.

## Global Constraints

- No new charting library — use Recharts (already the only chart lib in the codebase).
- No shared chart-color theme file — reuse the existing per-file `ESTADO_COLORS`/`PIE_COLORS` local-constant pattern (established convention across all `Dashboard/pages/*.jsx` files).
- No new automated test infrastructure for dashboard routes (matches existing repo convention — `dashboard.routes.js` and its siblings have zero test coverage today). Verification for query/chart tasks is manual: a direct read-only DB query + visual check in the browser.
- Status labels for `rastreo_ordenes.estado` must read `abierta/en_proceso/parcial/completada/cancelada` (aliasing `resuelta→completada`, `cerrada→cancelada`), reusing existing locale keys `rastreo.estado.*` already used by `Rastreo.jsx` — do not invent new status vocabulary or new locale keys for these labels.
- `es.js` and `zh.js` locale files must both be updated for every new user-facing string (this app supports Spanish + Chinese; `zh.js` — line numbers below are correct as of this plan's writing but re-check with `grep` before editing, since earlier tasks in this plan add lines above later ones).

---

### Task 1: Extract shared date-bucketing helper

**Files:**
- Create: `backend/src/shared/utils/dashboardBucket.js`
- Create: `backend/src/shared/utils/dashboardBucket.test.js`
- Modify: `backend/src/modules/wms/routes/surtido.dashboard.routes.js:1-31`

**Interfaces:**
- Produces: `getTrendBucket(fechaInicio: string, fechaFin: string): { bucket: 'day'|'week'|'month'|'year', interval: string, label: string }` and `BUCKET_META: Record<'day'|'week'|'month'|'year', { interval: string, label: string }>`, both exported from `backend/src/shared/utils/dashboardBucket.js`. Task 6 imports both.

This is a pure refactor (no behavior change) that pulls the bucket-size logic already live in `surtido.dashboard.routes.js` into a shared file, so Task 6 can reuse it instead of copy-pasting.

- [ ] **Step 1: Write the failing test**

Create `backend/src/shared/utils/dashboardBucket.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { getTrendBucket, BUCKET_META } from './dashboardBucket.js'

describe('getTrendBucket', () => {
  it('buckets by day for a range of 7 days or less', () => {
    expect(getTrendBucket('2026-07-01', '2026-07-07')).toEqual({ bucket: 'day', ...BUCKET_META.day })
  })

  it('buckets by week for a range between 8 and 31 days', () => {
    expect(getTrendBucket('2026-07-01', '2026-07-20')).toEqual({ bucket: 'week', ...BUCKET_META.week })
  })

  it('buckets by month for a range between 32 and 366 days', () => {
    expect(getTrendBucket('2026-01-01', '2026-06-01')).toEqual({ bucket: 'month', ...BUCKET_META.month })
  })

  it('buckets by year for a range longer than 366 days', () => {
    expect(getTrendBucket('2023-01-01', '2026-01-01')).toEqual({ bucket: 'year', ...BUCKET_META.year })
  })

  it('falls back to day bucket for malformed dates', () => {
    expect(getTrendBucket('not-a-date', '2026-07-07')).toEqual({ bucket: 'day', ...BUCKET_META.day })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/shared/utils/dashboardBucket.test.js`
Expected: FAIL — `Cannot find module './dashboardBucket.js'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/shared/utils/dashboardBucket.js`:

```js
function parseDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export const BUCKET_META = {
  day:   { interval: '1 day',   label: 'día' },
  week:  { interval: '1 week',  label: 'semana' },
  month: { interval: '1 month', label: 'mes' },
  year:  { interval: '1 year',  label: 'año' },
}

export function getTrendBucket(fechaInicio, fechaFin) {
  const start = parseDateKey(fechaInicio)
  const end = parseDateKey(fechaFin)
  if (!start || !end) return { bucket: 'day', ...BUCKET_META.day }

  const days = Math.max(1, Math.floor((end - start) / 86400000) + 1)
  if (days <= 7) return { bucket: 'day', ...BUCKET_META.day }
  if (days <= 31) return { bucket: 'week', ...BUCKET_META.week }
  if (days <= 366) return { bucket: 'month', ...BUCKET_META.month }
  return { bucket: 'year', ...BUCKET_META.year }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/shared/utils/dashboardBucket.test.js`
Expected: PASS — 5 tests passed

- [ ] **Step 5: Refactor `surtido.dashboard.routes.js` to use the shared helper**

In `backend/src/modules/wms/routes/surtido.dashboard.routes.js`, replace lines 1-31:

```js
import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'

const router = Router()

function parseDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const BUCKET_META = {
  day:   { interval: '1 day',   label: 'día' },
  week:  { interval: '1 week',  label: 'semana' },
  month: { interval: '1 month', label: 'mes' },
  year:  { interval: '1 year',  label: 'año' },
}

function getTrendBucket(fechaInicio, fechaFin) {
  const start = parseDateKey(fechaInicio)
  const end = parseDateKey(fechaFin)
  if (!start || !end) return { bucket: 'day', interval: '1 day', label: 'día' }

  const days = Math.max(1, Math.floor((end - start) / 86400000) + 1)
  if (days <= 7) return { bucket: 'day', interval: '1 day', label: 'día' }
  if (days <= 31) return { bucket: 'week', interval: '1 week', label: 'semana' }
  if (days <= 366) return { bucket: 'month', interval: '1 month', label: 'mes' }
  return { bucket: 'year', interval: '1 year', label: 'año' }
}
```

with:

```js
import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'
import { BUCKET_META, getTrendBucket } from '../../../shared/utils/dashboardBucket.js'

const router = Router()
```

Everything below (the `router.get('/', ...)` handler that calls `getTrendBucket(fecha_inicio, fecha_fin)` and references `BUCKET_META[bucketOverride]`) is untouched — it already only depends on the two names now imported instead of locally defined.

- [ ] **Step 6: Verify the surtido dashboard still returns the same shape**

Run: `cd backend && node -e "
import('./src/modules/wms/routes/surtido.dashboard.routes.js').then(() => console.log('surtido.dashboard.routes.js imports cleanly')).catch(e => { console.error(e); process.exit(1) })
"`
Expected: `surtido.dashboard.routes.js imports cleanly` (confirms no syntax/import errors — the route needs a running server + auth token for a full HTTP check, which is out of scope for this pure-refactor task; Task 6 will exercise the shared helper end-to-end through the new Inventario query).

- [ ] **Step 7: Commit**

```bash
git add backend/src/shared/utils/dashboardBucket.js backend/src/shared/utils/dashboardBucket.test.js backend/src/modules/wms/routes/surtido.dashboard.routes.js
git commit -m "refactor: extract shared date-bucketing helper from surtido dashboard"
```

---

### Task 2: Rastreo — Causa (barra horizontal) + Área (dona)

**Files:**
- Modify: `backend/src/modules/inventory/routes/dashboard.routes.js:24-145` (Promise.all), `:174-183` (graficas response)
- Modify: `frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx:1-26` (imports/colors), `:150-184` (rastreo charts grid)
- Modify: `frontend/src/core/stores/locales/es.js` (near line 170)
- Modify: `frontend/src/core/stores/locales/zh.js` (near line 229)

**Interfaces:**
- Produces: `graficas.rastreo_por_causa: Array<{ causa: string, cantidad: number }>` (top 10 + a synthetic `{ causa: 'Otros', cantidad }` row when there are more than 10 causes) and `graficas.rastreo_por_area: Array<{ area: string, cantidad }>`, both counting `rastreo_cajas` rows with a non-null `causa_rastreo_id`, scoped to the selected date range via `rc.updated_at`.

- [ ] **Step 1: Add the two backend queries**

In `backend/src/modules/inventory/routes/dashboard.routes.js`, add two entries to the `Promise.all` destructuring (line 24-34) and array (line 35-145). Change:

```js
      const [
        cajasEstadoRes,
        rastreoActivosRes,
        rastreoEstadoCajasRes,
        cajasMesRes,
        tasaRastreoRes,
        rastreoSemanaRes,
        tiempoRastreoRes,
        topResponsablesRes,
        escaneoTendenciaRes,
        sesionesStatsRes,
      ] = await Promise.all([
```

to:

```js
      const [
        cajasEstadoRes,
        rastreoActivosRes,
        rastreoEstadoCajasRes,
        cajasMesRes,
        tasaRastreoRes,
        rastreoSemanaRes,
        tiempoRastreoRes,
        topResponsablesRes,
        escaneoTendenciaRes,
        sesionesStatsRes,
        rastreoPorCausaRes,
        rastreoPorAreaRes,
      ] = await Promise.all([
```

Then, right before the closing `])` of the `Promise.all` array (currently line 144, the `sesionesStatsRes` query ending with `[req.tenantId, dateStart, dateEnd]` followed by `),` and `])`), insert two new queries:

```js
        // Frecuencia de causas de rastreo (cajas con causa asignada en el período)
        req.tQuery(
          `SELECT ct.descripcion AS causa, COUNT(*) AS cantidad
           FROM rastreo_cajas rc
           JOIN rastreo_causa_tipos ct ON ct.id = rc.causa_rastreo_id
           WHERE rc.tenant_id = $1
             AND rc.causa_rastreo_id IS NOT NULL
             AND ${instantDateInTZ('rc.updated_at', tz)} BETWEEN $2 AND $3
           GROUP BY ct.descripcion
           ORDER BY cantidad DESC`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Distribución de cajas en rastreo por área de causa
        req.tQuery(
          `SELECT ct.area AS area, COUNT(*) AS cantidad
           FROM rastreo_cajas rc
           JOIN rastreo_causa_tipos ct ON ct.id = rc.causa_rastreo_id
           WHERE rc.tenant_id = $1
             AND rc.causa_rastreo_id IS NOT NULL
             AND ${instantDateInTZ('rc.updated_at', tz)} BETWEEN $2 AND $3
           GROUP BY ct.area
           ORDER BY cantidad DESC`,
          [req.tenantId, dateStart, dateEnd]
        ),
```

- [ ] **Step 2: Add the top-10-plus-"Otros" helper and wire the response**

In the same file, above `const cajas = cajasEstadoRes.rows[0] || {}` (line 147), add:

```js
      function topNWithOthers(rows, key, n = 10) {
        if (rows.length <= n) return rows
        const top = rows.slice(0, n)
        const restTotal = rows.slice(n).reduce((sum, r) => sum + parseInt(r.cantidad || 0), 0)
        return [...top, { [key]: 'Otros', cantidad: restTotal }]
      }
```

Then in the `graficas` object (line 174-183), change:

```js
          graficas: {
            cajas_por_estado: [
              { estado: 'disponible', cantidad: parseInt(cajas.disponibles || 0) },
              { estado: 'bloqueada', cantidad: parseInt(cajas.bloqueadas || 0) },
              { estado: 'no_wms', cantidad: parseInt(cajas.no_wms || 0) },
            ],
            escaneo_diario: escaneoTendenciaRes.rows,
            rastreo_por_estado_cajas: rastreoEstadoCajasRes.rows,
            top_responsables: topResponsablesRes.rows,
          },
```

to:

```js
          graficas: {
            cajas_por_estado: [
              { estado: 'disponible', cantidad: parseInt(cajas.disponibles || 0) },
              { estado: 'bloqueada', cantidad: parseInt(cajas.bloqueadas || 0) },
              { estado: 'no_wms', cantidad: parseInt(cajas.no_wms || 0) },
            ],
            escaneo_diario: escaneoTendenciaRes.rows,
            rastreo_por_estado_cajas: rastreoEstadoCajasRes.rows,
            top_responsables: topResponsablesRes.rows,
            rastreo_por_causa: topNWithOthers(rastreoPorCausaRes.rows, 'causa', 10),
            rastreo_por_area: rastreoPorAreaRes.rows,
          },
```

(`escaneo_diario` and `top_responsables` stay untouched here — Tasks 3 and 6 replace them.)

- [ ] **Step 3: Sanity-check the two new queries against the real DB (read-only)**

Run (from `backend/`, using the tenant's real credentials already in `.env.local` at the repo root — adjust the date range to one you know has rastreo activity):

```bash
cd /Users/quiron/CascadeProjects/kirion
node -e "
require('dotenv').config({path: '.env.local'});
const { Pool } = require('pg');
const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });
pool.query(\"SELECT ct.descripcion AS causa, COUNT(*) AS cantidad FROM rastreo_cajas rc JOIN rastreo_causa_tipos ct ON ct.id = rc.causa_rastreo_id WHERE rc.causa_rastreo_id IS NOT NULL GROUP BY ct.descripcion ORDER BY cantidad DESC LIMIT 15\")
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); return pool.end() })
  .catch(e => { console.error(e.message); process.exit(1) })
"
```

Expected: an array of `{causa, cantidad}` rows (or an empty array if no tenant has assigned causes yet — acceptable, the chart shows `NoData` in that case).

- [ ] **Step 4: Add the two chart components on the frontend**

In `frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx`, add a color list for the causa/area donuts right after `PIE_COLORS` (line 26):

```js
const CAUSA_PIE_COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']
```

Replace the rastreo charts grid (lines 150-183):

```jsx
        {/* Rastreo charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={t('dashboard.inventario.chart.rastreoPorCausa')} icon={Crosshair}>
            {graficas.rastreo_por_causa?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={graficas.rastreo_por_causa} layout="vertical" margin={{ left: 4, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ece8" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="causa" width={120} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="cantidad" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <NoData height={220} />}
          </ChartCard>

          <ChartCard title={t('dashboard.inventario.chart.rastreoPorArea')} icon={Crosshair}>
            {graficas.rastreo_por_area?.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={graficas.rastreo_por_area}
                      dataKey="cantidad" nameKey="area"
                      cx="50%" cy="50%" outerRadius={80} innerRadius={45} strokeWidth={0}>
                      {graficas.rastreo_por_area.map((e, i) => (
                        <Cell key={i} fill={CAUSA_PIE_COLORS[i % CAUSA_PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {graficas.rastreo_por_area.map((e, i) => (
                    <div key={e.area} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CAUSA_PIE_COLORS[i % CAUSA_PIE_COLORS.length] }} />
                      <span className="text-xs text-warm-600 flex-1">{e.area}</span>
                      <span className="text-xs font-bold text-warm-700">{e.cantidad}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <NoData height={200} />}
          </ChartCard>

          <ChartCard title={t('dashboard.inventario.chart.rastreoEstado')} icon={Crosshair}>
            {graficas.rastreo_por_estado_cajas.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={graficas.rastreo_por_estado_cajas} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0ece8" />
                  <XAxis dataKey="estado_caja" tick={{ fontSize: 11 }} tickFormatter={v => estadoInventarioLabel(v, t)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                    {graficas.rastreo_por_estado_cajas.map((entry, i) => (
                      <Cell key={i} fill={ESTADO_COLORS[entry.estado_caja] || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <NoData height={200} />}
          </ChartCard>
        </div>
```

(`top_responsables` chart block is intentionally removed here — Task 3 replaces it with the stacked responsable×estatus chart in the same grid.)

- [ ] **Step 5: Add locale keys**

In `frontend/src/core/stores/locales/es.js`, after line 170 (`'dashboard.inventario.chart.topResponsables': 'Top responsables de rastreo',`), add:

```js
    'dashboard.inventario.chart.rastreoPorCausa': 'Frecuencia por causa de rastreo',
    'dashboard.inventario.chart.rastreoPorArea': 'Distribución por área',
```

In `frontend/src/core/stores/locales/zh.js`, after the equivalent line (`'dashboard.inventario.chart.topResponsables': 'Top 追踪负责人',`), add:

```js
    'dashboard.inventario.chart.rastreoPorCausa': '追踪原因频率',
    'dashboard.inventario.chart.rastreoPorArea': '按区域分布',
```

- [ ] **Step 6: Visual check**

Run: `cd frontend && npm run dev`, open the Dashboard page, select the Inventario tab, pick a date range with known rastreo activity (or leave the default), and confirm:
- "Frecuencia por causa de rastreo" shows a horizontal bar per causa (or `NoData` if the tenant has none).
- "Distribución por área" shows a donut with a legend list matching the causas' areas.
- The existing "Cajas en rastreo por estado" chart still renders unchanged.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/inventory/routes/dashboard.routes.js frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx frontend/src/core/stores/locales/es.js frontend/src/core/stores/locales/zh.js
git commit -m "feat: add causa/área charts to Inventario dashboard rastreo section"
```

---

### Task 3: Rastreo — Responsable × Estatus (barra apilada) + Estatus global (dona)

**Files:**
- Modify: `backend/src/modules/inventory/routes/dashboard.routes.js` (Promise.all + graficas, building on Task 2's edits)
- Modify: `frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx` (rastreo charts grid, building on Task 2's edits)
- Modify: `frontend/src/core/stores/locales/es.js`, `zh.js`

**Interfaces:**
- Produces: `graficas.rastreo_responsable_estatus: Array<{ responsable: string, abierta: number, en_proceso: number, parcial: number, completada: number, cancelada: number, total: number }>` (top 8 by `total`) and `graficas.rastreo_estatus_global: Array<{ estado: 'abierta'|'en_proceso'|'parcial'|'completada'|'cancelada', cantidad: number }>`. Replaces `graficas.top_responsables` (removed from the response — Task 2's chart edit already stopped rendering it).

- [ ] **Step 1: Add the two backend queries**

In `backend/src/modules/inventory/routes/dashboard.routes.js`, extend the `Promise.all` destructuring again:

```js
        rastreoPorCausaRes,
        rastreoPorAreaRes,
        rastreoResponsableEstatusRes,
        rastreoEstatusGlobalRes,
      ] = await Promise.all([
```

Add these two queries after the `rastreo_por_area` query added in Task 2:

```js
        // Órdenes de rastreo por responsable, separadas por estatus
        req.tQuery(
          `WITH aliased AS (
             SELECT ro.asignado_a,
               CASE ro.estado WHEN 'resuelta' THEN 'completada' WHEN 'cerrada' THEN 'cancelada' ELSE ro.estado END AS estado
             FROM rastreo_ordenes ro
             WHERE ro.tenant_id = $1
               AND ro.asignado_a IS NOT NULL
               AND ${instantDateInTZ('ro.created_at', tz)} BETWEEN $2 AND $3
           )
           SELECT
             u.nombre_completo AS responsable,
             COUNT(*) FILTER (WHERE a.estado = 'abierta') AS abierta,
             COUNT(*) FILTER (WHERE a.estado = 'en_proceso') AS en_proceso,
             COUNT(*) FILTER (WHERE a.estado = 'parcial') AS parcial,
             COUNT(*) FILTER (WHERE a.estado = 'completada') AS completada,
             COUNT(*) FILTER (WHERE a.estado = 'cancelada') AS cancelada,
             COUNT(*) AS total
           FROM aliased a
           JOIN usuarios u ON u.id = a.asignado_a AND u.tenant_id = $1
           GROUP BY u.nombre_completo
           ORDER BY total DESC
           LIMIT 8`,
          [req.tenantId, dateStart, dateEnd]
        ),
        // Distribución global de estatus de órdenes de rastreo
        req.tQuery(
          `SELECT
             CASE ro.estado WHEN 'resuelta' THEN 'completada' WHEN 'cerrada' THEN 'cancelada' ELSE ro.estado END AS estado,
             COUNT(*) AS cantidad
           FROM rastreo_ordenes ro
           WHERE ro.tenant_id = $1
             AND ${instantDateInTZ('ro.created_at', tz)} BETWEEN $2 AND $3
           GROUP BY 1
           ORDER BY cantidad DESC`,
          [req.tenantId, dateStart, dateEnd]
        ),
```

- [ ] **Step 2: Wire the response and drop `top_responsables`**

In the `graficas` object, change:

```js
            top_responsables: topResponsablesRes.rows,
            rastreo_por_causa: topNWithOthers(rastreoPorCausaRes.rows, 'causa', 10),
            rastreo_por_area: rastreoPorAreaRes.rows,
```

to:

```js
            rastreo_por_causa: topNWithOthers(rastreoPorCausaRes.rows, 'causa', 10),
            rastreo_por_area: rastreoPorAreaRes.rows,
            rastreo_responsable_estatus: rastreoResponsableEstatusRes.rows,
            rastreo_estatus_global: rastreoEstatusGlobalRes.rows,
```

Also remove `topResponsablesRes` from the `Promise.all` destructuring and its query (the "Top responsables de rastreo" query added originally at lines 107-119) — it's now fully superseded by `rastreo_responsable_estatus`.

- [ ] **Step 3: Sanity-check both queries against the real DB (read-only)**

```bash
cd /Users/quiron/CascadeProjects/kirion
node -e "
require('dotenv').config({path: '.env.local'});
const { Pool } = require('pg');
const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });
pool.query(\"SELECT CASE estado WHEN 'resuelta' THEN 'completada' WHEN 'cerrada' THEN 'cancelada' ELSE estado END AS estado, COUNT(*) AS cantidad FROM rastreo_ordenes GROUP BY 1 ORDER BY cantidad DESC\")
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); return pool.end() })
  .catch(e => { console.error(e.message); process.exit(1) })
"
```

Expected: rows like `{estado: 'completada', cantidad: 42}` etc., with only the five expected estado values appearing (confirms the alias CASE is catching every raw DB value).

- [ ] **Step 4: Add the two chart components**

In `frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx`, add `Legend` to the Recharts import (line 2-5, first needed by the stacked bar in this task):

```js
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
```

Add an order-status color map after `CAUSA_PIE_COLORS` (added in Task 2):

```js
const RASTREO_ESTADO_COLORS = {
  abierta: '#3b82f6',
  en_proceso: '#f59e0b',
  parcial: '#a855f7',
  completada: '#22c55e',
  cancelada: '#94a3b8',
}
const RASTREO_ESTADOS = ['abierta', 'en_proceso', 'parcial', 'completada', 'cancelada']
```

Add a label helper next to `estadoInventarioLabel` (after line 47):

```js
function estadoRastreoLabel(estado, t) {
  return t(`rastreo.estado.${estado}`)
}
```

In the rastreo charts grid (from Task 2's edit), insert the responsable×estatus and estatus-global charts right after the "Distribución por área" `ChartCard` and before "Cajas en rastreo por estado":

```jsx
          <ChartCard title={t('dashboard.inventario.chart.responsableEstatus')} icon={Users}>
            {graficas.rastreo_responsable_estatus?.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, graficas.rastreo_responsable_estatus.length * 32)}>
                <BarChart data={graficas.rastreo_responsable_estatus} layout="vertical" margin={{ left: 4, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ece8" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="responsable" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(value, name) => [value, estadoRastreoLabel(name, t)]} />
                  <Legend formatter={(value) => estadoRastreoLabel(value, t)} wrapperStyle={{ fontSize: 11 }} />
                  {RASTREO_ESTADOS.map(estado => (
                    <Bar key={estado} dataKey={estado} stackId="estatus" fill={RASTREO_ESTADO_COLORS[estado]} radius={estado === 'cancelada' ? [0, 4, 4, 0] : undefined} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : <NoData height={200} />}
          </ChartCard>

          <ChartCard title={t('dashboard.inventario.chart.estatusGlobal')} icon={Crosshair}>
            {graficas.rastreo_estatus_global?.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={graficas.rastreo_estatus_global}
                      dataKey="cantidad" nameKey="estado"
                      cx="50%" cy="50%" outerRadius={80} innerRadius={45} strokeWidth={0}>
                      {graficas.rastreo_estatus_global.map((e, i) => (
                        <Cell key={i} fill={RASTREO_ESTADO_COLORS[e.estado] || PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {graficas.rastreo_estatus_global.map((e, i) => (
                    <div key={e.estado} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: RASTREO_ESTADO_COLORS[e.estado] || PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-warm-600 flex-1">{estadoRastreoLabel(e.estado, t)}</span>
                      <span className="text-xs font-bold text-warm-700">{e.cantidad}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <NoData height={200} />}
          </ChartCard>
```

Remove the icon import `Users` if unused elsewhere in the file — it's not (still used here), so no import changes needed beyond what Task 2 already did.

- [ ] **Step 5: Add locale keys**

`es.js`, after the two keys added in Task 2:

```js
    'dashboard.inventario.chart.responsableEstatus': 'Responsables de rastreo por estatus',
    'dashboard.inventario.chart.estatusGlobal': 'Estatus global de rastreo',
```

`zh.js`, after the two keys added in Task 2:

```js
    'dashboard.inventario.chart.responsableEstatus': '追踪负责人按状态',
    'dashboard.inventario.chart.estatusGlobal': '追踪总体状态',
```

- [ ] **Step 6: Visual check**

`npm run dev`, open Dashboard → Inventario, confirm:
- The stacked bar shows one row per responsable with colored segments, and hovering shows the estatus label (not the raw `en_proceso` key) in the tooltip.
- The legend below/beside the stacked bar shows 5 estatus labels in Spanish (`Abierta`, `En proceso`, `Parcial`, `Finalizada`, `Cancelada` — matching `rastreo.estado.*` keys already used on the Rastreo page).
- The "Estatus global de rastreo" donut renders with the same 5-color scheme.
- Switch the app language to Chinese (if there's a language switcher) and confirm both charts' text switches too — or just re-check with `t()` calls manually to confirm the zh.js keys resolve.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/inventory/routes/dashboard.routes.js frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx frontend/src/core/stores/locales/es.js frontend/src/core/stores/locales/zh.js
git commit -m "feat: replace top-responsables chart with responsable x estatus + add estatus global donut"
```

---

### Task 4: Escaneo — quitar tarjetas OK / Sin match

**Files:**
- Modify: `frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx:80-90`
- Modify: `frontend/src/core/stores/locales/es.js`, `zh.js` (remove now-unused keys)

**Interfaces:** none (pure UI removal, no new data).

- [ ] **Step 1: Collapse the two KPI rows into one**

Replace lines 80-90:

```jsx
        {/* Escaneo KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <KpiCard label={t('dashboard.inventario.kpi.cajasDisponibles')} value={kpis.cajas_disponibles} icon={Package} index={0} />
          <KpiCard label={t('dashboard.inventario.kpi.cajasBloqueadas')} value={kpis.cajas_bloqueadas} icon={AlertTriangle} alert={kpis.cajas_bloqueadas > 0} index={1} />
          <KpiCard label={t('dashboard.inventario.kpi.cajasSinWms')} value={kpis.cajas_no_wms} icon={AlertTriangle} alert={kpis.cajas_no_wms > 0} index={2} />
          <KpiCard label={t('dashboard.inventario.kpi.escaneosPeriodo')} value={kpis.escaneos_periodo ?? kpis.cajas_mes} icon={ScanLine} index={3} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <KpiCard label={t('dashboard.inventario.kpi.sesionesPeriodo')} value={kpis.sesiones_periodo ?? '—'} icon={Layers} index={4} />
          <KpiCard label={t('dashboard.inventario.kpi.ok')} value={kpis.escaneos_ok_periodo ?? '—'} icon={CheckCircle2} index={5} />
          <KpiCard label={t('dashboard.inventario.kpi.sinMatch')} value={(kpis.escaneos_bloqueados_periodo ?? 0) + (kpis.escaneos_nowms_periodo ?? 0)} icon={AlertTriangle} alert index={6} />
        </div>
```

with:

```jsx
        {/* Escaneo KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <KpiCard label={t('dashboard.inventario.kpi.cajasDisponibles')} value={kpis.cajas_disponibles} icon={Package} index={0} />
          <KpiCard label={t('dashboard.inventario.kpi.cajasBloqueadas')} value={kpis.cajas_bloqueadas} icon={AlertTriangle} alert={kpis.cajas_bloqueadas > 0} index={1} />
          <KpiCard label={t('dashboard.inventario.kpi.cajasSinWms')} value={kpis.cajas_no_wms} icon={AlertTriangle} alert={kpis.cajas_no_wms > 0} index={2} />
          <KpiCard label={t('dashboard.inventario.kpi.escaneosPeriodo')} value={kpis.escaneos_periodo ?? kpis.cajas_mes} icon={ScanLine} index={3} />
          <KpiCard label={t('dashboard.inventario.kpi.sesionesPeriodo')} value={kpis.sesiones_periodo ?? '—'} icon={Layers} index={4} />
        </div>
```

`CheckCircle2` becomes unused as an import if nothing else in the file uses it — check with `grep -n "CheckCircle2" frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx` after this edit; if the only remaining match is the `import` line itself, remove `CheckCircle2` from the lucide-react import (line 6-8).

- [ ] **Step 2: Remove the now-unused locale keys**

Remove from `es.js`: `'dashboard.inventario.kpi.ok': 'OK',` and `'dashboard.inventario.kpi.sinMatch': 'Sin match',`.
Remove from `zh.js`: `'dashboard.inventario.kpi.ok': '正常',` and `'dashboard.inventario.kpi.sinMatch': '无匹配',`.

Confirm nothing else references them first:
```bash
grep -rn "dashboard.inventario.kpi.ok'\|dashboard.inventario.kpi.sinMatch" frontend/src --include="*.jsx" --include="*.js" | grep -v locales/
```
Expected: no output (safe to delete).

- [ ] **Step 3: Visual check**

`npm run dev`, open Dashboard → Inventario, confirm the ESCANEO section now shows a single row of 5 KPI cards (no "OK" / "Sin match" tiles), and that the layout doesn't look cramped on a narrow viewport (resize the browser window or check the `md:grid-cols-5` wrap behavior).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx frontend/src/core/stores/locales/es.js frontend/src/core/stores/locales/zh.js
git commit -m "chore: remove low-value OK/Sin-match KPI cards from Inventario dashboard"
```

---

### Task 5: Escaneo — Escaneos por responsable (barra apilada)

**Files:**
- Modify: `backend/src/modules/inventory/routes/dashboard.routes.js`
- Modify: `frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx`
- Modify: `frontend/src/core/stores/locales/es.js`, `zh.js`

**Interfaces:**
- Produces: `graficas.escaneo_por_responsable: Array<{ responsable: string, ok: number, bloqueados: number, sin_wms: number, total: number }>` (top 8 by `total`).

- [ ] **Step 1: Add the backend query**

Extend the `Promise.all` destructuring once more:

```js
        rastreoResponsableEstatusRes,
        rastreoEstatusGlobalRes,
        escaneoPorResponsableRes,
      ] = await Promise.all([
```

Add the query after the `rastreo_estatus_global` query from Task 3:

```js
        // Escaneos por responsable (operador de la sesión), separados por tipo
        req.tQuery(
          `SELECT
             u.nombre_completo AS responsable,
             COALESCE(SUM(sess.total_ok), 0) AS ok,
             COALESCE(SUM(sess.total_blocked), 0) AS bloqueados,
             COALESCE(SUM(sess.total_nowms), 0) AS sin_wms,
             COALESCE(SUM(sess.total_ok), 0) + COALESCE(SUM(sess.total_blocked), 0) + COALESCE(SUM(sess.total_nowms), 0) AS total
           FROM inv_sessions sess
           JOIN usuarios u ON u.id = sess.operator_id AND u.tenant_id = sess.tenant_id
           WHERE sess.tenant_id = $1
             AND sess.operator_id IS NOT NULL
             AND ${instantDateInTZ('sess.started_at', tz)} BETWEEN $2 AND $3
           GROUP BY u.nombre_completo
           ORDER BY total DESC
           LIMIT 8`,
          [req.tenantId, dateStart, dateEnd]
        ),
```

Wire it into the response:

```js
            rastreo_responsable_estatus: rastreoResponsableEstatusRes.rows,
            rastreo_estatus_global: rastreoEstatusGlobalRes.rows,
            escaneo_por_responsable: escaneoPorResponsableRes.rows,
```

- [ ] **Step 2: Sanity-check against the real DB (read-only)**

```bash
cd /Users/quiron/CascadeProjects/kirion
node -e "
require('dotenv').config({path: '.env.local'});
const { Pool } = require('pg');
const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });
pool.query(\"SELECT u.nombre_completo AS responsable, COALESCE(SUM(sess.total_ok),0) AS ok, COALESCE(SUM(sess.total_blocked),0) AS bloqueados, COALESCE(SUM(sess.total_nowms),0) AS sin_wms FROM inv_sessions sess JOIN usuarios u ON u.id = sess.operator_id AND u.tenant_id = sess.tenant_id WHERE sess.operator_id IS NOT NULL GROUP BY u.nombre_completo ORDER BY 2 DESC LIMIT 8\")
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); return pool.end() })
  .catch(e => { console.error(e.message); process.exit(1) })
"
```

Expected: rows shaped `{responsable, ok, bloqueados, sin_wms}` with numeric values.

- [ ] **Step 3: Add the chart component**

In `frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx`, add a scan-type color map next to `RASTREO_ESTADO_COLORS` (from Task 3):

```js
const ESCANEO_TIPO_COLORS = { ok: '#22c55e', bloqueados: '#f59e0b', sin_wms: '#ef4444' }
const ESCANEO_TIPOS = ['ok', 'bloqueados', 'sin_wms']
```

Add a label helper next to `estadoRastreoLabel` (from Task 3):

```js
function escaneoTipoLabel(tipo, t) {
  const map = { ok: t('dashboard.status.available'), bloqueados: t('dashboard.status.blocked'), sin_wms: t('dashboard.status.noWms') }
  return map[tipo] || tipo
}
```

(Reuses the existing generic `dashboard.status.*` keys already in both locale files — no new keys needed for the segment labels themselves.)

Add the chart as a new full-width row at the end of the ESCANEO charts grid — change the closing of that grid (originally lines 93-135, already modified by Task 6 below if done first; if Task 5 lands before Task 6, the grid still ends right after the "Escaneos por día" `ChartCard`). Insert right before the grid's closing `</div>` (the one that closes `<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">` in the ESCANEO section):

```jsx
          <ChartCard title={t('dashboard.inventario.chart.escaneoPorResponsable')} icon={Users} className="lg:col-span-2">
            {graficas.escaneo_por_responsable?.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, graficas.escaneo_por_responsable.length * 32)}>
                <BarChart data={graficas.escaneo_por_responsable} layout="vertical" margin={{ left: 4, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0ece8" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="responsable" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(value, name) => [value, escaneoTipoLabel(name, t)]} />
                  <Legend formatter={(value) => escaneoTipoLabel(value, t)} wrapperStyle={{ fontSize: 11 }} />
                  {ESCANEO_TIPOS.map(tipo => (
                    <Bar key={tipo} dataKey={tipo} stackId="tipo" fill={ESCANEO_TIPO_COLORS[tipo]} radius={tipo === 'sin_wms' ? [0, 4, 4, 0] : undefined} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : <NoData height={200} />}
          </ChartCard>
```

`Users` icon is already imported (used by the responsable×estatus chart in Task 3).

- [ ] **Step 4: Add locale key**

`es.js`:
```js
    'dashboard.inventario.chart.escaneoPorResponsable': 'Escaneos por responsable',
```
`zh.js`:
```js
    'dashboard.inventario.chart.escaneoPorResponsable': '按负责人扫描',
```

- [ ] **Step 5: Visual check**

`npm run dev`, open Dashboard → Inventario, confirm the new stacked bar appears full-width below the existing two ESCANEO charts, with green/amber/red segments per operator and a working legend/tooltip.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/inventory/routes/dashboard.routes.js frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx frontend/src/core/stores/locales/es.js frontend/src/core/stores/locales/zh.js
git commit -m "feat: add escaneos-por-responsable stacked chart to Inventario dashboard"
```

---

### Task 6: Escaneo — reemplazar "Escaneos por día" con Tendencia adaptativa

**Files:**
- Modify: `backend/src/modules/inventory/routes/dashboard.routes.js`
- Modify: `frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx`

**Interfaces:**
- Consumes: `getTrendBucket(fechaInicio, fechaFin)` from Task 1's `backend/src/shared/utils/dashboardBucket.js`.
- Produces: `graficas.escaneo_tendencia: Array<{ periodo: string, escaneos: number }>` (gap-filled across every bucket in range, replacing `graficas.escaneo_diario`) plus `graficas.escaneo_tendencia_bucket: 'day'|'week'|'month'|'year'`.

- [ ] **Step 1: Import the shared bucket helper and compute the bucket**

In `backend/src/modules/inventory/routes/dashboard.routes.js`, add to the imports (line 1-4):

```js
import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { instantDateInTZ } from '../../../shared/utils/dateUtils.js'
import { getTrendBucket } from '../../../shared/utils/dashboardBucket.js'
```

Right after `const monthEnd = ...` (line 22), add:

```js
      const trend = getTrendBucket(fecha_inicio, fecha_fin)
      const trendPeriodExpr = `DATE_TRUNC('${trend.bucket}', ${instantDateInTZ('sc.scanned_at', tz)}::timestamp)::date`
```

- [ ] **Step 2: Replace the daily-only query with the adaptive gap-filled query**

Find the existing "Daily escaneo trend in date range" query (currently bound to `escaneoTendenciaRes` in the `Promise.all`):

```js
        // Daily escaneo trend in date range
        req.tQuery(
          `SELECT
             ${instantDateInTZ('sc.scanned_at', tz)} AS fecha,
             COUNT(*) AS escaneos
           FROM inv_scans sc
           JOIN inv_sessions sess ON sess.id = sc.session_id AND sess.tenant_id = $1
           WHERE ${instantDateInTZ('sc.scanned_at', tz)} BETWEEN $2 AND $3
           GROUP BY fecha
           ORDER BY fecha`,
          [req.tenantId, dateStart, dateEnd]
        ),
```

Replace with:

```js
        // Tendencia de escaneos, bucket adaptativo (día/semana/mes/año) según amplitud del rango
        req.tQuery(
          `WITH bounds AS (
             SELECT
               DATE_TRUNC('${trend.bucket}', $2::date::timestamp)::date AS start_period,
               DATE_TRUNC('${trend.bucket}', $3::date::timestamp)::date AS end_period
           ),
           periods AS (
             SELECT GENERATE_SERIES(start_period, end_period, INTERVAL '${trend.interval}')::date AS periodo
             FROM bounds
           ),
           aggregated AS (
             SELECT
               ${trendPeriodExpr} AS periodo,
               COUNT(*) AS escaneos
             FROM inv_scans sc
             JOIN inv_sessions sess ON sess.id = sc.session_id AND sess.tenant_id = $1
             WHERE ${instantDateInTZ('sc.scanned_at', tz)} BETWEEN $2::date AND $3::date
             GROUP BY periodo
           )
           SELECT p.periodo, COALESCE(a.escaneos, 0) AS escaneos
           FROM periods p
           LEFT JOIN aggregated a ON a.periodo = p.periodo
           ORDER BY p.periodo`,
          [req.tenantId, fecha_inicio, fecha_fin]
        ),
```

(Same variable name `escaneoTendenciaRes` in the destructuring — no change needed there.)

- [ ] **Step 3: Update the response — rename `escaneo_diario` to `escaneo_tendencia` and add the bucket label**

Change:

```js
            escaneo_diario: escaneoTendenciaRes.rows,
```

to:

```js
            escaneo_tendencia: escaneoTendenciaRes.rows,
            escaneo_tendencia_bucket: trend.bucket,
```

- [ ] **Step 4: Sanity-check the query against the real DB (read-only)**

```bash
cd /Users/quiron/CascadeProjects/kirion
node -e "
require('dotenv').config({path: '.env.local'});
const { Pool } = require('pg');
const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });
pool.query(\`WITH bounds AS (SELECT DATE_TRUNC('month', \\\$1::date::timestamp)::date AS start_period, DATE_TRUNC('month', \\\$2::date::timestamp)::date AS end_period), periods AS (SELECT GENERATE_SERIES(start_period, end_period, INTERVAL '1 month')::date AS periodo FROM bounds), aggregated AS (SELECT DATE_TRUNC('month', sc.scanned_at)::date AS periodo, COUNT(*) AS escaneos FROM inv_scans sc JOIN inv_sessions sess ON sess.id = sc.session_id WHERE sc.scanned_at BETWEEN \\\$1::date AND \\\$2::date GROUP BY periodo) SELECT p.periodo, COALESCE(a.escaneos,0) AS escaneos FROM periods p LEFT JOIN aggregated a ON a.periodo = p.periodo ORDER BY p.periodo\`, ['2026-01-01', '2026-07-01'])
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); return pool.end() })
  .catch(e => { console.error(e.message); process.exit(1) })
"
```

Expected: one row per month from January through July 2026, `escaneos: 0` for months with no scans, non-zero for months with activity — confirms the gap-filling works (this simplified check skips the tenant/timezone filters that the real route applies, just to validate the CTE structure and date math in isolation).

- [ ] **Step 5: Replace the frontend chart**

In `frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx`, add `LineChart`/`Line` to the Recharts import:

```js
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
```

Add `fmtDateString` to the existing date-format import (line 15):

```js
import { fmtDate, fmtDateString } from '../../../core/utils/dateFormat'
```

Add the trend-label helpers near the top of the file, after `estadoInventarioLabel` (and after `estadoRastreoLabel`/`escaneoTipoLabel` if Tasks 3/5 already landed):

```js
function trendTitle(bucket, t) {
  const map = {
    day: t('dashboard.trend.daily'),
    week: t('dashboard.trend.weekly'),
    month: t('dashboard.trend.monthly'),
    year: t('dashboard.trend.yearly'),
  }
  return map[bucket] || t('dashboard.trend.title')
}

function trendLabel(value, bucket, t) {
  if (!value) return ''
  const [year, month] = String(value).split('T')[0].split('-')
  if (bucket === 'year') return year
  if (bucket === 'month') {
    const monthName = new Date(`${year}-${month}-15T12:00:00Z`)
      .toLocaleDateString('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    return monthName.replace('.', '')
  }
  if (bucket === 'week') return `${t('common.weekShort')} ${fmtDateString(value)}`
  return fmtDateString(value)
}
```

Replace the "Escaneos por día" `ChartCard` (lines 122-134):

```jsx
          <ChartCard title={t('dashboard.inventario.chart.escaneosDia')} icon={ScanLine}>
            {graficas.escaneo_diario?.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={graficas.escaneo_diario} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0ece8" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={v => fmtDate(v)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={v => fmtDate(v)} />
                  <Bar dataKey="escaneos" fill="#14b8a6" radius={[4, 4, 0, 0]} name={t('dashboard.metric.escaneos')} />
                </BarChart>
              </ResponsiveContainer>
            ) : <NoData height={200} />}
          </ChartCard>
```

with:

```jsx
          <ChartCard title={trendTitle(graficas.escaneo_tendencia_bucket, t)} icon={ScanLine}>
            {graficas.escaneo_tendencia?.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={graficas.escaneo_tendencia} margin={{ left: 0, right: 20, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ece8" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 10 }} tickFormatter={v => trendLabel(v, graficas.escaneo_tendencia_bucket, t)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={v => trendLabel(v, graficas.escaneo_tendencia_bucket, t)} />
                  <Line type="monotone" dataKey="escaneos" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} name={t('dashboard.metric.escaneos')} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : <NoData height={200} />}
          </ChartCard>
```

- [ ] **Step 6: Remove the now-unused `escaneosDia` locale key**

Confirm nothing else uses it:
```bash
grep -rn "dashboard.inventario.chart.escaneosDia" frontend/src --include="*.jsx" --include="*.js" | grep -v locales/
```
Expected: no output. Remove `'dashboard.inventario.chart.escaneosDia': 'Escaneos por día (período)',` from both `es.js` and `zh.js`.

- [ ] **Step 7: Visual check across range sizes**

`npm run dev`, open Dashboard → Inventario:
- Select a date range of a few days: chart title should read "Tendencia diaria" and x-axis ticks show day/month.
- Select a range spanning several months: title reads "Tendencia mensual", x-axis ticks show month abbreviations (e.g. "jul 2026").
- Confirm no console errors and the line renders smoothly across gaps (months/days with zero scans still show a point at 0, not a broken line).

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/inventory/routes/dashboard.routes.js frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx frontend/src/core/stores/locales/es.js frontend/src/core/stores/locales/zh.js
git commit -m "feat: replace daily-only escaneos chart with adaptive trend chart"
```

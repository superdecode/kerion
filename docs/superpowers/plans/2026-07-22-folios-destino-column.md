# Folios Destino Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Destino" column to the Despacho > Folios list table and its Excel export, showing a folio's single destination (`por_destino` type) or its orders' distinct destinations joined by commas (`por_orden` type, when more than one).

**Architecture:** Backend adds one more `array_agg(DISTINCT ...)` aggregation to the existing Folios list SQL query (same pattern already used for `outbound_order_nos`), returning a new `destinatarios` array per folio alongside the existing `destino`/`tipo` columns. Frontend adds a pure display-derivation function and wires it into the on-screen table and the Excel export in `Folios.jsx`. No new tables, no schema migration, no new API endpoint.

**Tech Stack:** Node.js/Express backend with raw `pg` queries (`req.tQuery`), React frontend, `xlsx` (SheetJS) for the export. No automated test harness covers this route or page today (verified: no `*.test.js` exists for `despacho/routes/folios.routes.js` or `Despacho/pages/Folios.jsx`) — verification is manual, consistent with how this codebase already tests this area.

## Global Constraints

- Folios `tipo === 'por_destino'` must display `folio.destino` (their existing single-value field) — never derived from `destinatarios`, even if that array happens to be populated too.
- Folios `tipo === 'por_orden'` must display the distinct, non-empty `destinatario` values from their orders, joined with `', '` (comma + space). Zero values → empty string, rendered as `—` by the existing UI convention for empty cells in this table.
- Do not modify `PrintFolioContent.jsx`'s `getUniqueDestinations` (different delimiter `' / '`, different view, explicitly out of scope per the spec).
- Reuse the existing i18n key `desp.col.destino` (already `"Destino"` in `es.js`, used in `Ordenes.jsx`) — do not create a new key.
- Final on-screen column order: Folio, Fecha Creación, **Destino**, Estado, Conductor, Unidad, # Órdenes, # Cajas, Acciones.
- Final Excel export column order: #, Folio, Fecha Creación, **Destino**, Estado, Conductor, Unidad, Unidad Tipo, # Órdenes, # Cajas, Operador, Fecha Salida.
- No backend route signature changes, no new query params — same `GET /despacho/folios` endpoint, additive field only.

---

### Task 1: Backend — aggregate distinct destinatarios in the Folios list query

**Files:**
- Modify: `backend/src/modules/despacho/routes/folios.routes.js:174-193`

**Interfaces:**
- Produces: each row returned by `GET /despacho/folios` gains a new field `destinatarios: string[]` (empty array if the folio has no orders with a non-empty `destinatario`). Existing fields `destino` (string|null) and `tipo` ('por_orden'|'por_destino') are already present via `f.*` and are unchanged. Tasks 2 and 3 consume `folio.tipo`, `folio.destino`, and `folio.destinatarios`.

- [ ] **Step 1: Add the aggregation to the SELECT**

In `backend/src/modules/despacho/routes/folios.routes.js`, replace the query at lines 174-193:

```javascript
      const result = await req.tQuery(
        `SELECT f.*,
                c.nombre AS conductor_nombre,
                u.placa AS unidad_placa, u.tipo AS unidad_tipo,
                us.nombre_completo AS operador_nombre,
                COUNT(fo.id) AS total_ordenes,
                COALESCE(SUM(fo.bultos), 0) AS total_cajas,
                COALESCE(array_agg(DISTINCT fo.outbound_order_no) FILTER (WHERE fo.outbound_order_no IS NOT NULL), '{}') AS outbound_order_nos,
                (
                  SELECT COALESCE(array_agg(DISTINCT dos.codigo_caja), '{}')
                  FROM dispatch_order_scans dos
                  WHERE dos.folio_id = f.id AND dos.tenant_id = f.tenant_id AND dos.codigo_caja IS NOT NULL
                ) AS box_codes
         FROM dispatch_folios f
         LEFT JOIN dispatch_conductores c ON c.id = f.conductor_id
         LEFT JOIN dispatch_unidades u ON u.id = f.unidad_id
         LEFT JOIN usuarios us ON us.id = f.operador_id
         LEFT JOIN dispatch_folio_orders fo ON fo.folio_id = f.id
         WHERE ${where.join(' AND ')}
         GROUP BY f.id, c.nombre, u.placa, u.tipo, us.nombre_completo
         ORDER BY f.created_at DESC`,
        params
      )
```

with:

```javascript
      const result = await req.tQuery(
        `SELECT f.*,
                c.nombre AS conductor_nombre,
                u.placa AS unidad_placa, u.tipo AS unidad_tipo,
                us.nombre_completo AS operador_nombre,
                COUNT(fo.id) AS total_ordenes,
                COALESCE(SUM(fo.bultos), 0) AS total_cajas,
                COALESCE(array_agg(DISTINCT fo.outbound_order_no) FILTER (WHERE fo.outbound_order_no IS NOT NULL), '{}') AS outbound_order_nos,
                COALESCE(array_agg(DISTINCT fo.destinatario) FILTER (WHERE fo.destinatario IS NOT NULL AND fo.destinatario <> ''), '{}') AS destinatarios,
                (
                  SELECT COALESCE(array_agg(DISTINCT dos.codigo_caja), '{}')
                  FROM dispatch_order_scans dos
                  WHERE dos.folio_id = f.id AND dos.tenant_id = f.tenant_id AND dos.codigo_caja IS NOT NULL
                ) AS box_codes
         FROM dispatch_folios f
         LEFT JOIN dispatch_conductores c ON c.id = f.conductor_id
         LEFT JOIN dispatch_unidades u ON u.id = f.unidad_id
         LEFT JOIN usuarios us ON us.id = f.operador_id
         LEFT JOIN dispatch_folio_orders fo ON fo.folio_id = f.id
         WHERE ${where.join(' AND ')}
         GROUP BY f.id, c.nombre, u.placa, u.tipo, us.nombre_completo
         ORDER BY f.created_at DESC`,
        params
      )
```

(Only the one new `COALESCE(array_agg(...)) AS destinatarios,` line is added; nothing else in the query changes — no `GROUP BY` change needed, matching how `outbound_order_nos` already aggregates without being in `GROUP BY`.)

- [ ] **Step 2: Verify the query directly against the dev database**

This project has no automated test for this route. Verify the raw SQL logic directly with a throwaway read-only script, following the existing `pg.Pool` + `.env.local` pattern already used in `backend/scripts/run-migration.js`.

Create a temporary file `backend/scripts/tmp-verify-destinatarios.js` (do not commit this file — delete it in Step 4):

```javascript
import pg from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const { Pool } = pg
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

const { rows } = await pool.query(`
  SELECT f.id, f.folio_numero, f.tipo, f.destino,
         COALESCE(array_agg(DISTINCT fo.destinatario) FILTER (WHERE fo.destinatario IS NOT NULL AND fo.destinatario <> ''), '{}') AS destinatarios
  FROM dispatch_folios f
  LEFT JOIN dispatch_folio_orders fo ON fo.folio_id = f.id
  WHERE f.deleted_at IS NULL
  GROUP BY f.id
  ORDER BY f.created_at DESC
  LIMIT 15
`)
console.table(rows.map(r => ({ folio: r.folio_numero, tipo: r.tipo, destino: r.destino, destinatarios: r.destinatarios })))
await pool.end()
```

Run: `cd backend && node scripts/tmp-verify-destinatarios.js`

Expected: a table with up to 15 real folios. Confirm:
- Rows with `tipo = 'por_destino'` show a non-null `destino` (the `destinatarios` column value for these rows is not used by the frontend, per Global Constraints, so its content doesn't need checking here).
- At least one row with `tipo = 'por_orden'` shows a `destinatarios` array. If any `por_orden` folio has 2+ distinct entries, that confirms the multi-value case works; if all existing `por_orden` folios happen to have only 0-1 distinct destinatario, that's fine — the query logic is still verified as correct SQL (proven by the array populating at all for folios that do have orders).

If the script errors on connection, check `backend/.env.local` has valid `DB_*` values (it should, per `backend/.env.development`/`.env.local` already present in this repo for local dev).

- [ ] **Step 3: Start the backend dev server and confirm no runtime errors**

Run: `cd backend && npm run dev` (leave running in background for Task 2/3 verification), watch startup log.

Expected: server starts normally (`Server running on port ...` or equivalent), no stack trace referencing `folios.routes.js`. Stop watching once confirmed; leave the process running for later tasks.

- [ ] **Step 4: Delete the temporary verification script**

```bash
rm backend/scripts/tmp-verify-destinatarios.js
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/despacho/routes/folios.routes.js
git commit -m "feat(despacho): aggregate distinct destinatarios per folio in list query"
```

---

### Task 2: Frontend — display-derivation helper and on-screen table column

**Files:**
- Modify: `frontend/src/modules/Despacho/pages/Folios.jsx`

**Interfaces:**
- Consumes: `folio.tipo`, `folio.destino`, `folio.destinatarios` from Task 1's API response (already flows through unmodified — `getFolios` in `despachoService.js:18-19` passes the full JSON payload through with no field filtering).
- Produces: module-level function `folioDestinoDisplay(folio)` returning a `string`, consumed by Task 3 (Excel export) as well as this task's table cell.

- [ ] **Step 1: Add the `folioDestinoDisplay` helper**

In `frontend/src/modules/Despacho/pages/Folios.jsx`, add this function directly after the existing `SortHeader` function (after line 52, before `export default function Folios() {` at line 54):

```javascript
function folioDestinoDisplay(folio) {
  if (folio.tipo === 'por_destino') return folio.destino || ''
  return (folio.destinatarios || []).filter(Boolean).join(', ')
}
```

- [ ] **Step 2: Add the "Destino" table header**

Replace line 496 (currently the Fecha Creación `SortHeader`, immediately followed by the Estado `SortHeader` on line 497):

```javascript
                    <SortHeader label={t('desp.folio.col.fechaCreacion')} field="created_at" {...sp} />
                    <SortHeader label={t('desp.folio.col.estado')} field="estado" {...sp} />
```

with:

```javascript
                    <SortHeader label={t('desp.folio.col.fechaCreacion')} field="created_at" {...sp} />
                    <th className="table-header">{t('desp.col.destino')}</th>
                    <SortHeader label={t('desp.folio.col.estado')} field="estado" {...sp} />
```

(Plain `<th>`, not `SortHeader` — `destinatarios` is a derived array, not a single sortable DB column, matching how the existing "Acciones" header at line 502 is also a plain `<th>` rather than a `SortHeader`.)

- [ ] **Step 3: Update the empty-state `colSpan`**

Replace line 508:

```javascript
                      <td colSpan={9} className="py-14 text-center">
```

with:

```javascript
                      <td colSpan={10} className="py-14 text-center">
```

(9 → 10: one column added to the previous 9-column table: checkbox + folio + fecha + estado + conductor + unidad + ordenes + cajas + acciones.)

- [ ] **Step 4: Add the "Destino" data cell**

Replace lines 531-537:

```javascript
                      <td className="table-cell">
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs text-warm-700">{fmtDate(folio.created_at)}</span>
                          <span className="text-[10px] text-warm-400">{fmtTimeShort(folio.created_at)}</span>
                        </div>
                      </td>
                      <td className="table-cell">{estadoBadge(folio.estado)}</td>
```

with:

```javascript
                      <td className="table-cell">
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs text-warm-700">{fmtDate(folio.created_at)}</span>
                          <span className="text-[10px] text-warm-400">{fmtTimeShort(folio.created_at)}</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        {folioDestinoDisplay(folio)
                          ? <span className="text-xs text-warm-700">{folioDestinoDisplay(folio)}</span>
                          : <span className="text-warm-300 text-xs">—</span>}
                      </td>
                      <td className="table-cell">{estadoBadge(folio.estado)}</td>
```

- [ ] **Step 5: Manual verification**

With the backend dev server running (from Task 1, Step 3) and a frontend dev server running (`cd frontend && npm run dev` in a separate terminal):

1. Navigate to Despacho > Folios in the browser.
2. Confirm the table now shows a "Destino" column between "Fecha Creación" and "Estado".
3. Find (or identify from Task 1's verification table output) a `por_destino` folio — confirm its Destino cell shows that folio's single destino value.
4. Find a `por_orden` folio with orders that have differing `destinatario` values — confirm its Destino cell shows them comma-separated. If none currently exists in the dev data, this is acceptable to defer to Task 3's verification or a follow-up manual check once such data exists — do not fabricate test data for this.
5. Find a folio with no orders (or no destinatario data) — confirm its Destino cell shows `—`, not a blank cell or an error.
6. Confirm no console errors in the browser dev tools.

Expected: column renders correctly for all three cases without breaking the table layout or crashing the page.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/Despacho/pages/Folios.jsx
git commit -m "feat(despacho): add Destino column to Folios table"
```

---

### Task 3: Frontend — Excel export column

**Files:**
- Modify: `frontend/src/modules/Despacho/pages/Folios.jsx:225-262`

**Interfaces:**
- Consumes: `folioDestinoDisplay(folio)` from Task 2 (same file, no import needed).
- Produces: no new exports — `exportFoliosSelected` remains a local closure, called from the existing export button (unchanged call site).

- [ ] **Step 1: Add the Destino value to each exported row**

Replace lines 228-240:

```javascript
    const rows = selectedFolios.map((folio, index) => ([
      index + 1,
      folio.folio_numero || '',
      fmtDate(folio.created_at),
      folio.estado || '',
      folio.conductor_nombre || '',
      folio.unidad_placa || '',
      folio.unidad_tipo || '',
      folio.total_ordenes ?? 0,
      folio.total_cajas ?? 0,
      folio.operador_nombre || '',
      folio.fecha_salida ? fmtDate(folio.fecha_salida) : '',
    ]))
```

with:

```javascript
    const rows = selectedFolios.map((folio, index) => ([
      index + 1,
      folio.folio_numero || '',
      fmtDate(folio.created_at),
      folioDestinoDisplay(folio),
      folio.estado || '',
      folio.conductor_nombre || '',
      folio.unidad_placa || '',
      folio.unidad_tipo || '',
      folio.total_ordenes ?? 0,
      folio.total_cajas ?? 0,
      folio.operador_nombre || '',
      folio.fecha_salida ? fmtDate(folio.fecha_salida) : '',
    ]))
```

- [ ] **Step 2: Add the "Destino" header to the export sheet**

Replace lines 244-256:

```javascript
      [
        '#',
        t('desp.folio.col.folio'),
        t('desp.folio.col.fechaCreacion'),
        t('desp.folio.col.estado'),
        t('desp.folio.col.conductor'),
        t('desp.folio.col.unidad'),
        t('desp.folios.bulk.unidadTipo'),
        t('desp.folio.col.ordenes'),
        t('desp.folio.col.cajas'),
        t('desp.folios.bulk.operador'),
        t('desp.folios.bulk.fechaSalida'),
      ],
```

with:

```javascript
      [
        '#',
        t('desp.folio.col.folio'),
        t('desp.folio.col.fechaCreacion'),
        t('desp.col.destino'),
        t('desp.folio.col.estado'),
        t('desp.folio.col.conductor'),
        t('desp.folio.col.unidad'),
        t('desp.folios.bulk.unidadTipo'),
        t('desp.folio.col.ordenes'),
        t('desp.folio.col.cajas'),
        t('desp.folios.bulk.operador'),
        t('desp.folios.bulk.fechaSalida'),
      ],
```

- [ ] **Step 3: Add a column width entry for the new column**

Replace lines 259-262:

```javascript
    ws['!cols'] = [
      { wch: 4 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 14 },
    ]
```

with:

```javascript
    ws['!cols'] = [
      { wch: 4 }, { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 22 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 14 },
    ]
```

(New `{ wch: 24 }` inserted at position 4, matching the new Destino column's position; wider than most since it may hold a comma-separated list.)

- [ ] **Step 4: Manual verification**

With both dev servers still running from Task 1/2:

1. In Despacho > Folios, select 2-3 folios in the checkboxes (mix of `por_destino` and `por_orden` if possible).
2. Trigger the export action (the button/handler that calls `exportFoliosSelected`).
3. Open the downloaded `folios_despacho_<date>.xlsx`.
4. Confirm the header row reads: `#, Folio, Fecha Creación, Destino, Estado, Conductor, Unidad, Unidad Tipo, # Órdenes, # Cajas, Operador, Fecha Salida` (12 columns).
5. Confirm each row's Destino value matches what was shown on-screen for that same folio in Task 2's verification.

Expected: file exports successfully, header and column count match, values line up with the correct folio per row.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/Despacho/pages/Folios.jsx
git commit -m "feat(despacho): add Destino column to Folios Excel export"
```

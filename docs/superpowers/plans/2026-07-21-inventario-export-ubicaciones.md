# Inventario Export Ubicaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the two existing location columns in the Inventario > Registros "export detalles" file (single-session and bulk) to explicit names, and add a third column for the session's destination location, which is already computed by the backend but currently discarded before the file is built.

**Architecture:** Frontend-only change. Add 1 new i18n key (export-only, not shared with on-screen table headers) to `es.js`/`zh.js` for the WMS-origin column; reuse two existing i18n keys (`work_location`, `destination_location`) that are already the established UI labels for the same underlying fields elsewhere in the app. Update the header arrays and row-builder functions in `Registros.jsx` for both export code paths (single-session `handleExportDetail`, bulk `buildInvDetailRows`/`INV_DETAIL_HEADERS`). No backend or database changes — `ubicacion_codigo` is already returned by both `GET /wmshub/inventory-session/:id` and `POST /wmshub/inventory-sessions/export-detail`.

**Tech Stack:** React (JSX), `xlsx` (SheetJS) for file generation, project's own i18n `t()` lookup keyed by locale files under `frontend/src/core/stores/locales/`.

## Global Constraints

- Do NOT modify the existing i18n keys `inventario.registros.origin_location` or `inventario.escaneo.location` — they are shared with live on-screen table headers (Registros.jsx:690, Registros.jsx:752, Escaneo.jsx:1016, Escaneo.jsx:1148) and must keep their current text. (`origin_location`'s current export usage is being replaced by `work_location` in this plan — see below.)
- Do NOT modify `inventario.registros.work_location` (`Ubic. trabajo`) or `inventario.registros.destination_location` (`Ubic. destino`) — reuse them as-is. Both are already used in the session-detail modal (Registros.jsx:557-558) and `QuickCodeSearchModal.jsx:243,247`.
- The new i18n key must be added to both `es.js` and `zh.js` (the only two locale files in this project) to avoid missing-translation fallback.
- No backend or migration changes — `ubicacion_codigo` is already in both API payloads.
- Follow the existing fallback pattern for destination display already used elsewhere in this file: `sessionData.ubicacion_codigo || sessionData.ubicacion_code` (Registros.jsx:353, :558).

---

### Task 1: Add the "Ubicacion Origen WMS" i18n key

**Files:**
- Modify: `frontend/src/core/stores/locales/es.js:1766` (insert after this line)
- Modify: `frontend/src/core/stores/locales/zh.js:1820` (insert after this line)

**Interfaces:**
- Produces: one new i18n key consumed by Task 2 and Task 3 — `inventario.registros.export_ubicacion_origen_wms`

- [ ] **Step 1: Add the key to `es.js`**

Open `frontend/src/core/stores/locales/es.js`, find line 1766 (`    'inventario.registros.origin_location': 'Ubicación origen',`), and add the new key immediately after it:

```javascript
    'inventario.registros.origin_location': 'Ubicación origen',
    'inventario.registros.export_ubicacion_origen_wms': 'Ubicacion Origen WMS',
```

- [ ] **Step 2: Add the key to `zh.js`**

Open `frontend/src/core/stores/locales/zh.js`, find line 1820 (`    'inventario.registros.origin_location': '源库位',`), and add the new key immediately after it:

```javascript
    'inventario.registros.origin_location': '源库位',
    'inventario.registros.export_ubicacion_origen_wms': '库位',
```

- [ ] **Step 3: Verify the key parses and resolves**

Both files are ES modules (`export default { ... }`). Verify with a build:

Run: `cd frontend && npx vite build --mode development 2>&1 | grep -i "error" | head -20`

Expected: no output (no syntax errors reported for `es.js` or `zh.js`). This project has no unit test runner for locale files — build is the available verification.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/core/stores/locales/es.js frontend/src/core/stores/locales/zh.js
git commit -m "feat: add export-only i18n key for inventario WMS origin location column"
```

---

### Task 2: Update single-session export (`handleExportDetail`)

**Files:**
- Modify: `frontend/src/modules/Inventario/pages/Registros.jsx:462-494`

**Interfaces:**
- Consumes: i18n key from Task 1 (`inventario.registros.export_ubicacion_origen_wms`); existing keys `inventario.registros.work_location`, `inventario.registros.destination_location`; existing `sessionData.ubicacion_codigo` / `sessionData.ubicacion_code` fields (already returned by `GET /wmshub/inventory-session/:id`, confirmed at `backend/src/modules/wms/routes/wms.routes.js:2120-2121`).
- Produces: no new exports — this is a local closure inside the `Registros` modal component.

- [ ] **Step 1: Update the header row and column widths**

In `frontend/src/modules/Inventario/pages/Registros.jsx`, replace line 477:

```javascript
        [t('inventario.registros.tarima'), t('inventario.escaneo.code_1'), t('inventario.escaneo.code_2'), t('inventario.registros.origin_location'), t('inventario.escaneo.location'), t('common.status'), t('inventario.registros.scan_date')],
```

with:

```javascript
        [t('inventario.registros.tarima'), t('inventario.escaneo.code_1'), t('inventario.escaneo.code_2'), t('inventario.registros.work_location'), t('inventario.registros.export_ubicacion_origen_wms'), t('inventario.registros.destination_location'), t('common.status'), t('inventario.registros.scan_date')],
```

Then update line 489 (the `ws['!cols']` width array, currently 7 entries matching the 7 header columns) to add one more entry for the new column, replacing:

```javascript
      ws['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 22 }]
```

with:

```javascript
      ws['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 22 }]
```

- [ ] **Step 2: Insert the destination-location value into each row**

Replace lines 478-486:

```javascript
        ...scans.map(sc => [
          tarimaCodeByRaw[normalizeTarimaGroupKey(sc.group_assignment, sectionCode)] || formatTarimaCode(sc.group_assignment, sectionCode, 0),
          sc.normalized_code || '',
          sc.code2 || '',
          sessionData.origin_location || '',
          sc.cell_no || '',
          sc.scan_status || '',
          sc.scanned_at ? fmtDateTime(sc.scanned_at) : '',
        ])
```

with:

```javascript
        ...scans.map(sc => [
          tarimaCodeByRaw[normalizeTarimaGroupKey(sc.group_assignment, sectionCode)] || formatTarimaCode(sc.group_assignment, sectionCode, 0),
          sc.normalized_code || '',
          sc.code2 || '',
          sessionData.origin_location || '',
          sc.cell_no || '',
          sessionData.ubicacion_codigo || sessionData.ubicacion_code || '',
          sc.scan_status || '',
          sc.scanned_at ? fmtDateTime(sc.scanned_at) : '',
        ])
```

- [ ] **Step 3: Manual verification**

Run the frontend dev server: `cd frontend && npm run dev`

In the browser:
1. Navigate to Inventario > Registros.
2. Open a session that has an assigned `ubicacion_id` (destino) — check the session detail modal already shows a value under "Ubic. destino" to confirm one exists.
3. Click "Exportar detalle" for that single session.
4. Open the downloaded `.xlsx` file and confirm the header row reads: `Tarima | Código 1 | Código 2 | Ubic. trabajo | Ubicacion Origen WMS | Ubic. destino | Estado | Fecha escaneo` (8 columns) and that the "Ubic. destino" column is populated with the same value shown in the session modal.
5. Repeat with a session that has NO destino assigned — confirm the "Ubic. destino" column is present but blank, and the file still opens without errors.

Expected: file exports successfully in both cases, header and column count match, no console errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/Inventario/pages/Registros.jsx
git commit -m "feat: add ubicacion destino column to single-session inventario export"
```

---

### Task 3: Update bulk export (`INV_DETAIL_HEADERS` / `buildInvDetailRows`)

**Files:**
- Modify: `frontend/src/modules/Inventario/pages/Registros.jsx:1100-1136`

**Interfaces:**
- Consumes: i18n key from Task 1; existing keys `inventario.registros.work_location`, `inventario.registros.destination_location`; `s.ubicacion_codigo` / `s.ubicacion_code` on each session object in `data.sessions[]` (already returned by `POST /wmshub/inventory-sessions/export-detail`, confirmed at `backend/src/modules/wms/routes/wms.routes.js:2177-2178`).
- Produces: no new exports — `INV_DETAIL_HEADERS`, `INV_DETAIL_COLS`, `buildInvDetailRows` remain local to the `Registros` component, consumed by `handleBulkExport` in the same file (unchanged call site).

- [ ] **Step 1: Update `INV_DETAIL_HEADERS` and `INV_DETAIL_COLS`**

Replace lines 1100-1113:

```javascript
  const INV_DETAIL_HEADERS = [
    t('inventario.registros.section'),
    t('inventario.registros.type'),
    t('inventario.registros.operator'),
    t('inventario.registros.tarima'),
    t('inventario.escaneo.code_1'),
    t('inventario.escaneo.code_2'),
    t('inventario.registros.origin_location'),
    t('inventario.escaneo.location'),
    t('common.status'),
    t('inventario.registros.scan_date'),
  ]
  const INV_DETAIL_COLS = [
    { wch: 22 }, { wch: 14 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 22 },
  ]
```

with:

```javascript
  const INV_DETAIL_HEADERS = [
    t('inventario.registros.section'),
    t('inventario.registros.type'),
    t('inventario.registros.operator'),
    t('inventario.registros.tarima'),
    t('inventario.escaneo.code_1'),
    t('inventario.escaneo.code_2'),
    t('inventario.registros.work_location'),
    t('inventario.registros.export_ubicacion_origen_wms'),
    t('inventario.registros.destination_location'),
    t('common.status'),
    t('inventario.registros.scan_date'),
  ]
  const INV_DETAIL_COLS = [
    { wch: 22 }, { wch: 14 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 22 },
  ]
```

- [ ] **Step 2: Insert the destination-location value into `buildInvDetailRows`**

Replace lines 1122-1133:

```javascript
      scans.forEach((sc) => {
        const key = normalizeTarimaGroupKey(sc.group_assignment, sectionCode)
        rows.push([
          sectionCode, tipo, s.operator_nombre || '',
          tarimaCodeByRaw[key] || sectionCode,
          sc.normalized_code || '', sc.code2 || '',
          s.origin_location || '',
          sc.cell_no || '',
          sc.scan_status || '',
          sc.scanned_at ? fmtDateTime(sc.scanned_at) : '',
        ])
      })
```

with:

```javascript
      scans.forEach((sc) => {
        const key = normalizeTarimaGroupKey(sc.group_assignment, sectionCode)
        rows.push([
          sectionCode, tipo, s.operator_nombre || '',
          tarimaCodeByRaw[key] || sectionCode,
          sc.normalized_code || '', sc.code2 || '',
          s.origin_location || '',
          sc.cell_no || '',
          s.ubicacion_codigo || s.ubicacion_code || '',
          sc.scan_status || '',
          sc.scanned_at ? fmtDateTime(sc.scanned_at) : '',
        ])
      })
```

- [ ] **Step 3: Manual verification**

With the dev server still running (`npm run dev` from Task 2):

1. Navigate to Inventario > Registros.
2. Select 2-3 sessions in the list checkboxes, including at least one with a destino assigned and one without.
3. Click the bulk "Exportar detalle" action.
4. Open the downloaded `inventario_registros_detalle_<date>.xlsx` and confirm the header row reads: `Sección | Tipo | Operador | Tarima | Código 1 | Código 2 | Ubic. trabajo | Ubicacion Origen WMS | Ubic. destino | Estado | Fecha escaneo` (11 columns).
5. Confirm rows for the session with a destino show the correct `Ubic. destino` value, and rows for the session without one are blank in that column but every other column is still populated correctly.

Expected: file exports successfully, header and column count match, values line up with the correct session per row.

- [ ] **Step 4: Confirm on-screen tables are unaffected**

1. In the same Registros page (not export), check the visible table column header at Registros.jsx:752 still reads the original text (from `inventario.escaneo.location`, unchanged).
2. Open a session detail modal (`th` at Registros.jsx:690) and confirm its scans table header also still reads the original text.
3. Navigate to Inventario > Escaneo (the live scanning page) and confirm its table headers (Escaneo.jsx:1016, :1148) are unchanged.

Expected: no visible UI text changed outside the two export files.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/Inventario/pages/Registros.jsx
git commit -m "feat: add ubicacion destino column to bulk inventario export"
```

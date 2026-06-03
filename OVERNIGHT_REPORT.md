# Overnight Audit Report — Inventario & Surtido Modules

**Date:** 2026-06-03  
**Commit:** 01f65e5a

---

## OBJECTIVE 1 — Functional gaps fixed

### Inventario `Escaneo.jsx`
- Added `ubicacionId` state to main component.
- Added `useQuery(['upapex-ubicaciones', 'inventario'])` to load filtered locations.
- `SessionSummaryModal` now accepts `ubicaciones`, `ubicacionId`, `setUbicacionId` props and renders a `<select>` when locations are available.
- `saveSessionMut` passes `ubicacion_id` to `POST /api/upapex/inventory-session`.
- On save success, `ubicacionId` is reset.

### Surtido `Validacion.jsx`
- Added `finalUbicacionId` state.
- Added `useQuery(['upapex-ubicaciones', 'surtido'])` to load filtered locations.
- Finalize modal now renders a `<select>` from `ubicacionesData.data` when available.
- `finalizeMut` passes `ubicacion_id` to `PUT /api/upapex/scan-session/:id`.
- On success, `finalUbicacionId` is reset.

---

## OBJECTIVE 2 — Shared ubicaciones system

### Backend changes

| File | Change |
|---|---|
| `backend/src/server.js` | Migration 043: `ALTER TABLE dev_ubicaciones ADD COLUMN IF NOT EXISTS modulo_uso TEXT[] DEFAULT ARRAY['todos']` |
| `backend/src/server.js` | Migration 044: `ubicacion_id UUID` FK added to both `inv_sessions` and `pick_sessions` |
| `backend/src/modules/upapex/routes/upapex.routes.js` | New `GET /api/upapex/ubicaciones?modulo=` route — tenant-scoped, filters by `modulo_uso @> ARRAY['todos'] OR modulo_uso @> ARRAY[$modulo]` |
| `backend/src/modules/upapex/routes/upapex.routes.js` | `POST /inventory-session` destructures and saves `ubicacion_id` |
| `backend/src/modules/upapex/routes/upapex.routes.js` | `PUT /scan-session/:id` destructures and applies `ubicacion_id` via dynamic field builder |

### Frontend changes

| File | Change |
|---|---|
| `frontend/src/modules/wmshub/services/wmsHubService.js` | Added `getUbicaciones(modulo)` — `GET /api/upapex/ubicaciones?modulo=` |
| `frontend/src/modules/inventario/pages/Escaneo.jsx` | Imports and uses `getUbicaciones('inventario')` |
| `frontend/src/modules/surtido/pages/Validacion.jsx` | Imports and uses `getUbicaciones('surtido')` |

**Default behavior:** locations with `modulo_uso = ARRAY['todos']` (the default) are returned for all modules. Administrators can later tag specific locations as `ARRAY['inventario']` or `ARRAY['surtido']` via the Devoluciones Administración UI to restrict visibility.

---

## OBJECTIVE 3 — UI consistency

Audited all pages in `modules/inventario/` and `modules/surtido/` for:
- Off-palette colors (`bg-blue-*`, `bg-gray-*`, `text-gray-*`) — **none found**
- All pages use `.card`, `.btn-primary`, `.input-field`, `btn-ghost`, `.badge` classes consistently
- Scan feedback panels use the established `bg-success-50/border-success-200`, `bg-warning-50/border-warning-200`, `bg-danger-50/border-danger-200` pattern
- No UI regressions introduced by this commit

---

## OBJECTIVE 4 — zh-CN / es translations

### Keys added to `i18nStore.js`

**Inventario — Escaneo (both zh + es):**
- `inventario.escaneo.session_types_card`
- `inventario.escaneo.scans_label`
- `inventario.escaneo.ok_abbr`
- `inventario.escaneo.blocked_abbr`
- `inventario.escaneo.nowms_abbr`
- `inventario.escaneo.time_label`
- `inventario.escaneo.last_scan`
- `inventario.escaneo.ubicacion_label`
- `inventario.escaneo.ubicacion_placeholder`

**Surtido — Validacion (both zh + es):**
- `surtido.escaneo.recount_success`
- `surtido.validacion.in_progress`
- `surtido.validacion.valid_abbr`
- `surtido.validacion.pending_abbr`
- `surtido.validacion.rejected_abbr`
- `surtido.validacion.time_label`
- `surtido.validacion.history_title`
- `surtido.validacion.history_empty`
- `surtido.validacion.all_complete`
- `surtido.validacion.ubicacion_label`
- `surtido.validacion.ubicacion_placeholder`

### Hardcoded strings replaced

**Inventario Escaneo.jsx (7 replaced):**
- `"Tipos de sesión"` → `t('inventario.escaneo.session_types_card')`
- `"escaneos"` → `t('inventario.escaneo.scans_label')`
- `"Disp."` → `t('inventario.escaneo.ok_abbr')`
- `"Bloq."` → `t('inventario.escaneo.blocked_abbr')`
- `"Sin WMS"` → `t('inventario.escaneo.nowms_abbr')`
- `"Tiempo"` → `t('inventario.escaneo.time_label')`
- `"Último escaneo"` → `t('inventario.escaneo.last_scan')`

**Surtido Validacion.jsx (9 replaced):**
- `'Reconteo reiniciado'` → `t('surtido.escaneo.recount_success')`
- `"Validación en curso"` → `t('surtido.validacion.in_progress')`
- `"Valid."` → `t('surtido.validacion.valid_abbr')`
- `"Pend."` → `t('surtido.validacion.pending_abbr')`
- `"Rech."` → `t('surtido.validacion.rejected_abbr')`
- `"Tiempo"` → `t('surtido.validacion.time_label')`
- `"Últimos escaneos"` → `t('surtido.validacion.history_title')`
- `"Sin escaneos aún"` → `t('surtido.validacion.history_empty')`
- `"Todo completo"` → `t('surtido.validacion.all_complete')`

---

## Build verification

```
✓ 2759 modules transformed.
✓ built in 4.97s
```

No compilation errors. Only pre-existing chunk-size warnings unrelated to this work.

---

## Out of scope (not changed)

- DropScan, Devoluciones core logic, Folios — untouched as instructed
- Vanilla `track` and `dispatch` apps — not ported per plan directive
- `dev_ubicaciones` CRUD UI changes — the `modulo_uso` column is added but the Administración UI to edit it is the Devoluciones team's concern; the filter works with the default `ARRAY['todos']` out of the box

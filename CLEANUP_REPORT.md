# Kirion WMS Module Cleanup Report

## Summary

Audit and refactor of the WMS module — eliminated the "upapex" branding from all user-facing surfaces, established Inventario and Surtido as standalone top-level modules, and consolidated WMS connection under the Sistema section.

---

## Files Deleted

| File | Reason |
|------|--------|
| `frontend/src/pages/WmsHub.jsx` | Old WMS connection page using `app_key + app_secret + base_url` via `/api/wms/credentials`. Superseded by `modules/wmshub/pages/Configuracion.jsx` (app_key only, `wms_config` table). |
| `frontend/src/core/services/wmsHubService.js` | Service for deleted WmsHub.jsx (`getWmsCredentials`, `saveWmsCredentials`, `testWmsConnection`). No other consumers. |

---

## Files Modified

### `frontend/src/core/components/layout/Sidebar.jsx`
- Removed standalone `wmshub` section from `getNavItems()` — WMS config is now an admin-only nav item
- Updated inventario permission keys: `upapex.inventario` → `inventario.escaneo` / `inventario.registros`
- Updated surtido: primary scan route `/surtido/validacion` → `/surtido/escaneo`, permissions `upapex.*` → `surtido.*`
- Renamed Sistema section label to use `t('nav.system')`
- Admin nav: replaced `/wms` (`global.wms`) with `/wmshub` (`sistema.wms`), label `t('nav.wms.config')`

### `frontend/src/App.jsx`
- Removed `import WmsHub` (deleted file)
- Renamed import alias `SurtidoValidacion` → `SurtidoEscaneo` (component file unchanged: `Validacion.jsx`)
- Updated MODULE_ROUTES: removed `upapex.*` entries, added `inventario.*`, `surtido.*`, `sistema.wms`
- `/wmshub` route permission: `upapex.hub` → `sistema.wms`
- `/surtido/escaneo` is now primary route (was redirect); `/surtido/validacion` is now the redirect
- Inventario routes: `upapex.inventario` → `inventario.registros` / `inventario.escaneo`
- Removed old `/wms` route block

### `frontend/src/pages/Administracion.jsx`
- Replaced "Upapex WMS" MODULE_GROUP with two new groups:
  - **Inventario WMS**: `inventario.escaneo`, `inventario.registros`, `inventario.admin`
  - **Surtido**: `surtido.ordenes`, `surtido.escaneo`, `surtido.registros`, `surtido.assign`, `surtido.admin`
- Sistema group: `global.wms` → `sistema.wms` (label: "Conexión WMS")

### `backend/src/modules/upapex/routes/upapex.routes.js`
All `requirePermission` calls updated — `upapex.*` eliminated from middleware:

| Endpoint | Old permission | New permission |
|----------|---------------|---------------|
| GET/POST `/config`, `/test-connection` | `upapex.hub` | `sistema.wms` |
| GET `/box-stock`, `/integrated-inventory` | `upapex.inventario` | `inventario.escaneo` |
| POST `/inventory-session` | `upapex.inventario` | `inventario.escaneo` |
| GET `/inventory-sessions`, `/inventory-session/:id` | `upapex.inventario` | `inventario.registros` |
| DELETE `/inventory-session/:id` | `upapex.inventario` | `inventario.admin` |
| GET `/outbound-list`, `/outbound-detail/:id` | `upapex.surtido` | `surtido.ordenes` |
| POST/PUT `/scan-session`, POST `/scan-event` | `upapex.surtido` | `surtido.escaneo` |
| GET `/scan-sessions`, `/scan-session/:id` | `upapex.surtido` | `surtido.registros` |
| GET `/surtidores`, GET `/order-tracking/:id` | `upapex.surtido` | `surtido.ordenes` |
| POST `/surtidores`, PUT `/order-tracking/:id` | `upapex.surtido` | `surtido.assign` |
| DELETE `/surtidores/:id` | `upapex.surtido` | `surtido.admin` |
| DELETE `/scan-session/:id/events` | `upapex.surtido` | `surtido.escaneo` |

### `backend/src/server.js`
Added migration step 041 (runs before RLS step 040) to backfill new permission keys from existing `upapex.*` JSONB data:
- Copies `upapex.inventario` → `inventario.escaneo`, `inventario.registros`
- Sets `inventario.admin = eliminar` only if prior level was `eliminar`, else `sin_acceso`
- Copies `upapex.surtido` → `surtido.ordenes`, `surtido.escaneo`, `surtido.registros`, `surtido.assign`
- Sets `surtido.admin = eliminar` only if prior level was `eliminar`, else `sin_acceso`
- Sets `sistema.wms` from `upapex.hub`
- Backfills default permissions for standard roles (Administrador, Jefe, Operador) if not already present
- All migration steps are idempotent (guarded with `WHERE NOT (permisos ? 'inventario')` etc.)

---

## Permission Key Map

| Old key | New key | Notes |
|---------|---------|-------|
| `upapex.hub` | `sistema.wms` | WMS connection config |
| `upapex.inventario` | `inventario.escaneo` | Scan operations |
| `upapex.inventario` | `inventario.registros` | View sessions |
| `upapex.inventario` (eliminar only) | `inventario.admin` | Delete sessions |
| `upapex.surtido` | `surtido.ordenes` | View orders |
| `upapex.surtido` | `surtido.escaneo` | Scan validation |
| `upapex.surtido` | `surtido.registros` | View scan sessions |
| `upapex.surtido` | `surtido.assign` | Assign pickers |
| `upapex.surtido` (eliminar only) | `surtido.admin` | Admin actions |
| `global.wms` | `sistema.wms` | (frontend nav only; backend `wms.routes.js` still uses `global.wms` — orphaned endpoint) |

---

## Module Status

### Inventario
- **Routes**: `/inventario/registros`, `/inventario/escaneo`
- **Permissions**: `inventario.escaneo`, `inventario.registros`, `inventario.admin`
- **Backend**: `upapex.routes.js` handles all inventory endpoints
- **Status**: Standalone top-level module — working

### Surtido
- **Routes**: `/surtido` (ordenes), `/surtido/escaneo`, `/surtido/registros`
- **Redirect**: `/surtido/validacion` → `/surtido/escaneo` (legacy URL support)
- **Permissions**: `surtido.ordenes`, `surtido.escaneo`, `surtido.registros`, `surtido.assign`, `surtido.admin`
- **Backend**: `upapex.routes.js` handles all surtido endpoints
- **Status**: Standalone top-level module — working

### Sistema / Conexión WMS
- **Route**: `/wmshub`
- **Component**: `modules/wmshub/pages/Configuracion.jsx` (unchanged)
- **Permission**: `sistema.wms`
- **Backend**: `/api/upapex/config`, `/api/upapex/test-connection`
- **Status**: Moved to Sistema admin section — working

### DropScan
- **No changes** — untouched by this refactor

### Devoluciones
- **No changes** — untouched by this refactor

---

## Orphaned / Deferred Items

| Item | Status | Notes |
|------|--------|-------|
| `backend/src/core/routes/wms.routes.js` | Orphaned backend | Still uses `global.wms` permission. Frontend consumer deleted. Route is harmless but can be removed in a future cleanup. |
| `upapex.*` JSONB keys in DB | Preserved | Migration copies to new keys but does not delete old `upapex.*` keys. Safe to remove via a future `UPDATE roles SET permisos = permisos - 'upapex'` after confirming all tenants have migrated. |

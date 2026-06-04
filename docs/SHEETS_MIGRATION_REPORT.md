# Google Sheets Migration Report

**Date:** 2026-06-04
**Branch:** main

## Summary

Replaced the xlwms OpenAPI integration with a Google Sheets CSV data source for
inventory (箱库存) and outbound orders (大货出库单). The original WMS API credentials
were valid and HMAC signing was confirmed working, but the account lacked
warehouse-level permissions (`whCode`), causing empty results.

## What Changed

### Backend

| File | Change |
|------|--------|
| `backend/migrations/039_wms_sheet_config.sql` | Added `sheet_inventory_url` and `sheet_outbound_url` columns to `wms_config` |
| `backend/src/modules/upapex/routes/upapex.routes.js` | `GET /config` now returns sheet URLs; added `PUT /config/sheets` and `GET /proxy/sheet` |

### Frontend services

| File | Change |
|------|--------|
| `frontend/src/modules/wmshub/services/googleSheetsService.js` | NEW — RFC 4180 CSV parser, fuzzy header mapping, 5-min cache, `getInventoryList`, `getOutboundList`, `getOutboundDetail`, `testSheetUrl`, `refreshSheet`, `getCacheTimestamp` |
| `frontend/src/modules/wmshub/services/wmsHubService.js` | Added `saveSheetConfig` |
| `frontend/src/modules/inventario/services/inventarioService.js` | `getBoxStock` now delegates to `googleSheetsService.getInventoryList` |
| `frontend/src/modules/surtido/services/surtidoService.js` | `getOutboundList` and `getOutboundDetail` now delegate to `googleSheetsService` |
| `frontend/src/modules/inventario/hooks/useBoxStock.js` | Removed stale `params` passthrough; updated `queryKey` and `staleTime` to 5 min |

### Frontend UI

| File | Change |
|------|--------|
| `frontend/src/modules/wmshub/pages/Configuracion.jsx` | Added Google Sheets card with URL inputs, "Probar" test buttons, save action |
| `frontend/src/modules/surtido/pages/Ordenes.jsx` | Added refresh button with "Datos al [timestamp]" in header |
| `frontend/src/core/stores/i18nStore.js` | Added 13 i18n keys in zh and es for Google Sheets UI |

### Archive

| File | Content |
|------|---------|
| `docs/archive/wms-api-integration.archived.js` | Original xlwms API client with README block explaining architecture, HMAC signing, and re-activation steps |

## Architecture

```
Browser
  └── googleSheetsService.js
        ├── Direct CORS fetch → https://docs.google.com/spreadsheets/d/e/.../pub?output=csv
        └── Fallback: GET /api/upapex/proxy/sheet?url= (backend proxies the fetch)

Cache: module-level Map, TTL 5 minutes per type (inventory / outbound)

Column mapping: fuzzy header normalization (Unicode NFD, lowercase, _ for spaces)
with alias tables covering Chinese, Spanish, and English header variants.

Response shapes: identical to xlwms API so no consuming-code changes were needed
beyond removing the `params` argument from getBoxStock/getOutboundList.
```

## Google Sheets Setup (per tenant)

1. Open the sheet in Google Sheets
2. File > Share > Publish to web > Select sheet > CSV format > Publish
3. Copy the published CSV URL
4. In the app: Sistema > Conexion WMS > Google Sheets section
5. Paste URL into the correct field and click "Probar" to validate
6. Click Save

## Restoring xlwms API

See `docs/archive/wms-api-integration.archived.js` for full re-activation instructions.
Requires the xlwms account to have `whCode`-level permissions assigned.

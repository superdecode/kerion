# Despacho — Dispatch Flow Design

**Date:** 2026-06-14
**Module:** `src/modules/Despacho`
**Status:** Approved

---

## 1. Context

The Despacho module has two sub-pages: Ordenes and Folios (with FolioDetalle). Currently:

- Ordenes loads all outbound orders from Google Sheets (via WmsHub) and defaults to a 30-day date range with no mandatory date gate.
- FolioDetalle has a basic scan mode for adding orders but no print functionality.
- The `POST /api/despacho/folios/:id/orders` endpoint returns 500 (to be diagnosed and fixed).
- Orders are not loading correctly — root cause to be confirmed during implementation.

Reference for UX/logic: `/Users/quiron/CascadeProjects/upapex/apps/dispatch/` (vanilla JS legacy app).

---

## 2. Architecture

### New files

```
src/modules/Despacho/
  components/
    IniciarDespachoModal.jsx     # mandatory date gate on first access
    ScanDispatchModal.jsx        # barcode scan modal
    DispatchQuantityModal.jsx    # bultos input + folio selector/creator
    AgendaView.jsx               # full-screen agenda overlay (grouped by customer)
  utils/
    despachoSession.js           # sessionStorage helpers (get/set/clear dates)
    printFolio.js                # generates print HTML, calls window.print()
```

### Modified files

- `Ordenes.jsx` — date gate logic, Iniciar Despacho button, truck quick-action per row, Agenda toggle
- `FolioDetalle.jsx` — print button in header
- `despachoService.js` — no new endpoints required; reuses `getFolios`, `createFolio`, `addOrder`, `findOrderByBarcode`
- Backend `folios.routes.js` — fix 500 error on `POST /:id/orders`

---

## 3. Session Storage

Key: `kirion_despacho_dates`
Shape: `{ dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }`

Helper module `despachoSession.js` exports:
- `getDespachoDates()` → `{ dateFrom, dateTo } | null`
- `setDespachoDates(dateFrom, dateTo)` → void
- `clearDespachoDates()` → void

Dates persist within the browser session (cleared on tab/browser close). Cleared when the user clicks "Limpiar" in the filter bar.

---

## 4. Ordenes Page — Date Gate Flow

On mount:
1. Read `getDespachoDates()` from sessionStorage.
2. If dates exist → restore `dateFrom` / `dateTo` state, load orders normally.
3. If no dates → show `IniciarDespachoModal` (blocks the view, no cancel button).

`IniciarDespachoModal`:
- Two date inputs: Fecha inicio, Fecha fin (same day allowed).
- "Iniciar" button → `setDespachoDates(...)`, sets component state, closes modal.
- No cancel option — dates are mandatory to use the module.

"Limpiar" button in filter bar:
- Calls `clearDespachoDates()` in addition to clearing local filter state.
- After clearing, `IniciarDespachoModal` reappears.

Date filter behaviour change:
- Remove the 30-day default (`subtractDays(getToday(), 29)`).
- Initial state: `dateFrom = ''`, `dateTo = ''`.
- The existing date inputs in the filter bar still allow manual adjustment after the gate modal.

---

## 5. Ordenes Page — New UI Elements

### Iniciar Despacho button (header, right side)
- Primary button, scan icon + label "Iniciar Despacho".
- Disabled when no orders are loaded.
- Opens `ScanDispatchModal`.
- Permission: `despacho.folios` crear.

### Agenda button (header, right side)
- Secondary button, calendar icon + label "Agenda".
- Disabled when no orders are loaded.
- Sets `showAgenda = true` which renders `AgendaView` over the table.

### Truck icon per table row
- New rightmost column header: empty (icon only).
- Button: `<Truck />` icon.
- Visible only to users with `despacho.folios` crear permission.
- On click → opens `DispatchQuantityModal` pre-filled with that order.

---

## 6. ScanDispatchModal

Triggered by: "Iniciar Despacho" button.

Behaviour:
1. Modal opens, input auto-focuses.
2. On Enter key (or 400 ms debounce after last keystroke):
   a. Search `filtered` orders array by exact `outboundOrderNo`.
   b. If no match → call `findOrderByBarcode(input)` (searches `logisticsTrackNo`, `thirdOrderNo`, `customizeCode` against Google Sheets).
   c. If barcode match is found but the order is NOT in `filtered` → show error "Orden fuera del rango de fechas activo", clear input.
   d. If match found and in range → open `DispatchQuantityModal` with the order data.
   e. If no match at all → show inline "No encontrada", clear input.
3. `DispatchQuantityModal` closes independently; scan modal stays open for next scan.
4. Modal has a Cerrar button.

Layout:
- Large monospace text input, placeholder "Escanear codigo...".
- Status line below input: idle / buscando / encontrada / no encontrada.

---

## 7. DispatchQuantityModal

Triggered by: successful scan result, or truck icon on a table row.

Content:
- Read-only: order number (monospace), customer name.
- Number input: "Bultos a despachar" — pre-filled with `outboundBoxCount ?? 1`.
- Folio selector:
  - Lists active folios (`estado IN ['borrador','en_proceso']`) from `getFolios({})`, filtered client-side.
  - Display: `folio_numero — conductor_nombre — unidad_placa`.
  - Plus an "Crear nuevo folio" option at the top.
- If "Crear nuevo folio" selected: inline conductor select + unidad select (already loaded in Ordenes via existing queries).
- "Despachar" button:
  - If new folio: calls `createFolio({ conductor_id, unidad_id })`, then `addOrder(newFolioId, payload)`.
  - If existing folio: calls `addOrder(folioId, { outbound_order_no, cliente, bultos })`.
  - On success: toast "Orden agregada al folio X", close modal, refetch `despacho-ordenes-dispatch`.
  - On error: show inline error message, do not close.

---

## 8. AgendaView

Full-screen overlay rendered inside Ordenes (controlled by `showAgenda` boolean state). Matches UPA pex `vista-agenda-content` behaviour.

Header:
- Date range label (inherited from active filter).
- Total orders count badge, total bultos count badge.
- "Imprimir Agenda" button.
- "Volver" button → sets `showAgenda = false`.

Body:
- Search/filter input.
- Orders from `filtered` (already computed in Ordenes) grouped by `customerName`.
- Per group card: group header ("DESTINO: CustomerName"), table with columns:
  - Horario (`outboundTime` formatted as HH:mm, or "—").
  - Orden (`outboundOrderNo`).
  - Bultos (`outboundBoxCount`).
  - Estado despacho (from `dispatchMap`: Pendiente / Cargado / Entregado / Sin folio).
- Group footer: subtotal ordenes + subtotal bultos.

Print:
- `window.print()` with a `@media print` stylesheet that hides everything except the agenda content.
- Same visual style as UPA pex resumen-entrega-module.

---

## 9. Print Folio (FolioDetalle)

New "Imprimir" button in the FolioDetalle header (alongside the existing edit/cancel buttons).

`printFolio.js` utility:
- Accepts `{ folio, orders }` (already available in FolioDetalle).
- Generates HTML string:
  - Title: "FOLIO DE DESPACHO"
  - Header grid: folio_numero, conductor_nombre, unidad_placa, fecha_salida, operador_nombre.
  - Orders table: #, outbound_order_no, cliente, bultos, peso_kg, estado.
  - Totals row: total orders, sum(bultos), sum(peso_kg).
  - Signature zone: Conductor / Recibe (blank lines).
  - Rejection detail table: 16 blank rows (code, qty, observation) — same as UPA pex.
- Opens `window.open()` popup, writes HTML, calls `popup.print()`, closes popup on afterprint.

---

## 10. Backend Fix — POST /folios/:id/orders 500 Error

Investigation steps during implementation:
1. Check if migration 059 has been applied: `SELECT * FROM schema_migrations WHERE version = '059'`.
2. If not applied, run migration manually.
3. Verify `req.tQuery` and `req.tenantId` are available in the despacho route context.
4. Check for constraint violations or type mismatches in the INSERT.
5. Add structured error logging to pinpoint the exact failure.

---

## 11. Error Handling

- Scan: inline status messages, never throws toasts for scan misses.
- DispatchQuantityModal: inline error on API failure, modal stays open.
- AgendaView: shows empty state if `filtered` is empty.
- Print: if `orders` is empty, shows toast "No hay ordenes para imprimir" and aborts.

---

## 12. Permissions

- `IniciarDespachoModal` + date gate: no permission required (all despacho users need dates).
- "Iniciar Despacho" scan button + truck icon: `despacho.folios` crear.
- "Agenda" button: `despacho.ordenes` ver.
- "Imprimir" in FolioDetalle: `despacho.folios` ver.

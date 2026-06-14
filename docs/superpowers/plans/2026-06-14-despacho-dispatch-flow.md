# Despacho — Dispatch Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mandatory date-gated order loading, barcode scan dispatch flow, agenda view, and folio print to the Kirion Despacho module, plus fix the backend 500 error on addOrder.

**Architecture:** Approach A — local state + sessionStorage. New components live in `src/modules/Despacho/components/`. Ordenes.jsx is updated to gate on dates, host all modals, and render AgendaView as a full-screen overlay. No new routes or stores.

**Tech Stack:** React 18, Vite, @tanstack/react-query, lucide-react, framer-motion, Tailwind CSS with existing utility classes, Node.js/Express backend, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-06-14-despacho-dispatch-design.md`

---

## File Map

| Action | File |
|--------|------|
| Fix | `backend/src/modules/despacho/routes/folios.routes.js` |
| Create | `frontend/src/modules/Despacho/utils/despachoSession.js` |
| Create | `frontend/src/modules/Despacho/utils/printFolio.js` |
| Create | `frontend/src/modules/Despacho/components/IniciarDespachoModal.jsx` |
| Create | `frontend/src/modules/Despacho/components/DispatchQuantityModal.jsx` |
| Create | `frontend/src/modules/Despacho/components/ScanDispatchModal.jsx` |
| Create | `frontend/src/modules/Despacho/components/AgendaView.jsx` |
| Modify | `frontend/src/modules/Despacho/pages/Ordenes.jsx` |
| Modify | `frontend/src/modules/Despacho/pages/FolioDetalle.jsx` |

---

## Task 1: Fix backend 500 on POST /folios/:id/orders

**Files:**
- Check: `backend/migrations/059_despacho_module.sql`
- Fix: `backend/src/modules/despacho/routes/folios.routes.js`

- [ ] **Step 1.1: Check if migration 059 is applied**

From the `kirion/backend` directory run:

```bash
node -e "
import('./src/config/database.js').then(async ({ pool }) => {
  const r = await pool.query(\"SELECT version FROM schema_migrations WHERE version = '59'\")
  console.log('Applied:', r.rows.length > 0)
  pool.end()
}).catch(e => { console.error(e.message); process.exit(1) })
"
```

If output is `Applied: false`, proceed to Step 1.2. If `true`, skip to Step 1.4.

- [ ] **Step 1.2: Run migration 059**

From the `kirion/backend` directory:

```bash
node scripts/run-migration.js
```

Expected output ends with `Applied: 1, Skipped: N`.

- [ ] **Step 1.3: Verify tables exist**

```bash
node -e "
import('./src/config/database.js').then(async ({ pool }) => {
  const r = await pool.query(\"SELECT table_name FROM information_schema.tables WHERE table_name IN ('dispatch_folios','dispatch_folio_orders','dispatch_conductores','dispatch_unidades') AND table_schema='public'\")
  console.log(r.rows.map(r => r.table_name))
  pool.end()
})
"
```

Expected: all 4 table names printed.

- [ ] **Step 1.4: Add structured error logging to addOrder route**

In `backend/src/modules/despacho/routes/folios.routes.js`, find the `POST /:id/orders` catch block (line ~223) and replace:

```js
// BEFORE
    } catch (error) {
      console.error('Add order to folio error:', error)
      res.status(500).json({ error: 'Error agregando orden al folio' })
    }
```

```js
// AFTER
    } catch (error) {
      console.error('Add order to folio error:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        constraint: error.constraint,
        table: error.table,
      })
      res.status(500).json({ error: 'Error agregando orden al folio', detail: error.message })
    }
```

- [ ] **Step 1.5: Test the endpoint manually**

Start the backend (`npm run dev` in `kirion/backend`), then:

```bash
# Replace TOKEN and FOLIO_ID with real values from your dev environment
curl -s -X POST http://localhost:3002/api/despacho/folios/FOLIO_ID/orders \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: TENANT_ID" \
  -d '{"outbound_order_no":"TEST-001","bultos":1}' | jq .
```

Expected: `{"folio": {...}, "orders": [...], "added_order_id": "..."}` with status 201.
If still 500: read `detail` in response and fix accordingly.

- [ ] **Step 1.6: Commit**

```bash
git add backend/src/modules/despacho/routes/folios.routes.js
git commit -m "fix: improve error logging on despacho addOrder endpoint"
```

---

## Task 2: Create despachoSession.js

**Files:**
- Create: `frontend/src/modules/Despacho/utils/despachoSession.js`

- [ ] **Step 2.1: Create the file**

```js
// frontend/src/modules/Despacho/utils/despachoSession.js
const KEY = 'kirion_despacho_dates'

export function getDespachoDates() {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setDespachoDates(dateFrom, dateTo) {
  sessionStorage.setItem(KEY, JSON.stringify({ dateFrom, dateTo }))
}

export function clearDespachoDates() {
  sessionStorage.removeItem(KEY)
}
```

- [ ] **Step 2.2: Commit**

```bash
git add frontend/src/modules/Despacho/utils/despachoSession.js
git commit -m "feat: add despacho session storage utility"
```

---

## Task 3: Create printFolio.js

**Files:**
- Create: `frontend/src/modules/Despacho/utils/printFolio.js`

- [ ] **Step 3.1: Create the utility**

```js
// frontend/src/modules/Despacho/utils/printFolio.js

function fmtPrint(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function printFolio({ folio, orders }) {
  if (!orders.length) return { success: false, message: 'No hay órdenes para imprimir' }

  const totalBultos = orders.reduce((s, o) => s + (Number(o.bultos) || 0), 0)
  const totalPeso   = orders.reduce((s, o) => s + (Number(o.peso_kg) || 0), 0)

  const orderRows = orders.map((o, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td class="col-mono">${o.outbound_order_no || '—'}</td>
      <td>${o.cliente || '—'}</td>
      <td class="col-center">${o.bultos ?? '—'}</td>
      <td class="col-center">${o.peso_kg != null ? Number(o.peso_kg).toFixed(2) : '—'}</td>
      <td>${o.estado || 'pendiente'}</td>
    </tr>`).join('')

  const rejectionRows = Array.from({ length: 16 }, (_, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td></td><td></td><td></td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Folio ${folio.folio_numero}</title>
  <style>
    @page { size: letter; margin: 15mm; }
    body { font-family: 'Segoe UI', sans-serif; font-size: 10pt; color: #334155; }
    .header { border: 1px solid #fed7aa; margin-bottom: 12px; }
    .header-title { background: #ffedd5; color: #9a3412; padding: 6px; text-align: center; font-weight: 700; font-size: 11pt; letter-spacing: .5px; }
    .header-row { display: flex; border-top: 1px solid #fed7aa; }
    .header-cell { flex: 1; padding: 5px 8px; border-right: 1px solid #fed7aa; }
    .header-cell:last-child { border-right: none; }
    .header-label { font-weight: 600; color: #78716c; font-size: 8.5pt; display: block; }
    .header-value { font-weight: 700; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #fed7aa; margin-bottom: 14px; }
    th { background: #fff7ed; color: #78716c; padding: 5px 6px; font-size: 8.5pt; font-weight: 600; border-bottom: 1px solid #fed7aa; text-transform: uppercase; text-align: left; }
    td { padding: 5px 6px; border-bottom: 1px solid #fee2ca; font-size: 9pt; }
    tr:nth-child(even) td { background: #fffbeb; }
    .col-num { width: 28px; text-align: center; }
    .col-mono { font-family: monospace; font-weight: 600; color: #1e3a5f; }
    .col-center { text-align: center; }
    tfoot td { background: #ffedd5 !important; font-weight: 700; font-size: 9pt; padding: 6px; }
    .section-title { background: #ffedd5; color: #9a3412; padding: 5px 8px; font-weight: 700; font-size: 10pt; border: 1px solid #fed7aa; margin-bottom: 8px; }
    .firmas { display: flex; justify-content: space-between; margin-top: 36px; }
    .firma { flex: 1; text-align: center; }
    .firma-line { border-top: 1px solid #334155; margin: 55px 24px 7px; }
    .firma-label { font-size: 8.5pt; color: #78716c; font-weight: 600; }
    .footer { margin-top: 16px; border-top: 1px solid #fed7aa; text-align: center; font-size: 8pt; color: #78716c; padding-top: 8px; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .header-title, .section-title, tfoot td { background: #ffedd5 !important; }
      th { background: #fff7ed !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">FOLIO DE DESPACHO</div>
    <div class="header-row">
      <div class="header-cell"><span class="header-label">Folio</span><span class="header-value">${folio.folio_numero}</span></div>
      <div class="header-cell"><span class="header-label">Conductor</span><span class="header-value">${folio.conductor_nombre || '—'}</span></div>
      <div class="header-cell"><span class="header-label">Unidad</span><span class="header-value">${folio.unidad_placa || '—'}</span></div>
    </div>
    <div class="header-row">
      <div class="header-cell"><span class="header-label">Fecha Salida</span><span class="header-value">${fmtPrint(folio.fecha_salida)}</span></div>
      <div class="header-cell"><span class="header-label">Operador</span><span class="header-value">${folio.operador_nombre || '—'}</span></div>
      <div class="header-cell"><span class="header-label">Estado</span><span class="header-value">${folio.estado}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th>Orden</th>
        <th>Cliente</th>
        <th class="col-center">Bultos</th>
        <th class="col-center">Peso kg</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>${orderRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3">TOTALES</td>
        <td class="col-center">${totalBultos}</td>
        <td class="col-center">${totalPeso.toFixed(2)}</td>
        <td>${orders.length} orden${orders.length !== 1 ? 'es' : ''}</td>
      </tr>
    </tfoot>
  </table>

  <div class="section-title">DETALLADO DE RECHAZOS</div>
  <table>
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th style="width:35%">Código</th>
        <th class="col-center">Cant</th>
        <th>Observación</th>
      </tr>
    </thead>
    <tbody>${rejectionRows}</tbody>
  </table>

  <div class="firmas">
    <div class="firma"><div class="firma-line"></div><div class="firma-label">Conductor — ${folio.conductor_nombre || ''}</div></div>
    <div class="firma"><div class="firma-line"></div><div class="firma-label">Recibe</div></div>
  </div>

  <div class="footer">Generado el ${new Date().toLocaleString('es-MX')} • Sistema Kirion WMS</div>
</body>
</html>`

  const popup = window.open('', '_blank', 'width=820,height=700,scrollbars=yes')
  if (!popup) return { success: false, message: 'El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.' }
  popup.document.write(html)
  popup.document.close()
  popup.onafterprint = () => popup.close()
  popup.focus()
  popup.print()
  return { success: true }
}
```

- [ ] **Step 3.2: Commit**

```bash
git add frontend/src/modules/Despacho/utils/printFolio.js
git commit -m "feat: add folio print utility"
```

---

## Task 4: Create IniciarDespachoModal

**Files:**
- Create: `frontend/src/modules/Despacho/components/IniciarDespachoModal.jsx`

This modal is non-dismissable (no Escape, no backdrop click, no cancel button). Uses a custom overlay instead of the shared `Modal` component.

- [ ] **Step 4.1: Create the component**

```jsx
// frontend/src/modules/Despacho/components/IniciarDespachoModal.jsx
import { useState } from 'react'
import { CalendarDays, Truck } from 'lucide-react'
import { setDespachoDates } from '../utils/despachoSession'

export default function IniciarDespachoModal({ isOpen, onConfirm }) {
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')

  if (!isOpen) return null

  function handleConfirm() {
    if (!from || !to) return
    setDespachoDates(from, to)
    onConfirm(from, to)
  }

  function handleFromChange(val) {
    setFrom(val)
    if (!to || val > to) setTo(val)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-primary-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Iniciar Despacho</h2>
              <p className="text-primary-200 text-xs">Selecciona el rango de fechas de entrega a despachar</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-warm-600 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              Fecha inicio
            </label>
            <input
              type="date"
              value={from}
              onChange={e => handleFromChange(e.target.value)}
              className="w-full rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-warm-600 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              Fecha fin
            </label>
            <input
              type="date"
              value={to}
              min={from}
              onChange={e => setTo(e.target.value)}
              className="w-full rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          {from && to && (
            <p className="text-xs text-primary-600 font-medium bg-primary-50 rounded-lg px-3 py-2">
              Cargará órdenes con fecha de entrega del {from} al {to}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={handleConfirm}
            disabled={!from || !to}
            className="w-full btn-primary py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Iniciar Despacho
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4.2: Commit**

```bash
git add frontend/src/modules/Despacho/components/IniciarDespachoModal.jsx
git commit -m "feat: add IniciarDespachoModal date gate component"
```

---

## Task 5: Create DispatchQuantityModal

**Files:**
- Create: `frontend/src/modules/Despacho/components/DispatchQuantityModal.jsx`

This modal receives `order` (outbound order object), `conductores`, `unidades`, and callbacks. It fetches active folios internally.

- [ ] **Step 5.1: Create the component**

```jsx
// frontend/src/modules/Despacho/components/DispatchQuantityModal.jsx
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Truck, Plus, X, CheckCircle2 } from 'lucide-react'
import Modal from '../../../core/components/common/Modal'
import { useToastStore } from '../../../core/stores/toastStore'
import { getFolios, createFolio, addOrder } from '../services/despachoService'

export default function DispatchQuantityModal({ isOpen, onClose, order, conductores = [], unidades = [] }) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()

  const [bultos, setBultos]           = useState(1)
  const [selectedFolioId, setSelectedFolioId] = useState('')
  const [createNew, setCreateNew]     = useState(false)
  const [newConductorId, setNewConductorId] = useState('')
  const [newUnidadId, setNewUnidadId] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')

  const { data: foliosData } = useQuery({
    queryKey: ['despacho-folios'],
    queryFn: () => getFolios({}),
    enabled: isOpen,
  })

  const activeFolios = (foliosData?.folios ?? []).filter(
    f => f.estado === 'borrador' || f.estado === 'en_proceso'
  )

  useEffect(() => {
    if (!isOpen) return
    setBultos(order?.outboundBoxCount ?? 1)
    setSelectedFolioId('')
    setCreateNew(false)
    setNewConductorId('')
    setNewUnidadId('')
    setError('')
  }, [isOpen, order])

  async function handleSubmit() {
    if (!order) return
    if (!createNew && !selectedFolioId) { setError('Selecciona un folio'); return }
    if (createNew && !newConductorId)   { setError('Selecciona un conductor'); return }
    if (createNew && !newUnidadId)      { setError('Selecciona una unidad'); return }
    if (!bultos || bultos < 1)          { setError('Bultos debe ser al menos 1'); return }

    setSubmitting(true)
    setError('')

    try {
      let folioId = selectedFolioId

      if (createNew) {
        const created = await createFolio({ conductor_id: newConductorId, unidad_id: newUnidadId })
        folioId = created.folio.id
      }

      await addOrder(folioId, {
        outbound_order_no: order.outboundOrderNo || order.order_no,
        cliente: order.customerName || order.cliente || '',
        bultos: Number(bultos),
      })

      await qc.invalidateQueries({ queryKey: ['despacho-ordenes-dispatch'] })
      await qc.invalidateQueries({ queryKey: ['despacho-folios'] })

      const folioNum = createNew
        ? 'nuevo folio'
        : (activeFolios.find(f => f.id === folioId)?.folio_numero ?? folioId)

      addToast({ type: 'success', message: `Orden agregada al folio ${folioNum}` })
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error ?? err.message ?? 'Error al agregar orden')
    } finally {
      setSubmitting(false)
    }
  }

  if (!order) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirmar Despacho"
      icon={Truck}
      size="sm"
      footer={
        <div className="flex gap-2 pt-4">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm" disabled={submitting}>
            <X className="w-4 h-4" /> Cancelar
          </button>
          <button onClick={handleSubmit} className="btn-primary flex-1 text-sm" disabled={submitting}>
            {submitting ? 'Despachando...' : 'Despachar'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Order info */}
        <div className="rounded-xl bg-warm-50 border border-warm-100 px-4 py-3 space-y-1">
          <p className="font-mono font-bold text-primary-700 text-sm">
            {order.outboundOrderNo || order.order_no}
          </p>
          <p className="text-xs text-warm-600">{order.customerName || order.cliente || '—'}</p>
        </div>

        {/* Bultos */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-warm-600 flex items-center gap-1">
            <Package className="w-3.5 h-3.5" /> Bultos a despachar
          </label>
          <input
            type="number"
            min={1}
            value={bultos}
            onChange={e => setBultos(e.target.value)}
            className="w-full rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {/* Folio selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-warm-600">Folio de despacho</label>

          {/* Create new option */}
          <button
            onClick={() => { setCreateNew(true); setSelectedFolioId('') }}
            className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
              createNew
                ? 'border-primary-400 bg-primary-50 text-primary-700'
                : 'border-warm-200 bg-warm-50 text-warm-600 hover:border-primary-300'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Crear nuevo folio
          </button>

          {/* Inline conductor + unidad for new folio */}
          {createNew && (
            <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-3 space-y-2">
              <select
                value={newConductorId}
                onChange={e => setNewConductorId(e.target.value)}
                className="w-full rounded-lg border border-warm-200 bg-white px-2 py-2 text-xs text-warm-800 outline-none"
              >
                <option value="">Seleccionar conductor...</option>
                {conductores.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <select
                value={newUnidadId}
                onChange={e => setNewUnidadId(e.target.value)}
                className="w-full rounded-lg border border-warm-200 bg-white px-2 py-2 text-xs text-warm-800 outline-none"
              >
                <option value="">Seleccionar unidad...</option>
                {unidades.map(u => (
                  <option key={u.id} value={u.id}>{u.placa} ({u.tipo})</option>
                ))}
              </select>
            </div>
          )}

          {/* Existing folios */}
          {activeFolios.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {activeFolios.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setSelectedFolioId(f.id); setCreateNew(false) }}
                  className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all ${
                    selectedFolioId === f.id
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-warm-100 bg-white text-warm-700 hover:border-warm-300'
                  }`}
                >
                  <span className="font-mono text-xs font-semibold">{f.folio_numero}</span>
                  <span className="text-[10px] text-warm-400">{f.conductor_nombre} · {f.unidad_placa}</span>
                  {selectedFolioId === f.id && <CheckCircle2 className="w-3.5 h-3.5 text-primary-500 shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {activeFolios.length === 0 && !createNew && (
            <p className="text-xs text-warm-400 text-center py-2">No hay folios activos. Crea uno nuevo.</p>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-danger-600 font-medium bg-danger-50 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

    </Modal>
  )
}
```

- [ ] **Step 5.2: Commit**

```bash
git add frontend/src/modules/Despacho/components/DispatchQuantityModal.jsx
git commit -m "feat: add DispatchQuantityModal component"
```

---

## Task 6: Create ScanDispatchModal

**Files:**
- Create: `frontend/src/modules/Despacho/components/ScanDispatchModal.jsx`

- [ ] **Step 6.1: Create the component**

```jsx
// frontend/src/modules/Despacho/components/ScanDispatchModal.jsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { ScanLine, X, Search, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { findOrderByBarcode } from '../services/despachoService'

const IDLE    = 'idle'
const LOADING = 'loading'
const FOUND   = 'found'
const NOT_FOUND = 'not_found'
const OUT_OF_RANGE = 'out_of_range'

export default function ScanDispatchModal({ isOpen, onClose, filteredOrders = [], onOrderFound }) {
  const [input, setInput]   = useState('')
  const [status, setStatus] = useState(IDLE)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setInput('')
      setStatus(IDLE)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  const search = useCallback(async (q) => {
    const raw = q.trim().toUpperCase()
    if (!raw) { setStatus(IDLE); return }

    setStatus(LOADING)

    // 1. Search in already-filtered orders by order number
    const inFilter = filteredOrders.find(
      o => (o.outboundOrderNo || o.order_no || '').toUpperCase() === raw
    )
    if (inFilter) {
      setStatus(FOUND)
      setTimeout(() => {
        setInput('')
        setStatus(IDLE)
        onOrderFound(inFilter)
      }, 300)
      return
    }

    // 2. Barcode lookup against Google Sheets (logisticsTrackNo, thirdOrderNo, customizeCode)
    try {
      const match = await findOrderByBarcode(raw)
      if (!match) { setStatus(NOT_FOUND); return }

      // Verify the found order is in the current filtered range
      const orderNo = match.outboundOrderNo || match.order_no || ''
      const inRange = filteredOrders.some(
        o => (o.outboundOrderNo || o.order_no || '') === orderNo
      )

      if (!inRange) { setStatus(OUT_OF_RANGE); return }

      setStatus(FOUND)
      setTimeout(() => {
        setInput('')
        setStatus(IDLE)
        onOrderFound(match)
      }, 300)
    } catch {
      setStatus(NOT_FOUND)
    }
  }, [filteredOrders, onOrderFound])

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current)
      search(input)
    }
  }

  function handleChange(e) {
    const val = e.target.value
    setInput(val)
    setStatus(IDLE)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 400)
  }

  const statusMeta = {
    [IDLE]:          { icon: null,          cls: '',                     text: 'Escanea o escribe y presiona Enter' },
    [LOADING]:       { icon: Loader2,       cls: 'text-warm-500',       text: 'Buscando...' },
    [FOUND]:         { icon: CheckCircle2,  cls: 'text-success-600',    text: 'Orden encontrada' },
    [NOT_FOUND]:     { icon: AlertCircle,   cls: 'text-danger-500',     text: 'No encontrada' },
    [OUT_OF_RANGE]:  { icon: AlertCircle,   cls: 'text-warning-600',    text: 'Orden fuera del rango de fechas activo' },
  }

  const sm = statusMeta[status]
  const Icon = sm.icon

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary-600" />
            <h2 className="font-bold text-warm-800 text-base">Escanear Orden</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-warm-100 text-warm-400 hover:text-warm-600 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          <div className={`relative flex items-center gap-2 rounded-xl border-2 px-4 py-3 transition-all ${
            status === FOUND       ? 'border-success-400 bg-success-50' :
            status === NOT_FOUND || status === OUT_OF_RANGE ? 'border-danger-300 bg-danger-50' :
            status === LOADING     ? 'border-primary-300 bg-primary-50' :
            'border-warm-200 bg-warm-50 focus-within:border-primary-400 focus-within:bg-white'
          }`}>
            <Search className="w-4 h-4 text-warm-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Escanear codigo..."
              className="flex-1 bg-transparent font-mono text-sm text-warm-800 outline-none focus-visible:outline-none focus-visible:ring-0 placeholder:text-warm-300"
            />
            {input && (
              <button onClick={() => { setInput(''); setStatus(IDLE) }} className="text-warm-400 hover:text-warm-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status line */}
          <div className={`flex items-center gap-1.5 text-xs font-medium min-h-[20px] ${sm.cls}`}>
            {Icon && <Icon className={`w-3.5 h-3.5 ${status === LOADING ? 'animate-spin' : ''}`} />}
            <span>{sm.text}</span>
          </div>

          <p className="text-[11px] text-warm-400 text-center">
            Busca por: numero de orden · codigo de rastreo · codigo de caja
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.2: Commit**

```bash
git add frontend/src/modules/Despacho/components/ScanDispatchModal.jsx
git commit -m "feat: add ScanDispatchModal barcode scan component"
```

---

## Task 7: Create AgendaView

**Files:**
- Create: `frontend/src/modules/Despacho/components/AgendaView.jsx`

- [ ] **Step 7.1: Create the component**

```jsx
// frontend/src/modules/Despacho/components/AgendaView.jsx
import { useState, useMemo } from 'react'
import { ArrowLeft, Printer, CalendarDays, Package, Search, X } from 'lucide-react'
import { fmtDate, fmtTimeShort } from '../../../core/utils/dateFormat'

const DISPATCH_LABEL = {
  pendiente:  'Pendiente',
  cargado:    'Cargado',
  entregado:  'Entregado',
  devolucion: 'Devolución',
}

const DISPATCH_CLS = {
  pendiente:  'text-warm-500',
  cargado:    'text-primary-700',
  entregado:  'text-success-700',
  devolucion: 'text-danger-600',
}

export default function AgendaView({ orders = [], dispatchMap, dateFrom, dateTo, onClose }) {
  const [q, setQ] = useState('')

  // Group filtered orders by customerName
  const groups = useMemo(() => {
    const search = q.trim().toLowerCase()
    const map = new Map()

    for (const order of orders) {
      const customer = order.customerName || order.cliente || 'Sin cliente'
      const orderNo  = order.outboundOrderNo || order.order_no || ''
      if (search && !orderNo.toLowerCase().includes(search) && !customer.toLowerCase().includes(search)) continue

      if (!map.has(customer)) map.set(customer, [])
      map.get(customer).push(order)
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([customer, rows]) => ({
        customer,
        rows,
        totalBultos: rows.reduce((s, o) => s + (Number(o.outboundBoxCount) || 0), 0),
      }))
  }, [orders, q, dispatchMap])

  const totalOrders = orders.length
  const totalBultos = useMemo(
    () => orders.reduce((s, o) => s + (Number(o.outboundBoxCount) || 0), 0),
    [orders]
  )

  function printAgenda() {
    const rows = groups.map(g => `
      <div class="group">
        <div class="group-header">DESTINO: ${g.customer}</div>
        <table>
          <thead><tr><th>Horario</th><th>Orden</th><th>Bultos</th><th>Estado</th></tr></thead>
          <tbody>
            ${g.rows.map(o => {
              const orderNo  = o.outboundOrderNo || o.order_no || ''
              const dispatch = dispatchMap?.get(orderNo)
              const estado   = dispatch ? DISPATCH_LABEL[dispatch.order_estado] ?? dispatch.order_estado : 'Sin folio'
              const time     = o.outboundTime || o.expectedTime || ''
              return `<tr>
                <td>${time ? new Date(time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td class="mono">${orderNo}</td>
                <td class="center">${o.outboundBoxCount ?? '—'}</td>
                <td>${estado}</td>
              </tr>`
            }).join('')}
          </tbody>
          <tfoot><tr><td colspan="4">Subtotal ${g.customer}: ${g.rows.length} orden${g.rows.length !== 1 ? 'es' : ''} · ${g.totalBultos} bultos</td></tr></tfoot>
        </table>
      </div>`).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Agenda Despacho</title>
      <style>
        @page { size: letter; margin: 15mm; }
        body { font-family: Segoe UI, sans-serif; font-size: 10pt; color: #334155; }
        .header { background: #ffedd5; border: 1px solid #fed7aa; padding: 8px 12px; margin-bottom: 12px; }
        .header h1 { margin: 0; color: #9a3412; font-size: 13pt; }
        .header p { margin: 2px 0 0; font-size: 9pt; color: #78716c; }
        .group { margin-bottom: 16px; }
        .group-header { background: #fff7ed; border: 1px solid #fed7aa; padding: 6px 10px; font-weight: 700; font-size: 9.5pt; color: #9a3412; }
        table { width: 100%; border-collapse: collapse; border: 1px solid #fed7aa; }
        th { background: #fff7ed; padding: 5px 6px; font-size: 8.5pt; border-bottom: 1px solid #fed7aa; text-align: left; }
        td { padding: 5px 6px; border-bottom: 1px solid #fee2ca; font-size: 9pt; }
        tfoot td { background: #f1f5f9; font-weight: 700; }
        .mono { font-family: monospace; font-weight: 600; }
        .center { text-align: center; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
      </style></head><body>
      <div class="header">
        <h1>Agenda de Despacho</h1>
        <p>${dateFrom} → ${dateTo} · ${totalOrders} órdenes · ${totalBultos} bultos</p>
      </div>
      ${rows}
    </body></html>`

    const popup = window.open('', '_blank', 'width=820,height=700,scrollbars=yes')
    if (!popup) return
    popup.document.write(html)
    popup.document.close()
    popup.onafterprint = () => popup.close()
    popup.focus()
    popup.print()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-2xl border-b border-warm-100/60 px-5 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-warm-100 text-warm-500 hover:text-warm-700 transition-all">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary-600" />
                <span className="font-bold text-warm-800 text-sm">Agenda de Despacho</span>
              </div>
              <p className="text-xs text-warm-500 ml-6">{dateFrom} → {dateTo}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge bg-primary-100 text-primary-700 text-[11px] font-bold">{totalOrders} órdenes</span>
            <span className="badge bg-warm-100 text-warm-600 text-[11px] font-bold">{totalBultos} bultos</span>
            <button onClick={printAgenda} className="btn-ghost text-xs flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-9 max-w-xs transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
          <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
          <input
            type="text"
            placeholder="Buscar orden o cliente..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="flex-1 text-xs outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0"
          />
          {q && <button onClick={() => setQ('')}><X className="w-3 h-3 text-warm-400 hover:text-warm-600" /></button>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            <Package className="w-8 h-8 text-warm-200" />
            <p className="text-sm text-warm-400 font-medium">Sin órdenes para mostrar</p>
          </div>
        ) : groups.map(({ customer, rows, totalBultos: gtb }) => (
          <div key={customer} className="rounded-2xl border border-warm-100 overflow-hidden shadow-sm bg-white">
            {/* Group header */}
            <div className="bg-warm-50 px-4 py-2.5 border-b border-warm-100 flex items-center justify-between">
              <span className="text-xs font-bold text-warm-700 uppercase tracking-wide">DESTINO: {customer}</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-warm-400">{rows.length} órdenes</span>
                <span className="text-[10px] text-warm-400">·</span>
                <span className="text-[10px] text-warm-400">{gtb} bultos</span>
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-sm">
              <thead className="bg-warm-50/60">
                <tr>
                  <th className="table-header">Horario</th>
                  <th className="table-header">Orden</th>
                  <th className="table-header text-center">Bultos</th>
                  <th className="table-header">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {rows.map(order => {
                  const orderNo  = order.outboundOrderNo || order.order_no || ''
                  const dispatch = dispatchMap?.get(orderNo)
                  const estado   = dispatch?.order_estado
                  const time     = order.outboundTime || order.expectedTime || ''
                  return (
                    <tr key={orderNo} className="hover:bg-warm-50/60 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-warm-500">
                        {time ? fmtTimeShort(time) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs font-semibold text-primary-700">{orderNo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs font-bold text-warm-700">{order.outboundBoxCount ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {estado
                          ? <span className={`text-xs font-semibold ${DISPATCH_CLS[estado] ?? 'text-warm-500'}`}>{DISPATCH_LABEL[estado] ?? estado}</span>
                          : <span className="text-xs text-warm-300">Sin folio</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Subtotal */}
              <tfoot>
                <tr className="bg-warm-50/80">
                  <td colSpan={4} className="px-4 py-2 text-[11px] font-bold text-warm-600">
                    Subtotal {customer}: {rows.length} orden{rows.length !== 1 ? 'es' : ''} · {gtb} bultos
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 7.2: Commit**

```bash
git add frontend/src/modules/Despacho/components/AgendaView.jsx
git commit -m "feat: add AgendaView grouped orders component"
```

---

## Task 8: Update Ordenes.jsx

**Files:**
- Modify: `frontend/src/modules/Despacho/pages/Ordenes.jsx`

This task provides the **complete replacement file**. Copy it exactly — it preserves every existing filter (MultiSelect status, MultiSelect dispatch, date range, date presets, search, clear, apply, status tabs) and adds the new elements on top of them.

- [ ] **Step 8.1: Replace Ordenes.jsx with the complete updated file**

Write the following content to `frontend/src/modules/Despacho/pages/Ordenes.jsx` in full. Every existing filter (MultiSelect, tabs, date presets, search, apply, clear) is preserved. New elements are clearly marked with `// NEW` comments.

```jsx
// frontend/src/modules/Despacho/pages/Ordenes.jsx
import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Search, X, Truck, PackageCheck, RefreshCw, Clock, Filter,
  Users, ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle,
  ScanLine, CalendarDays,                                        // NEW
} from 'lucide-react'
import Header from '../../../core/components/layout/Header'
import LoadingSpinner from '../../../core/components/common/LoadingSpinner'
import MultiSelect from '../../../core/components/common/MultiSelect'
import TablePagination from '../../../core/components/common/TablePagination'
import { useAuthStore } from '../../../core/stores/authStore'
import { fmtDate, fmtTimeShort } from '../../../core/utils/dateFormat'
import { getOutboundList, getOrdenesDispatch, getConductores, getUnidades } from '../services/despachoService'  // NEW: getConductores, getUnidades
import { ConductoresModal, UnidadesModal } from '../components/CatalogsModals'
import IniciarDespachoModal  from '../components/IniciarDespachoModal'    // NEW
import ScanDispatchModal     from '../components/ScanDispatchModal'        // NEW
import DispatchQuantityModal from '../components/DispatchQuantityModal'    // NEW
import AgendaView            from '../components/AgendaView'               // NEW
import { getDespachoDates, setDespachoDates, clearDespachoDates } from '../utils/despachoSession'  // NEW

const STATUS_META = {
  pending_assignment: { label: 'Por Asignar', cls: 'bg-warm-100 text-warm-600' },
  sorting:            { label: 'En Surtido',  cls: 'bg-primary-100 text-primary-700' },
  validating:         { label: 'Validando',   cls: 'bg-accent-100 text-accent-700' },
  complete:           { label: 'Completo',    cls: 'bg-success-100 text-success-700' },
  partial:            { label: 'Parcial',     cls: 'bg-warning-100 text-warning-700' },
  cancelled:          { label: 'Cancelado',   cls: 'bg-danger-100 text-danger-700' },
}

const DISPATCH_ESTADO_META = {
  pendiente:  { label: 'Pendiente',  cls: 'text-warm-500' },
  cargado:    { label: 'Cargado',    cls: 'text-primary-700' },
  entregado:  { label: 'Entregado',  cls: 'text-success-700' },
  devolucion: { label: 'Devolución', cls: 'text-danger-600' },
}

const DATE_PRESETS = [
  { label: 'Hoy',     d: 0 },
  { label: '7 días',  d: 7 },
  { label: '30 días', d: 30 },
]

const STATUS_OPTIONS  = Object.entries(STATUS_META).map(([k, v]) => ({ value: k, label: v.label }))
const DISPATCH_OPTIONS = [
  { value: 'none', label: 'Sin folio' },
  ...Object.entries(DISPATCH_ESTADO_META).map(([k, v]) => ({ value: k, label: v.label })),
]

const TABS = [
  { id: 'all',       label: 'Todos' },
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'cargado',   label: 'Cargado' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'cancelado', label: 'Cancelado' },
]

function statusBadge(status) {
  const meta = STATUS_META[status] ?? STATUS_META.pending_assignment
  return <span className={`badge text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
}

function SortHeader({ label, field, sortField, sortDir, onSort, className = '' }) {
  const active = field === sortField
  return (
    <th
      className={`table-header cursor-pointer select-none hover:bg-warm-100/60 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active
          ? sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3 text-primary-500" />
            : <ChevronDown className="w-3 h-3 text-primary-500" />
          : <ChevronsUpDown className="w-3 h-3 text-warm-300" />
        }
      </div>
    </th>
  )
}

export default function Ordenes() {
  const qc = useQueryClient()

  const canManageCatalogs = useAuthStore(s => {
    const lvl = s.getPermissionLevel('despacho.ordenes')
    return lvl === 'actualizar' || lvl === 'eliminar'
  })
  // NEW
  const canDispatch = useAuthStore(s => {
    const lvl = s.getPermissionLevel('despacho.folios')
    return ['crear', 'actualizar', 'eliminar'].includes(lvl)
  })

  const [searchInput, setSearchInput]   = useState('')
  const [search, setSearch]             = useState('')
  const [dateFrom, setDateFrom]         = useState('')   // NEW: empty by default (gate modal required)
  const [dateTo, setDateTo]             = useState('')   // NEW: empty by default
  const [statusFilter, setStatusFilter] = useState([])
  const [dispatchFilter, setDispatchFilter] = useState([])
  const [tab, setTab]       = useState('all')
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir]     = useState('desc')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(20)
  const [refreshing, setRefreshing]   = useState(false)
  const [showConductores, setShowConductores] = useState(false)
  const [showUnidades, setShowUnidades]       = useState(false)

  // NEW state
  const [showIniciarDespacho, setShowIniciarDespacho] = useState(false)
  const [showScan, setShowScan]               = useState(false)
  const [showAgenda, setShowAgenda]           = useState(false)
  const [dispatchOrder, setDispatchOrder]     = useState(null)
  const [showDispatchQty, setShowDispatchQty] = useState(false)

  const { data: sheetsData, isLoading: loadingSheets, isError } = useQuery({
    queryKey: ['despacho-outbound-list'],
    queryFn: getOutboundList,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  })

  const { data: dispatchData } = useQuery({
    queryKey: ['despacho-ordenes-dispatch'],
    queryFn: getOrdenesDispatch,
    refetchInterval: 30000,
  })

  // NEW: load catalogs for DispatchQuantityModal
  const { data: conductoresData } = useQuery({ queryKey: ['despacho-conductores'], queryFn: getConductores })
  const { data: unidadesData }    = useQuery({ queryKey: ['despacho-unidades'],    queryFn: getUnidades })
  const conductores = conductoresData?.conductores ?? []
  const unidades    = unidadesData?.unidades    ?? []

  const dispatchMap = useMemo(() => {
    const map = new Map()
    for (const d of (dispatchData?.dispatch ?? [])) {
      map.set(d.outbound_order_no, d)
    }
    return map
  }, [dispatchData])

  const allOrders = useMemo(() => {
    const raw = sheetsData?.data?.records ?? sheetsData?.records ?? []
    return Array.isArray(raw) ? raw : []
  }, [sheetsData])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allOrders.filter(order => {
      const orderNo  = order.outboundOrderNo || order.order_no || ''
      const orderDate = order.outboundTime || order.expectedTime || order.orderCreateTime || ''
      const dateKey  = orderDate ? orderDate.slice(0, 10) : ''
      if (dateFrom && dateKey && dateKey < dateFrom) return false
      if (dateTo   && dateKey && dateKey > dateTo)   return false
      if (statusFilter.length > 0) {
        const status = order.trackingStatus || order.status || 'pending_assignment'
        if (!statusFilter.includes(status)) return false
      }
      if (dispatchFilter.length > 0) {
        const dispatch    = dispatchMap.get(orderNo)
        const dispEstado  = dispatch ? dispatch.order_estado : 'none'
        if (!dispatchFilter.includes(dispEstado)) return false
      }
      if (tab !== 'all') {
        const dispatch   = dispatchMap.get(orderNo)
        const wmsStatus  = order.trackingStatus || order.status || ''
        if (tab === 'pendiente') {
          if (dispatch && dispatch.order_estado !== 'pendiente') return false
        } else if (tab === 'cargado') {
          if (!dispatch || dispatch.order_estado !== 'cargado') return false
        } else if (tab === 'entregado') {
          if (!dispatch || dispatch.order_estado !== 'entregado') return false
        } else if (tab === 'cancelado') {
          if (wmsStatus !== 'cancelled' && (!dispatch || dispatch.order_estado !== 'devolucion')) return false
        }
      }
      if (q) {
        const customer = (order.customerName || order.cliente || '').toLowerCase()
        if (!orderNo.toLowerCase().includes(q) && !customer.includes(q)) return false
      }
      return true
    })
  }, [allOrders, search, dateFrom, dateTo, statusFilter, dispatchFilter, tab, dispatchMap])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const noA = a.outboundOrderNo || a.order_no || ''
      const noB = b.outboundOrderNo || b.order_no || ''
      let av, bv
      if (sortField === 'date') {
        av = a.outboundTime || a.expectedTime || a.orderCreateTime || ''
        bv = b.outboundTime || b.expectedTime || b.orderCreateTime || ''
      } else if (sortField === 'folio') {
        av = dispatchMap.get(noA)?.folio_numero ?? ''
        bv = dispatchMap.get(noB)?.folio_numero ?? ''
      } else if (sortField === 'outboundOrderNo') {
        av = noA; bv = noB
      } else if (sortField === 'customerName') {
        av = a.customerName || a.cliente || ''
        bv = b.customerName || b.cliente || ''
      } else if (sortField === 'trackingStatus') {
        av = a.trackingStatus || a.status || ''
        bv = b.trackingStatus || b.status || ''
      } else {
        av = a[sortField] ?? ''
        bv = b[sortField] ?? ''
      }
      av = String(av).toLowerCase()
      bv = String(bv).toLowerCase()
      if (sortDir === 'asc') return av < bv ? -1 : av > bv ? 1 : 0
      return bv < av ? -1 : bv > av ? 1 : 0
    })
    return arr
  }, [filtered, sortField, sortDir, dispatchMap])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize]
  )

  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo, statusFilter, dispatchFilter, tab])

  // NEW: restore session dates on mount; show gate modal if no dates stored
  useEffect(() => {
    const saved = getDespachoDates()
    if (saved) {
      setDateFrom(saved.dateFrom)
      setDateTo(saved.dateTo)
    } else {
      setShowIniciarDespacho(true)
    }
  }, [])

  function handleSort(field) {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function applyFilters() { setSearch(searchInput.trim()) }

  function clearFilters() {
    clearDespachoDates()                // NEW: clear session
    setSearchInput('')
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setStatusFilter([])
    setDispatchFilter([])
    setTab('all')
    setShowIniciarDespacho(true)        // NEW: re-show gate modal
  }

  // NEW: update session when dates change manually
  function handleDateFromChange(val) {
    setDateFrom(val)
    if (val && dateTo) setDespachoDates(val, dateTo)
  }
  function handleDateToChange(val) {
    setDateTo(val)
    if (dateFrom && val) setDespachoDates(dateFrom, val)
  }

  // NEW: dispatch flow handlers
  function handleOrderFound(order) {
    setDispatchOrder(order)
    setShowDispatchQty(true)
  }
  function handleTruckClick(order) {
    setDispatchOrder(order)
    setShowDispatchQty(true)
  }

  const hasFilters = search || statusFilter.length > 0 || dispatchFilter.length > 0 || dateFrom || dateTo

  const isPartial = sheetsData?.data?.partial ?? false
  const sp = { sortField, sortDir, onSort: handleSort }

  const tabCounts = useMemo(() => {
    const counts = { all: allOrders.length, pendiente: 0, cargado: 0, entregado: 0, cancelado: 0 }
    for (const order of allOrders) {
      const orderNo  = order.outboundOrderNo || order.order_no || ''
      const dispatch = dispatchMap.get(orderNo)
      const wmsStatus = order.trackingStatus || order.status || ''
      if (!dispatch || dispatch.order_estado === 'pendiente') counts.pendiente++
      if (dispatch?.order_estado === 'cargado')   counts.cargado++
      if (dispatch?.order_estado === 'entregado') counts.entregado++
      if (wmsStatus === 'cancelled' || dispatch?.order_estado === 'devolucion') counts.cancelado++
    }
    return counts
  }, [allOrders, dispatchMap])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await qc.invalidateQueries({ queryKey: ['despacho-outbound-list'] })
      await qc.invalidateQueries({ queryKey: ['despacho-ordenes-dispatch'] })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Órdenes de Despacho"
        subtitle="Órdenes de salida disponibles para embarque"
        actions={
          <div className="flex items-center gap-2">
            {/* NEW: Iniciar Despacho scan button */}
            {canDispatch && (
              <button
                onClick={() => setShowScan(true)}
                disabled={!allOrders.length}
                className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ScanLine className="w-3.5 h-3.5" />
                Iniciar Despacho
              </button>
            )}
            {/* NEW: Agenda button */}
            <button
              onClick={() => setShowAgenda(true)}
              disabled={!filtered.length}
              className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Agenda
            </button>
            {canManageCatalogs && (
              <>
                <button onClick={() => setShowConductores(true)} className="btn-ghost text-xs flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Conductores
                </button>
                <button onClick={() => setShowUnidades(true)} className="btn-ghost text-xs flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" />
                  Unidades
                </button>
              </>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing || loadingSheets}
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Sticky filter bar — ALL ORIGINAL FILTERS PRESERVED */}
        <div className="sticky top-0 z-[100] bg-white/80 backdrop-blur-2xl border-b border-warm-100/60 px-5 pt-2.5 space-y-2">

          {/* Row 1 — date range + presets */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10">
              <Clock className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input
                type="date" value={dateFrom}
                onChange={e => handleDateFromChange(e.target.value)}   // NEW handler
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0" />
              <span className="text-warm-300 text-xs">→</span>
              <input
                type="date" value={dateTo}
                onChange={e => handleDateToChange(e.target.value)}     // NEW handler
                className="text-xs outline-none bg-transparent text-warm-700 w-[110px] focus-visible:outline-none focus-visible:ring-0" />
            </div>
            {DATE_PRESETS.map(({ label, d }) => (
              <button key={label}
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10)
                  const from  = d === 0 ? today : new Date(Date.now() - d * 864e5).toISOString().slice(0, 10)
                  setDateFrom(from)
                  setDateTo(today)
                  setDespachoDates(from, today)   // NEW: persist preset in session
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-warm-100 text-warm-600 hover:bg-warm-200 transition-colors"
              >{label}</button>
            ))}
            {isPartial && (
              <span className="text-[11px] text-warning-600 font-medium ml-1">Cargando datos...</span>
            )}
          </div>

          {/* Row 2 — MultiSelects + search + apply (FULLY PRESERVED) */}
          <div className="flex items-center gap-2 flex-wrap">
            <MultiSelect
              options={STATUS_OPTIONS}
              selected={statusFilter}
              onChange={setStatusFilter}
              placeholder="Estado WMS"
            />
            <MultiSelect
              options={DISPATCH_OPTIONS}
              selected={dispatchFilter}
              onChange={setDispatchFilter}
              placeholder="Folio estado"
              icon={Truck}
            />
            <div className="flex items-center gap-1.5 bg-warm-50 border border-warm-200 rounded-xl px-3 h-10 min-w-[200px] flex-1 transition-all focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 focus-within:shadow-sm">
              <Search className="w-3.5 h-3.5 text-warm-400 shrink-0" />
              <input
                type="text"
                placeholder="Buscar por orden o cliente..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyFilters() }}
                className="flex-1 min-w-0 text-sm outline-none bg-transparent text-warm-700 focus-visible:outline-none focus-visible:ring-0"
              />
              {searchInput && (
                <button onClick={() => { setSearchInput(''); setSearch('') }} className="text-warm-400 hover:text-warm-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {hasFilters && (
              <button onClick={clearFilters}
                className="inline-flex items-center gap-1 h-10 px-3 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                <X className="w-3 h-3" /> Limpiar
              </button>
            )}
            <button onClick={applyFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-100 px-4 text-xs font-semibold text-violet-700 hover:bg-violet-200 transition-colors">
              <Filter className="w-3 h-3" /> Aplicar
            </button>
          </div>

          {/* Row 3 — status tabs (FULLY PRESERVED) */}
          <div className="flex gap-0 border-b border-warm-100 -mx-5 px-5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
                  tab === t.id
                    ? 'border-primary-500 text-primary-700'
                    : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                }`}
              >
                {t.label}
                {tabCounts[t.id] > 0 && (
                  <span className={`text-[10px] font-bold ${tab === t.id ? 'text-primary-500' : 'text-warm-400'}`}>
                    {tabCounts[t.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loadingSheets ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="w-10 h-10 text-danger-300" />
            <p className="text-sm font-medium text-warm-600">No se pudieron cargar las órdenes</p>
            <p className="text-xs text-warm-400">Verifica la configuración de WMS Hub o presiona Actualizar</p>
            <button onClick={handleRefresh} className="btn-secondary text-xs flex items-center gap-1.5 mt-1">
              <RefreshCw className="w-3.5 h-3.5" /> Reintentar
            </button>
          </div>
        ) : (
          <div className="px-5 py-4">
            <div className="rounded-2xl border border-warm-100 overflow-hidden shadow-sm bg-white">
              <table className="w-full text-sm">
                <thead className="bg-warm-50 sticky top-0 z-[5] border-b border-warm-100">
                  <tr>
                    <SortHeader label="Orden"          field="outboundOrderNo" {...sp} />
                    <SortHeader label="Cliente"        field="customerName"    {...sp} />
                    <SortHeader label="Estado WMS"     field="trackingStatus"  {...sp} />
                    <SortHeader label="Folio Despacho" field="folio"           {...sp} />
                    <SortHeader label="Fecha"          field="date"            {...sp} />
                    {canDispatch && <th className="table-header w-10" />}  {/* NEW */}
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-50">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={canDispatch ? 6 : 5} className="py-14 text-center">
                        <PackageCheck className="w-8 h-8 text-warm-200 mx-auto mb-2" />
                        <p className="text-sm text-warm-400 font-medium">Sin órdenes en el rango seleccionado</p>
                        {allOrders.length === 0 && (
                          <p className="text-xs text-warm-300 mt-1">
                            Presiona <strong>Actualizar</strong> para cargar datos desde la hoja
                          </p>
                        )}
                      </td>
                    </tr>
                  ) : paginated.map((order, i) => {
                    const orderNo  = order.outboundOrderNo || order.order_no || ''
                    const customer = order.customerName || order.cliente || '—'
                    const status   = order.trackingStatus || order.status || 'pending_assignment'
                    const dateVal  = order.outboundTime || order.expectedTime || order.orderCreateTime || ''
                    const dispatch = dispatchMap.get(orderNo)
                    const dm       = dispatch ? DISPATCH_ESTADO_META[dispatch.order_estado] : null

                    return (
                      <motion.tr key={orderNo || i}
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.3) }}
                        className="hover:bg-warm-50/60 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-primary-700 text-xs">{orderNo || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-warm-700 font-medium">{customer}</span>
                        </td>
                        <td className="px-4 py-3">{statusBadge(status)}</td>
                        <td className="px-4 py-3">
                          {dispatch ? (
                            <div className="flex items-center gap-1.5">
                              <Truck className="w-3 h-3 text-warm-400" />
                              <span className="font-mono text-xs text-warm-600">{dispatch.folio_numero}</span>
                              {dm && <span className={`text-[10px] font-semibold ${dm.cls}`}>{dm.label}</span>}
                            </div>
                          ) : (
                            <span className="text-warm-300 text-xs">Sin folio</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {dateVal ? (
                            <div className="flex flex-col leading-tight">
                              <span className="text-xs text-warm-700">{fmtDate(dateVal)}</span>
                              <span className="text-[10px] text-warm-400">{fmtTimeShort(dateVal)}</span>
                            </div>
                          ) : <span className="text-warm-300 text-xs">—</span>}
                        </td>
                        {/* NEW: truck quick-action */}
                        {canDispatch && (
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => handleTruckClick(order)}
                              title="Despachar orden"
                              className="p-1.5 rounded-xl hover:bg-primary-50 text-warm-300 hover:text-primary-600 transition-all"
                            >
                              <Truck className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
              <TablePagination
                page={safePage}
                totalPages={totalPages}
                pageSize={pageSize}
                total={sorted.length}
                onPageChange={setPage}
                onPageSizeChange={p => { setPageSize(p); setPage(1) }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Existing catalog modals */}
      <ConductoresModal isOpen={showConductores} onClose={() => setShowConductores(false)} canManage={canManageCatalogs} />
      <UnidadesModal    isOpen={showUnidades}    onClose={() => setShowUnidades(false)}    canManage={canManageCatalogs} />

      {/* NEW: Date gate modal (non-dismissable) */}
      <IniciarDespachoModal
        isOpen={showIniciarDespacho}
        onConfirm={(from, to) => {
          setDateFrom(from)
          setDateTo(to)
          setShowIniciarDespacho(false)
        }}
      />

      {/* NEW: Barcode scan modal */}
      <ScanDispatchModal
        isOpen={showScan}
        onClose={() => setShowScan(false)}
        filteredOrders={filtered}
        onOrderFound={handleOrderFound}
      />

      {/* NEW: Dispatch quantity + folio selector modal */}
      <DispatchQuantityModal
        isOpen={showDispatchQty}
        onClose={() => { setShowDispatchQty(false); setDispatchOrder(null) }}
        order={dispatchOrder}
        conductores={conductores}
        unidades={unidades}
      />

      {/* NEW: Full-screen agenda overlay */}
      {showAgenda && (
        <div className="fixed inset-0 z-[150] bg-white flex flex-col">
          <AgendaView
            orders={filtered}
            dispatchMap={dispatchMap}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onClose={() => setShowAgenda(false)}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8.2: Commit**

```bash
git add frontend/src/modules/Despacho/pages/Ordenes.jsx
git commit -m "feat: add date gate, scan dispatch flow, truck action, and agenda view to Ordenes"
```

---

## Task 9: Update FolioDetalle.jsx — print button

**Files:**
- Modify: `frontend/src/modules/Despacho/pages/FolioDetalle.jsx`

- [ ] **Step 9.1: Add print import**

Add to the existing imports in FolioDetalle.jsx:

```js
import { Printer } from 'lucide-react'
import { printFolio } from '../utils/printFolio'
```

- [ ] **Step 9.2: Add print handler inside the component**

Add after the existing `invalidate` function (around line 76):

```js
  function handlePrint() {
    if (!folio) return
    const result = printFolio({ folio, orders })
    if (!result.success) addToast({ type: 'error', message: result.message })
  }
```

- [ ] **Step 9.3: Add print button to the header**

In `FolioDetalle.jsx`, find the `<Header>` component's `actions` prop. Add the print button alongside the existing buttons:

```jsx
  // Add this button inside the actions div, before the existing edit/cancel buttons:
  <button
    onClick={handlePrint}
    disabled={!folio || !orders.length}
    className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-50"
  >
    <Printer className="w-3.5 h-3.5" />
    Imprimir
  </button>
```

- [ ] **Step 9.4: Verify in browser**

Navigate to any folio detail page: http://localhost:3000/despacho/folios/FOLIO_ID

Expected:
1. "Imprimir" button appears in the header.
2. Clicking it opens a print preview popup with: folio header, orders table with totals, rejection detail section (16 blank rows), signature zone.
3. If no orders: nothing happens (button disabled) or toast "No hay órdenes para imprimir".

- [ ] **Step 9.5: Commit**

```bash
git add frontend/src/modules/Despacho/pages/FolioDetalle.jsx
git commit -m "feat: add print folio button to FolioDetalle"
```

---

## Final Verification Checklist

- [ ] Migration 059 is applied — `dispatch_folios`, `dispatch_folio_orders`, `dispatch_conductores`, `dispatch_unidades` tables exist
- [ ] `POST /api/despacho/folios/:id/orders` returns 201, not 500
- [ ] Opening `/despacho/ordenes` with no sessionStorage shows `IniciarDespachoModal`
- [ ] After entering dates, the modal doesn't appear again on refresh within the same session
- [ ] "Limpiar" clears sessionStorage and shows the modal again
- [ ] "Iniciar Despacho" button opens `ScanDispatchModal`
- [ ] Scanning a valid order number opens `DispatchQuantityModal`
- [ ] Scanning an order barcode from Google Sheets that is in range opens `DispatchQuantityModal`
- [ ] Scanning a barcode not in the date range shows "Orden fuera del rango de fechas activo"
- [ ] `DispatchQuantityModal`: creating a new folio + adding order works end-to-end
- [ ] `DispatchQuantityModal`: selecting an existing folio + adding order works end-to-end
- [ ] After successful dispatch, order row shows folio data (dispatch map refreshed)
- [ ] Truck icon per row opens `DispatchQuantityModal` pre-filled with that order
- [ ] "Agenda" button opens `AgendaView` grouped by customer
- [ ] Agenda print produces a correctly formatted page
- [ ] Back arrow in `AgendaView` returns to the orders table
- [ ] "Imprimir" in `FolioDetalle` produces a formatted print with orders table and signature zone

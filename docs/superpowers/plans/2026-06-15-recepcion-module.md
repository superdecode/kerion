# Recepción Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans

**Goal:** Build the Recepción module — WMS inbound validation system with Excel import, order management, barcode scanning, and reception list report.

**Architecture:** Backend Express routes + Postgres migration, frontend React pages following existing module patterns (Devoluciones for import, DropScan/Escaneo for scanning UI).

**Tech Stack:** Node/Express, PostgreSQL, React, React Query, xlsx, lucide-react, Tailwind, zustand i18n

---

## Task 1: SQL Migration 061

**Files:** Create `backend/migrations/061_recepcion_module.sql`

- [ ] Create the migration file with all tables, indexes, permissions, and schema_migrations insert

## Task 2: Backend recepcion.routes.js

**Files:** Create `backend/src/modules/recepcion/routes/recepcion.routes.js`

- [ ] CRUD for orders + lines with folio generation INB-YYYYMMDD-XXXX

## Task 3: Backend validacion.routes.js

**Files:** Create `backend/src/modules/recepcion/routes/validacion.routes.js`

- [ ] Sessions + scan processing + scan-events list

## Task 4: Backend reporte.routes.js

**Files:** Create `backend/src/modules/recepcion/routes/reporte.routes.js`

- [ ] GET orders/:id/lista-recepcion data endpoint

## Task 5: Register routes in server.js

**Files:** Modify `backend/src/server.js`

- [ ] Import and mount all 3 route files at /api/recepcion

## Task 6: i18n keys

**Files:** Modify `frontend/src/core/stores/i18nStore.js`

- [ ] Add rec.* keys to both zh and es sections

## Task 7: recepcionService.js

**Files:** Create `frontend/src/modules/Recepcion/services/recepcionService.js`

- [ ] All API call functions

## Task 8: Recibir.jsx — main list

**Files:** Create `frontend/src/modules/Recepcion/pages/Recibir.jsx`

- [ ] Table with filters, date range, pagination, Recibir button

## Task 9: ImportarOrdenModal.jsx + ColumnMappingModal.jsx

**Files:** Create both component files

- [ ] 2-step import modal with auto header detection and manual mapping fallback

## Task 10: RecepcionDetalle.jsx

**Files:** Create `frontend/src/modules/Recepcion/pages/RecepcionDetalle.jsx`

- [ ] Order detail page with 2 tabs: Detalle + Validación

## Task 11: ValidacionRecepcion.jsx

**Files:** Create `frontend/src/modules/Recepcion/pages/ValidacionRecepcion.jsx`

- [ ] Scan screen with left panel, auto-focus input, sounds, tarima toggle

## Task 12: ListaRecepcionReport.js

**Files:** Create `frontend/src/modules/Recepcion/utils/listaRecepcionReport.js`

- [ ] Client-side Excel/print report generator

## Task 13: Sidebar + App.jsx + routes

**Files:** Modify `frontend/src/core/components/layout/Sidebar.jsx` and `frontend/src/App.jsx`

- [ ] Add recepcion group (sky color, after devoluciones), register all routes

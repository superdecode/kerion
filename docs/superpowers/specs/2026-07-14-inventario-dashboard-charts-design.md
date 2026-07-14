# Dashboard Inventario — Gráficas de Rastreo y Escaneo

**Fecha:** 2026-07-14
**Estado:** Aprobado para implementación

---

## Propósito

Ampliar las secciones RASTREO y ESCANEO del dashboard de Inventario (dentro del Dashboard general, no el dashboard standalone del módulo) con gráficas que hoy no existen (causa/área de rastreo, responsable×estatus, tendencia de escaneos), y quitar dos tarjetas KPI de bajo valor informativo (OK / Sin match).

**Archivo objetivo:** `frontend/src/modules/Dashboard/pages/InventarioDashboard.jsx`
**Endpoint objetivo:** `GET /api/inventory/dashboard` → `backend/src/modules/inventory/routes/dashboard.routes.js`

No se toca el dashboard standalone `frontend/src/modules/Inventario/pages/Dashboard.jsx` (fuera de alcance).

---

## Sección RASTREO

### Se queda igual
- KPIs: rastreos activos, creados (período), cerrados (período), tasa de éxito.
- Gráfica "Cajas en rastreo por estado" (barra, nivel `rastreo_cajas.estado_caja`).

### Nuevas / modificadas

| # | Gráfica | Tipo | Fuente | Agrupación |
|---|---------|------|--------|------------|
| 1 | Frecuencia por causa de rastreo | Barra horizontal | `rastreo_cajas` | `causa_rastreo_id → rastreo_causa_tipos.descripcion`, top 10 + "Otros" |
| 2 | Distribución por área | Dona | `rastreo_cajas` | `causa_rastreo_id → rastreo_causa_tipos.area` |
| 3 | Responsables × estatus (reemplaza "Top responsables") | Barra horizontal apilada | `rastreo_ordenes` | `asignado_a` (join `usuarios`) × `estado`, top 8 responsables |
| 4 | Estatus global de rastreo | Dona | `rastreo_ordenes` | `estado` (todas las órdenes del período) |

Solo cajas con `causa_rastreo_id IS NOT NULL` entran en #1/#2 (cajas sin causa asignada aún no aportan a esta vista).

Estatus de `rastreo_ordenes.estado` en #3 y #4 usa el mismo alias de lectura que `rastreo.routes.js` (`STATUS_ALIASES`: `resuelta→completada`, `cerrada→cancelada`) para que las etiquetas coincidan con la página de Rastreo — no se inventa un vocabulario nuevo.

### Layout (grid 2 columnas)
```
[ Causa (barra horiz.) ]        [ Área (dona) ]
[ Responsables × estatus ]      [ Estatus global (dona) ]
[ Cajas por estado (existente, barra) — full width o solo ]
```

---

## Sección ESCANEO

### Se quita
- Tarjeta KPI "OK" (`kpis.escaneos_ok_periodo`)
- Tarjeta KPI "Sin match" (`kpis.escaneos_bloqueados_periodo + escaneos_nowms_periodo`)
- La fila de KPIs se reduce a una sola fila de 5: cajas disponibles, cajas bloqueadas, cajas sin WMS, escaneos (período), sesiones (período).

### Se reemplaza
- "Escaneos por día (período)" (barra diaria fija) → **Tendencia de escaneos** (bucket adaptativo día/semana/mes/año según amplitud del rango de fechas seleccionado, mismo patrón que `surtido.dashboard.routes.js`).

### Se agrega
- **Escaneos por responsable**: barra horizontal apilada, un segmento por `scan_status` (ok / bloqueados / sin WMS) por operador (`inv_sessions.operator_id → usuarios.nombre_completo`), top 8 operadores.

### Se queda igual
- Dona "Cajas en sistema por estado".

### Layout
```
[ Cajas por estado (dona, existente) ]   [ Tendencia de escaneos (adaptativa) ]
[ Escaneos por responsable (barra apilada, full width) ]
```

---

## Backend — cambios en `dashboard.routes.js`

Todas las queries nuevas se agregan al `Promise.all` existente (mismo patrón que las queries actuales de rastreo/escaneo), devueltas bajo nuevas claves de `graficas`:

- `rastreo_por_causa` — `SELECT c.descripcion, COUNT(*) FROM rastreo_cajas rc JOIN rastreo_causa_tipos c ON c.id = rc.causa_rastreo_id WHERE rc.tenant_id = $1 AND rc.causa_rastreo_id IS NOT NULL AND ...periodo GROUP BY c.descripcion ORDER BY COUNT(*) DESC`. El backend recorta a top 10 y suma el resto en una fila `"Otros"` (misma responsabilidad que ya tiene la query — el frontend solo renderiza filas, no decide el corte).
- `rastreo_por_area` — igual pero `GROUP BY c.area`.
- `rastreo_responsable_estatus` — `rastreo_ordenes` agrupado por `asignado_a` (join `usuarios.nombre_completo`) y `estado` (con alias aplicado), pivoteado a filas `{responsable, abierta, en_proceso, parcial, completada, cancelada}` para que Recharts pueda apilar por `dataKey` fijo. Top 8 responsables por total de órdenes (suma de todos los estatus) del período.
- `rastreo_estatus_global` — `rastreo_ordenes` agrupado solo por `estado` (con alias).
- `escaneo_por_responsable` — `inv_sessions` agrupado por `operator_id` (join `usuarios`), `SUM(total_ok), SUM(total_blocked), SUM(total_nowms)`. Top 8 operadores por total combinado (ok+bloqueados+sin WMS) del período.
- `escaneo_tendencia` (reemplaza la query de `escaneo_diario`) — reutiliza/extrae el helper de bucketing adaptativo de `surtido.dashboard.routes.js` a un util compartido (p.ej. `shared/utils/dashboardBucket.js`) y lo aplica a la query existente de `inv_scans`/`inv_sessions`.

El alias de estatus (`STATUS_ALIASES`) de `rastreo.routes.js` no está exportado hoy — se exporta o se duplica la constante (decisión menor de implementación, no bloquea el diseño).

---

## Frontend

- Recharts (ya en uso, sin librería nueva): `BarChart` horizontal para #1/#3/escaneos-por-responsable, `PieChart` con `innerRadius` para las donas (#2/#4), `Bar` con `stackId` compartido para las barras apiladas.
- Colores: se reutiliza el patrón local `ESTADO_COLORS`/`PIE_COLORS` ya presente en `InventarioDashboard.jsx`. No se crea un theme file compartido (fuera de alcance — sería un refactor no relacionado a los otros 5 dashboards de módulo).
- Componentes compartidos existentes (`KpiCard`, `ChartCard`, `NoData`) se siguen usando igual.

---

## Verificación

No hay tests automatizados sobre `dashboard.routes.js` en el repo hoy (patrón existente, no se introduce infraestructura de testing nueva para esto). Verificación:
1. Sanity-check de cada query nueva vía conexión directa de solo lectura a la DB de prod, confirmando la forma de los datos devueltos.
2. `npm run dev` del frontend y revisión visual de las 6 gráficas nuevas/modificadas con datos reales, incluyendo casos de rango de fechas corto/largo (para confirmar el bucketing adaptativo) y tenants con pocas/ninguna causa de rastreo asignada (para confirmar que `NoData` se muestra en vez de una gráfica vacía rota).

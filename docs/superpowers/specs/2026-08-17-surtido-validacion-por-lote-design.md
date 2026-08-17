# Surtido — Validación por Lote (diseño)

Fecha: 2026-08-17
Módulo: `frontend/src/modules/Surtido` + `backend/src/modules/wms`
Estado: aprobado para implementación

## Problema

La validación de surtido hoy es siempre **por orden**: el operador escanea o busca una OBC,
se abre el panel de esa orden y valida sus cajas. Cuando se surte un lote completo del día
(varias órdenes armadas juntas sobre tarimas), obliga a abrir y cerrar una orden a la vez,
aunque las cajas físicamente llegan mezcladas en la misma tarima.

Despacho ya resolvió el mismo problema con `ValidarPorDestino`: un *pool* de órdenes y
escaneo libre que se autoasigna a la orden que corresponda, agrupando por tarima.

## Objetivo

Agregar un segundo modo de validación en Surtido, elegible al iniciar una validación:

- **Por Orden** — el flujo actual, sin cambios de comportamiento.
- **Por Lote** — se elige una fecha, se carga el pool de órdenes de esa fecha, y los
  códigos escaneados se asignan automáticamente a la orden del pool que los contenga.
  Las cajas se agrupan en tarimas; cada tarima tiene su ubicación.

## Decisiones tomadas

| # | Decisión | Elegido |
|---|---|---|
| 1 | Nombre del modo | "Por Lote" (`por_lote`), frente a "Por Orden" (`por_orden`) |
| 2 | Modelo de registro | Al confirmar se crea **una `pick_session` por orden tocada** + sus `pick_events`, agrupadas por una fila en `pick_batches` |
| 3 | Momento de persistencia | Borrador **local** (localStorage) durante el escaneo; **un commit atómico** al confirmar |
| 4 | Campo de fecha del pool | `outboundTime` del sheet outbound (mismo campo que usa `getOrderDateKey` en Despacho) |

Consecuencia de (2): `Registros`, `Historial`, `OrdenDetalle`, `pick_order_tracking`,
`pick_box_status` y los exports siguen funcionando sin cambios; una validación por lote
aparece en Registros como N sesiones normales, adicionalmente etiquetadas con su lote.

Consecuencia de (3): un corte de luz o un refresh no pierde el borrador (vive en
localStorage por pestaña). Perder el dispositivo antes de confirmar sí pierde el borrador;
se acepta el riesgo a cambio de que nada se guarde en la base sin confirmación explícita.

## Arquitectura

```
Validacion.jsx  (page, ya existe)
├── ValidacionTypeModal.jsx      [nuevo]  elige por_orden | por_lote (+ fecha)
├── TabSession                   (existe) modo por_orden — sin cambios funcionales
└── ValidarPorLote.jsx           [nuevo]  modo por_lote

frontend/src/modules/Surtido/
├── components/
│   ├── ValidacionTypeModal.jsx      [nuevo]
│   ├── ValidarPorLote.jsx           [nuevo]  orquestador del modo lote
│   ├── LotePoolSidebar.jsx          [nuevo]  panel lateral de órdenes + detalle de cajas
│   ├── LoteTarimaPanel.jsx          [nuevo]  tarima activa, cerrar tarima, ubicación
│   ├── LoteResumenCards.jsx         [nuevo]  tarjetas órdenes / cajas / tarimas
│   ├── LoteForzarFechaModal.jsx     [nuevo]  alerta de caja de otra fecha (±1 día)
│   └── LoteConfirmarModal.jsx       [nuevo]  confirmación / cancelación del lote
├── hooks/
│   └── useLoteDraft.js              [nuevo]  estado del borrador + persistencia local
├── utils/
│   ├── locationValue.js             [extraído de Validacion.jsx]
│   ├── itemMatching.js              [extraído de Validacion.jsx]
│   ├── lotePool.js                  [nuevo]  índice código→orden del pool
│   └── tarima.js                    [nuevo]  refs T01, T02, …
└── services/surtidoService.js       [+ funciones de lote]
```

### Unidades y responsabilidades

- **`lotePool.js`** — dado el arreglo de órdenes del sheet para una fecha, construye
  `{ orders, codeIndex }` donde `codeIndex: Map<variante_de_código, { orderNo, boxKey, limit }>`.
  Reusa `generateCodeVariations` / `normalizeCodeFast` y la misma lógica de límites por
  código que `buildExpectedCodeLimits`. No conoce React.
- **`useLoteDraft.js`** — única fuente de verdad del borrador: fecha, pool, tarimas,
  escaneos, ubicaciones, contadores. Expone `scan(code, { force })`, `closeTarima(ubicacion)`,
  `removeLastScan()`, `removeScan(id)`, `removeTarima(ref)`, `reset()`. Persiste en
  localStorage en cada mutación. No hace red.
- **`ValidarPorLote.jsx`** — compone hook + subcomponentes, maneja el modal de forzado,
  la confirmación y la llamada al commit. Es el único que habla con el servicio.
- **Backend `pick-batch`** — un endpoint de commit atómico y uno de lectura.

## Flujo de datos

### 1. Inicio

`Validacion.jsx` → botón "Iniciar validación" → `ValidacionTypeModal`:

- **Por Orden** → abre la pestaña como hoy (`TabSession`, step `search`).
- **Por Lote** → pide una fecha (default: hoy). Al aceptar se crea una pestaña
  `{ tipo: 'por_lote', fecha }` que renderiza `ValidarPorLote`.

### 2. Carga del pool

`getOutboundBatchByDate(dateKey)` (nuevo, en `googleSheetsService.js`) recorre **una sola vez**
las filas ya cacheadas del sheet outbound (una fila = una caja) y devuelve:

```js
{
  orders: [{
    outboundOrderNo, thirdOrderNo, receiverName, logisticsTrackNo, logisticsChannel,
    outboundTime, dateKey, expectedCount,
    packageList: [{ customizeCode, boxType, quantity }],   // igual que getOutboundDetail
  }],
  byDate: Map<dateKey, orderNo[]>,   // incluye día anterior y posterior, para la tolerancia
}
```

Se cargan tres días (D-1, D, D+1) para poder resolver la tolerancia sin una segunda pasada.
El pool "activo" es solo D; D±1 se usa exclusivamente para reconocer una caja fuera de fecha.

### 3. Escaneo

Para cada código escaneado, en orden:

1. Normaliza (`normalizeScanCode`) y genera variantes.
2. Busca en el `codeIndex` del día D.
   - **Match** → asigna a esa orden, resultado `ok`, salvo que la caja ya tenga sus
     unidades completas → `duplicate`.
   - **Sin match** → busca en el índice de D-1 / D+1.
     - **Match fuera de fecha** → abre `LoteForzarFechaModal` con el mensaje explícito:
       *"Esta caja pertenece a la orden {OBC} con fecha {fecha_caja}, no a la fecha que
       estás validando ({fecha_lote}). Revisa que sea la caja correcta antes de forzarla."*
       El operador puede **forzar** (queda marcada `forced_date_mismatch`) o **rechazar**.
     - **Sin match en ningún día** → `not_found`, sonido de error, entra al feed de
       rechazados. No se ofrece forzado (no hay orden a la que asignarla).
3. Tolerancia máxima: **±1 día**. Una caja de D-2 o D+2 se trata como `not_found`.

Todo escaneo `ok` se asigna a la **tarima activa** con la ubicación pendiente de captura.

### 4. Tarimas y ubicación

- La tarima activa arranca en `T01` (`tarima.js: genTarimaRef`, formato `T` + 2 dígitos,
  idéntico al de Despacho).
- "Cerrar tarima" pide la **ubicación** con el mismo input y las mismas reglas que el modo
  por orden (`validateLocationValue`, máx. 16 caracteres, detección de payload de escáner).
  La ubicación se guarda en la tarima y se copia a cada `pick_event` de esa tarima
  (`ubicacion_nota`), que es como Registros ya la lee hoy.
- Al cerrar, se abre automáticamente `T02` y se vuelve a pedir ubicación al cerrarla.
- El código de tarima es solo interno/visual; lo que importa en los registros es la ubicación.

### 5. Panel lateral

`LotePoolSidebar` lista las órdenes del pool separadas en **Completas** y **Pendientes**
(mismo criterio que `isOrderComplete` / `isOrderPending` de Despacho: `validadas >= esperadas`).
Al hacer clic en una orden se expande su detalle:

- Cajas validadas: código, hora, usuario, ubicación, tarima.
- Cajas pendientes: código esperado y cuántas unidades faltan.

### 6. Tarjetas de resumen

`LoteResumenCards`, arriba del área de escaneo: **órdenes completas / total**, **cajas
validadas**, **tarimas cerradas (+ activa)**. Se recalculan desde el borrador, sin red.

### 7. Eliminaciones y permisos

Se reusan los niveles existentes de `surtido.validacion` (no hay permisos nuevos):

| Acción | Nivel requerido |
|---|---|
| Escanear, cerrar tarima, confirmar lote | `crear` |
| Eliminar **el último** escaneo | `crear` |
| Eliminar **la última** tarima (con sus escaneos) | `crear` |
| Eliminar **cualquier** escaneo o **cualquier** tarima | `eliminar` |
| Cancelar todo el lote | `crear` (con confirmación explícita) |

La regla se evalúa en el hook (UI) y se re-verifica en el backend para lo que ya está
confirmado. Mientras el lote es borrador, todo ocurre en local.

### 8. Confirmación

- **Cancelar lote** → modal de confirmación; borra el borrador local. Nada tocó la base.
- **Confirmar lote** → `POST /wmshub/pick-batch/commit` con el borrador completo.
  Hasta ese momento el lote no existe en la base.
- El botón de confirmar se deshabilita si hay una tarima abierta sin ubicación.

## Modelo de datos

Migración `108_surtido_pick_batches.sql`:

```sql
CREATE TABLE IF NOT EXISTS pick_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  fecha_lote DATE NOT NULL,
  operator_id INTEGER REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado','cancelado')),
  total_ordenes INTEGER NOT NULL DEFAULT 0,
  total_cajas INTEGER NOT NULL DEFAULT 0,
  total_tarimas INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  confirmed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pick_batch_tarimas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES pick_batches(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  tarima_ref TEXT NOT NULL,
  ubicacion_nota TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (batch_id, tarima_ref)
);

ALTER TABLE pick_sessions ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES pick_batches(id);
ALTER TABLE pick_events   ADD COLUMN IF NOT EXISTS tarima_ref TEXT;
ALTER TABLE pick_events   ADD COLUMN IF NOT EXISTS forced_date_mismatch BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pick_batches_tenant_fecha ON pick_batches(tenant_id, fecha_lote DESC);
CREATE INDEX IF NOT EXISTS idx_pick_sessions_batch ON pick_sessions(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pick_events_tarima ON pick_events(session_id, tarima_ref) WHERE tarima_ref IS NOT NULL;
```

RLS: las dos tablas nuevas siguen el patrón de `103_rls_force_and_policies.sql`
(`FORCE ROW LEVEL SECURITY` + política por `app.tenant_id`).

## API

### `POST /wmshub/pick-batch/commit`
Permiso `surtido.validacion:crear`. Cuerpo:

```jsonc
{
  "fecha_lote": "2026-08-17",
  "notes": "…",
  "tarimas": [{ "tarima_ref": "T01", "ubicacion_nota": "A1-01-01-01", "closed_at": "…" }],
  "orders": [{
    "outbound_order_no": "OBC…",
    "third_order_no": "…",
    "receiver_name": "…", "logistics_track_no": "…", "logistics_channel": "…",
    "outbound_delivery_at": "…",
    "total_expected": 12,
    "expected_boxes": [ /* snapshot del sheet, igual que POST /scan-session */ ],
    "events": [{
      "scanned_code": "…", "normalized_code": "…",
      "matched_box_type": "…", "matched_sku": null,
      "scan_result": "ok",
      "quantity": 1,
      "tarima_ref": "T01",
      "ubicacion_nota": "A1-01-01-01",
      "forced_date_mismatch": false,
      "scanned_at": "2026-08-17T18:22:03.000Z",
      "client_event_id": "…"
    }]
  }]
}
```

Ejecuta todo en un `req.tTransaction`:

1. Inserta `pick_batches` y `pick_batch_tarimas`.
2. Por cada orden: reusa la misma lógica de `POST /scan-session` (una `pick_sessions` por
   orden; reabre/reutiliza la existente si la hay) y le fija `batch_id`.
3. Inserta los `pick_events` con `tarima_ref`, `ubicacion_nota`, `forced_date_mismatch`,
   `operator_id` y `scanned_at` del cliente, re-validando cada `ok` contra
   `expected_boxes` con los mismos helpers que `POST /scan-event`
   (`matchExpectedBox`, degradación a `duplicate` al exceder la cantidad esperada).
4. `refreshPickSessionTotals` y upsert de `pick_box_status` = `'validada'` por caja `ok`.
5. `upsertOrderTrackingSnapshot` por orden.
6. Cierra cada sesión con `complete` o `with_discrepancies` según `ok >= total_expected`.

**Idempotencia**: `client_event_id` es único por evento; un reintento del mismo commit
(red cortada tras el `COMMIT`) no duplica eventos. Se implementa con un índice único
parcial sobre `(tenant_id, client_event_id)` y `ON CONFLICT DO NOTHING`.

Respuesta: `{ success, data: { batch, sessions: [{ outbound_order_no, session_id, ok, duplicados, rechazados }] } }`.

### `GET /wmshub/pick-batches` y `GET /wmshub/pick-batch/:id`
Permiso `surtido.validacion:ver` o `surtido.registros:ver`. Listado paginado por fecha y
detalle con sus sesiones, tarimas y eventos. Alimenta la consulta desde Registros.

### `DELETE /wmshub/pick-batch/:id/tarima/:ref` y `DELETE /wmshub/scan-event/:id`
El borrado de eventos ya existe. Se agrega el borrado de una tarima confirmada completa,
con permiso `surtido.validacion:eliminar`.

## Manejo de errores

- **Sheet sin cargar / sin órdenes para la fecha** → estado vacío explicativo con botón de
  refrescar el sheet, no un pool vacío silencioso.
- **Caja de otra fecha (±1 día)** → modal de forzado con OBC y ambas fechas visibles.
- **Caja de ±2 días o desconocida** → rechazo con el motivo real ("no pertenece a ninguna
  orden del lote ni de los días adyacentes"), nunca un genérico.
- **Commit falla** → la transacción hace ROLLBACK, el borrador local **no se borra**, y se
  muestra el error con opción de reintentar. Es el único punto donde el operador puede
  perder trabajo, y por eso es transaccional y reintentable.
- **Offline al confirmar** → se bloquea el commit con `OfflineBlockedModal` (el mismo que
  usa `ValidarPorDestino`) y el borrador queda intacto hasta que vuelva la conexión.

## Pruebas

Unitarias (Vitest):
- `lotePool`: índice de códigos, variantes, límites por caja, separación D / D±1.
- `useLoteDraft`: ok / duplicate / not_found, forzado, cierre de tarima con ubicación,
  borrar último escaneo, borrar tarima, reglas de permisos, round-trip por localStorage.
- `tarima.js`: generación y normalización de refs.

Integración (backend):
- Commit crea N sesiones + eventos + tarimas y deja los totales correctos.
- Commit repetido con los mismos `client_event_id` no duplica.
- Un `ok` cuyo código no está en `expected_boxes` se rechaza.
- Exceder la cantidad esperada degrada a `duplicate`.
- Aislamiento por tenant en las dos tablas nuevas.

E2E (Playwright), flujo crítico:
iniciar por lote → elegir fecha → escanear cajas de dos órdenes → cerrar tarima con
ubicación → escanear caja de otra fecha y forzarla → confirmar → verificar en Registros.

## Fuera de alcance

- Cambiar el comportamiento del modo por orden.
- Impresión de etiquetas de tarima.
- Reabrir un lote ya confirmado para seguir escaneando (se abre un lote nuevo).

# Inventario — Export de detalles: columnas de ubicación

**Fecha:** 2026-07-21
**Módulo:** Inventario / Registros de escaneo

## Contexto

El export de detalles (masivo y de sesión única) del módulo Inventario > Registros muestra hoy dos columnas de ubicación con nombres genéricos que no dejan claro su origen ni su semántica:

- **"Ubicación origen"** — texto libre que el operador escribe manualmente al iniciar la sesión de escaneo. Se persiste en `inv_sessions.origin_location`. No proviene de WMS.
- **"Ubicación"** — capturada por escaneo, viene de `inv_scans.cell_no`, que sí es un dato real leído del snapshot de WMS (Google Sheet) en el momento del escaneo.

Además, existe un tercer dato de ubicación — la ubicación destino de la sesión (`ubicacion_id` → `dev_ubicaciones`, expuesta por el backend como `ubicacion_codigo`) — que ya se calcula y se devuelve en el payload de ambos endpoints de export, pero se descarta antes de construir el archivo, por lo que hoy no aparece en el export.

Esto genera confusión al leer el archivo exportado: no es evidente cuál columna es un dato manual, cuál es un dato real de WMS, y falta el destino.

## Objetivo

Renombrar y completar las columnas de ubicación en el export de detalles para que las 3 sean explícitas:

1. **Ubicacion Trabajo** (antes "Ubicación origen") — dato manual del operador, sin cambios de fuente.
2. **Ubicacion Origen WMS** (antes "Ubicación") — dato real de WMS capturado al escanear, sin cambios de fuente.
3. **Ubicacion Destino** (nueva) — ubicación destino de la sesión, ya calculada en backend, agregada al mapeo del export.

## Restricción de alcance

`inventario.registros.origin_location` y `inventario.escaneo.location` son claves i18n **compartidas** con encabezados de tablas en pantalla (Registros.jsx líneas 690, 752; Escaneo.jsx líneas 1016, 1148). Renombrar el texto de esas claves cambiaría también esas tablas en vivo, lo cual está fuera de alcance. Por lo tanto no se tocan.

**Hallazgo de pre-flight (post-aprobación inicial):** ya existen dos claves i18n, no detectadas en la investigación inicial, que son la etiqueta establecida en otras partes de la UI (modal de detalle de sesión, `QuickCodeSearchModal.jsx`) para dos de estos mismos datos:

- `inventario.registros.work_location` = "Ubic. trabajo" — label ya usado para `sessionData.origin_location` en Registros.jsx:557 y QuickCodeSearchModal.jsx:243.
- `inventario.registros.destination_location` = "Ubic. destino" — label ya usado para `sessionData.ubicacion_codigo` en Registros.jsx:558 y QuickCodeSearchModal.jsx:247.

Decisión (confirmada con el usuario): **reutilizar ambas claves existentes en el export**, en vez de crear claves nuevas con el texto literal "Ubicacion Trabajo" / "Ubicacion Destino". El texto final en el export será "Ubic. trabajo" y "Ubic. destino", consistente con el resto de la app. Solo se agrega **una** clave i18n nueva y exclusiva del export, para "Ubicación Origen WMS" (no existe ninguna clave reutilizable con ese significado).

## Diseño

### 1. Clave i18n nueva

Agregar en `frontend/src/core/stores/locales/es.js` y `frontend/src/core/stores/locales/zh.js`, junto a las claves `inventario.registros.*` existentes:

| Clave | ES | ZH (referencia) |
|---|---|---|
| `inventario.registros.export_ubicacion_origen_wms` | Ubicacion Origen WMS | 库位 |

Las otras dos columnas reutilizan `inventario.registros.work_location` y `inventario.registros.destination_location` sin modificarlas.

### 2. Export masivo (`INV_DETAIL_HEADERS` / `buildInvDetailRows`, Registros.jsx ~1100-1136)

- Header en la posición de "Ubicación origen" → usa `t('inventario.registros.work_location')`. Fuente de dato sin cambios: `s.origin_location`.
- Header en la posición de "Ubicación" → usa `t('inventario.registros.export_ubicacion_origen_wms')`. Fuente de dato sin cambios: `sc.cell_no`.
- Nuevo header insertado inmediatamente después → `t('inventario.registros.destination_location')`. Fuente de dato: `s.ubicacion_codigo` (ya presente en el payload de `POST /wmshub/inventory-sessions/export-detail`, `data.sessions[].ubicacion_codigo`).
- Orden final de columnas: Sección, Tipo, Operador, Tarima, Código 1, Código 2, Ubic. trabajo, Ubicacion Origen WMS, Ubic. destino, Estado, Fecha escaneo.

### 3. Export de sesión única (`handleExportDetail`, Registros.jsx ~462-494, headers en línea 477)

Mismo tratamiento: header de "Ubicación origen" → clave `work_location`, header de "Ubicación" → clave nueva `export_ubicacion_origen_wms`, insertar header `destination_location`, y mapear `sessionData.ubicacion_codigo` en la fila correspondiente (dato ya presente en `GET /wmshub/inventory-session/:id`).

### 4. Backend

Sin cambios. Ambos endpoints (`wms.routes.js:2107-2140` y `:2144-2199`) ya hacen `LEFT JOIN dev_ubicaciones` y devuelven `ubicacion_codigo` en el payload.

## Fuera de alcance

- No se toca la columna "Ubicación Destino" ya existente como label en el modal de detalle de sesión (Registros.jsx:558) ni en `QuickCodeSearchModal.jsx:247` — ambas usan la clave `destination_location`, que no se modifica.
- No se renombran encabezados de tablas en pantalla (Registros.jsx, Escaneo.jsx).
- No se agregan nuevos campos a la base de datos.

## Testing

Verificación manual:
1. Exportar detalle de una sesión individual desde el modal de sesión → confirmar 3 columnas de ubicación con los nombres y datos correctos.
2. Exportar detalle masivo de varias sesiones seleccionadas → mismo chequeo, incluyendo sesiones sin `ubicacion_id` asignado (columna Destino debe quedar vacía o con placeholder, no romper el archivo).
3. Confirmar que las tablas en pantalla de Registros.jsx y Escaneo.jsx no cambiaron sus encabezados.

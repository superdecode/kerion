# Despacho — Folios: columna Destino

**Fecha:** 2026-07-22
**Módulo:** Despacho / Folios

## Contexto

La lista de Folios (`frontend/src/modules/Despacho/pages/Folios.jsx`) no muestra el destino del folio, ni en la tabla en pantalla ni en su export a Excel. Un folio (`dispatch_folios`) puede ser de dos tipos:

- **`por_destino`** — se creó eligiendo un único destino/canal; ese valor se persiste directo en `dispatch_folios.destino` (texto simple).
- **`por_orden`** — se arma agregando órdenes individuales una por una; no tiene un destino único a nivel folio. Cada orden (`dispatch_folio_orders`) trae su propio `destinatario`, que puede variar entre órdenes del mismo folio.

Ya existe un precedente de este patrón "un destino o varios, según el caso" en `PrintFolioContent.jsx` (`getUniqueDestinations`), que dedupe los `destinatario` de las órdenes de un folio y decide el label singular/plural — pero los une con `' / '`, no con comas.

## Objetivo

Agregar una columna **Destino** a la tabla de Folios y a su export a Excel:

- Folios `por_destino` → muestran su único `destino`.
- Folios `por_orden` → muestran los `destinatario` distintos de sus órdenes, **separados por coma** si hay más de uno.

## Diseño

### 1. Backend — agregación en la query de lista

`backend/src/modules/despacho/routes/folios.routes.js`, query de `GET /` (líneas ~174-193). Se agrega una agregación más al `SELECT`, siguiendo el mismo patrón ya usado para `outbound_order_nos` (línea 180):

```sql
COALESCE(array_agg(DISTINCT fo.destinatario) FILTER (WHERE fo.destinatario IS NOT NULL AND fo.destinatario <> ''), '{}') AS destinatarios,
```

No requiere cambios en `GROUP BY` (los `array_agg` existentes ya agrupan solo por `f.id` y las columnas no agregadas del `JOIN`). `f.destino` ya viene incluido vía `f.*`.

### 2. Frontend — helper de display

En `Folios.jsx`, una función que decide qué mostrar según `folio.tipo`:

```js
function folioDestinoDisplay(folio) {
  if (folio.tipo === 'por_destino') return folio.destino || ''
  return (folio.destinatarios || []).filter(Boolean).join(', ')
}
```

- `por_destino`: usa `folio.destino` directo (fuente autoritativa para ese tipo, igual que en `FolioDetalle.jsx` y `ValidarPorDestino.jsx`). No se mezcla con `destinatarios` aunque el array exista.
- `por_orden`: junta los `destinatarios` distintos con `, `. Si no hay ninguno, cadena vacía (la UI ya maneja vacíos con `—`, igual que las demás columnas de esta tabla).

### 3. Columna en la tabla

Orden final de columnas: **Folio, Fecha Creación, Destino, Estado, Conductor, Unidad, # Órdenes, # Cajas, Acciones** (Destino insertado entre Fecha Creación y Estado, líneas ~495-502 y ~528-537).

Celda de datos: `folioDestinoDisplay(folio)`, con fallback visual `—` cuando esté vacío, igual que Conductor/Unidad en la misma tabla (líneas ~538-546).

### 4. Columna en el export a Excel

`exportFoliosSelected()` (líneas ~225-260): se agrega `folioDestinoDisplay(folio)` a cada fila y el header correspondiente al array de headers, en la misma posición relativa (después de Fecha Creación).

### 5. i18n

Se reutiliza la clave existente **`desp.col.destino`** (= "Destino"), ya usada en `Ordenes.jsx` (tabla y export) con el mismo texto exacto — mismo módulo Despacho, mismo significado. No se crea clave nueva.

## Fuera de alcance

- No se toca `PrintFolioContent.jsx` (`getUniqueDestinations`, delimitador `' / '`) — vista distinta (impresión/preview), no mencionada en el pedido.
- No se agrega edición del destino desde esta vista — solo lectura/visualización.
- No se toca `FolioDetalle.jsx`, `AgendaView.jsx`, dashboard, ni ninguna otra vista fuera de la lista de Folios y su export.
- No se crean columnas ni tablas nuevas en base de datos — solo se agrega una agregación a una query existente.

## Testing

Sin infraestructura de tests automatizados en este proyecto (frontend ni para queries SQL ad-hoc de este tipo). Verificación manual:

1. Un folio `por_destino` → columna Destino muestra el valor único de `folio.destino`.
2. Un folio `por_orden` con una sola `destinatario` distinta entre sus órdenes → columna muestra ese único valor (sin coma).
3. Un folio `por_orden` con 2+ `destinatario` distintos → columna muestra todos, separados por coma.
4. Un folio `por_orden` sin órdenes (o sin destinatario en ninguna) → columna muestra `—`, no rompe la tabla.
5. Export a Excel de una selección mixta de folios → columna Destino presente y coherente con lo mostrado en pantalla para cada fila.

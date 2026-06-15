# Módulo Recepción — Diseño técnico
**Fecha:** 2026-06-15
**Estado:** Aprobado para implementación

---

## Propósito

Sistema de validación de entrada de mercancía al almacén. Reemplaza el proceso en Google Sheets. Permite importar el archivo WMS, crear órdenes de recepción con folio INB- y validar cajas mediante escaneo, con trazabilidad completa.

---

## Estructura de archivos

### Frontend
```
frontend/src/modules/Recepcion/
  pages/
    Recibir.jsx                  Vista principal — tabla de órdenes con filtros
    RecepcionDetalle.jsx         Detalle de orden con tabs Detalle y Validación
    ValidacionRecepcion.jsx      Pantalla de escaneo (no modal, vista dedicada)
  components/
    ImportarOrdenModal.jsx       Modal 2 pasos: upload → review (base: SalidaImportModal)
    ColumnMappingModal.jsx       Mapeo manual cuando encabezados no coinciden
    ListaRecepcionReport.jsx     Reporte imprimible agrupado por código base
  services/
    recepcionService.js          Llamadas API del módulo
```

### Backend
```
backend/src/modules/recepcion/
  routes/
    recepcion.routes.js          CRUD órdenes + líneas
    validacion.routes.js         Escaneos + sesiones de validación
    reporte.routes.js            Lista de recepción
backend/migrations/
  061_recepcion_module.sql
```

---

## Base de datos (migration 061)

### Tablas

**`inbound_orders`**
```sql
id UUID PK, tenant_id UUID NOT NULL,
folio TEXT NOT NULL,                          -- INB-YYYYMMDD-XX
cliente TEXT, inbound_order_no TEXT,
tracking_no TEXT, reference_no TEXT,
estado TEXT DEFAULT 'pendiente_validacion'    -- pendiente_validacion | en_validacion | completo | parcial | cancelado
  CHECK (estado IN (...)),
total_cajas INT DEFAULT 0,
cajas_validadas INT DEFAULT 0,
responsable_id INT REFERENCES usuarios(id),
created_at TIMESTAMPTZ DEFAULT now(),
updated_at TIMESTAMPTZ DEFAULT now()
UNIQUE (tenant_id, folio)
```

**`inbound_lines`**
```sql
id UUID PK, tenant_id UUID NOT NULL,
order_id UUID REFERENCES inbound_orders(id) ON DELETE CASCADE,
box_type TEXT, custom_box_barcode TEXT,
sku TEXT, qty_per_box INT,
estado_validacion TEXT DEFAULT 'pendiente'   -- pendiente | validada | faltante
  CHECK (estado_validacion IN (...)),
validated_by INT REFERENCES usuarios(id),
validated_at TIMESTAMPTZ,
notas TEXT,
created_at TIMESTAMPTZ DEFAULT now()
```

**`inbound_scan_events`**
```sql
id UUID PK, tenant_id UUID NOT NULL,
order_id UUID REFERENCES inbound_orders(id) ON DELETE CASCADE,
line_id UUID REFERENCES inbound_lines(id),   -- NULL si no encontrado
codigo_escaneado TEXT NOT NULL,
match_field TEXT,                             -- 'custom_box_barcode' | 'box_type' | NULL
sku_asociado TEXT,
resultado TEXT NOT NULL                       -- 'correcto' | 'duplicado' | 'no_encontrado'
  CHECK (resultado IN (...)),
scanned_by INT REFERENCES usuarios(id),
scanned_at TIMESTAMPTZ DEFAULT now(),
created_at TIMESTAMPTZ DEFAULT now()
```

**`inbound_validation_sessions`**
```sql
id UUID PK, tenant_id UUID NOT NULL,
order_id UUID REFERENCES inbound_orders(id) ON DELETE CASCADE,
user_id INT REFERENCES usuarios(id),
inicio_at TIMESTAMPTZ DEFAULT now(),
fin_at TIMESTAMPTZ,
total_escaneado INT DEFAULT 0,
tarimas_enabled BOOL DEFAULT false,
created_at TIMESTAMPTZ DEFAULT now()
```

### Índices
```sql
idx_inbound_orders_tenant      ON inbound_orders(tenant_id, estado, created_at DESC)
idx_inbound_orders_tracking    ON inbound_orders(tenant_id, tracking_no)
idx_inbound_orders_cliente     ON inbound_orders(tenant_id, cliente)
idx_inbound_lines_order        ON inbound_lines(tenant_id, order_id, estado_validacion)
idx_inbound_scan_events_order  ON inbound_scan_events(tenant_id, order_id, scanned_at DESC)
idx_inbound_validation_sessions ON inbound_validation_sessions(tenant_id, order_id)
```

---

## Generación de folio

Patrón: `INB-YYYYMMDD-XX` (contador diario por tenant, igual que `DSP-` en despacho).

```js
async function generateFolioNumero(req) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const countRes = await req.tQuery(
    `SELECT COUNT(*) FROM inbound_orders WHERE tenant_id=$1 AND folio LIKE $2`,
    [req.tenantId, `INB-${dateStr}-%`]
  )
  const seq = String(parseInt(countRes.rows[0].count) + 1).padStart(4, '0')
  return `INB-${dateStr}-${seq}`
}
```

---

## Import modal — mapeo de encabezados

Los 8 campos estándar con normalización de encabezados (lowercase, sin espacios ni caracteres especiales):

| Campo sistema | Encabezados WMS reconocidos |
|---|---|
| `cliente` | `client` |
| `inbound_order_no` | `inboundorderno` |
| `tracking_no` | `trackingno`, `cargono` |
| `reference_no` | `referenceno` |
| `box_type` | `boxtype` |
| `custom_box_barcode` | `customboxbarcode` |
| `sku` | `sku` |
| `qty_per_box` | `qtyperbox` |

**Flujo:**
1. Cargar archivo → `xlsx.utils.sheet_to_json` → normalizar todas las claves
2. Comparar con tabla de encabezados esperados
3. Si todos 8 coinciden → ir al paso 2 (review) directamente
4. Si alguno falla → abrir `ColumnMappingModal`: columnas del archivo a la izquierda, selector de campo sistema a la derecha, pre-asignando coincidencias parciales
5. Paso 2: tabla virtual con todos los registros, barra búsqueda interna, indicadores visuales de filas con campos vacíos, botón Confirmar e importar

**Capacidad:** Hasta 2000 registros. Procesamiento 100% en memoria, sin paginación interna del modal. `xlsx` carga todo el array en `sheet_to_json`, se pasa directamente al estado React.

---

## API endpoints

### recepcion.routes.js
```
GET    /api/recepcion/orders           Lista con filtros (cliente, estado, tracking, referencia, fechas)
POST   /api/recepcion/orders           Crear orden + líneas (recibe array de rows del Excel)
GET    /api/recepcion/orders/:id       Detalle de orden con líneas
PATCH  /api/recepcion/orders/:id       Actualizar estado / datos de encabezado
DELETE /api/recepcion/orders/:id       Eliminar orden (solo estado pendiente_validacion)
PATCH  /api/recepcion/lines/:id        Actualizar estado_validacion de línea individual
DELETE /api/recepcion/lines/:id        Eliminar línea individual
```

### validacion.routes.js
```
POST   /api/recepcion/orders/:id/sessions          Crear sesión de validación
PATCH  /api/recepcion/orders/:id/sessions/:sid     Actualizar sesión (fin_at, total)
POST   /api/recepcion/orders/:id/scan              Procesar escaneo (devuelve resultado + línea actualizada)
GET    /api/recepcion/orders/:id/scan-events       Historial de escaneos de la orden
```

### reporte.routes.js
```
GET    /api/recepcion/orders/:id/lista-recepcion   Datos para el reporte imprimible
```

---

## Lógica de escaneo (backend)

```
POST /api/recepcion/orders/:id/scan
  body: { codigo_escaneado, tarimas_enabled }

1. Normalizar código (lowercase, trim)
2. Buscar en inbound_lines WHERE order_id=$id AND custom_box_barcode = $codigo
3. Si no → buscar WHERE order_id=$id AND box_type = $codigo
4. Si encontrado:
   a. Si estado_validacion = 'pendiente':
      - UPDATE inbound_lines SET estado_validacion='validada', validated_by, validated_at
      - UPDATE inbound_orders SET cajas_validadas = cajas_validadas + 1 (si pasa a completo → cambiar estado)
      - INSERT inbound_scan_events (resultado='correcto', match_field)
      - Return { resultado: 'correcto', line, tarima_num (si habilitado) }
   b. Si estado_validacion = 'validada':
      - INSERT inbound_scan_events (resultado='duplicado')
      - Return { resultado: 'duplicado' }
5. Si no encontrado:
   - INSERT inbound_scan_events (resultado='no_encontrado', line_id=NULL)
   - Return { resultado: 'no_encontrado' }
```

---

## Toggle de tarimas virtuales

**Código base** = prefijo del `custom_box_barcode` eliminando el sufijo numérico final:
- `ABC-001` → `ABC`
- `ABC-002` → `ABC` (misma tarima)
- `XYZ-10` → `XYZ` (tarima diferente)
- Regex: `código.replace(/-?\d+$/, '')`

**Asignación:** Mapa en memoria cliente-side. Cada código base único recibe número correlativo (1, 2, 3…) en orden de primer escaneo en la sesión. El backend no persiste números de tarima; son efímeros por sesión. Al exportar la Lista de Recepción con tarimas habilitadas, se recalcula el mapa con los datos de la orden.

**UI:** Badge visible en zona de escaneo: `"Tarima 3"` con color por número (ciclo de 10 colores). En pantalla pequeña (PDA), el badge ocupa el 100% del ancho bajo el campo de escaneo.

---

## Pantalla de validación — layout

```
┌─────────────────────────────────────────────────────────┐
│ Header (volver al detalle + folio + estado)              │
├──────────────────┬──────────────────────────────────────┤
│ Panel izquierdo  │ Panel derecho (principal)             │
│ (folio, cliente, │                                       │
│  totales,        │  ┌──────────────────────────────────┐ │
│  estado)         │  │  [ScanBarcode icon]               │ │
│                  │  │  Escanea una caja...              │ │
│ [Validadas N/N]  │  │  ________________________________  │ │
│ [Pendientes N]   │  │  < input autofocus >              │ │
│ [Errores N]      │  └──────────────────────────────────┘ │
│                  │  Último escaneo: [resultado flash]    │
│ Toggle tarimas   │  [Badge tarima si habilitado]         │
└──────────────────┴──────────────────────────────────────┘

Mobile/PDA (< 640px): una sola columna
  - Totales arriba (compactos, font-size grande)
  - Input escaneo fijo al bottom
  - Toggle tarimas colapsado
```

---

## Lista de recepción — reporte

Generado client-side con `xlsx.utils.aoa_to_sheet`. Estructura:

```
Encabezado: Cliente | Orden WMS | Tracking | Referencia | Fecha
Tabla:
  #  | Código Base  | Cajas | SKU | Qty/Caja | [Tarima #]
  1  | ABC          | 5     | SKU1| 10       | [1]
  2  | XYZ          | 3     | SKU2| 20       | [2]
  ─────────────────────────────────────────────────────
  Total: 8 cajas
```

La columna `Tarima #` solo aparece si el usuario la solicita (flag en la llamada al reporte o en UI).

Disponible también como HTML imprimible `@media print { background: none; }`.

---

## Sistema de permisos

### Nuevos permisos
```
recepcion.recibir    ver | crear | actualizar | eliminar
recepcion.validacion ver | crear | actualizar | eliminar
```

### Actualización de roles Administrador
```sql
UPDATE roles
SET permisos = permisos || '{"recepcion": {"recibir": "eliminar", "validacion": "eliminar"}}'::jsonb,
    updated_at = now()
WHERE nombre = 'Administrador'
  AND (permisos -> 'recepcion') IS NULL;
```

### Nivel mínimo por acción
| Acción | Nivel mínimo |
|---|---|
| Ver órdenes y detalles | ver |
| Crear orden (importar Excel) | crear |
| Generar lista de recepción | crear |
| Validar cajas (escaneo) | actualizar |
| Editar líneas, cambiar estados, exportar | actualizar |
| Habilitar clasificación en tarimas | actualizar |
| Eliminar órdenes (solo pendiente_validacion) | eliminar |
| Eliminar líneas individuales | eliminar |

---

## Sidebar

```js
{
  id: 'recepcion',
  label: t('nav.recepcion'),
  icon: PackageCheck,           // lucide-react
  items: [
    {
      path: '/recepcion/recibir',
      label: t('nav.rec.recibir'),
      icon: ClipboardList,
      permission: 'recepcion.recibir'
    }
  ]
}
```

Color theme: `orange`
```js
recepcion: { iconBg: 'bg-orange-500/20', iconColor: 'text-orange-400', activeBg: 'bg-orange-600/15', activeBorder: 'border-orange-500/30' }
```

---

## i18n — claves nuevas

Todos los textos nuevos del módulo deben tener clave en `es` y `zh` en `i18nStore.js`. Prefijo `rec.*`. Ejemplos:

```
rec.title              → Recepción | 收货
rec.recibir.title      → Recibir | 接收
rec.import.title       → Importar orden de entrada | 导入入库单
rec.import.step1       → Cargar archivo | 上传文件
rec.import.step2       → Revisar registros | 审核记录
rec.import.btn.confirm → Confirmar e importar | 确认并导入
rec.folio              → Folio | 单号
rec.status.pendiente_validacion → Pendiente de validación | 待验证
rec.status.en_validacion        → En validación | 验证中
rec.status.completo             → Completo | 完成
rec.status.parcial              → Parcial | 部分完成
rec.status.cancelado            → Cancelado | 已取消
rec.scan.result.correcto        → Caja validada | 箱已验证
rec.scan.result.duplicado       → Duplicado — ya fue escaneado | 重复 — 已扫描
rec.scan.result.no_encontrado   → Código no encontrado en la orden | 未找到编码
rec.tarimas.toggle              → Habilitar clasificación en tarimas | 启用托盘分类
rec.tarimas.label               → Tarima | 托盘
rec.lista_recepcion.title       → Lista de recepción | 收货清单
nav.recepcion                   → Recepción | 收货
nav.rec.recibir                 → Recibir | 接收
```

---

## Orden de implementación

1. Migration SQL 061 (tablas + índices + permisos + tenant_modules)
2. Backend: routes `recepcion.routes.js`, `validacion.routes.js`, `reporte.routes.js` + registro en `server.js`
3. Frontend service `recepcionService.js`
4. Vista principal `Recibir.jsx` (tabla + filtros)
5. `ImportarOrdenModal.jsx` + `ColumnMappingModal.jsx`
6. `RecepcionDetalle.jsx` (2 tabs)
7. `ValidacionRecepcion.jsx` (escaneo + lógica tarimas)
8. `ListaRecepcionReport.jsx` (reporte imprimible)
9. Sidebar + rutas en `App.jsx` + i18n keys
10. Permisos: actualizar `moduleGuard` allowlist y roles Administrador
11. Smoke test: importar 2000 registros → validar cajas → lista de recepción

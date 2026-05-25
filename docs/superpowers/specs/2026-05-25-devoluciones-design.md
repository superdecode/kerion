# Modulo Devoluciones — Spec de Diseno

**Fecha:** 2026-05-25
**Branch objetivo:** feature/devoluciones
**Worktree:** `../kirion-devoluciones` (creado con `git worktree add ../kirion-devoluciones feature/devoluciones`)
**Proyecto:** Kirion WMS

---

## 1. Proposito y contexto

El modulo Devoluciones es una herramienta de registro y control de mercancia devuelta por clientes antes de su entrada al WMS principal. Permite al equipo registrar, inspeccionar y almacenar temporalmente mercancia devuelta, reclamarla oficialmente, y darle entrada al WMS cuando el cliente lo solicite. El equipo chino requiere exportacion de todos los registros.

Flujo principal: **Entradas → Inventario → Salidas**

- Una sesion confirmada en Entradas genera items en Inventario.
- Una salida confirmada descuenta cantidades de Inventario.

---

## 2. Arquitectura general

El modulo sigue exactamente el mismo patron que DropScan:

- **Backend:** Express.js routes en `backend/src/modules/devoluciones/routes/`
- **Frontend:** React pages + services en `frontend/src/modules/devoluciones/`
- **Permisos:** middleware `requirePermission` + store `useAuthStore` con claves `devoluciones.*`
- **i18n:** claves en `i18nStore.js` en es y zh
- **Tenant:** todo registro incluye `tenant_id`

---

## 3. Modelo de datos (migracion 034)

### 3.1 dev_ubicaciones — catalogo de ubicaciones

```sql
CREATE TABLE dev_ubicaciones (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(codigo, tenant_id)
);
```

- No se puede eliminar si tiene inventario activo (validacion en backend).
- Solo se puede desactivar (activo = false).
- Lista muestra cantidad de piezas en stock por ubicacion (query sobre dev_inventario).
- Importacion via Excel: columnas `codigo`, `nombre`, `descripcion`.
- Alta rapida habilitada para usuarios con nivel `actualizar` o superior en `devoluciones.entradas`.

### 3.2 dev_sesiones — registro de entrada (equivalente a tarima en DropScan)

```sql
CREATE TABLE dev_sesiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,                      -- KD20260525L001
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','en_proceso','confirmado','cancelado')),
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  ubicacion_id INTEGER REFERENCES dev_ubicaciones(id),
  notas TEXT,
  confirmado_at TIMESTAMPTZ,
  cancelado_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(codigo, tenant_id)
);
```

**Formato de codigo:** `KD{YYYYMMDD}{L}{NNN}` donde:
- `KD` = prefijo fijo
- `YYYYMMDD` = fecha de creacion (zona horaria del tenant)
- Letra del dia: L=Lunes, M=Martes, X=Miercoles, J=Jueves, V=Viernes, S=Sabado, D=Domingo
- `NNN` = consecutivo de 3 digitos por dia y tenant, reinicia cada dia

Generacion atomica en transaccion (igual que `generateTarimaCodigo` en DropScan).

**Estados:**
- `borrador`: recien creado, sin items o con items parciales, no confirmado
- `en_proceso`: tiene al menos un item registrado
- `confirmado`: bloqueado, items pasados a inventario
- `cancelado`: anulado sin generar inventario

### 3.3 dev_items — items dentro de una sesion

```sql
CREATE TABLE dev_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id UUID NOT NULL REFERENCES dev_sesiones(id) ON DELETE CASCADE,
  codigo_trazabilidad TEXT NOT NULL,         -- KD-{sesion_codigo}-{seq3}
  embalaje1 TEXT,                            -- numero de guia 1 / codigo embalaje principal
  embalaje2 TEXT,                            -- numero de guia 2 / codigo embalaje secundario
  descripcion TEXT,                          -- descripcion del producto
  peso NUMERIC(10,3),                        -- kg
  largo NUMERIC(10,2),                       -- cm
  ancho NUMERIC(10,2),
  alto NUMERIC(10,2),
  multicaja BOOLEAN DEFAULT false,           -- la caja contiene multiples productos diferentes
  es_danado BOOLEAN DEFAULT false,           -- mercancia danada o vacia, requiere evidencia
  notas TEXT,
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  ubicacion_id INTEGER REFERENCES dev_ubicaciones(id),
  en_inventario BOOLEAN DEFAULT false,       -- true tras confirmacion de sesion
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(codigo_trazabilidad, tenant_id)
);
```

**Formato codigo_trazabilidad:** `KD-{sesion_codigo}-{seq3}` (ej: `KD-KD20260525L001-001`).

### 3.4 dev_item_skus — SKUs por item (soporta multicaja)

```sql
CREATE TABLE dev_item_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES dev_items(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  sku2 TEXT,                                 -- SKU secundario opcional
  descripcion TEXT,                          -- autocompletada del historial
  cantidad INTEGER NOT NULL DEFAULT 1,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- Cada item tiene al menos un SKU.
- Si `multicaja = true`, puede tener N filas (N SKUs distintos).
- Autocompletado: al escribir un SKU, buscar en `dev_item_skus` del tenant, devolver descripcion mas reciente.

### 3.5 dev_item_fotos — evidencia fotografica

```sql
CREATE TABLE dev_item_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES dev_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,                -- path en Supabase Storage
  nombre_original TEXT,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- Solo habilitado cuando `es_danado = true`.
- Bucket Supabase: `devoluciones-evidencia/{tenant_id}/{item_id}/{filename}`.

### 3.6 dev_inventario — inventario activo

```sql
CREATE TABLE dev_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES dev_items(id),
  sesion_id UUID NOT NULL REFERENCES dev_sesiones(id),
  sku TEXT NOT NULL,
  sku2 TEXT,
  descripcion TEXT,
  embalaje1 TEXT,
  embalaje2 TEXT,
  codigo_trazabilidad TEXT NOT NULL,
  cantidad_disponible INTEGER NOT NULL DEFAULT 0,
  cantidad_original INTEGER NOT NULL,
  ubicacion_id INTEGER REFERENCES dev_ubicaciones(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

- Una fila por SKU por item (si multicaja, se crean N filas).
- `cantidad_disponible` = cantidad original menos salidas confirmadas.
- Se actualiza atomicamente en cada movimiento/ajuste/salida.

### 3.7 dev_movimientos — auditoria completa

```sql
CREATE TABLE dev_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL
    CHECK (tipo IN ('entrada','salida','ajuste','traslado')),
  inventario_id UUID REFERENCES dev_inventario(id),
  item_id UUID REFERENCES dev_items(id),
  cantidad_anterior INTEGER,
  cantidad_nueva INTEGER,
  ubicacion_anterior_id INTEGER REFERENCES dev_ubicaciones(id),
  ubicacion_nueva_id INTEGER REFERENCES dev_ubicaciones(id),
  referencia_id UUID,                        -- dev_sesiones.id o dev_salidas.id
  referencia_tipo TEXT,                      -- 'sesion' | 'salida' | 'ajuste'
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  motivo TEXT,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- Registro inmutable (no se edita, solo se crea).
- Todo cambio de cantidad o ubicacion genera una fila aqui.

### 3.8 dev_ajustes — registro de ajustes e inventario fisico

```sql
CREATE TABLE dev_ajustes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('ajuste','movimiento')),
  estado TEXT NOT NULL DEFAULT 'confirmado'
    CHECK (estado IN ('borrador','confirmado','cancelado')),
  descripcion TEXT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

- **Tipo ajuste:** edita cantidades en `dev_inventario`, registra en `dev_movimientos` tipo `ajuste`.
- **Tipo movimiento:** traslada items/tarimas completas a nueva ubicacion, registra tipo `traslado`.

### 3.9 dev_salidas — ordenes de salida

```sql
CREATE TABLE dev_salidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,                      -- KDS20260525L001
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','pendiente','en_proceso','completado','cancelado')),
  notas TEXT,
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  completado_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(codigo, tenant_id)
);
```

**Formato codigo salida:** `KDS{YYYYMMDD}{L}{NNN}` (prefijo KDS en lugar de KD).

### 3.10 dev_salida_items — lineas de orden de salida

```sql
CREATE TABLE dev_salida_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salida_id UUID NOT NULL REFERENCES dev_salidas(id) ON DELETE CASCADE,
  inventario_id UUID NOT NULL REFERENCES dev_inventario(id),
  sku TEXT NOT NULL,
  descripcion TEXT,
  codigo_trazabilidad TEXT,
  ubicacion_id INTEGER REFERENCES dev_ubicaciones(id),
  cantidad_solicitada INTEGER NOT NULL,
  cantidad_surtida INTEGER,
  surtido BOOLEAN DEFAULT false,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. Permisos

Claves de permiso nuevas (agregadas en `MODULE_GROUPS` de `Administracion.jsx` y en `moduleGuard`):

| Clave                         | Descripcion                             |
|-------------------------------|-----------------------------------------|
| `devoluciones.entradas`       | Registros de entrada de devoluciones    |
| `devoluciones.inventario`     | Inventario activo y ajustes             |
| `devoluciones.salidas`        | Ordenes de salida                       |

Sin pagina de Configuracion independiente. El control de ubicaciones se expone como boton en la pagina de Inventario, condicionado a nivel `actualizar` o superior en `devoluciones.inventario`.

Niveles aplicados por submodulo:

- `ver`: consultar listas y detalles
- `crear`: crear sesiones, items, salidas, ajustes
- `actualizar`: editar, confirmar, mover, gestionar ubicaciones
- `eliminar`: cancelar sesiones/salidas, eliminar ajustes

---

## 5. Rutas frontend

```
/devoluciones/entradas              — lista de registros de entrada
/devoluciones/entradas/nueva        — crear nueva entrada (o modal)
/devoluciones/entradas/:id          — detalle + registro de items de una entrada
/devoluciones/inventario            — inventario activo + historial + ajustes
/devoluciones/salidas               — lista de ordenes de salida
/devoluciones/salidas/nueva         — crear nueva orden
/devoluciones/salidas/:id           — detalle de una orden
```

Todas protegidas con `<PermissionRoute module="devoluciones.X" />`.

---

## 6. Rutas API backend

Prefijo: `/api/devoluciones`

### Entradas
```
GET    /entradas                              — lista con filtros y paginacion
POST   /entradas                              — crear sesion (genera codigo KD...)
GET    /entradas/:id                          — detalle con items y SKUs
PUT    /entradas/:id                          — editar sesion (ubicacion, notas)
POST   /entradas/:id/confirmar                — confirmar sesion → genera dev_inventario
POST   /entradas/:id/cancelar                 — cancelar sesion
POST   /entradas/:id/items                    — agregar item a sesion
PUT    /entradas/:id/items/:itemId            — editar item
DELETE /entradas/:id/items/:itemId            — eliminar item (solo si sesion no confirmada)
POST   /entradas/:id/items/:itemId/fotos      — subir evidencia (Supabase Storage)
DELETE /entradas/:id/items/:itemId/fotos/:fotoId
```

### Inventario
```
GET    /inventario                            — inventario activo con filtros
GET    /inventario/historial                  — movimientos cronologicos
GET    /inventario/ajustes                    — lista de ajustes/movimientos registrados
POST   /inventario/ajustes                    — crear ajuste o movimiento
PUT    /inventario/ajustes/:id                — editar ajuste (si permisos)
DELETE /inventario/ajustes/:id                — eliminar ajuste (si permisos)
GET    /inventario/ubicaciones                — lista de ubicaciones con stock count
POST   /inventario/ubicaciones                — crear ubicacion
PUT    /inventario/ubicaciones/:id            — editar ubicacion
DELETE /inventario/ubicaciones/:id            — eliminar (bloqueado si tiene inventario activo)
POST   /inventario/ubicaciones/importar       — importar Excel
```

### Salidas
```
GET    /salidas                               — lista con filtros
POST   /salidas                               — crear orden de salida
GET    /salidas/:id                           — detalle
PUT    /salidas/:id                           — editar orden (solo en borrador/pendiente)
POST   /salidas/:id/completar                 — confirmar surtido real → descuenta inventario
POST   /salidas/:id/cancelar
POST   /salidas/importar                      — crear desde Excel (SKU + cantidad)
```

### Utilitarios
```
GET    /sku-autocomplete?q=&tenant_id=        — busqueda de SKUs en historial propio
GET    /export/entradas/:id                   — Excel de una sesion confirmada
GET    /export/salidas/:id                    — Excel de una orden completada
```

---

## 7. Interfaz de usuario

### 7.1 Sidebar

Nuevo grupo independiente en `getNavItems()`:

```js
{
  id: 'devoluciones',
  label: t('nav.devoluciones'),
  items: [
    { path: '/devoluciones/entradas',   label: t('nav.dev.entradas'),   icon: PackageCheck,       permission: 'devoluciones.entradas'   },
    { path: '/devoluciones/inventario', label: t('nav.dev.inventario'), icon: Boxes,              permission: 'devoluciones.inventario' },
    { path: '/devoluciones/salidas',    label: t('nav.dev.salidas'),    icon: ArrowRightFromLine, permission: 'devoluciones.salidas'    },
  ]
}
```

### 7.2 Pagina Entradas

**Lista (`/devoluciones/entradas`):**
- Boton "Nueva entrada" condicionado a `crear`
- Barra de busqueda unica: filtra por codigo KD, embalaje1, embalaje2, SKU, codigo_trazabilidad
- Filtros: estado (chips multiselect), rango de fechas, responsable
- Tabla: Codigo | Fecha | Responsable | Ubicacion | N° items | Estado | Acciones
- Badges de estado con colores consistentes con DropScan
- Exportar Excel en sesiones confirmadas (condicionado a `exportar`)

**Detalle (`/devoluciones/entradas/:id`):**
- Header: codigo KD (con icono de copia), badge estado, responsable, ubicacion (selector condicionado a permisos)
- Lista de items registrados (tabla con columnas: trazabilidad, embalaje1, embalaje2, SKU(s), descripcion, cantidad, peso, medidas, multicaja, danado)
- Formulario de nuevo item (panel lateral o seccion inline):
  - Auto-focus en Embalaje1 al abrir
  - Tab/Enter navega al siguiente campo
  - SKU con autocomplete (busca en historial del tenant)
  - Descripcion autocompletada al seleccionar SKU
  - Boton "+SKU2" para agregar segundo SKU
  - Toggle Multicaja: si activo, permite agregar N filas de SKU con sus cantidades
  - Toggle Danado/vacio: muestra boton "Subir evidencia" si activo
  - Campos opcionales (peso, medidas, notas) colapsables para agilizar escaneo
- Botones: "Guardar" (estado en_proceso), "Confirmar entrada" (modal de confirmacion con resumen)
- Codigo trazabilidad de cada item visible y copiable (icono copy + toast)

### 7.3 Pagina Inventario

Tabs: **[Inventario Actual]** | **[Historial]** | **[Ajustes de inventario]**

**Tab Inventario Actual:**
- Barra de busqueda unica (SKU, embalaje1, embalaje2, descripcion, codigo_trazabilidad)
- Tabla: Trazabilidad | SKU | SKU2 | Descripcion | Embalaje1 | Embalaje2 | Ubicacion | Cantidad disponible
- Boton "Mover mercancia" condicionado a `actualizar` (crea movimiento de traslado)
- Boton "Ubicaciones" condicionado a `actualizar` → modal con catalogo de ubicaciones

**Modal Ubicaciones:**
- Lista: Codigo | Nombre | Pcs en stock | Activo (toggle)
- Agregar ubicacion (formulario inline o modal anidado)
- Importar Excel (plantilla descargable)
- Eliminar: bloqueado si `pcs en stock > 0`, solo permite desactivar

**Tab Historial:**
- Tabla cronologica: Fecha | Tipo | Trazabilidad | SKU | Cantidad anterior | Cantidad nueva | Ubicacion | Usuario | Motivo/Referencia
- Filtros: tipo de movimiento, rango de fechas

**Tab Ajustes de inventario:**
- Lista de ajustes/movimientos registrados con tipo badge (Ajuste / Movimiento)
- Boton "Nuevo" condicionado a `crear` → modal con dos opciones:
  - **Ajuste de cantidad:** seleccionar item(s), ingresar cantidad real, motivo obligatorio → genera movimiento tipo `ajuste`
  - **Movimiento de mercancia:** seleccionar items o tarima completa, seleccionar ubicacion destino → genera movimiento tipo `traslado`
- Editar/eliminar condicionado a nivel de permisos

### 7.4 Pagina Salidas

**Lista:**
- Boton "Nueva salida" condicionado a `crear`
- Tabla: Codigo | Fecha | Responsable | N° lineas | Estado | Acciones
- Filtros: estado, rango de fechas

**Detalle (`/devoluciones/salidas/:id`):**
- Dos modos de carga: manual (buscar items en inventario) o importar Excel
- En importacion Excel: el sistema cruza vs inventario disponible y presenta: encontrados / no encontrados
- Usuario puede editar cantidades, eliminar lineas, agregar nuevas antes de confirmar
- Estados: Borrador → Pendiente → En proceso → Completado/Cancelado
- Boton "Imprimir lista de surtido": PDF/printable con ubicaciones por item
- Boton "Confirmar surtido": modal para editar cantidades reales, marcar no surtidos → descuenta inventario y registra movimientos

---

## 8. Exportacion Excel

Todos los exports se generan con `xlsx` (ya instalado en el proyecto).

**Export de entrada confirmada:**
- Hoja 1: encabezados en Espanol
- Hoja 2: encabezados en Chino simplificado (zh)
- Campos: Codigo sesion, Fecha, Responsable, Ubicacion, Trazabilidad, Embalaje1, Embalaje2, SKU, SKU2, Descripcion, Cantidad, Peso, Largo, Ancho, Alto, Multicaja, Notas

**Export de salida completada:**
- Misma estructura dual de hojas
- Campos adicionales: Cantidad solicitada, Cantidad surtida, Surtido (si/no)

---

## 9. Codigo de trazabilidad

- **Sesion:** `KD{YYYYMMDD}{L}{NNN}` — generado en backend al crear sesion
- **Item:** `KD-{sesion_codigo}-{seq3}` — generado en backend al crear item, atomico dentro de la sesion
- **Salida:** `KDS{YYYYMMDD}{L}{NNN}` — mismo algoritmo que sesion, prefijo KDS

Todos son visibles en la UI con icono de copia (click → clipboard + toast confirmacion).

---

## 10. i18n

Claves nuevas en `i18nStore.js` para `es` y `zh`:

```
nav.devoluciones
nav.dev.entradas
nav.dev.inventario
nav.dev.salidas

dev.entradas.title
dev.entradas.nueva
dev.entradas.codigo
dev.entradas.estado.borrador
dev.entradas.estado.en_proceso
dev.entradas.estado.confirmado
dev.entradas.estado.cancelado
dev.entradas.confirmar
dev.entradas.cancelar
dev.entradas.items.agregar
dev.entradas.items.multicaja
dev.entradas.items.danado
dev.entradas.items.trazabilidad
dev.entradas.items.embalaje1
dev.entradas.items.embalaje2
dev.entradas.items.evidencia

dev.inventario.title
dev.inventario.tab.actual
dev.inventario.tab.historial
dev.inventario.tab.ajustes
dev.inventario.mover
dev.inventario.ubicaciones.title
dev.inventario.ubicaciones.pcs
dev.inventario.ajuste.tipo.ajuste
dev.inventario.ajuste.tipo.movimiento
dev.inventario.ajuste.motivo

dev.salidas.title
dev.salidas.nueva
dev.salidas.codigo
dev.salidas.estado.borrador
dev.salidas.estado.pendiente
dev.salidas.estado.en_proceso
dev.salidas.estado.completado
dev.salidas.estado.cancelado
dev.salidas.imprimir
dev.salidas.confirmar_surtido
dev.salidas.importar

perm.group.devoluciones
perm.sub.dev.entradas
perm.sub.dev.inventario
perm.sub.dev.salidas
```

---

## 11. Archivos nuevos a crear

### Backend
```
backend/src/modules/devoluciones/
  routes/
    entradas.routes.js
    inventario.routes.js
    salidas.routes.js
  index.js                         — exporta todos los routers
backend/migrations/034_devoluciones.sql
```

### Frontend
```
frontend/src/modules/devoluciones/
  pages/
    Entradas.jsx                   — lista de registros
    EntradaDetalle.jsx             — detalle + formulario de items
    Inventario.jsx                 — inventario actual + historial + ajustes
    Salidas.jsx                    — lista de ordenes
    SalidaDetalle.jsx              — detalle de orden
  components/
    EntradaFormItem.jsx            — formulario de registro de item
    InventarioUbicacionesModal.jsx — modal de gestion de ubicaciones
    AjusteModal.jsx                — modal nuevo ajuste/movimiento
    SalidaImportModal.jsx          — modal importar Excel para salida
    SurtidoConfirmModal.jsx        — modal confirmacion de surtido real
  services/
    devolucionesService.js         — todas las llamadas API del modulo
```

### Modificaciones en archivos existentes
```
frontend/src/App.jsx               — agregar rutas devoluciones + imports
frontend/src/core/components/layout/Sidebar.jsx — agregar grupo devoluciones a getNavItems()
frontend/src/core/stores/i18nStore.js            — agregar claves es/zh
frontend/src/pages/Administracion.jsx            — agregar MODULE_GROUPS para devoluciones
backend/src/server.js              — registrar rutas devoluciones
```

---

## 12. Consideraciones de implementacion

1. **Generacion de codigos:** funcion `generateDevCodigo(client, tenantId, prefijo)` reutilizable para sesiones y salidas. Corre dentro de transaccion para evitar duplicados.
2. **Confirmacion atomica:** confirmar sesion en una transaccion: UPDATE dev_sesiones + INSERT dev_inventario (una fila por SKU por item) + INSERT dev_movimientos.
3. **Confirmacion de salida:** UPDATE dev_inventario (restar cantidades reales) + INSERT dev_movimientos + UPDATE dev_salidas dentro de una transaccion.
4. **Autocomplete SKU:** endpoint GET `/sku-autocomplete?q=TEXTO` busca en `dev_item_skus` del tenant, devuelve top 10 matches con descripcion y frecuencia de uso.
5. **Supabase Storage:** usar el cliente de Supabase ya configurado en el proyecto. Bucket `devoluciones-evidencia` con path `{tenant_id}/{item_id}/{uuid}-{filename}`.
6. **Export Excel:** generar con `xlsx` (ya disponible), dos hojas (es/zh) con encabezados traducidos.
7. **Ubicaciones no eliminables:** endpoint DELETE de ubicacion verifica `COUNT(*) FROM dev_inventario WHERE ubicacion_id = $1 AND cantidad_disponible > 0` antes de proceder.
8. **Worktree:** todo el desarrollo ocurre en `../kirion-devoluciones` en el branch `feature/devoluciones`. Merge al principal al finalizar y validar.

---

## 13. Orden de implementacion

1. Crear worktree: `git worktree add ../kirion-devoluciones feature/devoluciones`
2. Migracion SQL 034 (tablas + indices + triggers)
3. Backend: `entradas.routes.js` (CRUD completo + confirmar)
4. Backend: `inventario.routes.js` (lista, ajustes, ubicaciones)
5. Backend: `salidas.routes.js` (CRUD + completar + importar)
6. Backend: registrar rutas en `server.js`
7. Frontend: `devolucionesService.js`
8. Frontend: `Entradas.jsx` + `EntradaDetalle.jsx` + `EntradaFormItem.jsx`
9. Frontend: `Inventario.jsx` + modales (ubicaciones, ajuste)
10. Frontend: `Salidas.jsx` + `SalidaDetalle.jsx` + modales (importar, surtido)
11. Sidebar + App.jsx + Administracion.jsx + i18n
12. Validar en worktree, luego merge a main

# Surtido — Validación por Lote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un segundo modo de validación de surtido ("Por Lote") que carga el pool de órdenes de una fecha, autoasigna cada caja escaneada a la orden que la contiene, agrupa las cajas en tarimas con ubicación, y al confirmar crea las mismas `pick_sessions` / `pick_events` que el modo por orden.

**Architecture:** El escaneo vive en un borrador local (localStorage) manejado por un reducer puro; nada toca la base hasta que el operador confirma, momento en que un endpoint transaccional (`POST /api/wmshub/pick-batch/commit`) crea una `pick_batches`, sus tarimas, y una `pick_sessions` + `pick_events` por cada orden tocada. La lógica de emparejamiento código→orden y las reglas de tarima/permiso son funciones puras testeables, separadas de los componentes React.

**Tech Stack:** React 18 + Vite + Zustand + TanStack Query + Tailwind (frontend), Express + node-postgres con RLS por tenant (backend), Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-08-17-surtido-validacion-por-lote-design.md`

## Global Constraints

- Rutas del proyecto relativas a `/Users/quiron/CascadeProjects/kirion`.
- Español en todo el texto visible; las claves i18n van en `frontend/src/core/stores/locales/es.js` **y** `zh.js`. Nunca texto literal en JSX.
- Reglas de UI de `frontend/CLAUDE.md`: `<th className="table-header">`, `thead` con `bg-warm-50 sticky top-0 z-[5] border-b border-warm-100`, identificadores primarios en `font-mono font-semibold text-primary-700`, códigos de caja en `font-mono text-xs text-warm-600`.
- Inmutabilidad: nunca mutar estado; siempre devolver copias nuevas.
- Sin `console.log` en código de producción.
- Sin secretos en código.
- Permisos: se reusan los niveles existentes de `surtido.validacion` (`ver` / `crear` / `actualizar` / `eliminar`). **No se crean permisos nuevos.**
- Tipo de validación: los valores literales son `'por_orden'` y `'por_lote'`.
- Formato de tarima: `T` + número a 2 dígitos (`T01`, `T02`, …), idéntico al de Despacho.
- Tolerancia de fecha: **exactamente ±1 día**. D-2 o D+2 nunca se pueden forzar.
- Toda consulta backend debe filtrar por `tenant_id` explícitamente, además de RLS.
- Migración nueva: número `108`, y debe registrarse en `schema_migrations` como hacen las anteriores.
- Commits: `<type>: <descripción>` en español (feat, fix, refactor, test, chore).

---

### Task 1: Runner de pruebas del frontend

El frontend no tiene runner de pruebas unitarias (solo Playwright para e2e). Todas las tareas siguientes son TDD sobre lógica pura, así que esto va primero.

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.js`
- Create: `frontend/src/modules/Surtido/utils/tarima.js`
- Test: `frontend/src/modules/Surtido/utils/tarima.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `npm test` y `npm run test:watch` en `frontend/`.
  - `frontend/src/modules/Surtido/utils/tarima.js`:
    - `genTarimaRef(num: number): string` → `1` → `'T01'`.
    - `normalizeTarimaRef(value: string|number): string` → `'t1'`/`1`/`'T1'` → `'T01'`; devuelve el valor en mayúsculas y sin espacios si no encaja el patrón.
    - `getTarimaNum(ref: string): number|null` → `'T02'` → `2`; `'X'` → `null`.
    - `nextTarimaRef(refs: string[]): string` → `['T01','T02']` → `'T03'`; `[]` → `'T01'`.

- [ ] **Step 1: Instalar vitest y agregar los scripts**

```bash
cd frontend && npm install --save-dev vitest@^1.6.0
```

En `frontend/package.json`, dentro de `"scripts"`, agregar después de `"preview": "vite preview"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Crear la configuración de vitest**

Crear `frontend/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/modules/Surtido/utils/**', 'src/modules/Surtido/hooks/**'],
    },
  },
})
```

- [ ] **Step 3: Escribir la prueba que falla**

Crear `frontend/src/modules/Surtido/utils/tarima.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { genTarimaRef, normalizeTarimaRef, getTarimaNum, nextTarimaRef } from './tarima'

describe('genTarimaRef', () => {
  it('rellena a dos digitos', () => {
    expect(genTarimaRef(1)).toBe('T01')
    expect(genTarimaRef(12)).toBe('T12')
  })

  it('no trunca numeros de tres digitos', () => {
    expect(genTarimaRef(103)).toBe('T103')
  })
})

describe('normalizeTarimaRef', () => {
  it('acepta un numero suelto', () => {
    expect(normalizeTarimaRef(3)).toBe('T03')
    expect(normalizeTarimaRef('3')).toBe('T03')
  })

  it('acepta minusculas y espacios', () => {
    expect(normalizeTarimaRef(' t7 ')).toBe('T07')
  })

  it('deja pasar un valor que no encaja en el patron', () => {
    expect(normalizeTarimaRef('tarima-a')).toBe('TARIMA-A')
  })

  it('devuelve cadena vacia para vacio', () => {
    expect(normalizeTarimaRef('')).toBe('')
    expect(normalizeTarimaRef(null)).toBe('')
  })
})

describe('getTarimaNum', () => {
  it('extrae el numero', () => {
    expect(getTarimaNum('T02')).toBe(2)
  })

  it('devuelve null cuando no es una ref de tarima', () => {
    expect(getTarimaNum('X')).toBeNull()
    expect(getTarimaNum('')).toBeNull()
  })
})

describe('nextTarimaRef', () => {
  it('arranca en T01 con la lista vacia', () => {
    expect(nextTarimaRef([])).toBe('T01')
  })

  it('sigue despues de la mayor', () => {
    expect(nextTarimaRef(['T01', 'T02'])).toBe('T03')
  })

  it('ignora refs sin numero', () => {
    expect(nextTarimaRef(['T01', 'MANUAL'])).toBe('T02')
  })
})
```

- [ ] **Step 4: Correr la prueba y verificar que falla**

Run: `cd frontend && npm test -- tarima`
Expected: FAIL — `Failed to resolve import "./tarima"`.

- [ ] **Step 5: Implementar**

Crear `frontend/src/modules/Surtido/utils/tarima.js`:

```js
/**
 * Refs de tarima para la validación por lote.
 * Mismo formato que usa Despacho (ValidarPorDestino): T + número a 2 dígitos.
 */

export function genTarimaRef(num) {
  return 'T' + String(num).padStart(2, '0')
}

export function normalizeTarimaRef(value) {
  const raw = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return genTarimaRef(Number(raw))
  if (/^T\d+$/.test(raw)) return 'T' + raw.slice(1).padStart(2, '0')
  return raw
}

export function getTarimaNum(tarimaRef) {
  const match = String(tarimaRef || '').match(/^T(\d+)$/i)
  return match ? Number(match[1]) : null
}

export function nextTarimaRef(refs) {
  const nums = (refs || []).map(getTarimaNum).filter(n => Number.isInteger(n))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return genTarimaRef(max + 1)
}
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `cd frontend && npm test`
Expected: PASS, 11 pruebas.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.js frontend/src/modules/Surtido/utils/tarima.js frontend/src/modules/Surtido/utils/tarima.test.js
git commit -m "test: agregar vitest al frontend y utilidades de refs de tarima"
```

---

### Task 2: Extraer utilidades reutilizables de Validacion.jsx

`Validacion.jsx` tiene 3730 líneas. La validación de ubicación y el emparejamiento de códigos están definidos ahí adentro y el modo por lote los necesita idénticos. Se extraen a módulos propios y `Validacion.jsx` los importa — sin cambiar comportamiento.

**Files:**
- Create: `frontend/src/modules/Surtido/utils/locationValue.js`
- Test: `frontend/src/modules/Surtido/utils/locationValue.test.js`
- Create: `frontend/src/modules/Surtido/utils/itemMatching.js`
- Test: `frontend/src/modules/Surtido/utils/itemMatching.test.js`
- Modify: `frontend/src/modules/Surtido/pages/Validacion.jsx` (borrar las definiciones locales líneas 52 y 64–122 y 154–277; importar desde los módulos nuevos)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `locationValue.js`: `LOCATION_MAX_LENGTH: number` (16), `normalizeLocationValue(raw: string): string`, `validateLocationValue(raw: string): { ok: boolean, normalized: string, reason?: 'empty'|'payload'|'charset'|'length', summary?: string }`.
  - `itemMatching.js`: `buildItemMaps(detailData): { packageMap: Map, productMap: Map }`, `buildExpectedCodeLimits(detailData): Map<string, number>`, `findMatchedItem(code, packageMap, productMap): object|null`, `findLooseCandidates(code, packageMap, productMap): object[]`, `validateOrderBoxData(detailData): { ok: boolean, reason?: string, warnings?: string[], packageList?: object[] }`.

- [ ] **Step 1: Escribir la prueba de locationValue**

Crear `frontend/src/modules/Surtido/utils/locationValue.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { normalizeLocationValue, validateLocationValue, LOCATION_MAX_LENGTH } from './locationValue'

describe('normalizeLocationValue', () => {
  it('sube a mayusculas y quita espacios', () => {
    expect(normalizeLocationValue(' a1-01-01-01 ')).toBe('A1-01-01-01')
  })

  it('normaliza guiones tipograficos', () => {
    expect(normalizeLocationValue('A1–01')).toBe('A1-01')
  })

  it('normaliza comillas de cualquier teclado a una recta', () => {
    expect(normalizeLocationValue('A1”01')).toBe('A1"01')
    expect(normalizeLocationValue('A1´01')).toBe('A1"01')
  })
})

describe('validateLocationValue', () => {
  it('acepta una ubicacion normal', () => {
    expect(validateLocationValue('A1-01-01-01')).toEqual({ ok: true, normalized: 'A1-01-01-01' })
  })

  it('acepta una sola comilla como separador', () => {
    expect(validateLocationValue('A1"01').ok).toBe(true)
  })

  it('rechaza vacio', () => {
    expect(validateLocationValue('  ').reason).toBe('empty')
  })

  it('rechaza un payload de escaner', () => {
    expect(validateLocationValue('{"reference_id":"X"}').reason).toBe('payload')
  })

  it('rechaza caracteres fuera del juego permitido', () => {
    expect(validateLocationValue('A1@01').reason).toBe('charset')
  })

  it('rechaza cuando excede el maximo', () => {
    expect(validateLocationValue('A'.repeat(LOCATION_MAX_LENGTH + 1)).reason).toBe('length')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npm test -- locationValue`
Expected: FAIL — no se resuelve `./locationValue`.

- [ ] **Step 3: Crear locationValue.js**

Crear `frontend/src/modules/Surtido/utils/locationValue.js` moviendo **textualmente** el código de `Validacion.jsx` líneas 52 (`LOCATION_MAX_LENGTH`) y 64–122 (`normalizeLocationValue`, `validateLocationValue`), incluidos sus comentarios, y agregando `export` a cada uno:

```js
export const LOCATION_MAX_LENGTH = 16

export function normalizeLocationValue(raw) { /* cuerpo textual de Validacion.jsx:64-79 */ }

export function validateLocationValue(raw) { /* cuerpo textual de Validacion.jsx:80-122 */ }
```

No cambies ni una condición: el objetivo es que el modo por lote valide ubicaciones exactamente igual que el modo por orden.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npm test -- locationValue`
Expected: PASS.

- [ ] **Step 5: Escribir la prueba de itemMatching**

Crear `frontend/src/modules/Surtido/utils/itemMatching.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  buildItemMaps, buildExpectedCodeLimits, findMatchedItem,
  findLooseCandidates, validateOrderBoxData,
} from './itemMatching'

const detail = {
  packageList: [
    { customizeCode: '61193379-1', boxType: 'CAJA-A', quantity: 1 },
    { customizeCode: '61193379-2', boxType: 'CAJA-A', quantity: 2 },
  ],
  productList: [{ sku: 'SKU-001', quantity: 3 }],
}

describe('buildItemMaps', () => {
  it('indexa cajas y productos', () => {
    const { packageMap, productMap } = buildItemMaps(detail)
    expect(packageMap.get('61193379-1')).toBeTruthy()
    expect(productMap.get('SKU-001')).toBeTruthy()
  })

  it('devuelve mapas vacios sin detalle', () => {
    const { packageMap, productMap } = buildItemMaps(null)
    expect(packageMap.size).toBe(0)
    expect(productMap.size).toBe(0)
  })
})

describe('buildExpectedCodeLimits', () => {
  it('usa la cantidad de cada fila', () => {
    const limits = buildExpectedCodeLimits(detail)
    expect(limits.get('61193379-1')).toBe(1)
    expect(limits.get('61193379-2')).toBe(2)
  })
})

describe('findMatchedItem', () => {
  it('encuentra por codigo exacto', () => {
    const { packageMap, productMap } = buildItemMaps(detail)
    expect(findMatchedItem('61193379-1', packageMap, productMap)?.displayCode).toBe('61193379-1')
  })

  it('devuelve null para un codigo ajeno', () => {
    const { packageMap, productMap } = buildItemMaps(detail)
    expect(findMatchedItem('99999999', packageMap, productMap)).toBeNull()
  })
})

describe('findLooseCandidates', () => {
  it('encuentra por codigo base cuando no hay exacto', () => {
    const { packageMap, productMap } = buildItemMaps(detail)
    expect(findLooseCandidates('61193379', packageMap, productMap).length).toBeGreaterThan(0)
  })

  it('no adivina con codigos demasiado cortos', () => {
    const { packageMap, productMap } = buildItemMaps(detail)
    expect(findLooseCandidates('611', packageMap, productMap)).toEqual([])
  })
})

describe('validateOrderBoxData', () => {
  it('acepta una orden con cajas y codigos', () => {
    expect(validateOrderBoxData(detail).ok).toBe(true)
  })

  it('rechaza sin datos', () => {
    expect(validateOrderBoxData(null)).toEqual({ ok: false, reason: 'no_data' })
  })

  it('rechaza sin cajas', () => {
    expect(validateOrderBoxData({ packageList: [] })).toEqual({ ok: false, reason: 'no_boxes' })
  })

  it('rechaza cuando ninguna caja trae codigo', () => {
    expect(validateOrderBoxData({ packageList: [{ quantity: 1 }] })).toEqual({ ok: false, reason: 'no_codes' })
  })
})
```

- [ ] **Step 6: Correr y verificar que falla**

Run: `cd frontend && npm test -- itemMatching`
Expected: FAIL — no se resuelve `./itemMatching`.

- [ ] **Step 7: Crear itemMatching.js**

Crear `frontend/src/modules/Surtido/utils/itemMatching.js` moviendo **textualmente** desde `Validacion.jsx` las líneas 154–277: `buildItemMaps`, `buildExpectedCodeLimits`, `findMatchedItem`, `LOOSE_MATCH_MIN_LEN`, `itemCodeCandidates`, `uniqueItemEntries`, `findLooseCandidates`, `validateOrderBoxData` — con todos sus comentarios. Encabeza el archivo con:

```js
import { generateCodeVariations, normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import { extractBaseCode } from '../../Shared/Wms/extractBaseCode'
```

Exporta `buildItemMaps`, `buildExpectedCodeLimits`, `findMatchedItem`, `findLooseCandidates`, `validateOrderBoxData`. `LOOSE_MATCH_MIN_LEN`, `itemCodeCandidates` y `uniqueItemEntries` quedan internos.

- [ ] **Step 8: Correr y verificar que pasa**

Run: `cd frontend && npm test -- itemMatching`
Expected: PASS.

- [ ] **Step 9: Actualizar Validacion.jsx para importar en vez de definir**

En `frontend/src/modules/Surtido/pages/Validacion.jsx`:
1. Borrar `const LOCATION_MAX_LENGTH = 16` y las funciones `normalizeLocationValue`, `validateLocationValue`, `buildItemMaps`, `buildExpectedCodeLimits`, `findMatchedItem`, `LOOSE_MATCH_MIN_LEN`, `itemCodeCandidates`, `uniqueItemEntries`, `findLooseCandidates`, `validateOrderBoxData`.
2. Agregar junto a los demás imports del módulo:

```js
import { LOCATION_MAX_LENGTH, normalizeLocationValue, validateLocationValue } from '../utils/locationValue'
import {
  buildItemMaps, buildExpectedCodeLimits, findMatchedItem,
  findLooseCandidates, validateOrderBoxData,
} from '../utils/itemMatching'
```

3. Verificar que `generateCodeVariations` / `normalizeCodeFast` / `extractBaseCode` sigan importados solo si el archivo aún los usa en otro punto; si quedaron sin uso, quitarlos del import.

- [ ] **Step 10: Verificar que el build sigue verde**

Run: `cd frontend && npm run build`
Expected: build exitoso, sin errores de import ni de variables no definidas.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/modules/Surtido/utils frontend/src/modules/Surtido/pages/Validacion.jsx
git commit -m "refactor: extraer validacion de ubicacion y emparejamiento de codigos de Validacion.jsx"
```

---

### Task 3: Pool de órdenes por fecha desde el sheet

El sheet outbound ya se carga completo en cliente (una fila = una caja). Se agrega una función que arma en una sola pasada el pool de una fecha más sus días adyacentes, con el `packageList` de cada orden. Sin llamadas de red adicionales.

**Files:**
- Create: `frontend/src/modules/Surtido/utils/lotePool.js`
- Test: `frontend/src/modules/Surtido/utils/lotePool.test.js`
- Modify: `frontend/src/modules/WmsHub/services/googleSheetsService.js` (agregar `getOutboundBatchByDate` al final del archivo)

**Interfaces:**
- Consumes: `genTarimaRef` no; usa `normalizeCodeFast` / `generateCodeVariations` de `../../Shared/Wms/normalizeCode`.
- Produces:
  - `lotePool.js`:
    - `getOrderDateKey(order): string` → `'YYYY-MM-DD'` o `''`. Lee `outboundTime` y cae a `expectedTime` / `orderCreateTime`.
    - `adjacentDateKeys(dateKey): { prev: string, next: string }`.
    - `buildLotePool(orders: object[], dateKey: string): LotePool` donde
      `LotePool = { dateKey, orders: PoolOrder[], codeIndex: Map<string, PoolMatch[]>, adjacentIndex: Map<string, PoolMatch[]> }`,
      `PoolOrder = { outboundOrderNo, thirdOrderNo, receiverName, logisticsTrackNo, logisticsChannel, outboundTime, dateKey, expectedCount, packageList, expectedBoxes }`,
      `PoolMatch = { outboundOrderNo, dateKey, canonical, limit }`.
      `expectedBoxes` es el snapshot que consume el backend: `[{ canonical, codes: string[], quantity }]`.
    - `matchInPool(pool, normalizedCode): { status: 'match'|'adjacent'|'none', matches: PoolMatch[] }`.
  - `googleSheetsService.js`: `getOutboundBatchByDate(dateKey): Promise<{ success: boolean, data: { dateKey, orders, adjacentOrders } }>`.

- [ ] **Step 1: Escribir la prueba de lotePool**

Crear `frontend/src/modules/Surtido/utils/lotePool.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { getOrderDateKey, adjacentDateKeys, buildLotePool, matchInPool } from './lotePool'

const ordenes = [
  {
    outboundOrderNo: 'OBC-1', outboundTime: '2026-08-17 10:00:00', receiverName: 'Cliente A',
    packageList: [
      { customizeCode: 'AAA-1', boxType: 'CAJA', quantity: 1 },
      { customizeCode: 'AAA-2', boxType: 'CAJA', quantity: 2 },
    ],
  },
  {
    outboundOrderNo: 'OBC-2', outboundTime: '2026-08-17 11:00:00', receiverName: 'Cliente B',
    packageList: [{ customizeCode: 'BBB-1', boxType: 'CAJA', quantity: 1 }],
  },
  {
    outboundOrderNo: 'OBC-3', outboundTime: '2026-08-16 09:00:00', receiverName: 'Cliente C',
    packageList: [{ customizeCode: 'CCC-1', boxType: 'CAJA', quantity: 1 }],
  },
  {
    outboundOrderNo: 'OBC-4', outboundTime: '2026-08-14 09:00:00', receiverName: 'Cliente D',
    packageList: [{ customizeCode: 'DDD-1', boxType: 'CAJA', quantity: 1 }],
  },
]

describe('getOrderDateKey', () => {
  it('lee outboundTime en formato ISO', () => {
    expect(getOrderDateKey({ outboundTime: '2026-08-17 10:00:00' })).toBe('2026-08-17')
  })

  it('interpreta dd/mm/yyyy cuando el dia es mayor a 12', () => {
    expect(getOrderDateKey({ outboundTime: '17/08/2026' })).toBe('2026-08-17')
  })

  it('devuelve cadena vacia sin fecha', () => {
    expect(getOrderDateKey({})).toBe('')
  })
})

describe('adjacentDateKeys', () => {
  it('calcula dia anterior y posterior', () => {
    expect(adjacentDateKeys('2026-08-17')).toEqual({ prev: '2026-08-16', next: '2026-08-18' })
  })

  it('cruza el fin de mes', () => {
    expect(adjacentDateKeys('2026-08-31')).toEqual({ prev: '2026-08-30', next: '2026-09-01' })
  })
})

describe('buildLotePool', () => {
  const pool = buildLotePool(ordenes, '2026-08-17')

  it('solo incluye las ordenes de la fecha en el pool activo', () => {
    expect(pool.orders.map(o => o.outboundOrderNo)).toEqual(['OBC-1', 'OBC-2'])
  })

  it('calcula las cajas esperadas sumando cantidades', () => {
    expect(pool.orders.find(o => o.outboundOrderNo === 'OBC-1').expectedCount).toBe(3)
  })

  it('arma el snapshot expectedBoxes para el backend', () => {
    const boxes = pool.orders.find(o => o.outboundOrderNo === 'OBC-1').expectedBoxes
    expect(boxes).toHaveLength(2)
    expect(boxes[0]).toMatchObject({ canonical: 'AAA1', quantity: 1 })
    expect(boxes[0].codes).toContain('AAA1')
  })

  it('indexa el dia anterior y el posterior por separado', () => {
    expect(matchInPool(pool, 'CCC-1').status).toBe('adjacent')
  })

  it('no reconoce una orden de dos dias antes', () => {
    expect(matchInPool(pool, 'DDD-1').status).toBe('none')
  })
})

describe('matchInPool', () => {
  const pool = buildLotePool(ordenes, '2026-08-17')

  it('asigna el codigo a su orden', () => {
    const res = matchInPool(pool, 'AAA-1')
    expect(res.status).toBe('match')
    expect(res.matches[0].outboundOrderNo).toBe('OBC-1')
    expect(res.matches[0].limit).toBe(1)
  })

  it('respeta la cantidad de la fila como limite', () => {
    expect(matchInPool(pool, 'AAA-2').matches[0].limit).toBe(2)
  })

  it('rechaza un codigo desconocido', () => {
    expect(matchInPool(pool, 'ZZZ-9')).toEqual({ status: 'none', matches: [] })
  })

  it('reporta la fecha de la orden en un match adyacente', () => {
    expect(matchInPool(pool, 'CCC-1').matches[0].dateKey).toBe('2026-08-16')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npm test -- lotePool`
Expected: FAIL — no se resuelve `./lotePool`.

- [ ] **Step 3: Implementar lotePool.js**

Crear `frontend/src/modules/Surtido/utils/lotePool.js`. `getOrderDateKey` se copia de `frontend/src/modules/Despacho/components/ValidarPorDestino.jsx:90-124` (incluyendo el comentario sobre D/M/Y vs M/D/Y) y se adapta a los nombres de campo del sheet outbound.

```js
import { generateCodeVariations, normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import { toDateKey } from '../../../core/utils/dateFormat'

function compactCanonical(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function getOrderDateKey(order) {
  const raw = order?.outboundTime || order?.expectedTime || order?.orderCreateTime || ''
  if (!raw) return ''
  const str = String(raw).trim()
  const isoLike = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (isoLike) return `${isoLike[1]}-${String(isoLike[2]).padStart(2, '0')}-${String(isoLike[3]).padStart(2, '0')}`

  const slashDate = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (slashDate) {
    const first = Number(slashDate[1])
    const second = Number(slashDate[2])
    // first > 12 → D/M/Y sin ambigüedad. second > 12 → M/D/Y sin ambigüedad.
    // Ambos ≤ 12 → D/M/Y (default del WMS/MX).
    let day, month
    if (first > 12)       { day = first; month = second }
    else if (second > 12) { month = first; day = second }
    else                  { day = first; month = second }
    return `${slashDate[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  try {
    const k = toDateKey(str)
    return (k && k !== '—') ? k : ''
  } catch { return '' }
}

export function adjacentDateKeys(dateKey) {
  const base = new Date(`${dateKey}T12:00:00`)
  const shift = (days) => {
    const d = new Date(base)
    d.setDate(d.getDate() + days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return { prev: shift(-1), next: shift(1) }
}

function buildExpectedBoxes(packageList) {
  const byCanonical = new Map()
  for (const p of packageList || []) {
    const codes = [p.customizeCode, p.boxType, p.boxCode].filter(Boolean).map(compactCanonical).filter(Boolean)
    const canonical = compactCanonical(p.customizeCode || p.boxType || p.boxCode || '')
    if (!canonical || codes.length === 0) continue
    const quantity = Number(p.quantity ?? p.totalPackageQty ?? p.qty ?? 1) || 1
    const existing = byCanonical.get(canonical)
    if (existing) {
      existing.quantity += quantity
      existing.codes = [...new Set([...existing.codes, ...codes])]
      continue
    }
    byCanonical.set(canonical, { canonical, codes: [...new Set([canonical, ...codes])], quantity })
  }
  return [...byCanonical.values()]
}

function toPoolOrder(order) {
  const packageList = order.packageList || []
  const expectedBoxes = buildExpectedBoxes(packageList)
  return {
    outboundOrderNo: order.outboundOrderNo,
    thirdOrderNo: order.thirdOrderNo || null,
    receiverName: order.receiverName || null,
    logisticsTrackNo: order.logisticsTrackNo || null,
    logisticsChannel: order.logisticsChannel || null,
    outboundTime: order.outboundTime || null,
    dateKey: getOrderDateKey(order),
    expectedCount: expectedBoxes.reduce((sum, b) => sum + b.quantity, 0),
    packageList,
    expectedBoxes,
  }
}

function indexOrders(poolOrders) {
  const index = new Map()
  for (const order of poolOrders) {
    for (const box of order.expectedBoxes) {
      const match = {
        outboundOrderNo: order.outboundOrderNo,
        dateKey: order.dateKey,
        canonical: box.canonical,
        limit: box.quantity,
      }
      for (const code of box.codes) {
        const norm = normalizeCodeFast(code)
        if (!norm) continue
        for (const variant of generateCodeVariations(norm, false)) {
          const bucket = index.get(variant)
          if (bucket) {
            if (!bucket.some(m => m.outboundOrderNo === match.outboundOrderNo && m.canonical === match.canonical)) {
              bucket.push(match)
            }
          } else {
            index.set(variant, [match])
          }
        }
      }
    }
  }
  return index
}

export function buildLotePool(orders, dateKey) {
  const { prev, next } = adjacentDateKeys(dateKey)
  const all = (orders || []).map(toPoolOrder).filter(o => o.outboundOrderNo)
  const activeOrders = all.filter(o => o.dateKey === dateKey)
  const adjacentOrders = all.filter(o => o.dateKey === prev || o.dateKey === next)
  return {
    dateKey,
    orders: activeOrders,
    codeIndex: indexOrders(activeOrders),
    adjacentIndex: indexOrders(adjacentOrders),
  }
}

export function matchInPool(pool, rawCode) {
  const norm = normalizeCodeFast(rawCode)
  if (!norm) return { status: 'none', matches: [] }
  for (const variant of generateCodeVariations(norm, false)) {
    const hit = pool.codeIndex.get(variant)
    if (hit) return { status: 'match', matches: hit }
  }
  for (const variant of generateCodeVariations(norm, false)) {
    const hit = pool.adjacentIndex.get(variant)
    if (hit) return { status: 'adjacent', matches: hit }
  }
  return { status: 'none', matches: [] }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npm test -- lotePool`
Expected: PASS, 16 pruebas.

- [ ] **Step 5: Agregar getOutboundBatchByDate al servicio del sheet**

Al final de `frontend/src/modules/WmsHub/services/googleSheetsService.js`, después de `getOutboundDetail`, agregar:

```js
/**
 * Pool de órdenes de una fecha (más el día anterior y el posterior) para la
 * validación por lote. Una sola pasada sobre las filas ya cargadas del sheet
 * — cada fila es una caja, así que el packageList sale del mismo agrupado.
 * Fuerza el fetch completo cuando el cache está en su slice parcial: un pool
 * truncado rechazaría cajas que sí pertenecen al lote.
 */
export async function getOutboundBatchByDate(dateKey) {
  const rows = await loadSheet('outbound', getCacheStatus('outbound').partial)
  const [headerRow, ...dataRows] = rows
  const map = buildHeaderMap(headerRow, OUTBOUND_ALIASES)

  const orderMap = new Map()
  const SPARSE_FIELDS = ['thirdOrderNo', 'logisticsTrackNo', 'logisticsChannel', 'receiverName', 'outboundTime', 'whCode']

  for (const row of dataRows) {
    const r = mapRowToOutbound(row, map)
    if (!r.outboundOrderNo) continue
    let entry = orderMap.get(r.outboundOrderNo)
    if (!entry) {
      entry = { ...r, packageList: [] }
      orderMap.set(r.outboundOrderNo, entry)
    } else {
      SPARSE_FIELDS.forEach(f => { if (!entry[f] && r[f]) entry[f] = r[f] })
    }
    entry.packageList.push({ boxType: r.boxType, customizeCode: r.customizeCode, quantity: r.quantity })
  }

  const all = [...orderMap.values()].map(o => ({ ...o, outboundBoxCount: o.outboundBoxCount || o.packageList.length }))
  return { success: true, data: { dateKey, orders: all } }
}
```

Nota: devuelve **todas** las órdenes; `buildLotePool` hace el filtrado por fecha, que es donde está probado.

- [ ] **Step 6: Exponer el servicio en surtidoService**

En `frontend/src/modules/Surtido/services/surtidoService.js`, junto a los otros re-exports del sheet (líneas 2–17), agregar `getOutboundBatchByDate as getOutboundBatchByDateFromSheets` al import y:

```js
export const getOutboundBatchByDate = (dateKey) => getOutboundBatchByDateFromSheets(dateKey)
```

- [ ] **Step 7: Verificar el build**

Run: `cd frontend && npm run build && npm test`
Expected: build exitoso y todas las pruebas en verde.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/modules/Surtido/utils/lotePool.js frontend/src/modules/Surtido/utils/lotePool.test.js frontend/src/modules/WmsHub/services/googleSheetsService.js frontend/src/modules/Surtido/services/surtidoService.js
git commit -m "feat: armar pool de ordenes por fecha para validacion por lote"
```

---

### Task 4: Reducer del borrador de lote

El corazón de la funcionalidad: un reducer puro que decide el resultado de cada escaneo, agrupa por tarima, aplica las reglas de eliminación por permiso y produce el payload de commit. Nada de React ni de red.

**Files:**
- Create: `frontend/src/modules/Surtido/utils/loteDraft.js`
- Test: `frontend/src/modules/Surtido/utils/loteDraft.test.js`

**Interfaces:**
- Consumes: `matchInPool` de `./lotePool`, `nextTarimaRef` de `./tarima`, `validateLocationValue` de `./locationValue`, `normalizeScanCode` de `../../Shared/Wms/normalizeCode`.
- Produces:
  - `createDraft({ dateKey, pool, operatorId }): Draft` donde
    `Draft = { dateKey, operatorId, tarimas: Tarima[], activeTarimaRef: string, scans: Scan[], createdAt: number }`,
    `Tarima = { ref, ubicacionNota: string|null, closedAt: number|null }`,
    `Scan = { id, code, rawCode, orderNo: string|null, canonical: string|null, result: 'ok'|'duplicate'|'not_found', tarimaRef: string, forcedDateMismatch: boolean, ts: number }`.
  - `scanDraft(draft, pool, rawCode, { force = false } = {}): { draft: Draft, outcome: Outcome }` donde
    `Outcome = { result: 'ok'|'duplicate'|'not_found'|'needs_force', orderNo, code, orderDateKey, loteDateKey }`.
    `'needs_force'` **no** modifica el borrador; el llamador abre el modal y reintenta con `force: true`.
  - `closeTarima(draft, ubicacionRaw): { draft: Draft, error: string|null }` — valida la ubicación, la fija en la tarima activa, la cierra y abre la siguiente.
  - `canRemoveScan(draft, scanId, permission: 'crear'|'eliminar'): boolean`
  - `canRemoveTarima(draft, tarimaRef, permission): boolean`
  - `removeScan(draft, scanId): Draft`
  - `removeTarima(draft, tarimaRef): Draft`
  - `draftSummary(draft, pool): { ordenesCompletas, ordenesTotal, cajasValidadas, cajasEsperadas, tarimasCerradas, tarimaActiva }`
  - `orderProgress(draft, pool): Map<orderNo, { validated: Scan[], pendingBoxes: { canonical, faltan }[], complete: boolean }>`
  - `buildCommitPayload(draft, pool, notes: string): object` — el cuerpo exacto de `POST /wmshub/pick-batch/commit` documentado en la spec.

- [ ] **Step 1: Escribir las pruebas**

Crear `frontend/src/modules/Surtido/utils/loteDraft.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildLotePool } from './lotePool'
import {
  createDraft, scanDraft, closeTarima, removeScan, removeTarima,
  canRemoveScan, canRemoveTarima, draftSummary, orderProgress, buildCommitPayload,
} from './loteDraft'

const ordenes = [
  {
    outboundOrderNo: 'OBC-1', outboundTime: '2026-08-17 10:00:00', receiverName: 'Cliente A',
    packageList: [{ customizeCode: 'AAA-1', quantity: 1 }, { customizeCode: 'AAA-2', quantity: 2 }],
  },
  {
    outboundOrderNo: 'OBC-2', outboundTime: '2026-08-17 11:00:00', receiverName: 'Cliente B',
    packageList: [{ customizeCode: 'BBB-1', quantity: 1 }],
  },
  {
    outboundOrderNo: 'OBC-3', outboundTime: '2026-08-16 09:00:00', receiverName: 'Cliente C',
    packageList: [{ customizeCode: 'CCC-1', quantity: 1 }],
  },
]

const pool = buildLotePool(ordenes, '2026-08-17')
const nuevo = () => createDraft({ dateKey: '2026-08-17', operatorId: 7 })

describe('createDraft', () => {
  it('arranca con la tarima T01 abierta y sin escaneos', () => {
    const d = nuevo()
    expect(d.activeTarimaRef).toBe('T01')
    expect(d.tarimas).toEqual([{ ref: 'T01', ubicacionNota: null, closedAt: null }])
    expect(d.scans).toEqual([])
  })
})

describe('scanDraft', () => {
  it('asigna una caja a su orden', () => {
    const { draft, outcome } = scanDraft(nuevo(), pool, 'AAA-1')
    expect(outcome).toMatchObject({ result: 'ok', orderNo: 'OBC-1' })
    expect(draft.scans).toHaveLength(1)
    expect(draft.scans[0].tarimaRef).toBe('T01')
  })

  it('no muta el borrador original', () => {
    const original = nuevo()
    scanDraft(original, pool, 'AAA-1')
    expect(original.scans).toHaveLength(0)
  })

  it('marca duplicado al exceder la cantidad esperada de la caja', () => {
    let d = nuevo()
    d = scanDraft(d, pool, 'AAA-1').draft
    const { outcome } = scanDraft(d, pool, 'AAA-1')
    expect(outcome.result).toBe('duplicate')
  })

  it('permite las unidades que la fila declara', () => {
    let d = nuevo()
    d = scanDraft(d, pool, 'AAA-2').draft
    expect(scanDraft(d, pool, 'AAA-2').outcome.result).toBe('ok')
  })

  it('pide forzar cuando la caja es de un dia adyacente', () => {
    const { draft, outcome } = scanDraft(nuevo(), pool, 'CCC-1')
    expect(outcome).toMatchObject({ result: 'needs_force', orderNo: 'OBC-3', orderDateKey: '2026-08-16', loteDateKey: '2026-08-17' })
    expect(draft.scans).toHaveLength(0)
  })

  it('registra la caja forzada marcandola', () => {
    const { draft, outcome } = scanDraft(nuevo(), pool, 'CCC-1', { force: true })
    expect(outcome.result).toBe('ok')
    expect(draft.scans[0].forcedDateMismatch).toBe(true)
  })

  it('rechaza un codigo que no esta en ningun dia', () => {
    const { draft, outcome } = scanDraft(nuevo(), pool, 'ZZZ-9')
    expect(outcome.result).toBe('not_found')
    expect(draft.scans[0].result).toBe('not_found')
    expect(draft.scans[0].orderNo).toBeNull()
  })

  it('ignora un codigo vacio', () => {
    const d = nuevo()
    expect(scanDraft(d, pool, '   ').draft.scans).toHaveLength(0)
  })
})

describe('closeTarima', () => {
  it('fija la ubicacion, cierra y abre la siguiente', () => {
    let d = scanDraft(nuevo(), pool, 'AAA-1').draft
    const { draft, error } = closeTarima(d, 'a1-01-01-01')
    expect(error).toBeNull()
    expect(draft.tarimas[0]).toMatchObject({ ref: 'T01', ubicacionNota: 'A1-01-01-01' })
    expect(draft.tarimas[0].closedAt).toBeGreaterThan(0)
    expect(draft.activeTarimaRef).toBe('T02')
  })

  it('rechaza una ubicacion invalida sin cerrar nada', () => {
    const d = scanDraft(nuevo(), pool, 'AAA-1').draft
    const { draft, error } = closeTarima(d, '{"reference_id":"X"}')
    expect(error).toBeTruthy()
    expect(draft.activeTarimaRef).toBe('T01')
  })

  it('rechaza cerrar una tarima sin escaneos', () => {
    const { error } = closeTarima(nuevo(), 'A1-01-01-01')
    expect(error).toBeTruthy()
  })

  it('los escaneos siguientes caen en la tarima nueva', () => {
    let d = scanDraft(nuevo(), pool, 'AAA-1').draft
    d = closeTarima(d, 'A1-01-01-01').draft
    d = scanDraft(d, pool, 'BBB-1').draft
    expect(d.scans.find(s => s.code.includes('BBB')).tarimaRef).toBe('T02')
  })
})

describe('permisos de eliminacion', () => {
  const armado = () => {
    let d = scanDraft(nuevo(), pool, 'AAA-1').draft
    d = scanDraft(d, pool, 'AAA-2').draft
    return d
  }

  it('un usuario con crear solo borra el ultimo escaneo', () => {
    const d = armado()
    expect(canRemoveScan(d, d.scans[d.scans.length - 1].id, 'crear')).toBe(true)
    expect(canRemoveScan(d, d.scans[0].id, 'crear')).toBe(false)
  })

  it('un usuario con eliminar borra cualquier escaneo', () => {
    const d = armado()
    expect(canRemoveScan(d, d.scans[0].id, 'eliminar')).toBe(true)
  })

  it('un usuario con crear solo borra la ultima tarima', () => {
    let d = armado()
    d = closeTarima(d, 'A1-01-01-01').draft
    d = scanDraft(d, pool, 'BBB-1').draft
    expect(canRemoveTarima(d, 'T02', 'crear')).toBe(true)
    expect(canRemoveTarima(d, 'T01', 'crear')).toBe(false)
    expect(canRemoveTarima(d, 'T01', 'eliminar')).toBe(true)
  })
})

describe('removeScan / removeTarima', () => {
  it('borrar un escaneo libera la unidad para volver a escanearla', () => {
    let d = scanDraft(nuevo(), pool, 'AAA-1').draft
    d = removeScan(d, d.scans[0].id)
    expect(d.scans).toHaveLength(0)
    expect(scanDraft(d, pool, 'AAA-1').outcome.result).toBe('ok')
  })

  it('borrar una tarima elimina sus escaneos', () => {
    let d = scanDraft(nuevo(), pool, 'AAA-1').draft
    d = closeTarima(d, 'A1-01-01-01').draft
    d = scanDraft(d, pool, 'BBB-1').draft
    d = removeTarima(d, 'T01')
    expect(d.scans.every(s => s.tarimaRef !== 'T01')).toBe(true)
    expect(d.tarimas.some(tar => tar.ref === 'T01')).toBe(false)
  })
})

describe('draftSummary', () => {
  it('cuenta ordenes completas, cajas y tarimas', () => {
    let d = nuevo()
    d = scanDraft(d, pool, 'BBB-1').draft
    d = closeTarima(d, 'A1-01-01-01').draft
    d = scanDraft(d, pool, 'AAA-1').draft
    expect(draftSummary(d, pool)).toMatchObject({
      ordenesCompletas: 1, ordenesTotal: 2, cajasValidadas: 2, cajasEsperadas: 4,
      tarimasCerradas: 1, tarimaActiva: 'T02',
    })
  })
})

describe('orderProgress', () => {
  it('reporta validadas y pendientes por orden', () => {
    const d = scanDraft(nuevo(), pool, 'AAA-1').draft
    const progreso = orderProgress(d, pool)
    const obc1 = progreso.get('OBC-1')
    expect(obc1.validated).toHaveLength(1)
    expect(obc1.complete).toBe(false)
    expect(obc1.pendingBoxes).toEqual([{ canonical: 'AAA2', faltan: 2 }])
  })
})

describe('buildCommitPayload', () => {
  it('agrupa los eventos por orden e incluye tarima y ubicacion', () => {
    let d = scanDraft(nuevo(), pool, 'AAA-1').draft
    d = scanDraft(d, pool, 'BBB-1').draft
    d = closeTarima(d, 'A1-01-01-01').draft
    const payload = buildCommitPayload(d, pool, 'notas')

    expect(payload.fecha_lote).toBe('2026-08-17')
    expect(payload.notes).toBe('notas')
    expect(payload.tarimas).toEqual([
      expect.objectContaining({ tarima_ref: 'T01', ubicacion_nota: 'A1-01-01-01' }),
    ])
    expect(payload.orders).toHaveLength(2)

    const obc1 = payload.orders.find(o => o.outbound_order_no === 'OBC-1')
    expect(obc1.total_expected).toBe(3)
    expect(obc1.expected_boxes).toHaveLength(2)
    expect(obc1.events[0]).toMatchObject({
      scan_result: 'ok', tarima_ref: 'T01', ubicacion_nota: 'A1-01-01-01', forced_date_mismatch: false, quantity: 1,
    })
    expect(obc1.events[0].client_event_id).toBeTruthy()
  })

  it('excluye la tarima abierta sin ubicacion y sus escaneos', () => {
    let d = scanDraft(nuevo(), pool, 'AAA-1').draft
    d = closeTarima(d, 'A1-01-01-01').draft
    d = scanDraft(d, pool, 'BBB-1').draft
    const payload = buildCommitPayload(d, pool, '')
    expect(payload.tarimas.map(tar => tar.tarima_ref)).toEqual(['T01'])
    expect(payload.orders.map(o => o.outbound_order_no)).toEqual(['OBC-1'])
  })

  it('no manda los rechazados como ok', () => {
    let d = scanDraft(nuevo(), pool, 'ZZZ-9').draft
    d = scanDraft(d, pool, 'AAA-1').draft
    d = closeTarima(d, 'A1-01-01-01').draft
    const payload = buildCommitPayload(d, pool, '')
    const eventos = payload.orders.flatMap(o => o.events)
    expect(eventos.every(e => e.scan_result !== 'not_found')).toBe(true)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npm test -- loteDraft`
Expected: FAIL — no se resuelve `./loteDraft`.

- [ ] **Step 3: Implementar loteDraft.js**

Crear `frontend/src/modules/Surtido/utils/loteDraft.js`:

```js
import { normalizeScanCode } from '../../Shared/Wms/normalizeCode'
import { matchInPool } from './lotePool'
import { nextTarimaRef } from './tarima'
import { validateLocationValue } from './locationValue'

function genScanId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createDraft({ dateKey, operatorId }) {
  return {
    dateKey,
    operatorId: operatorId ?? null,
    tarimas: [{ ref: 'T01', ubicacionNota: null, closedAt: null }],
    activeTarimaRef: 'T01',
    scans: [],
    createdAt: Date.now(),
  }
}

// Unidades ya validadas de una caja concreta (orden + código canónico).
function okCount(draft, orderNo, canonical) {
  return draft.scans.filter(s => s.result === 'ok' && s.orderNo === orderNo && s.canonical === canonical).length
}

// Ante varias cajas candidatas para el mismo código, toma la primera que aún
// tenga unidades pendientes; si todas están llenas, la primera (será duplicado).
function pickMatch(draft, matches) {
  return matches.find(m => okCount(draft, m.outboundOrderNo, m.canonical) < m.limit) || matches[0]
}

function appendScan(draft, scan) {
  return { ...draft, scans: [...draft.scans, scan] }
}

export function scanDraft(draft, pool, rawCode, { force = false } = {}) {
  const code = normalizeScanCode(rawCode)
  if (!code) return { draft, outcome: { result: 'ignored', code: '', orderNo: null } }

  const { status, matches } = matchInPool(pool, code)

  if (status === 'none') {
    const scan = {
      id: genScanId(), code, rawCode: String(rawCode).trim(), orderNo: null, canonical: null,
      result: 'not_found', tarimaRef: draft.activeTarimaRef, forcedDateMismatch: false, ts: Date.now(),
    }
    return { draft: appendScan(draft, scan), outcome: { result: 'not_found', code, orderNo: null } }
  }

  if (status === 'adjacent' && !force) {
    const match = matches[0]
    return {
      draft,
      outcome: {
        result: 'needs_force', code,
        orderNo: match.outboundOrderNo,
        orderDateKey: match.dateKey,
        loteDateKey: draft.dateKey,
      },
    }
  }

  const match = pickMatch(draft, matches)
  const yaValidadas = okCount(draft, match.outboundOrderNo, match.canonical)

  if (yaValidadas >= match.limit) {
    const scan = {
      id: genScanId(), code, rawCode: String(rawCode).trim(),
      orderNo: match.outboundOrderNo, canonical: match.canonical,
      result: 'duplicate', tarimaRef: draft.activeTarimaRef, forcedDateMismatch: false, ts: Date.now(),
    }
    return { draft: appendScan(draft, scan), outcome: { result: 'duplicate', code, orderNo: match.outboundOrderNo } }
  }

  const scan = {
    id: genScanId(), code, rawCode: String(rawCode).trim(),
    orderNo: match.outboundOrderNo, canonical: match.canonical,
    result: 'ok', tarimaRef: draft.activeTarimaRef,
    forcedDateMismatch: status === 'adjacent', ts: Date.now(),
  }
  return {
    draft: appendScan(draft, scan),
    outcome: { result: 'ok', code, orderNo: match.outboundOrderNo, orderDateKey: match.dateKey, loteDateKey: draft.dateKey },
  }
}

export function closeTarima(draft, ubicacionRaw) {
  const tieneEscaneos = draft.scans.some(s => s.tarimaRef === draft.activeTarimaRef && s.result === 'ok')
  if (!tieneEscaneos) return { draft, error: 'sin_escaneos' }

  const validation = validateLocationValue(ubicacionRaw)
  if (!validation.ok) return { draft, error: validation.reason }

  const closedAt = Date.now()
  const tarimas = draft.tarimas.map(tar =>
    tar.ref === draft.activeTarimaRef
      ? { ...tar, ubicacionNota: validation.normalized, closedAt }
      : tar
  )
  const siguiente = nextTarimaRef(tarimas.map(tar => tar.ref))
  return {
    draft: {
      ...draft,
      tarimas: [...tarimas, { ref: siguiente, ubicacionNota: null, closedAt: null }],
      activeTarimaRef: siguiente,
    },
    error: null,
  }
}

export function canRemoveScan(draft, scanId, permission) {
  if (permission === 'eliminar') return draft.scans.some(s => s.id === scanId)
  const last = draft.scans[draft.scans.length - 1]
  return Boolean(last && last.id === scanId)
}

export function canRemoveTarima(draft, tarimaRef, permission) {
  if (!draft.tarimas.some(tar => tar.ref === tarimaRef)) return false
  if (permission === 'eliminar') return true
  // Con permiso básico solo se puede deshacer la tarima en curso.
  return tarimaRef === draft.activeTarimaRef
}

export function removeScan(draft, scanId) {
  return { ...draft, scans: draft.scans.filter(s => s.id !== scanId) }
}

export function removeTarima(draft, tarimaRef) {
  const tarimas = draft.tarimas.filter(tar => tar.ref !== tarimaRef)
  const scans = draft.scans.filter(s => s.tarimaRef !== tarimaRef)
  if (tarimas.length === 0) {
    return { ...draft, tarimas: [{ ref: 'T01', ubicacionNota: null, closedAt: null }], activeTarimaRef: 'T01', scans }
  }
  const activa = draft.activeTarimaRef === tarimaRef ? tarimas[tarimas.length - 1].ref : draft.activeTarimaRef
  return { ...draft, tarimas, scans, activeTarimaRef: activa }
}

export function orderProgress(draft, pool) {
  const progreso = new Map()
  for (const order of pool.orders) {
    const validated = draft.scans.filter(s => s.result === 'ok' && s.orderNo === order.outboundOrderNo)
    const pendingBoxes = order.expectedBoxes
      .map(box => ({ canonical: box.canonical, faltan: box.quantity - okCount(draft, order.outboundOrderNo, box.canonical) }))
      .filter(box => box.faltan > 0)
    progreso.set(order.outboundOrderNo, {
      validated,
      pendingBoxes,
      complete: order.expectedCount > 0 && validated.length >= order.expectedCount,
    })
  }
  return progreso
}

export function draftSummary(draft, pool) {
  const progreso = orderProgress(draft, pool)
  let ordenesCompletas = 0
  progreso.forEach(p => { if (p.complete) ordenesCompletas += 1 })
  return {
    ordenesCompletas,
    ordenesTotal: pool.orders.length,
    cajasValidadas: draft.scans.filter(s => s.result === 'ok').length,
    cajasEsperadas: pool.orders.reduce((sum, o) => sum + o.expectedCount, 0),
    tarimasCerradas: draft.tarimas.filter(tar => tar.closedAt).length,
    tarimaActiva: draft.activeTarimaRef,
  }
}

export function buildCommitPayload(draft, pool, notes) {
  // Solo se confirma lo que ya está en una tarima cerrada con ubicación: una
  // tarima abierta todavía no tiene dónde decir que está.
  const cerradas = draft.tarimas.filter(tar => tar.closedAt && tar.ubicacionNota)
  const ubicacionPorTarima = new Map(cerradas.map(tar => [tar.ref, tar.ubicacionNota]))

  const eventos = draft.scans.filter(s =>
    s.result !== 'not_found' && s.orderNo && ubicacionPorTarima.has(s.tarimaRef)
  )

  const porOrden = new Map()
  for (const scan of eventos) {
    if (!porOrden.has(scan.orderNo)) porOrden.set(scan.orderNo, [])
    porOrden.get(scan.orderNo).push(scan)
  }

  const orders = [...porOrden.entries()].map(([orderNo, scans]) => {
    const order = pool.orders.find(o => o.outboundOrderNo === orderNo) || {}
    return {
      outbound_order_no: orderNo,
      third_order_no: order.thirdOrderNo ?? null,
      receiver_name: order.receiverName ?? null,
      logistics_track_no: order.logisticsTrackNo ?? null,
      logistics_channel: order.logisticsChannel ?? null,
      outbound_delivery_at: order.outboundTime ?? null,
      total_expected: order.expectedCount ?? 0,
      expected_boxes: order.expectedBoxes ?? [],
      events: scans.map(scan => ({
        client_event_id: scan.id,
        scanned_code: scan.rawCode,
        normalized_code: scan.code,
        matched_box_type: scan.canonical,
        matched_sku: null,
        scan_result: scan.result,
        quantity: 1,
        tarima_ref: scan.tarimaRef,
        ubicacion_nota: ubicacionPorTarima.get(scan.tarimaRef),
        forced_date_mismatch: scan.forcedDateMismatch,
        scanned_at: new Date(scan.ts).toISOString(),
      })),
    }
  })

  return {
    fecha_lote: draft.dateKey,
    notes: notes || null,
    tarimas: cerradas.map(tar => ({
      tarima_ref: tar.ref,
      ubicacion_nota: tar.ubicacionNota,
      closed_at: new Date(tar.closedAt).toISOString(),
    })),
    orders,
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npm test -- loteDraft`
Expected: PASS, 22 pruebas.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/Surtido/utils/loteDraft.js frontend/src/modules/Surtido/utils/loteDraft.test.js
git commit -m "feat: reducer del borrador de validacion por lote"
```

---

### Task 5: Migración y helpers compartidos del backend

**Files:**
- Create: `backend/migrations/108_surtido_pick_batches.sql`
- Create: `backend/src/modules/wms/utils/pickBoxes.js`
- Test: `backend/src/tests/pickBoxes.test.js`
- Modify: `backend/src/modules/wms/routes/wms.routes.js` (borrar las definiciones locales de `compactCanonicalCode`, `normalizeExpectedBoxes`, `matchExpectedBox`, `normalizeOptionalText`, `parsePositiveInt` — líneas 150–152, 154–178, 180–191, 213–222 — e importarlas)

**Interfaces:**
- Consumes: `normalizeScanCode` de `backend/src/shared/utils` (mismo import que ya usa `wms.routes.js`; copiar la ruta exacta desde el encabezado de ese archivo).
- Produces: `backend/src/modules/wms/utils/pickBoxes.js` exporta `compactCanonicalCode(raw): string`, `normalizeExpectedBoxes(value): {canonical, codes, quantity}[]`, `matchExpectedBox(expectedBoxes, scannedCode): {canonical, codes, quantity}|{ambiguous:true}|null`, `normalizeOptionalText(value): string|null`, `parsePositiveInt(value, fallback): number`.

- [ ] **Step 1: Escribir la prueba de los helpers**

Crear `backend/src/tests/pickBoxes.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  compactCanonicalCode, normalizeExpectedBoxes, matchExpectedBox,
  normalizeOptionalText, parsePositiveInt,
} from '../modules/wms/utils/pickBoxes.js'

describe('compactCanonicalCode', () => {
  it('quita separadores y sube a mayusculas', () => {
    expect(compactCanonicalCode('aaa-1/2')).toBe('AAA12')
  })
})

describe('normalizeExpectedBoxes', () => {
  it('agrupa filas repetidas sumando su cantidad', () => {
    const boxes = normalizeExpectedBoxes([
      { canonical: 'AAA1', codes: ['AAA-1'], quantity: 1 },
      { canonical: 'AAA1', codes: ['AAA_1'], quantity: 2 },
    ])
    expect(boxes).toHaveLength(1)
    expect(boxes[0].quantity).toBe(3)
  })

  it('descarta filas sin codigo', () => {
    expect(normalizeExpectedBoxes([{ quantity: 1 }])).toEqual([])
  })

  it('devuelve vacio si no es un arreglo', () => {
    expect(normalizeExpectedBoxes(null)).toEqual([])
  })
})

describe('matchExpectedBox', () => {
  const boxes = normalizeExpectedBoxes([
    { canonical: 'AAA1', codes: ['AAA-1'], quantity: 1 },
    { canonical: 'AAA2', codes: ['AAA-2', 'CAJA'], quantity: 1 },
    { canonical: 'AAA3', codes: ['AAA-3', 'CAJA'], quantity: 1 },
  ])

  it('encuentra la caja por cualquiera de sus codigos', () => {
    expect(matchExpectedBox(boxes, 'aaa-1').canonical).toBe('AAA1')
  })

  it('marca ambiguo un alias compartido', () => {
    expect(matchExpectedBox(boxes, 'CAJA')).toEqual({ ambiguous: true })
  })

  it('devuelve null para un codigo ajeno', () => {
    expect(matchExpectedBox(boxes, 'ZZZ')).toBeNull()
  })
})

describe('normalizeOptionalText', () => {
  it('convierte vacio en null', () => {
    expect(normalizeOptionalText('   ')).toBeNull()
    expect(normalizeOptionalText(undefined)).toBeNull()
  })

  it('recorta el texto', () => {
    expect(normalizeOptionalText('  x  ')).toBe('x')
  })
})

describe('parsePositiveInt', () => {
  it('usa el fallback ante valores invalidos', () => {
    expect(parsePositiveInt('0', 1)).toBe(1)
    expect(parsePositiveInt('abc', 5)).toBe(5)
  })

  it('acepta un entero positivo', () => {
    expect(parsePositiveInt('3', 1)).toBe(3)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx vitest run src/tests/pickBoxes.test.js`
Expected: FAIL — no se resuelve `../modules/wms/utils/pickBoxes.js`.

- [ ] **Step 3: Crear pickBoxes.js**

Crear `backend/src/modules/wms/utils/pickBoxes.js` moviendo **textualmente** desde `wms.routes.js` los cuerpos de `compactCanonicalCode` (línea 150), `normalizeExpectedBoxes` (154), `matchExpectedBox` (180), `normalizeOptionalText` (213) y `parsePositiveInt` (219), con sus comentarios, agregando `export` a cada uno. El archivo empieza importando `normalizeScanCode` desde la misma ruta que usa `wms.routes.js`.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx vitest run src/tests/pickBoxes.test.js`
Expected: PASS.

- [ ] **Step 5: Hacer que wms.routes.js use los helpers compartidos**

En `backend/src/modules/wms/routes/wms.routes.js` borrar esas cinco funciones y agregar junto a los demás imports:

```js
import {
  compactCanonicalCode, normalizeExpectedBoxes, matchExpectedBox,
  normalizeOptionalText, parsePositiveInt,
} from '../utils/pickBoxes.js'
```

- [ ] **Step 6: Verificar que la suite del backend sigue verde**

Run: `cd backend && npm test`
Expected: PASS (las pruebas que necesitan base se saltan solas sin `DB_HOST`).

- [ ] **Step 7: Escribir la migración**

Crear `backend/migrations/108_surtido_pick_batches.sql`:

```sql
-- Migration 108: Surtido — validación por lote (pick_batches + tarimas)

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
ALTER TABLE pick_events   ADD COLUMN IF NOT EXISTS client_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pick_batches_tenant_fecha ON pick_batches(tenant_id, fecha_lote DESC);
CREATE INDEX IF NOT EXISTS idx_pick_batch_tarimas_batch ON pick_batch_tarimas(tenant_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_pick_sessions_batch ON pick_sessions(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pick_events_tarima ON pick_events(session_id, tarima_ref) WHERE tarima_ref IS NOT NULL;

-- Idempotencia del commit: reintentar el mismo lote no duplica eventos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pick_events_client_event
  ON pick_events(tenant_id, client_event_id) WHERE client_event_id IS NOT NULL;

-- RLS, mismo patrón que la migración 103.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pick_batches', 'pick_batch_tarimas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('108', 'surtido_pick_batches')
ON CONFLICT (version) DO NOTHING;
```

- [ ] **Step 8: Aplicar la migración**

Run: `cd backend && npm run db:migrate -- 108_surtido_pick_batches.sql`
Expected: la migración corre sin error. Si el script espera otro formato de argumento, revisa `backend/scripts/run-migration.js` y usa el que corresponda.

Si no hay base disponible en este entorno, déjalo anotado y continúa: la migración se aplica antes de la Task 6.

- [ ] **Step 9: Commit**

```bash
git add backend/migrations/108_surtido_pick_batches.sql backend/src/modules/wms/utils/pickBoxes.js backend/src/tests/pickBoxes.test.js backend/src/modules/wms/routes/wms.routes.js
git commit -m "feat: esquema de lotes de surtido y helpers compartidos de cajas"
```

---

### Task 6: Endpoint de commit del lote

**Files:**
- Create: `backend/src/modules/wms/services/pickBatchService.js`
- Test: `backend/src/tests/pickBatchService.test.js`
- Create: `backend/src/modules/wms/routes/pickBatch.routes.js`
- Modify: `backend/src/server.js` (montar las rutas nuevas)

**Interfaces:**
- Consumes: `normalizeExpectedBoxes`, `matchExpectedBox`, `normalizeOptionalText`, `parsePositiveInt` de `../utils/pickBoxes.js`; `req.tTransaction(cb)` de `backend/src/config/database.js`.
- Produces:
  - `pickBatchService.js`:
    - `validateCommitPayload(body): { ok: boolean, error?: string }` — pura.
    - `resolveEventResults(expectedBoxes, events): { events: ResolvedEvent[], errors: string[] }` — pura. Re-valida cada `ok` contra el snapshot: sin match o ambiguo → `unexpected`; al exceder la cantidad esperada → `duplicate`. `ResolvedEvent` agrega `resolved_result` y `resolved_box_type`.
    - `commitBatch(req, body): Promise<{ batch, sessions }>` — transaccional.
  - `pickBatch.routes.js`: router Express con `POST /commit`, `GET /`, `GET /:id`, `DELETE /:id/tarima/:ref`.

- [ ] **Step 1: Escribir la prueba de la lógica pura**

Crear `backend/src/tests/pickBatchService.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { validateCommitPayload, resolveEventResults } from '../modules/wms/services/pickBatchService.js'
import { normalizeExpectedBoxes } from '../modules/wms/utils/pickBoxes.js'

const payloadValido = {
  fecha_lote: '2026-08-17',
  tarimas: [{ tarima_ref: 'T01', ubicacion_nota: 'A1-01-01-01', closed_at: '2026-08-17T18:00:00.000Z' }],
  orders: [{
    outbound_order_no: 'OBC-1',
    total_expected: 1,
    expected_boxes: [{ canonical: 'AAA1', codes: ['AAA1'], quantity: 1 }],
    events: [{
      client_event_id: 'e1', scanned_code: 'AAA-1', normalized_code: 'AAA-1',
      matched_box_type: 'AAA1', scan_result: 'ok', quantity: 1,
      tarima_ref: 'T01', ubicacion_nota: 'A1-01-01-01',
      forced_date_mismatch: false, scanned_at: '2026-08-17T17:59:00.000Z',
    }],
  }],
}

describe('validateCommitPayload', () => {
  it('acepta un payload completo', () => {
    expect(validateCommitPayload(payloadValido)).toEqual({ ok: true })
  })

  it('exige la fecha del lote', () => {
    expect(validateCommitPayload({ ...payloadValido, fecha_lote: '' }).ok).toBe(false)
  })

  it('exige formato ISO en la fecha', () => {
    expect(validateCommitPayload({ ...payloadValido, fecha_lote: '17/08/2026' }).ok).toBe(false)
  })

  it('rechaza un lote sin ordenes', () => {
    expect(validateCommitPayload({ ...payloadValido, orders: [] }).ok).toBe(false)
  })

  it('rechaza una orden sin OBC', () => {
    const body = { ...payloadValido, orders: [{ ...payloadValido.orders[0], outbound_order_no: '' }] }
    expect(validateCommitPayload(body).ok).toBe(false)
  })

  it('rechaza un evento sin client_event_id', () => {
    const events = [{ ...payloadValido.orders[0].events[0], client_event_id: '' }]
    const body = { ...payloadValido, orders: [{ ...payloadValido.orders[0], events }] }
    expect(validateCommitPayload(body).ok).toBe(false)
  })

  it('rechaza una tarima sin ubicacion', () => {
    const body = { ...payloadValido, tarimas: [{ tarima_ref: 'T01', ubicacion_nota: '' }] }
    expect(validateCommitPayload(body).ok).toBe(false)
  })
})

describe('resolveEventResults', () => {
  const boxes = normalizeExpectedBoxes([
    { canonical: 'AAA1', codes: ['AAA1'], quantity: 1 },
    { canonical: 'AAA2', codes: ['AAA2'], quantity: 2 },
  ])
  const ev = (over) => ({
    client_event_id: 'x', scanned_code: 'AAA-1', normalized_code: 'AAA-1',
    scan_result: 'ok', quantity: 1, tarima_ref: 'T01', ubicacion_nota: 'A1-01-01-01',
    forced_date_mismatch: false, scanned_at: '2026-08-17T17:59:00.000Z', ...over,
  })

  it('confirma un ok que esta en el snapshot', () => {
    const { events } = resolveEventResults(boxes, [ev({})])
    expect(events[0].resolved_result).toBe('ok')
    expect(events[0].resolved_box_type).toBe('AAA1')
  })

  it('degrada a duplicate al exceder la cantidad esperada', () => {
    const { events } = resolveEventResults(boxes, [ev({ client_event_id: 'a' }), ev({ client_event_id: 'b' })])
    expect(events.map(e => e.resolved_result)).toEqual(['ok', 'duplicate'])
  })

  it('respeta una cantidad esperada mayor a uno', () => {
    const dos = [
      ev({ client_event_id: 'a', normalized_code: 'AAA-2' }),
      ev({ client_event_id: 'b', normalized_code: 'AAA-2' }),
    ]
    expect(resolveEventResults(boxes, dos).events.map(e => e.resolved_result)).toEqual(['ok', 'ok'])
  })

  it('marca unexpected un codigo fuera del snapshot', () => {
    const { events } = resolveEventResults(boxes, [ev({ normalized_code: 'ZZZ' })])
    expect(events[0].resolved_result).toBe('unexpected')
  })

  it('deja pasar un duplicate declarado por el cliente', () => {
    const { events } = resolveEventResults(boxes, [ev({ scan_result: 'duplicate' })])
    expect(events[0].resolved_result).toBe('duplicate')
  })

  it('reporta error cuando la orden no trae snapshot', () => {
    const { errors } = resolveEventResults([], [ev({})])
    expect(errors.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx vitest run src/tests/pickBatchService.test.js`
Expected: FAIL — no se resuelve `pickBatchService.js`.

- [ ] **Step 3: Implementar pickBatchService.js**

Crear `backend/src/modules/wms/services/pickBatchService.js`:

```js
import {
  normalizeExpectedBoxes, matchExpectedBox,
  normalizeOptionalText, parsePositiveInt,
} from '../utils/pickBoxes.js'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ALLOWED_RESULTS = new Set(['ok', 'duplicate', 'unexpected'])

export function validateCommitPayload(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Cuerpo inválido' }
  if (!ISO_DATE_RE.test(String(body.fecha_lote || ''))) {
    return { ok: false, error: 'fecha_lote debe venir como YYYY-MM-DD' }
  }
  if (!Array.isArray(body.orders) || body.orders.length === 0) {
    return { ok: false, error: 'El lote no tiene órdenes que confirmar' }
  }
  if (!Array.isArray(body.tarimas) || body.tarimas.length === 0) {
    return { ok: false, error: 'El lote no tiene tarimas cerradas' }
  }
  for (const tarima of body.tarimas) {
    if (!normalizeOptionalText(tarima?.tarima_ref)) return { ok: false, error: 'Cada tarima requiere tarima_ref' }
    if (!normalizeOptionalText(tarima?.ubicacion_nota)) {
      return { ok: false, error: `La tarima ${tarima?.tarima_ref} no tiene ubicación` }
    }
  }
  const tarimaRefs = new Set(body.tarimas.map(tar => String(tar.tarima_ref)))
  for (const order of body.orders) {
    if (!normalizeOptionalText(order?.outbound_order_no)) {
      return { ok: false, error: 'Cada orden requiere outbound_order_no' }
    }
    if (!Array.isArray(order.events) || order.events.length === 0) {
      return { ok: false, error: `La orden ${order.outbound_order_no} no tiene eventos` }
    }
    for (const event of order.events) {
      if (!normalizeOptionalText(event?.client_event_id)) {
        return { ok: false, error: 'Cada evento requiere client_event_id' }
      }
      if (!normalizeOptionalText(event?.scanned_code)) {
        return { ok: false, error: 'Cada evento requiere scanned_code' }
      }
      if (!ALLOWED_RESULTS.has(String(event?.scan_result))) {
        return { ok: false, error: `Resultado de escaneo inválido: ${event?.scan_result}` }
      }
      if (!tarimaRefs.has(String(event?.tarima_ref))) {
        return { ok: false, error: `El evento ${event.client_event_id} apunta a una tarima que no viene en el lote` }
      }
    }
  }
  return { ok: true }
}

export function resolveEventResults(expectedBoxesRaw, events) {
  const expectedBoxes = normalizeExpectedBoxes(expectedBoxesRaw)
  const errors = []
  const usados = new Map()

  const resolved = (events || []).map((event) => {
    if (event.scan_result !== 'ok') {
      return { ...event, resolved_result: event.scan_result, resolved_box_type: normalizeOptionalText(event.matched_box_type) }
    }
    if (expectedBoxes.length === 0) {
      errors.push(`La orden no tiene snapshot de cajas; el evento ${event.client_event_id} no se puede validar`)
      return { ...event, resolved_result: 'unexpected', resolved_box_type: null }
    }
    const match = matchExpectedBox(expectedBoxes, event.normalized_code || event.scanned_code)
    if (!match || match.ambiguous) {
      return { ...event, resolved_result: 'unexpected', resolved_box_type: null }
    }
    const yaUsadas = usados.get(match.canonical) || 0
    const permitidas = parsePositiveInt(match.quantity, 1)
    if (yaUsadas >= permitidas) {
      return { ...event, resolved_result: 'duplicate', resolved_box_type: match.canonical }
    }
    usados.set(match.canonical, yaUsadas + 1)
    return { ...event, resolved_result: 'ok', resolved_box_type: match.canonical }
  })

  return { events: resolved, errors }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && npx vitest run src/tests/pickBatchService.test.js`
Expected: PASS.

- [ ] **Step 5: Implementar commitBatch en el mismo servicio**

Agregar al final de `backend/src/modules/wms/services/pickBatchService.js`:

```js
/**
 * Confirma un lote completo en una sola transacción: si algo falla, no queda
 * ni el lote ni una sola sesión a medias.
 * Reintentar el mismo commit no duplica eventos — client_event_id es único
 * por tenant (índice parcial de la migración 108).
 */
export async function commitBatch(req, body) {
  return req.tTransaction(async (client) => {
    const tenantId = req.tenantId
    const operatorId = req.fullUser?.id || req.user?.id || null

    const totalCajas = body.orders.reduce(
      (sum, o) => sum + o.events.filter(e => e.scan_result === 'ok').length, 0
    )

    const batchRes = await client.query(
      `INSERT INTO pick_batches
         (tenant_id, fecha_lote, operator_id, status, total_ordenes, total_cajas, total_tarimas, notes)
       VALUES ($1, $2, $3, 'confirmado', $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, body.fecha_lote, operatorId, body.orders.length, totalCajas, body.tarimas.length,
       normalizeOptionalText(body.notes)]
    )
    const batch = batchRes.rows[0]

    for (const tarima of body.tarimas) {
      await client.query(
        `INSERT INTO pick_batch_tarimas (batch_id, tenant_id, tarima_ref, ubicacion_nota, closed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (batch_id, tarima_ref) DO NOTHING`,
        [batch.id, tenantId, tarima.tarima_ref, normalizeOptionalText(tarima.ubicacion_nota),
         tarima.closed_at || null]
      )
    }

    const sessions = []

    for (const order of body.orders) {
      const { events: resolvedEvents } = resolveEventResults(order.expected_boxes, order.events)
      const expectedBoxes = normalizeExpectedBoxes(order.expected_boxes)
      const totalExpected = parsePositiveInt(order.total_expected, 0) || 0

      // Una orden mapea siempre a una sola pick_sessions. Se reusa la existente
      // (mismo criterio que POST /scan-session) para no fragmentar su avance.
      const existing = await client.query(
        `SELECT * FROM pick_sessions
         WHERE tenant_id = $1 AND outbound_order_no = $2
         ORDER BY updated_at DESC LIMIT 1`,
        [tenantId, order.outbound_order_no]
      )

      let session
      if (existing.rows.length > 0) {
        const updated = await client.query(
          `UPDATE pick_sessions
           SET operator_id = $1,
               status = 'open',
               completed_at = NULL,
               batch_id = $2,
               total_expected = GREATEST(total_expected, $3),
               receiver_name = COALESCE(receiver_name, $4),
               logistics_track_no = COALESCE(logistics_track_no, $5),
               logistics_channel = COALESCE(logistics_channel, $6),
               outbound_delivery_at = COALESCE(outbound_delivery_at, $7),
               third_order_no = COALESCE(third_order_no, $8),
               expected_boxes = CASE WHEN jsonb_array_length($9::jsonb) > 0 THEN $9::jsonb ELSE expected_boxes END,
               updated_at = now()
           WHERE id = $10 AND tenant_id = $11
           RETURNING *`,
          [operatorId, batch.id, totalExpected,
           normalizeOptionalText(order.receiver_name), normalizeOptionalText(order.logistics_track_no),
           normalizeOptionalText(order.logistics_channel), order.outbound_delivery_at || null,
           normalizeOptionalText(order.third_order_no), JSON.stringify(expectedBoxes),
           existing.rows[0].id, tenantId]
        )
        session = updated.rows[0]
      } else {
        const created = await client.query(
          `INSERT INTO pick_sessions
             (tenant_id, outbound_order_no, third_order_no, operator_id, status, total_expected, total_scanned,
              receiver_name, logistics_track_no, logistics_channel, outbound_delivery_at, expected_boxes, batch_id)
           VALUES ($1, $2, $3, $4, 'open', $5, 0, $6, $7, $8, $9, $10::jsonb, $11)
           RETURNING *`,
          [tenantId, order.outbound_order_no, normalizeOptionalText(order.third_order_no), operatorId, totalExpected,
           normalizeOptionalText(order.receiver_name), normalizeOptionalText(order.logistics_track_no),
           normalizeOptionalText(order.logistics_channel), order.outbound_delivery_at || null,
           JSON.stringify(expectedBoxes), batch.id]
        )
        session = created.rows[0]
      }

      let okCount = 0
      for (const event of resolvedEvents) {
        const inserted = await client.query(
          `INSERT INTO pick_events
             (session_id, tenant_id, scanned_code, normalized_code, matched_sku, matched_box_type,
              scan_result, quantity, input_method, ubicacion_nota, operator_id,
              tarima_ref, forced_date_mismatch, client_event_id, scanned_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scanner', $9, $10, $11, $12, $13, COALESCE($14::timestamptz, now()))
           ON CONFLICT (tenant_id, client_event_id) WHERE client_event_id IS NOT NULL DO NOTHING
           RETURNING id, scan_result`,
          [session.id, tenantId, String(event.scanned_code).trim(),
           event.normalized_code || event.scanned_code,
           normalizeOptionalText(event.matched_sku), event.resolved_box_type,
           event.resolved_result, parsePositiveInt(event.quantity, 1),
           normalizeOptionalText(event.ubicacion_nota), operatorId,
           normalizeOptionalText(event.tarima_ref), Boolean(event.forced_date_mismatch),
           event.client_event_id, event.scanned_at || null]
        )
        if (inserted.rows.length > 0 && inserted.rows[0].scan_result === 'ok') okCount += 1

        if (event.resolved_result === 'ok') {
          const norm = String(event.normalized_code || event.scanned_code).trim().toUpperCase()
          const variantes = new Set([norm])
          if (norm.includes('-')) variantes.add(norm.replace(/-/g, '/'))
          if (norm.includes('/')) variantes.add(norm.replace(/\//g, '-'))
          for (const variante of variantes) {
            await client.query(
              `INSERT INTO pick_box_status (tenant_id, outbound_order_no, box_code, estado, updated_by)
               VALUES ($1, $2, $3, 'validada', $4)
               ON CONFLICT (tenant_id, outbound_order_no, box_code) DO NOTHING`,
              [tenantId, order.outbound_order_no, variante, req.user?.email || String(operatorId)]
            )
          }
        }
      }

      const totalesRes = await client.query(
        `SELECT COALESCE(SUM(COALESCE(quantity, 1)), 0)::int AS total_scanned
         FROM pick_events WHERE session_id = $1 AND tenant_id = $2 AND scan_result = 'ok'`,
        [session.id, tenantId]
      )
      const totalScanned = totalesRes.rows[0].total_scanned
      const finalStatus = totalExpected > 0 && totalScanned >= totalExpected ? 'complete' : 'with_discrepancies'

      const cerrada = await client.query(
        `UPDATE pick_sessions
         SET total_scanned = $1, status = $2, completed_at = now(), updated_at = now()
         WHERE id = $3 AND tenant_id = $4
         RETURNING *`,
        [totalScanned, finalStatus, session.id, tenantId]
      )

      sessions.push({
        outbound_order_no: order.outbound_order_no,
        session_id: session.id,
        status: finalStatus,
        ok: totalScanned,
        total_expected: totalExpected,
        insertados: okCount,
      })
    }

    return { batch, sessions }
  })
}
```

- [ ] **Step 6: Crear el router**

Crear `backend/src/modules/wms/routes/pickBatch.routes.js`. Copia el bloque de imports de middleware y helpers desde el encabezado de `wms.routes.js` (`authenticateToken`, `loadFullUser`, `requirePermission`, `requireAnyPermission` si aplica, `UUID_RE`) usando las mismas rutas relativas.

```js
import express from 'express'
import { validateCommitPayload, commitBatch } from '../services/pickBatchService.js'
// ...imports de middleware, copiados de wms.routes.js

const router = express.Router()

router.post('/commit',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'crear'),
  async (req, res) => {
    try {
      const validation = validateCommitPayload(req.body)
      if (!validation.ok) return res.status(400).json({ success: false, error: validation.error })
      const data = await commitBatch(req, req.body)
      res.status(201).json({ success: true, data })
    } catch (err) {
      console.error('POST wmshub/pick-batch/commit error:', err.message)
      res.status(500).json({ success: false, error: 'Error confirmando el lote de validación' })
    }
  }
)

router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'ver'),
  async (req, res) => {
    try {
      const { page = 1, pageSize = 20, fecha_inicio, fecha_fin } = req.query
      const limit = Math.min(parseInt(pageSize) || 20, 200)
      const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit
      const conditions = ['b.tenant_id = $1']
      const params = [req.tenantId]
      let p = 2
      if (fecha_inicio) { conditions.push(`b.fecha_lote >= $${p++}`); params.push(fecha_inicio) }
      if (fecha_fin)    { conditions.push(`b.fecha_lote <= $${p++}`); params.push(fecha_fin) }

      const result = await req.tQuery(
        `SELECT b.*, u.nombre_completo AS operator_nombre,
                COUNT(*) OVER()::int AS total_rows
         FROM pick_batches b
         LEFT JOIN usuarios u ON u.id = b.operator_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY b.fecha_lote DESC, b.created_at DESC
         LIMIT $${p++} OFFSET $${p}`,
        [...params, limit, offset]
      )
      res.json({
        success: true,
        data: result.rows,
        meta: { total: result.rows[0]?.total_rows ?? 0, page: Number(page), limit },
      })
    } catch (err) {
      console.error('GET wmshub/pick-batch error:', err.message)
      res.status(500).json({ success: false, error: 'Error listando lotes' })
    }
  }
)

router.get('/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'ver'),
  async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) {
        return res.status(400).json({ success: false, error: 'ID de lote inválido' })
      }
      const batch = await req.tQuery(
        `SELECT b.*, u.nombre_completo AS operator_nombre
         FROM pick_batches b LEFT JOIN usuarios u ON u.id = b.operator_id
         WHERE b.id = $1 AND b.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (batch.rows.length === 0) return res.status(404).json({ success: false, error: 'Lote no encontrado' })

      const tarimas = await req.tQuery(
        `SELECT * FROM pick_batch_tarimas WHERE batch_id = $1 AND tenant_id = $2 ORDER BY tarima_ref`,
        [req.params.id, req.tenantId]
      )
      const sessions = await req.tQuery(
        `SELECT s.*, u.nombre_completo AS operator_nombre
         FROM pick_sessions s LEFT JOIN usuarios u ON u.id = s.operator_id
         WHERE s.batch_id = $1 AND s.tenant_id = $2
         ORDER BY s.outbound_order_no`,
        [req.params.id, req.tenantId]
      )
      const events = await req.tQuery(
        `SELECT e.*, u.nombre_completo AS operator_nombre
         FROM pick_events e
         JOIN pick_sessions s ON s.id = e.session_id
         LEFT JOIN usuarios u ON u.id = e.operator_id
         WHERE s.batch_id = $1 AND e.tenant_id = $2
         ORDER BY e.scanned_at`,
        [req.params.id, req.tenantId]
      )
      res.json({
        success: true,
        data: { batch: batch.rows[0], tarimas: tarimas.rows, sessions: sessions.rows, events: events.rows },
      })
    } catch (err) {
      console.error('GET wmshub/pick-batch/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo el lote' })
    }
  }
)

// Borrar una tarima ya confirmada: elimina sus eventos y recalcula los totales
// de cada sesión afectada. Solo para usuarios con permiso de eliminar.
router.delete('/:id/tarima/:ref',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'eliminar'),
  async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) {
        return res.status(400).json({ success: false, error: 'ID de lote inválido' })
      }
      const data = await req.tTransaction(async (client) => {
        const afectadas = await client.query(
          `DELETE FROM pick_events e
           USING pick_sessions s
           WHERE e.session_id = s.id AND s.batch_id = $1 AND e.tenant_id = $2 AND e.tarima_ref = $3
           RETURNING s.id AS session_id`,
          [req.params.id, req.tenantId, req.params.ref]
        )
        await client.query(
          `DELETE FROM pick_batch_tarimas WHERE batch_id = $1 AND tenant_id = $2 AND tarima_ref = $3`,
          [req.params.id, req.tenantId, req.params.ref]
        )
        const sessionIds = [...new Set(afectadas.rows.map(r => r.session_id))]
        for (const sessionId of sessionIds) {
          await client.query(
            `UPDATE pick_sessions s
             SET total_scanned = COALESCE((
                   SELECT SUM(COALESCE(quantity, 1))::int FROM pick_events
                   WHERE session_id = $1 AND tenant_id = $2 AND scan_result = 'ok'
                 ), 0),
                 updated_at = now()
             WHERE s.id = $1 AND s.tenant_id = $2`,
            [sessionId, req.tenantId]
          )
        }
        await client.query(
          `UPDATE pick_batches
           SET total_tarimas = GREATEST(total_tarimas - 1, 0),
               total_cajas = GREATEST(total_cajas - $3, 0),
               updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [req.params.id, req.tenantId, afectadas.rowCount]
        )
        return { eventos_eliminados: afectadas.rowCount, sesiones_afectadas: sessionIds.length }
      })
      res.json({ success: true, data })
    } catch (err) {
      console.error('DELETE wmshub/pick-batch/:id/tarima/:ref error:', err.message)
      res.status(500).json({ success: false, error: 'Error eliminando la tarima' })
    }
  }
)

export default router
```

- [ ] **Step 7: Montar el router**

En `backend/src/server.js`, junto a la línea 237 (`app.use('/api/wmshub', ...)`), **antes** de ella para que no la capture el router genérico:

```js
app.use('/api/wmshub/pick-batch', tenantContext, tenantDB, moduleGuard('surtido'), pickBatchRoutes)
```

y el import correspondiente arriba, siguiendo el estilo de los demás:

```js
import pickBatchRoutes from './modules/wms/routes/pickBatch.routes.js'
```

- [ ] **Step 8: Verificar que el servidor arranca y las pruebas pasan**

Run: `cd backend && npm test && node --check src/modules/wms/routes/pickBatch.routes.js && node --check src/modules/wms/services/pickBatchService.js`
Expected: pruebas en verde y sin errores de sintaxis.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/wms/services/pickBatchService.js backend/src/tests/pickBatchService.test.js backend/src/modules/wms/routes/pickBatch.routes.js backend/src/server.js
git commit -m "feat: endpoint transaccional de confirmacion de lote de surtido"
```

---

### Task 7: Servicio y textos del frontend

**Files:**
- Modify: `frontend/src/modules/Surtido/services/surtidoService.js`
- Modify: `frontend/src/core/stores/locales/es.js`
- Modify: `frontend/src/core/stores/locales/zh.js`

**Interfaces:**
- Consumes: `api` de `../../../core/services/api` (ya importado en el servicio).
- Produces: `commitPickBatch(body)`, `getPickBatches(params)`, `getPickBatch(id)`, `deletePickBatchTarima(id, ref)` en `surtidoService.js`; las claves i18n `surtido.lote.*` en ambos diccionarios.

- [ ] **Step 1: Agregar las funciones del servicio**

Al final de `frontend/src/modules/Surtido/services/surtidoService.js`:

```js
// Validación por lote
export const commitPickBatch = (body) =>
  api.post('/wmshub/pick-batch/commit', body, { timeout: 120000 }).then(r => r.data)

export const getPickBatches = (params) =>
  api.get('/wmshub/pick-batch', { params }).then(r => r.data)

export const getPickBatch = (id) =>
  api.get(`/wmshub/pick-batch/${id}`).then(r => r.data)

export const deletePickBatchTarima = (id, tarimaRef) =>
  api.delete(`/wmshub/pick-batch/${id}/tarima/${encodeURIComponent(tarimaRef)}`).then(r => r.data)
```

- [ ] **Step 2: Agregar las claves en es.js**

En `frontend/src/core/stores/locales/es.js`, junto al bloque `surtido.validacion.*` (alrededor de la línea 2174):

```js
    'surtido.lote.tipoModal.title':          'Iniciar validación',
    'surtido.lote.tipoModal.subtitle':       'Elige cómo vas a validar este surtido',
    'surtido.lote.tipo.porOrden.label':      'Validación por Orden',
    'surtido.lote.tipo.porOrden.desc':       'Busca una orden y valida sus cajas una por una. Es el flujo de siempre.',
    'surtido.lote.tipo.porLote.label':       'Validación por Lote',
    'surtido.lote.tipo.porLote.desc':        'Elige una fecha y el sistema carga todas sus órdenes. Escanea cualquier caja y se asigna sola a la orden que le corresponde.',
    'surtido.lote.fecha.label':              'Fecha del lote',
    'surtido.lote.fecha.help':               'Se cargarán las órdenes con salida en esta fecha.',
    'surtido.lote.iniciar':                  'Iniciar lote',
    'surtido.lote.tab.label':                'Lote',
    'surtido.lote.cargando':                 'Cargando órdenes del lote…',
    'surtido.lote.vacio.title':              'Sin órdenes para esta fecha',
    'surtido.lote.vacio.desc':               'No hay órdenes de salida con esa fecha en el sheet. Refresca los datos o elige otra fecha.',
    'surtido.lote.vacio.refrescar':          'Refrescar datos',
    'surtido.lote.resumen.ordenes':          'Órdenes completas',
    'surtido.lote.resumen.cajas':            'Cajas validadas',
    'surtido.lote.resumen.tarimas':          'Tarimas',
    'surtido.lote.tarima.activa':            'Tarima activa',
    'surtido.lote.tarima.cerrar':            'Cerrar tarima',
    'surtido.lote.tarima.ubicacion':         'Ubicación de la tarima',
    'surtido.lote.tarima.ubicacionPlaceholder': 'Escanea o escribe la ubicación',
    'surtido.lote.tarima.cerrada':           'Tarima cerrada en',
    'surtido.lote.tarima.eliminar':          'Eliminar tarima',
    'surtido.lote.tarima.eliminarConfirm':   '¿Eliminar la tarima {ref} y todos sus escaneos?',
    'surtido.lote.tarima.sinEscaneos':       'La tarima no tiene cajas escaneadas todavía.',
    'surtido.lote.scan.placeholder':         'Escanea una caja del lote',
    'surtido.lote.scan.ok':                  'Caja asignada a',
    'surtido.lote.scan.duplicate':           'Esa caja ya fue validada en este lote',
    'surtido.lote.scan.notFound':            'El código no pertenece a ninguna orden del lote ni de los días adyacentes. Revisa que sea una caja de este surtido.',
    'surtido.lote.scan.eliminarUltimo':      'Eliminar último registro',
    'surtido.lote.scan.eliminarConfirm':     '¿Eliminar el registro de {code}?',
    'surtido.lote.forzar.title':             'La caja no corresponde a la fecha del lote',
    'surtido.lote.forzar.body':              'Esta caja pertenece a la orden {orden}, con fecha {fechaOrden}. El lote que estás validando es del {fechaLote}. Revisa que sea la caja correcta antes de forzarla.',
    'surtido.lote.forzar.confirmar':         'Forzar entrada',
    'surtido.lote.forzar.cancelar':          'No agregar',
    'surtido.lote.forzada':                  'Forzada de otra fecha',
    'surtido.lote.panel.completas':          'Completas',
    'surtido.lote.panel.pendientes':         'Pendientes',
    'surtido.lote.panel.cajasValidadas':     'Cajas validadas',
    'surtido.lote.panel.cajasPendientes':    'Cajas pendientes',
    'surtido.lote.panel.faltan':             'faltan {n}',
    'surtido.lote.confirmar':                'Confirmar lote',
    'surtido.lote.confirmar.title':          'Confirmar la validación del lote',
    'surtido.lote.confirmar.body':           'Se crearán los registros de {ordenes} órdenes con {cajas} cajas en {tarimas} tarimas. Esta acción no se puede deshacer desde aquí.',
    'surtido.lote.confirmar.tarimaAbierta':  'Cierra la tarima activa con su ubicación antes de confirmar.',
    'surtido.lote.confirmar.exito':          'Lote confirmado',
    'surtido.lote.confirmar.error':          'No se pudo confirmar el lote. El borrador sigue guardado; vuelve a intentarlo.',
    'surtido.lote.cancelar':                 'Cancelar lote',
    'surtido.lote.cancelar.title':           'Cancelar el lote completo',
    'surtido.lote.cancelar.body':            'Se borrarán los {cajas} escaneos de este lote. Todavía no se ha guardado nada en el sistema.',
    'surtido.lote.cancelar.confirmar':       'Sí, cancelar todo',
    'surtido.lote.borrador':                 'Borrador sin confirmar',
    'surtido.lote.sinPermisoEliminar':       'Solo puedes eliminar el último registro o la tarima en curso.',
```

- [ ] **Step 3: Agregar las mismas claves en zh.js**

En `frontend/src/core/stores/locales/zh.js` agregar las mismas claves con su traducción al chino, respetando los placeholders `{orden}`, `{fechaOrden}`, `{fechaLote}`, `{ref}`, `{code}`, `{n}`, `{ordenes}`, `{cajas}`, `{tarimas}`. Si el archivo tiene una convención de agrupación por bloque de módulo, colócalas en el bloque de surtido.

- [ ] **Step 4: Verificar la paridad de claves**

Run:
```bash
cd frontend && node -e "
const es = (await import('./src/core/stores/locales/es.js')).default
const zh = (await import('./src/core/stores/locales/zh.js')).default
const faltan = Object.keys(es).filter(k => k.startsWith('surtido.lote.') && !(k in zh))
if (faltan.length) { console.error('Faltan en zh:', faltan); process.exit(1) }
console.log('paridad ok:', Object.keys(es).filter(k => k.startsWith('surtido.lote.')).length, 'claves')
" --input-type=module
```
Expected: `paridad ok: 46 claves` (o el número que resulte), sin claves faltantes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/Surtido/services/surtidoService.js frontend/src/core/stores/locales/es.js frontend/src/core/stores/locales/zh.js
git commit -m "feat: servicio y textos de validacion por lote"
```

---

### Task 8: Hook useLoteDraft con persistencia local

**Files:**
- Create: `frontend/src/modules/Surtido/hooks/useLoteDraft.js`
- Test: `frontend/src/modules/Surtido/hooks/useLoteDraft.test.js`

**Interfaces:**
- Consumes: todo lo exportado por `../utils/loteDraft`.
- Produces:
  - `LOTE_DRAFT_KEY(tabId): string` → `kirion_surtido_lote_${tabId}`.
  - `loadDraft(tabId): Draft|null` — lee localStorage; devuelve `null` si está corrupto.
  - `saveDraft(tabId, draft): void` — escribe localStorage, tolerante a cuota llena.
  - `clearDraft(tabId): void`
  - `useLoteDraft({ tabId, dateKey, pool, operatorId, permission }): { draft, summary, progress, scan, forceScan, closeActiveTarima, removeScanById, removeTarimaByRef, canRemoveScanById, canRemoveTarimaByRef, cancelDraft, commitPayload }` — hook React que envuelve el reducer y persiste en cada cambio.

- [ ] **Step 1: Escribir la prueba de la persistencia**

Crear `frontend/src/modules/Surtido/hooks/useLoteDraft.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LOTE_DRAFT_KEY, loadDraft, saveDraft, clearDraft } from './useLoteDraft'
import { createDraft, scanDraft } from '../utils/loteDraft'
import { buildLotePool } from '../utils/lotePool'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const pool = buildLotePool([{
  outboundOrderNo: 'OBC-1', outboundTime: '2026-08-17 10:00:00',
  packageList: [{ customizeCode: 'AAA-1', quantity: 1 }],
}], '2026-08-17')

beforeEach(() => store.clear())

describe('LOTE_DRAFT_KEY', () => {
  it('aisla el borrador por pestana', () => {
    expect(LOTE_DRAFT_KEY('abc')).toBe('kirion_surtido_lote_abc')
    expect(LOTE_DRAFT_KEY('abc')).not.toBe(LOTE_DRAFT_KEY('def'))
  })
})

describe('persistencia del borrador', () => {
  it('sobrevive un round trip completo', () => {
    const { draft } = scanDraft(createDraft({ dateKey: '2026-08-17', operatorId: 7 }), pool, 'AAA-1')
    saveDraft('t1', draft)
    const recuperado = loadDraft('t1')
    expect(recuperado.scans).toHaveLength(1)
    expect(recuperado.scans[0].orderNo).toBe('OBC-1')
    expect(recuperado.activeTarimaRef).toBe('T01')
  })

  it('devuelve null cuando no hay nada guardado', () => {
    expect(loadDraft('vacio')).toBeNull()
  })

  it('devuelve null ante un borrador corrupto en vez de reventar', () => {
    localStorage.setItem(LOTE_DRAFT_KEY('roto'), '{no es json')
    expect(loadDraft('roto')).toBeNull()
  })

  it('descarta un objeto sin la forma esperada', () => {
    localStorage.setItem(LOTE_DRAFT_KEY('raro'), JSON.stringify({ hola: 1 }))
    expect(loadDraft('raro')).toBeNull()
  })

  it('clearDraft borra la entrada', () => {
    saveDraft('t2', createDraft({ dateKey: '2026-08-17', operatorId: 1 }))
    clearDraft('t2')
    expect(loadDraft('t2')).toBeNull()
  })

  it('no revienta si localStorage esta lleno', () => {
    const original = globalThis.localStorage.setItem
    globalThis.localStorage.setItem = () => { throw new Error('QuotaExceeded') }
    expect(() => saveDraft('t3', createDraft({ dateKey: '2026-08-17', operatorId: 1 }))).not.toThrow()
    globalThis.localStorage.setItem = original
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npm test -- useLoteDraft`
Expected: FAIL — no se resuelve `./useLoteDraft`.

- [ ] **Step 3: Implementar el hook**

Crear `frontend/src/modules/Surtido/hooks/useLoteDraft.js`:

```js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createDraft, scanDraft, closeTarima, removeScan, removeTarima,
  canRemoveScan, canRemoveTarima, draftSummary, orderProgress, buildCommitPayload,
} from '../utils/loteDraft'

export const LOTE_DRAFT_KEY = (tabId) => `kirion_surtido_lote_${tabId}`

function isDraftShape(value) {
  return Boolean(
    value && typeof value === 'object' &&
    typeof value.dateKey === 'string' &&
    Array.isArray(value.tarimas) &&
    Array.isArray(value.scans) &&
    typeof value.activeTarimaRef === 'string'
  )
}

export function loadDraft(tabId) {
  try {
    const raw = localStorage.getItem(LOTE_DRAFT_KEY(tabId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isDraftShape(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveDraft(tabId, draft) {
  try {
    localStorage.setItem(LOTE_DRAFT_KEY(tabId), JSON.stringify(draft))
  } catch {
    // Cuota llena o almacenamiento bloqueado: el escaneo sigue en memoria.
  }
}

export function clearDraft(tabId) {
  try { localStorage.removeItem(LOTE_DRAFT_KEY(tabId)) } catch {}
}

export function useLoteDraft({ tabId, dateKey, pool, operatorId, permission }) {
  const [draft, setDraft] = useState(() => {
    const guardado = loadDraft(tabId)
    if (guardado && guardado.dateKey === dateKey) return guardado
    return createDraft({ dateKey, operatorId })
  })

  // Espejo síncrono del borrador: dos lecturas del escáner pueden llegar en el
  // mismo tick, antes de cualquier re-render, y leer `draft` de la clausura
  // anterior perdería el primer escaneo. Toda escritura pasa por commitDraft,
  // que actualiza el ref antes que el estado.
  const draftRef = useRef(draft)

  const commitDraft = useCallback((next) => {
    draftRef.current = next
    setDraft(next)
  }, [])

  useEffect(() => { saveDraft(tabId, draft) }, [tabId, draft])

  // El resultado de un escaneo se calcula fuera del updater: React 18 puede
  // invocar el updater de setState más tarde (o dos veces en StrictMode), así
  // que leer el outcome desde dentro daría un valor no confiable justo en el
  // camino que decide qué sonido y qué modal se muestran.
  const scan = useCallback((rawCode) => {
    const salida = scanDraft(draftRef.current, pool, rawCode)
    if (salida.outcome.result !== 'needs_force') commitDraft(salida.draft)
    return salida.outcome
  }, [pool, commitDraft])

  const forceScan = useCallback((rawCode) => {
    const salida = scanDraft(draftRef.current, pool, rawCode, { force: true })
    commitDraft(salida.draft)
    return salida.outcome
  }, [pool, commitDraft])

  const closeActiveTarima = useCallback((ubicacion) => {
    const salida = closeTarima(draftRef.current, ubicacion)
    if (!salida.error) commitDraft(salida.draft)
    return salida.error
  }, [commitDraft])

  const removeScanById = useCallback((id) => commitDraft(removeScan(draftRef.current, id)), [commitDraft])
  const removeTarimaByRef = useCallback((ref) => commitDraft(removeTarima(draftRef.current, ref)), [commitDraft])

  const cancelDraft = useCallback(() => {
    clearDraft(tabId)
    commitDraft(createDraft({ dateKey, operatorId }))
  }, [tabId, dateKey, operatorId, commitDraft])

  const summary = useMemo(() => draftSummary(draft, pool), [draft, pool])
  const progress = useMemo(() => orderProgress(draft, pool), [draft, pool])

  return {
    draft,
    summary,
    progress,
    scan,
    forceScan,
    closeActiveTarima,
    removeScanById,
    removeTarimaByRef,
    canRemoveScanById: (id) => canRemoveScan(draft, id, permission),
    canRemoveTarimaByRef: (ref) => canRemoveTarima(draft, ref, permission),
    cancelDraft,
    commitPayload: (notes) => buildCommitPayload(draft, pool, notes),
  }
}
```

Nota: `scan`, `forceScan` y `closeActiveTarima` **devuelven** el outcome/error de forma síncrona, porque de eso dependen el sonido, el toast y el modal de forzado. Por eso leen `draftRef.current` en vez del estado de la clausura, y toda escritura pasa por `commitDraft`.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npm test -- useLoteDraft`
Expected: PASS, 7 pruebas.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/Surtido/hooks/useLoteDraft.js frontend/src/modules/Surtido/hooks/useLoteDraft.test.js
git commit -m "feat: hook de borrador de lote con persistencia local"
```

---

### Task 9: Modal de selección de tipo de validación

**Files:**
- Create: `frontend/src/modules/Surtido/components/ValidacionTypeModal.jsx`
- Modify: `frontend/src/modules/Surtido/pages/Validacion.jsx` (nueva pestaña con `tipo`; abrir el modal desde el botón de nueva sesión)

**Interfaces:**
- Consumes: `Modal` de `../../../core/components/common/Modal`, `useI18nStore`, claves `surtido.lote.tipoModal.*` / `surtido.lote.tipo.*` / `surtido.lote.fecha.*`.
- Produces: `ValidacionTypeModal({ isOpen, onClose, onSelect })` donde `onSelect({ tipo: 'por_orden' | 'por_lote', fecha?: string })`. `fecha` viene siempre en `'YYYY-MM-DD'` y solo cuando `tipo === 'por_lote'`.
- Las pestañas de `Validacion.jsx` pasan a tener forma `{ id, label, tipo, fecha? }`. `normalizeStoredTabs` debe rellenar `tipo: 'por_orden'` en las pestañas guardadas de versiones anteriores.

- [ ] **Step 1: Leer el modal de referencia**

Lee `frontend/src/modules/Despacho/components/FolioTypeModal.jsx` (las primeras ~200 líneas) para copiar el patrón visual de tarjetas de tipo: dos tarjetas seleccionables, la elegida con borde `border-primary-300 bg-primary-50`. Reproduce ese patrón; no inventes uno nuevo.

- [ ] **Step 2: Crear el componente**

Crear `frontend/src/modules/Surtido/components/ValidacionTypeModal.jsx`:

- Dos tarjetas: **Por Orden** (icono `List`, tono `primary`) y **Por Lote** (icono `Layers`, tono `accent`), con `label` y `desc` desde i18n.
- Al elegir "Por Lote" se muestra debajo un `<input type="date">` con `defaultValue` = hoy en `'YYYY-MM-DD'` (calcúlalo con `new Date()` local, no UTC, para no adelantar un día), etiqueta `surtido.lote.fecha.label` y ayuda `surtido.lote.fecha.help`.
- Botón primario: `surtido.lote.iniciar` para lote, `common.create` para orden. Deshabilitado si el tipo es lote y no hay fecha.
- Encabezado con `surtido.lote.tipoModal.title` / `.subtitle`.
- Cumple `frontend/CLAUDE.md`: título del modal en `text-xl`, sin estilos inline sueltos.

- [ ] **Step 3: Integrar en Validacion.jsx**

1. En `normalizeStoredTabs`, dar por defecto `tipo: 'por_orden'` a cualquier pestaña guardada sin `tipo`, y conservar `fecha` cuando exista.
2. `buildDefaultTab(label)` devuelve `{ id: genId(), label, tipo: 'por_orden' }`.
3. El botón de "Nueva Sesión" (en `TabBar` y en `MobileSessionPicker`) abre `ValidacionTypeModal` en lugar de crear la pestaña directamente.
4. `onSelect({ tipo, fecha })` crea la pestaña: para `por_orden` como hoy; para `por_lote`, `{ id: genId(), label: `${t('surtido.lote.tab.label')} ${fecha}`, tipo: 'por_lote', fecha }`.
5. En el render de pestañas, si `tab.tipo === 'por_lote'` renderiza `<ValidarPorLote tabId={tab.id} fecha={tab.fecha} isActive={...} />`; si no, el `TabSession` actual sin cambios.
6. El punto de color de la pestaña: `bg-accent-400` para lote, `bg-primary-400` para orden (mismo criterio que Despacho).

Hasta la Task 10 `ValidarPorLote` no existe: crea un archivo mínimo que solo renderice un `LoadingSpinner`, para que el build siga verde, y complétalo en la tarea siguiente.

- [ ] **Step 4: Verificar el build**

Run: `cd frontend && npm run build && npm test`
Expected: build exitoso y pruebas en verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/Surtido/components/ValidacionTypeModal.jsx frontend/src/modules/Surtido/components/ValidarPorLote.jsx frontend/src/modules/Surtido/pages/Validacion.jsx
git commit -m "feat: selector de tipo de validacion de surtido"
```

---

### Task 10: Panel de validación por lote

La pantalla completa. Se apoya en todo lo anterior; aquí no hay lógica nueva de negocio, solo composición y presentación.

**Files:**
- Modify: `frontend/src/modules/Surtido/components/ValidarPorLote.jsx` (completar el stub de la Task 9)
- Create: `frontend/src/modules/Surtido/components/LoteResumenCards.jsx`
- Create: `frontend/src/modules/Surtido/components/LoteTarimaPanel.jsx`
- Create: `frontend/src/modules/Surtido/components/LotePoolSidebar.jsx`
- Create: `frontend/src/modules/Surtido/components/LoteForzarFechaModal.jsx`
- Create: `frontend/src/modules/Surtido/components/LoteConfirmarModal.jsx`

**Interfaces:**
- Consumes: `useLoteDraft` (Task 8), `buildLotePool` (Task 3), `getOutboundBatchByDate` y `commitPickBatch` (Tasks 3 y 7), `ScanInputBar` de `../../Shared/Wms/ScanInputBar`, `playSound` de `../../Shared/Wms/playSound`, `Modal`, `LoadingSpinner`, `OfflineBlockedModal` de `../../../core/components/common/`, `useToastStore`, `useAuthStore`, `useI18nStore`, `useOfflineStore`, `fmtTimeShort` de `../../../core/utils/dateFormat`.
- Produces:
  - `ValidarPorLote({ tabId, fecha, isActive })` — default export.
  - `LoteResumenCards({ summary })`
  - `LoteTarimaPanel({ draft, onCloseTarima, onRemoveTarima, canRemoveTarima })`
  - `LotePoolSidebar({ pool, progress, visible, onToggle })`
  - `LoteForzarFechaModal({ isOpen, outcome, onConfirm, onCancel })`
  - `LoteConfirmarModal({ isOpen, mode: 'confirmar'|'cancelar', summary, notes, onNotesChange, onConfirm, onClose, isPending })`

- [ ] **Step 1: Leer las referencias visuales**

Lee `frontend/src/modules/Despacho/components/ValidarPorDestino.jsx:202-700` para el layout (barra de escaneo arriba, feed al centro, panel lateral colapsable a la derecha con `PanelRightClose`/`PanelRightOpen`) y `frontend/src/modules/Surtido/pages/Validacion.jsx:1351-2150` para cómo el modo por orden presenta el feed, los sonidos y el input de ubicación. Reproduce esos patrones.

- [ ] **Step 2: LoteResumenCards**

Tres tarjetas en `grid grid-cols-3 gap-3`:
- Órdenes completas: `{ordenesCompletas}/{ordenesTotal}`, icono `Package`, tono primary.
- Cajas validadas: `{cajasValidadas}/{cajasEsperadas}`, icono `Boxes`, tono success.
- Tarimas: `{tarimasCerradas}` con subtítulo `{tarimaActiva}` como activa, icono `Layers`, tono accent.

Números en `text-2xl font-bold`, etiquetas desde `surtido.lote.resumen.*`.

- [ ] **Step 3: LoteTarimaPanel**

- Muestra la tarima activa en `font-mono font-semibold text-primary-700` y cuántas cajas lleva.
- Botón "Cerrar tarima" que abre un input de ubicación (mismo comportamiento que el del modo por orden: `autoFocus`, Enter confirma). Al confirmar llama `onCloseTarima(valor)`; si devuelve error, muestra el toast que corresponda al `reason` (`sin_escaneos` → `surtido.lote.tarima.sinEscaneos`; los demás → los mensajes de ubicación inválida ya existentes en `surtido.validacion.*`).
- Lista las tarimas cerradas con su ref, su ubicación y la hora (`fmtTimeShort`), cada una con botón de eliminar visible solo si `canRemoveTarima(ref)`; pide confirmación con `surtido.lote.tarima.eliminarConfirm`.

- [ ] **Step 4: LotePoolSidebar**

- Dos secciones colapsables: `surtido.lote.panel.completas` y `surtido.lote.panel.pendientes`, cada una con su conteo.
- Cada orden: OBC en `font-mono font-semibold text-primary-700`, nombre del destinatario en `text-xs text-warm-700 font-medium`, y `validadas/esperadas`.
- Al hacer clic, expande el detalle: tabla de cajas validadas (código en `font-mono text-xs text-warm-600`, hora, usuario, ubicación, tarima) usando `<th className="table-header">` y el `thead` con las clases obligatorias; debajo, la lista de cajas pendientes con `surtido.lote.panel.faltan`.
- Colapsable completo en móvil, igual que el panel lateral de `ValidarPorDestino`.

- [ ] **Step 5: LoteForzarFechaModal**

Modal de advertencia (tono warning) que muestra `surtido.lote.forzar.title` y el cuerpo `surtido.lote.forzar.body` con `{orden}`, `{fechaOrden}` y `{fechaLote}` sustituidos. Dos botones: `surtido.lote.forzar.confirmar` (primario) y `surtido.lote.forzar.cancelar`. Es el único punto donde una caja de otra fecha entra al lote.

- [ ] **Step 6: LoteConfirmarModal**

Un solo componente con dos modos:
- `confirmar`: cuerpo `surtido.lote.confirmar.body` con los totales, textarea opcional de notas, botón primario `surtido.lote.confirmar`. Si hay una tarima activa con escaneos sin cerrar, se muestra `surtido.lote.confirmar.tarimaAbierta` y el botón queda deshabilitado.
- `cancelar`: cuerpo `surtido.lote.cancelar.body` con el conteo de escaneos, botón destructivo `surtido.lote.cancelar.confirmar`.

- [ ] **Step 7: ValidarPorLote — composición**

```jsx
export default function ValidarPorLote({ tabId, fecha, isActive }) {
  // 1. useQuery(['surtido-lote-pool', fecha], () => getOutboundBatchByDate(fecha))
  //    staleTime 60_000, retry false.
  // 2. const pool = useMemo(() => buildLotePool(data?.data?.orders ?? [], fecha), [data, fecha])
  // 3. permission: hasPermission('surtido.validacion','eliminar') ? 'eliminar' : 'crear'
  // 4. const lote = useLoteDraft({ tabId, dateKey: fecha, pool, operatorId: user?.id, permission })
  // 5. handleScan(code):
  //      const outcome = lote.scan(code)
  //      'ok'        → playSound('success'), toast con surtido.lote.scan.ok + orden
  //      'duplicate' → playSound('duplicate'), toast warning surtido.lote.scan.duplicate
  //      'not_found' → playSound('error'), toast error surtido.lote.scan.notFound
  //      'needs_force' → playSound('suspicious'), abre LoteForzarFechaModal con el outcome
  //    El modal, al confirmar, llama lote.forceScan(code) y aplica el caso 'ok'.
  // 6. Autofoco del input tras cada escaneo, igual que TabSession.
  // 7. commitMut = useMutation({ mutationFn: () => commitPickBatch(lote.commitPayload(notes)) })
  //      onSuccess: toast surtido.lote.confirmar.exito, lote.cancelDraft(), invalidar
  //        ['surtido-scan-sessions'] y ['surtido-order-tracking'].
  //      onError: toast surtido.lote.confirmar.error — NO borrar el borrador.
  // 8. Si useOfflineStore.status === 'offline' al confirmar → OfflineBlockedModal, sin llamar al servidor.
  // 9. Estados: isLoading → LoadingSpinner + surtido.lote.cargando;
  //    pool.orders.length === 0 → estado vacío con surtido.lote.vacio.* y botón que
  //    llama refreshSheet('outbound') y refetch.
}
```

Estructura del layout: `flex flex-col h-full` → `LoteResumenCards` → fila con área de escaneo (`ScanInputBar` + `LoteTarimaPanel` + feed de últimos escaneos) y `LotePoolSidebar` a la derecha → barra inferior con "Cancelar lote" y "Confirmar lote". Badge `surtido.lote.borrador` visible mientras no se confirme.

En el feed, cada escaneo `ok` lleva su botón de eliminar solo si `lote.canRemoveScanById(id)`; si el usuario no tiene permiso, el botón no se renderiza y el tooltip explica con `surtido.lote.sinPermisoEliminar`. Los escaneos forzados llevan el badge `surtido.lote.forzada`.

- [ ] **Step 8: Verificar el build y las pruebas**

Run: `cd frontend && npm run build && npm test`
Expected: build exitoso, todas las pruebas en verde.

- [ ] **Step 9: Revisión manual contra el checklist de UI**

Verifica en `frontend/CLAUDE.md`: `<th className="table-header">` en todas las tablas nuevas; `thead` con `bg-warm-50 sticky top-0 z-[5] border-b border-warm-100`; OBC y refs de tarima en `font-mono font-semibold text-primary-700`; códigos de caja en `font-mono text-xs text-warm-600`; nombres de cliente en `text-xs text-warm-700 font-medium`. Corrige lo que no cumpla.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/modules/Surtido/components
git commit -m "feat: panel de validacion de surtido por lote"
```

---

### Task 11: Prueba e2e del flujo completo

**Files:**
- Create: `frontend/e2e/surtido-validacion-lote.spec.js`

**Interfaces:**
- Consumes: la configuración de Playwright existente. Antes de escribir, lee `frontend/playwright.config.js` y una spec existente en `frontend/e2e/` para copiar el patrón de login y `baseURL`.

- [ ] **Step 1: Leer el patrón e2e existente**

Run: `ls frontend/e2e/*.spec.js && cat frontend/playwright.config.js`
Copia de una spec existente el helper de login y la forma de esperar por la app.

- [ ] **Step 2: Escribir la prueba**

Crear `frontend/e2e/surtido-validacion-lote.spec.js` cubriendo el camino crítico:

1. Login e ir a Surtido → Validación.
2. Clic en "Nueva Sesión" → elegir "Validación por Lote" → elegir la fecha → "Iniciar lote".
3. Esperar a que carguen las tarjetas de resumen con `ordenesTotal > 0`.
4. Escanear (escribir + Enter en el input) una caja de una orden del pool; verificar que el panel lateral la mueve a la orden correcta.
5. Escanear la misma caja otra vez; verificar el mensaje de duplicado.
6. Escanear un código inventado; verificar el mensaje de rechazo con la explicación de fecha/lote.
7. Cerrar la tarima con una ubicación válida; verificar que aparece `T02` como activa.
8. Confirmar el lote; verificar el toast de éxito.
9. Ir a Registros y verificar que aparece la sesión de esa orden.

Si el entorno e2e no tiene datos del sheet, marca la prueba con `test.skip(!process.env.E2E_SHEET_READY, 'requiere sheet outbound con datos')` en vez de dejarla fallando.

- [ ] **Step 3: Correr la prueba**

Run: `cd frontend && npx playwright test surtido-validacion-lote`
Expected: PASS, o SKIP explícito si falta el entorno de datos.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/surtido-validacion-lote.spec.js
git commit -m "test: e2e del flujo de validacion de surtido por lote"
```

---

### Task 12: Revisión final

- [ ] **Step 1: Suite completa**

Run:
```bash
cd frontend && npm test && npm run build
cd ../backend && npm test
```
Expected: todo en verde.

- [ ] **Step 2: Revisión de código**

Dispara el agente `code-reviewer` sobre el diff completo de la rama. Atiende los hallazgos CRITICAL y HIGH; los MEDIUM cuando sean baratos.

- [ ] **Step 3: Revisión de seguridad**

Dispara el agente `security-reviewer` sobre `backend/src/modules/wms/services/pickBatchService.js` y `backend/src/modules/wms/routes/pickBatch.routes.js`. Confirma: toda consulta filtra por `tenant_id`, todo parámetro va parametrizado (nunca interpolado), el permiso de cada ruta es el correcto, y ningún mensaje de error filtra datos internos.

- [ ] **Step 4: Verificación funcional del checklist del pedido**

Repasa uno por uno contra la app corriendo:
- [ ] Al iniciar una validación se puede escoger el tipo.
- [ ] "Por Orden" abre exactamente el panel de siempre.
- [ ] "Por Lote" pide fecha y trae el pool de esa fecha.
- [ ] Una caja del pool se asigna sola a su orden.
- [ ] Una caja ajena se rechaza con un mensaje que explica el motivo real.
- [ ] Una caja de ±1 día abre el modal de forzado nombrando ambas fechas.
- [ ] Una caja de ±2 días no se puede forzar.
- [ ] Al cerrar una tarima se pide la ubicación y se abre la siguiente.
- [ ] La ubicación queda en cada registro de esa tarima.
- [ ] El panel lateral separa completas de pendientes y abre el detalle por orden.
- [ ] El detalle muestra código, hora, usuario y ubicación de cada caja validada.
- [ ] Las tarjetas superiores muestran órdenes, cajas y tarimas.
- [ ] Se puede eliminar una tarima sin borrar todo.
- [ ] Se puede eliminar el último registro.
- [ ] Un usuario con permiso básico solo borra el último registro / la tarima en curso.
- [ ] Un usuario con permiso de eliminar borra cualquiera.
- [ ] Los duplicados se detectan.
- [ ] Un refresh o un corte de energía conservan el borrador.
- [ ] Sin confirmar, no hay nada en Registros.
- [ ] Al confirmar, las órdenes aparecen en Registros con sus cajas.
- [ ] Cancelar pide confirmación y borra el borrador.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore: cerrar validacion de surtido por lote"
```

import { generateCodeVariations, normalizeCodeFast } from '../../Shared/Wms/normalizeCode'
import { toDateKey } from '../../../core/utils/dateFormat'

/**
 * Pool de órdenes de una fecha para la validación por lote.
 *
 * El sheet outbound ya vive completo en cliente (una fila = una caja), así que
 * el pool se arma en memoria: no hay una llamada de detalle por orden.
 */

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
    // Ambos ≤ 12 → D/M/Y, que es el formato del WMS/MX.
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
  // Mediodía local evita que un cambio de horario mueva el día al restar/sumar.
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
      // Filas repetidas de la misma caja son la única forma legítima de que un
      // código admita más de un escaneo. Se preserva esa cantidad de origen.
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
      // El índice se llavea en forma compacta (sin separadores), que es la misma
      // forma canónica que usa el backend para decidir si una caja pertenece a
      // una orden. Así "AAA-1", "AAA_1" y "AAA1" caen todos en la misma entrada.
      for (const code of box.codes) {
        const norm = normalizeCodeFast(code)
        if (!norm) continue
        for (const variant of generateCodeVariations(norm, false)) {
          const key = compactCanonical(variant)
          if (!key) continue
          const bucket = index.get(key)
          if (bucket) {
            if (!bucket.some(m => m.outboundOrderNo === match.outboundOrderNo && m.canonical === match.canonical)) {
              bucket.push(match)
            }
          } else {
            index.set(key, [match])
          }
        }
      }
    }
  }
  return index
}

/**
 * El pool activo son solo las órdenes de `dateKey`. Los días adyacentes se
 * indexan aparte: sirven exclusivamente para reconocer una caja fuera de fecha
 * y ofrecer forzarla. Un día más lejos no se reconoce en absoluto.
 */
export function buildLotePool(orders, dateKey) {
  const { prev, next } = adjacentDateKeys(dateKey)
  const all = (orders || []).map(toPoolOrder).filter(o => o.outboundOrderNo)
  const activeOrders = all.filter(o => o.dateKey === dateKey)
  const adjacentOrders = all.filter(o => o.dateKey === prev || o.dateKey === next)
  return {
    dateKey,
    orders: activeOrders,
    adjacentOrders,
    codeIndex: indexOrders(activeOrders),
    adjacentIndex: indexOrders(adjacentOrders),
  }
}

/**
 * Un código que cae en más de una caja (un boxType genérico compartido) no
 * identifica ninguna. El backend rechaza ese caso al validar contra el snapshot
 * de la orden, así que aquí se reporta como ambiguo en vez de asignarlo a la
 * primera candidata y descubrir el problema hasta el commit.
 */
function resolveStatus(matches, okStatus) {
  const canonicos = new Set(matches.map(m => `${m.outboundOrderNo}::${m.canonical}`))
  return canonicos.size > 1 ? 'ambiguous' : okStatus
}

export function matchInPool(pool, rawCode) {
  const norm = normalizeCodeFast(rawCode)
  if (!norm) return { status: 'none', matches: [] }
  const keys = [...new Set(
    generateCodeVariations(norm, false).map(compactCanonical).filter(Boolean)
  )]
  for (const key of keys) {
    const hit = pool.codeIndex.get(key)
    if (hit) return { status: resolveStatus(hit, 'match'), matches: hit }
  }
  for (const key of keys) {
    const hit = pool.adjacentIndex.get(key)
    if (hit) return { status: resolveStatus(hit, 'adjacent'), matches: hit }
  }
  return { status: 'none', matches: [] }
}

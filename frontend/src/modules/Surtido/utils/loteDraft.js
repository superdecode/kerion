import { normalizeScanCode } from '../../Shared/Wms/normalizeCode'
import { matchInPool } from './lotePool'
import { nextTarimaRef } from './tarima'
import { validateLocationValue } from './locationValue'

/**
 * Borrador de una validación por lote.
 *
 * Todas estas funciones son puras: reciben un borrador y devuelven uno nuevo.
 * Nada aquí toca React, la red ni el almacenamiento — eso vive en
 * hooks/useLoteDraft.js. El borrador no llega a la base hasta que el operador
 * confirma, y el payload de esa confirmación lo arma buildCommitPayload.
 */

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
  return draft.scans.filter(
    s => s.result === 'ok' && s.orderNo === orderNo && s.canonical === canonical
  ).length
}

// Ante varias cajas candidatas del mismo código, toma la primera que aún tenga
// unidades pendientes; si todas están llenas, la primera (será duplicado).
function pickMatch(draft, matches) {
  return matches.find(m => okCount(draft, m.outboundOrderNo, m.canonical) < m.limit) || matches[0]
}

function appendScan(draft, scan) {
  return { ...draft, scans: [...draft.scans, scan] }
}

function buildScan(draft, code, rawCode, over) {
  return {
    id: genScanId(),
    code,
    rawCode: String(rawCode).trim(),
    orderNo: null,
    canonical: null,
    tarimaRef: draft.activeTarimaRef,
    forcedDateMismatch: false,
    ts: Date.now(),
    ...over,
  }
}

export function scanDraft(draft, pool, rawCode, { force = false } = {}) {
  const code = normalizeScanCode(rawCode)
  if (!code) return { draft, outcome: { result: 'ignored', code: '', orderNo: null } }

  const { status, matches } = matchInPool(pool, code)

  // Un alias compartido por varias cajas no identifica ninguna. Forzarlo no lo
  // haría menos ambiguo, así que ni siquiera se ofrece: el backend lo rechazaría
  // igual al validar contra el snapshot de la orden.
  if (status === 'ambiguous') {
    const scan = buildScan(draft, code, rawCode, { result: 'ambiguous' })
    return { draft: appendScan(draft, scan), outcome: { result: 'ambiguous', code, orderNo: null } }
  }

  if (status === 'none') {
    const scan = buildScan(draft, code, rawCode, { result: 'not_found' })
    return { draft: appendScan(draft, scan), outcome: { result: 'not_found', code, orderNo: null } }
  }

  if (status === 'adjacent' && !force) {
    const match = matches[0]
    return {
      draft,
      outcome: {
        result: 'needs_force',
        code,
        orderNo: match.outboundOrderNo,
        orderDateKey: match.dateKey,
        loteDateKey: draft.dateKey,
      },
    }
  }

  const match = pickMatch(draft, matches)
  const yaValidadas = okCount(draft, match.outboundOrderNo, match.canonical)

  if (yaValidadas >= match.limit) {
    const scan = buildScan(draft, code, rawCode, {
      result: 'duplicate', orderNo: match.outboundOrderNo, canonical: match.canonical,
    })
    return {
      draft: appendScan(draft, scan),
      outcome: { result: 'duplicate', code, orderNo: match.outboundOrderNo },
    }
  }

  const scan = buildScan(draft, code, rawCode, {
    result: 'ok',
    orderNo: match.outboundOrderNo,
    canonical: match.canonical,
    forcedDateMismatch: status === 'adjacent',
  })
  return {
    draft: appendScan(draft, scan),
    outcome: {
      result: 'ok', code, orderNo: match.outboundOrderNo,
      orderDateKey: match.dateKey, loteDateKey: draft.dateKey,
    },
  }
}

export function closeTarima(draft, ubicacionRaw) {
  const tieneEscaneos = draft.scans.some(
    s => s.tarimaRef === draft.activeTarimaRef && s.result === 'ok'
  )
  if (!tieneEscaneos) return { draft, error: 'sin_escaneos', summary: null }

  const validation = validateLocationValue(ubicacionRaw)
  // El summary viaja junto al reason: es el mismo texto que el modo por orden
  // ya muestra ante una ubicación inválida, y evita duplicarlo en i18n.
  if (!validation.ok) return { draft, error: validation.reason, summary: validation.summary }

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
    summary: null,
  }
}

export function canRemoveScan(draft, scanId, permission) {
  if (!draft.scans.some(s => s.id === scanId)) return false
  if (permission === 'eliminar') return true
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
    return {
      ...draft,
      tarimas: [{ ref: 'T01', ubicacionNota: null, closedAt: null }],
      activeTarimaRef: 'T01',
      scans,
    }
  }
  const activa = draft.activeTarimaRef === tarimaRef
    ? tarimas[tarimas.length - 1].ref
    : draft.activeTarimaRef
  return { ...draft, tarimas, scans, activeTarimaRef: activa }
}

export function orderProgress(draft, pool) {
  const progreso = new Map()
  for (const order of pool.orders) {
    const validated = draft.scans.filter(
      s => s.result === 'ok' && s.orderNo === order.outboundOrderNo
    )
    const pendingBoxes = order.expectedBoxes
      .map(box => ({
        canonical: box.canonical,
        faltan: box.quantity - okCount(draft, order.outboundOrderNo, box.canonical),
      }))
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

// Una caja forzada pertenece a una orden de un día adyacente, que no está en el
// pool activo. Su snapshot se busca en ambos lados para que el commit mande
// expected_boxes correcto y el backend pueda validarla.
function findPoolOrder(pool, orderNo) {
  return pool.orders.find(o => o.outboundOrderNo === orderNo)
    || (pool.adjacentOrders || []).find(o => o.outboundOrderNo === orderNo)
    || null
}

export function buildCommitPayload(draft, pool, notes) {
  // Solo se confirma lo que está en una tarima cerrada con ubicación: una
  // tarima abierta todavía no tiene dónde decir que está.
  const cerradas = draft.tarimas.filter(tar => tar.closedAt && tar.ubicacionNota)
  const ubicacionPorTarima = new Map(cerradas.map(tar => [tar.ref, tar.ubicacionNota]))

  const eventos = draft.scans.filter(
    s => (s.result === 'ok' || s.result === 'duplicate')
      && s.orderNo
      && ubicacionPorTarima.has(s.tarimaRef)
  )

  const porOrden = new Map()
  for (const scan of eventos) {
    if (!porOrden.has(scan.orderNo)) porOrden.set(scan.orderNo, [])
    porOrden.get(scan.orderNo).push(scan)
  }

  const orders = [...porOrden.entries()].map(([orderNo, scans]) => {
    const order = findPoolOrder(pool, orderNo) || {}
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

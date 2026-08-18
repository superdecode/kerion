import {
  normalizeExpectedBoxes, matchExpectedBox,
  normalizeOptionalText, parsePositiveInt,
} from '../utils/pickBoxes.js'
import { upsertOrderTrackingSnapshot } from '../utils/orderTracking.js'

/**
 * Confirmación de una validación de surtido por lote.
 *
 * El cliente escanea contra un pool de órdenes de una fecha y guarda todo en un
 * borrador local; nada llega aquí hasta que el operador confirma. Este servicio
 * recibe ese borrador completo y lo materializa en una transacción: una fila en
 * pick_batches, sus tarimas, y una pick_sessions con sus pick_events por cada
 * orden tocada — los mismos registros que produce la validación por orden.
 */

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
    if (!normalizeOptionalText(tarima?.tarima_ref)) {
      return { ok: false, error: 'Cada tarima requiere tarima_ref' }
    }
    if (!normalizeOptionalText(tarima?.ubicacion_nota)) {
      return { ok: false, error: `La tarima ${tarima?.tarima_ref} no tiene ubicación` }
    }
  }

  const tarimaRefs = new Set(body.tarimas.map(tar => String(tar.tarima_ref)))
  // Los client_event_id son la llave de idempotencia del commit. Si el propio
  // lote trae repetidos, el ON CONFLICT descartaría escaneos legítimos en
  // silencio, así que se rechaza el lote entero antes de tocar la base.
  const vistos = new Set()

  for (const order of body.orders) {
    if (!normalizeOptionalText(order?.outbound_order_no)) {
      return { ok: false, error: 'Cada orden requiere outbound_order_no' }
    }
    if (!Array.isArray(order.events) || order.events.length === 0) {
      return { ok: false, error: `La orden ${order.outbound_order_no} no tiene eventos` }
    }
    for (const event of order.events) {
      const clientEventId = normalizeOptionalText(event?.client_event_id)
      if (!clientEventId) {
        return { ok: false, error: 'Cada evento requiere client_event_id' }
      }
      if (vistos.has(clientEventId)) {
        return { ok: false, error: `client_event_id repetido en el lote: ${clientEventId}` }
      }
      vistos.add(clientEventId)
      if (!normalizeOptionalText(event?.scanned_code)) {
        return { ok: false, error: 'Cada evento requiere scanned_code' }
      }
      if (!ALLOWED_RESULTS.has(String(event?.scan_result))) {
        return { ok: false, error: `Resultado de escaneo inválido: ${event?.scan_result}` }
      }
      if (!tarimaRefs.has(String(event?.tarima_ref))) {
        return { ok: false, error: `El evento ${clientEventId} apunta a una tarima que no viene en el lote` }
      }
    }
  }
  return { ok: true }
}

/**
 * Re-valida del lado del servidor cada escaneo 'ok' contra el snapshot de cajas
 * de su orden, con las mismas reglas que POST /scan-event: un código que no
 * pertenece a la orden (o un alias ambiguo) baja a 'unexpected', y exceder las
 * unidades esperadas baja a 'duplicate'. El cliente propone; el servidor decide.
 *
 * seedCounts (canonical -> cuántas unidades ya se escanearon en OTRA sesión,
 * ej. una validación por orden previa que se retoma por lote) se suma al
 * conteo antes de procesar este lote — sin esto, una caja ya escaneada fuera
 * de este commit se contaría como 'ok' otra vez en vez de 'duplicate'.
 */
export function resolveEventResults(expectedBoxesRaw, events, seedCounts = new Map()) {
  const expectedBoxes = normalizeExpectedBoxes(expectedBoxesRaw)
  const errors = []
  const usados = new Map(seedCounts)

  const resolved = (events || []).map((event) => {
    if (event.scan_result !== 'ok') {
      return {
        ...event,
        resolved_result: event.scan_result,
        resolved_box_type: normalizeOptionalText(event.matched_box_type),
      }
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

/**
 * Una orden ya validada no se puede volver a validar por ningun metodo. Es la
 * misma condicion "genuinelyComplete" que aplica POST /scan-session: la sesion
 * no esta abierta y ya alcanzo las cajas esperadas. Sin este filtro, confirmar
 * un lote reabriria (status='open') una orden terminada y le agregaria cajas
 * en silencio.
 */
export function findLockedOrders(rows) {
  return (rows || []).filter((row) => (
    row.status !== 'open'
    && Number(row.total_expected) > 0
    && Number(row.total_scanned) >= Number(row.total_expected)
  ))
}

export class OrdersAlreadyValidatedError extends Error {
  constructor(orders) {
    super('Hay órdenes que ya fueron validadas')
    this.name = 'OrdersAlreadyValidatedError'
    this.code = 'ORDERS_ALREADY_VALIDATED'
    this.orders = orders
  }
}

/**
 * Estado de validacion de un conjunto de ordenes, para que el modo lote sepa
 * cuales ya estan cerradas antes de que el operador escanee sus cajas.
 */
export async function getOrdersValidationState(req, obcs) {
  const lista = [...new Set((obcs || []).map(o => String(o).trim()).filter(Boolean))]
  if (lista.length === 0) return []
  const result = await req.tQuery(
    `SELECT DISTINCT ON (s.outbound_order_no)
            s.outbound_order_no, s.status, s.total_expected, s.total_scanned,
            s.completed_at, s.batch_id, u.nombre_completo AS operator_nombre
     FROM pick_sessions s
     LEFT JOIN usuarios u ON u.id = s.operator_id
     WHERE s.tenant_id = $1 AND s.outbound_order_no = ANY($2)
     ORDER BY s.outbound_order_no, s.updated_at DESC`,
    [req.tenantId, lista]
  )
  const bloqueadas = new Set(findLockedOrders(result.rows).map(r => r.outbound_order_no))
  return result.rows.map(row => ({ ...row, locked: bloqueadas.has(row.outbound_order_no) }))
}

/**
 * Confirma un lote completo en una sola transacción: si algo falla, no queda
 * ni el lote ni una sola sesión a medias, y el borrador local del operador
 * sigue intacto para reintentar.
 *
 * Reintentar el mismo commit no duplica eventos: client_event_id es único por
 * tenant (índice parcial de la migración 108) y los INSERT usan ON CONFLICT.
 */
export async function commitBatch(req, body) {
  return req.tTransaction(async (client) => {
    const tenantId = req.tenantId
    const operatorId = req.fullUser?.id || req.user?.id || null
    const updatedBy = req.user?.email || String(operatorId)

    // Antes de escribir nada: ninguna orden del lote puede estar ya validada.
    // Se aborta el commit entero en vez de dejar medio lote adentro — el
    // borrador del operador sigue local e intacto para corregirlo.
    const obcs = [...new Set(body.orders.map(o => String(o.outbound_order_no)))]
    const previas = await client.query(
      `SELECT DISTINCT ON (s.outbound_order_no)
              s.outbound_order_no, s.status, s.total_expected, s.total_scanned,
              u.nombre_completo AS operator_nombre
       FROM pick_sessions s
       LEFT JOIN usuarios u ON u.id = s.operator_id
       WHERE s.tenant_id = $1 AND s.outbound_order_no = ANY($2)
       ORDER BY s.outbound_order_no, s.updated_at DESC`,
      [tenantId, obcs]
    )
    const bloqueadas = findLockedOrders(previas.rows)
    if (bloqueadas.length > 0) throw new OrdersAlreadyValidatedError(bloqueadas)

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
      const expectedBoxes = normalizeExpectedBoxes(order.expected_boxes)
      const parsedExpected = Number.parseInt(order.total_expected, 10)
      const totalExpected = Number.isInteger(parsedExpected) && parsedExpected > 0 ? parsedExpected : 0

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
        // Si la orden estaba abierta por otro operador, el lote se la queda —
        // bloquear todo el commit por una orden en disputa seria peor. Pero la
        // toma de control queda escrita, igual que en POST /scan-session.
        const previa = existing.rows[0]
        const mismoOperador = Number(previa.operator_id) === Number(operatorId)
        const notaTakeover = (previa.status === 'open' && !mismoOperador)
          ? `Retomada por lote ${body.fecha_lote} (${req.fullUser?.nombre_completo || req.user?.email || 'otro operador'})`
          : null
        const notasFinales = notaTakeover
          ? (previa.notes ? `${previa.notes} | ${notaTakeover}` : notaTakeover)
          : previa.notes

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
               notes = $12,
               updated_at = now()
           WHERE id = $10 AND tenant_id = $11
           RETURNING *`,
          [operatorId, batch.id, totalExpected,
           normalizeOptionalText(order.receiver_name), normalizeOptionalText(order.logistics_track_no),
           normalizeOptionalText(order.logistics_channel), order.outbound_delivery_at || null,
           normalizeOptionalText(order.third_order_no), JSON.stringify(expectedBoxes),
           previa.id, tenantId, notasFinales]
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

      // La orden puede llegar con avance PARCIAL de otra sesión (ej. validada a
      // medias por orden y retomada por lote) sin estar bloqueada por
      // findLockedOrders (que solo excluye órdenes ya COMPLETAS). El cliente no
      // tiene forma de saber qué se escaneó fuera de este lote, así que sin este
      // conteo previo una caja ya validada en la sesión reusada se contaría
      // como 'ok' otra vez en vez de 'duplicate', inflando total_scanned por
      // encima de las cajas físicas reales. Se excluyen los client_event_id de
      // este propio commit para no penalizar un reintento idempotente.
      let seedCounts = new Map()
      if (existing.rows.length > 0) {
        const thisCommitIds = order.events.map(e => e.client_event_id)
        // client_event_id es NULL en todo evento del modo por orden (nunca lo
        // manda POST /scan-event) — "= ANY(...)" con NULL a la izquierda da
        // NULL, no FALSE, así que excluiría esas filas del conteo por completo.
        // Se cubre explícitamente con "client_event_id IS NULL OR ...".
        const seedRes = await client.query(
          `SELECT matched_box_type, COUNT(*)::int AS n
           FROM pick_events
           WHERE session_id = $1 AND tenant_id = $2 AND scan_result = 'ok'
             AND matched_box_type IS NOT NULL
             AND (client_event_id IS NULL OR NOT (client_event_id = ANY($3::text[])))
           GROUP BY matched_box_type`,
          [session.id, tenantId, thisCommitIds]
        )
        seedCounts = new Map(seedRes.rows.map(r => [r.matched_box_type, r.n]))
      }
      const { events: resolvedEvents } = resolveEventResults(order.expected_boxes, order.events, seedCounts)

      let insertados = 0
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
        if (inserted.rows.length > 0) insertados += 1

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
              [tenantId, order.outbound_order_no, variante, updatedBy]
            )
          }
        }
      }

      // Mismo snapshot que hace POST /scan-session: sin esto la orden no se
      // refleja en Ordenes ni en el seguimiento tras validarla por lote.
      await upsertOrderTrackingSnapshot(client, tenantId, order.outbound_order_no, {
        third_order_no: order.third_order_no,
        receiver_name: order.receiver_name,
        logistics_track_no: order.logistics_track_no,
        logistics_channel: order.logistics_channel,
        outbound_delivery_at: order.outbound_delivery_at,
        outbound_box_count: totalExpected,
      })

      const totalesRes = await client.query(
        `SELECT COALESCE(SUM(COALESCE(quantity, 1)), 0)::int AS total_scanned
         FROM pick_events WHERE session_id = $1 AND tenant_id = $2 AND scan_result = 'ok'`,
        [session.id, tenantId]
      )
      const totalScanned = totalesRes.rows[0].total_scanned
      const finalStatus = totalExpected > 0 && totalScanned >= totalExpected
        ? 'complete'
        : 'with_discrepancies'

      await client.query(
        `UPDATE pick_sessions
         SET total_scanned = $1, status = $2, completed_at = now(), updated_at = now()
         WHERE id = $3 AND tenant_id = $4`,
        [totalScanned, finalStatus, session.id, tenantId]
      )

      sessions.push({
        outbound_order_no: order.outbound_order_no,
        session_id: session.id,
        status: finalStatus,
        total_scanned: totalScanned,
        total_expected: totalExpected,
        eventos_insertados: insertados,
      })
    }

    return { batch, sessions }
  })
}

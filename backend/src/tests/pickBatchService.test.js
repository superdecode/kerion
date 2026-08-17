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

  it('rechaza un cuerpo que no es objeto', () => {
    expect(validateCommitPayload(null).ok).toBe(false)
  })

  it('rechaza un lote sin ordenes', () => {
    expect(validateCommitPayload({ ...payloadValido, orders: [] }).ok).toBe(false)
  })

  it('rechaza un lote sin tarimas', () => {
    expect(validateCommitPayload({ ...payloadValido, tarimas: [] }).ok).toBe(false)
  })

  it('rechaza una orden sin OBC', () => {
    const body = { ...payloadValido, orders: [{ ...payloadValido.orders[0], outbound_order_no: '' }] }
    expect(validateCommitPayload(body).ok).toBe(false)
  })

  it('rechaza una orden sin eventos', () => {
    const body = { ...payloadValido, orders: [{ ...payloadValido.orders[0], events: [] }] }
    expect(validateCommitPayload(body).ok).toBe(false)
  })

  it('rechaza un evento sin client_event_id', () => {
    const events = [{ ...payloadValido.orders[0].events[0], client_event_id: '' }]
    const body = { ...payloadValido, orders: [{ ...payloadValido.orders[0], events }] }
    expect(validateCommitPayload(body).ok).toBe(false)
  })

  it('rechaza un evento sin scanned_code', () => {
    const events = [{ ...payloadValido.orders[0].events[0], scanned_code: '  ' }]
    const body = { ...payloadValido, orders: [{ ...payloadValido.orders[0], events }] }
    expect(validateCommitPayload(body).ok).toBe(false)
  })

  it('rechaza un resultado de escaneo no permitido', () => {
    const events = [{ ...payloadValido.orders[0].events[0], scan_result: 'not_found' }]
    const body = { ...payloadValido, orders: [{ ...payloadValido.orders[0], events }] }
    expect(validateCommitPayload(body).ok).toBe(false)
  })

  it('rechaza una tarima sin ubicacion', () => {
    const body = { ...payloadValido, tarimas: [{ tarima_ref: 'T01', ubicacion_nota: '' }] }
    expect(validateCommitPayload(body).ok).toBe(false)
  })

  it('rechaza un evento que apunta a una tarima ajena al lote', () => {
    const events = [{ ...payloadValido.orders[0].events[0], tarima_ref: 'T09' }]
    const body = { ...payloadValido, orders: [{ ...payloadValido.orders[0], events }] }
    expect(validateCommitPayload(body).ok).toBe(false)
  })

  it('rechaza client_event_id repetidos dentro del mismo lote', () => {
    const e = payloadValido.orders[0].events[0]
    const body = { ...payloadValido, orders: [{ ...payloadValido.orders[0], events: [e, { ...e }] }] }
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
    const { events } = resolveEventResults(boxes, [ev({ normalized_code: 'ZZZ-9' })])
    expect(events[0].resolved_result).toBe('unexpected')
  })

  it('marca unexpected un alias ambiguo', () => {
    const compartido = normalizeExpectedBoxes([
      { canonical: 'BBB1', codes: ['BBB1', 'CAJA'], quantity: 1 },
      { canonical: 'BBB2', codes: ['BBB2', 'CAJA'], quantity: 1 },
    ])
    const { events } = resolveEventResults(compartido, [ev({ normalized_code: 'CAJA' })])
    expect(events[0].resolved_result).toBe('unexpected')
  })

  it('deja pasar un duplicate declarado por el cliente', () => {
    const { events } = resolveEventResults(boxes, [ev({ scan_result: 'duplicate' })])
    expect(events[0].resolved_result).toBe('duplicate')
  })

  it('un duplicate del cliente no consume la unidad esperada', () => {
    const { events } = resolveEventResults(boxes, [
      ev({ client_event_id: 'a', scan_result: 'duplicate' }),
      ev({ client_event_id: 'b' }),
    ])
    expect(events[1].resolved_result).toBe('ok')
  })

  it('reporta error cuando la orden no trae snapshot', () => {
    const { errors, events } = resolveEventResults([], [ev({})])
    expect(errors.length).toBeGreaterThan(0)
    expect(events[0].resolved_result).toBe('unexpected')
  })

  it('no revienta con una lista vacia de eventos', () => {
    expect(resolveEventResults(boxes, []).events).toEqual([])
  })
})

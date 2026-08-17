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
    expect(outcome).toMatchObject({
      result: 'needs_force', orderNo: 'OBC-3', orderDateKey: '2026-08-16', loteDateKey: '2026-08-17',
    })
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

  it('rechaza un codigo ambiguo sin asignarlo a ninguna orden', () => {
    const ambiguo = buildLotePool([
      { outboundOrderNo: 'OBC-A', outboundTime: '2026-08-17 10:00:00', packageList: [{ customizeCode: 'MISMO-1', quantity: 1 }] },
      { outboundOrderNo: 'OBC-B', outboundTime: '2026-08-17 10:00:00', packageList: [{ customizeCode: 'MISMO-1', quantity: 1 }] },
    ], '2026-08-17')
    const { draft, outcome } = scanDraft(createDraft({ dateKey: '2026-08-17', operatorId: 1 }), ambiguo, 'MISMO-1')
    expect(outcome.result).toBe('ambiguous')
    expect(draft.scans[0].orderNo).toBeNull()
  })

  it('un codigo ambiguo no se puede forzar', () => {
    const ambiguo = buildLotePool([
      { outboundOrderNo: 'OBC-A', outboundTime: '2026-08-17 10:00:00', packageList: [{ customizeCode: 'MISMO-1', quantity: 1 }] },
      { outboundOrderNo: 'OBC-B', outboundTime: '2026-08-17 10:00:00', packageList: [{ customizeCode: 'MISMO-1', quantity: 1 }] },
    ], '2026-08-17')
    const { outcome } = scanDraft(createDraft({ dateKey: '2026-08-17', operatorId: 1 }), ambiguo, 'MISMO-1', { force: true })
    expect(outcome.result).toBe('ambiguous')
  })

  it('ignora un codigo vacio', () => {
    const d = nuevo()
    expect(scanDraft(d, pool, '   ').draft.scans).toHaveLength(0)
  })
})

describe('closeTarima', () => {
  it('fija la ubicacion, cierra y abre la siguiente', () => {
    const d = scanDraft(nuevo(), pool, 'AAA-1').draft
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
    expect(error).toBe('sin_escaneos')
  })

  it('un rechazo no cuenta como escaneo para cerrar la tarima', () => {
    const d = scanDraft(nuevo(), pool, 'ZZZ-9').draft
    expect(closeTarima(d, 'A1-01-01-01').error).toBe('sin_escaneos')
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

  it('nadie puede borrar un escaneo inexistente', () => {
    const d = armado()
    expect(canRemoveScan(d, 'no-existe', 'eliminar')).toBe(false)
  })

  it('un usuario con crear solo borra la tarima en curso', () => {
    let d = armado()
    d = closeTarima(d, 'A1-01-01-01').draft
    d = scanDraft(d, pool, 'BBB-1').draft
    expect(canRemoveTarima(d, 'T02', 'crear')).toBe(true)
    expect(canRemoveTarima(d, 'T01', 'crear')).toBe(false)
    expect(canRemoveTarima(d, 'T01', 'eliminar')).toBe(true)
  })

  it('no se puede borrar una tarima que no existe', () => {
    expect(canRemoveTarima(armado(), 'T99', 'eliminar')).toBe(false)
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

  it('borrar la unica tarima deja el borrador utilizable', () => {
    let d = scanDraft(nuevo(), pool, 'AAA-1').draft
    d = removeTarima(d, 'T01')
    expect(d.tarimas).toEqual([{ ref: 'T01', ubicacionNota: null, closedAt: null }])
    expect(d.activeTarimaRef).toBe('T01')
    expect(d.scans).toHaveLength(0)
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
      scan_result: 'ok', tarima_ref: 'T01', ubicacion_nota: 'A1-01-01-01',
      forced_date_mismatch: false, quantity: 1,
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

  it('los duplicados sí viajan al servidor, para que queden en el registro', () => {
    let d = scanDraft(nuevo(), pool, 'AAA-1').draft
    d = scanDraft(d, pool, 'AAA-1').draft
    d = closeTarima(d, 'A1-01-01-01').draft
    const eventos = buildCommitPayload(d, pool, '').orders.flatMap(o => o.events)
    expect(eventos.filter(e => e.scan_result === 'duplicate')).toHaveLength(1)
  })

  it('la caja forzada viaja marcada', () => {
    let d = scanDraft(nuevo(), pool, 'CCC-1', { force: true }).draft
    d = closeTarima(d, 'A1-01-01-01').draft
    const payload = buildCommitPayload(d, pool, '')
    const obc3 = payload.orders.find(o => o.outbound_order_no === 'OBC-3')
    expect(obc3.events[0].forced_date_mismatch).toBe(true)
  })

  it('una orden forzada de otra fecha lleva su propio snapshot de cajas', () => {
    let d = scanDraft(nuevo(), pool, 'CCC-1', { force: true }).draft
    d = closeTarima(d, 'A1-01-01-01').draft
    const obc3 = buildCommitPayload(d, pool, '').orders.find(o => o.outbound_order_no === 'OBC-3')
    expect(obc3.expected_boxes).toHaveLength(1)
    expect(obc3.expected_boxes[0].canonical).toBe('CCC1')
    expect(obc3.total_expected).toBe(1)
  })

  it('sin tarimas cerradas no manda nada', () => {
    const d = scanDraft(nuevo(), pool, 'AAA-1').draft
    const payload = buildCommitPayload(d, pool, '')
    expect(payload.orders).toEqual([])
    expect(payload.tarimas).toEqual([])
  })
})

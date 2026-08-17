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

  // 'CAJA' es el boxType compartido por las dos cajas de OBC-1: no identifica
  // ninguna. El backend rechaza ese caso, así que aquí se rechaza igual en vez
  // de asignarlo a la primera y descubrirlo hasta el commit.
  it('marca ambiguo un alias compartido por varias cajas', () => {
    const res = matchInPool(pool, 'CAJA')
    expect(res.status).toBe('ambiguous')
    expect(res.matches.length).toBeGreaterThan(1)
  })

  it('un alias compartido entre ordenes distintas tambien es ambiguo', () => {
    const compartido = buildLotePool([
      { outboundOrderNo: 'OBC-A', outboundTime: '2026-08-17 10:00:00', packageList: [{ customizeCode: 'MISMO-1', quantity: 1 }] },
      { outboundOrderNo: 'OBC-B', outboundTime: '2026-08-17 10:00:00', packageList: [{ customizeCode: 'MISMO-1', quantity: 1 }] },
    ], '2026-08-17')
    expect(matchInPool(compartido, 'MISMO-1').status).toBe('ambiguous')
  })

  it('una caja con codigo propio sigue resolviendo aunque comparta boxType', () => {
    expect(matchInPool(pool, 'AAA-1').status).toBe('match')
  })
})

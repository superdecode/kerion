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

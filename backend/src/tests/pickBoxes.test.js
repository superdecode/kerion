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

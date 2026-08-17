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

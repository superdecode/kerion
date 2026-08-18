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

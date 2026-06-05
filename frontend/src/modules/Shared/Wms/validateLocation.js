/**
 * Location validation for the WMS warehouse grid.
 * Format: {Area}{Aisle}-{Rack}-{Level}-{Position}
 * Areas: A-D | Aisle: 1-32 | Rack: 01-20 | Level: 01-06 | Position: 01-02
 * Ported from upapex/shared/js/wms-utils.js::validateLocation
 */

function normalizeLocation(location) {
  if (!location || typeof location !== 'string') return ''
  return location
    .trim()
    .toUpperCase()
    .replace(/['´`'\/]/g, '-')
    .replace(/\s+/g, '')
}

export function validateLocation(location) {
  if (!location || typeof location !== 'string') {
    return { valid: false, normalized: '', parsed: null, message: 'Ubicación vacía o inválida', original: location }
  }

  const normalized = normalizeLocation(location)
  const match = normalized.match(/^([A-D])(\d+)-(\d+)-(\d+)-(\d+)$/)

  if (!match) {
    return {
      valid: false, normalized, parsed: null,
      message: 'Formato incorrecto. Use: {Area}{Aisle}-{Rack}-{Level}-{Position} (ej: A1-01-01-01)',
      original: location,
    }
  }

  const [, area, aisle, rack, level, position] = match
  const aisleNum = parseInt(aisle, 10)
  const rackNum = parseInt(rack, 10)
  const levelNum = parseInt(level, 10)
  const positionNum = parseInt(position, 10)

  if (!['A', 'B', 'C', 'D'].includes(area))
    return { valid: false, normalized, parsed: null, message: 'Área inválida. Solo se permiten: A, B, C, D', original: location }

  if (aisleNum < 1 || aisleNum > 32)
    return { valid: false, normalized, parsed: null, message: 'Pasillo inválido. Rango permitido: 1-32', original: location }

  if (aisle.length > 1 && aisle[0] === '0')
    return { valid: false, normalized, parsed: null, message: 'Pasillo no debe tener ceros a la izquierda', original: location }

  if (rackNum < 1 || rackNum > 20)
    return { valid: false, normalized, parsed: null, message: 'Rack inválido. Rango permitido: 01-20', original: location }

  if (levelNum < 1 || levelNum > 6)
    return { valid: false, normalized, parsed: null, message: 'Nivel inválido. Rango permitido: 01-06', original: location }

  if (positionNum < 1 || positionNum > 2)
    return { valid: false, normalized, parsed: null, message: 'Posición inválida. Rango permitido: 01-02', original: location }

  const formatted = `${area}${aisle}-${rack.padStart(2, '0')}-${level.padStart(2, '0')}-${position.padStart(2, '0')}`

  return {
    valid: true,
    normalized: formatted,
    parsed: {
      area,
      aisle,
      rack: rack.padStart(2, '0'),
      level: level.padStart(2, '0'),
      position: position.padStart(2, '0'),
      formatted,
    },
    message: 'Ubicación válida',
    original: location,
  }
}

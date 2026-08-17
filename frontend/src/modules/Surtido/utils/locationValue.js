/**
 * Validación de la ubicación libre que captura el operador durante el surtido.
 * Extraído de Validacion.jsx para que la validación por lote aplique
 * exactamente las mismas reglas que la validación por orden.
 */

export const LOCATION_MAX_LENGTH = 16

export function normalizeLocationValue(raw) {
  if (!raw) return ''
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[／⁄]/g, '/')
    // ES/EN keyboards produce different glyphs on the same key when toggling
    // layouts (straight ", curly “ ” „ ‟, prime ″, acute/backtick used as a
    // quote). Location codes use one as a separator — normalize them all to a
    // single canonical " so it's recognized regardless of which layout typed it.
    .replace(/[“”„‟´`ˮ″]/g, '"')
    .replace(/\s+/g, '')
}

export function validateLocationValue(raw) {
  const trimmed = String(raw || '').trim()
  const normalized = normalizeLocationValue(trimmed)
  const quoteCount = (normalized.match(/"/g) || []).length
  // A single " is a legitimate location separator (see normalizeLocationValue).
  // Only treat it as a scanned JSON payload once there are 2+ — that's what an
  // actual "key":"value" structure looks like — plus the unambiguous JSON
  // structure characters and known payload field names.
  const looksStructuredPayload =
    /[{}[\]]/u.test(trimmed)
    || quoteCount > 1
    || /(?:reference_id|ops_data|container_type|source|seller)/i.test(trimmed)

  if (!normalized) {
    return { ok: false, reason: 'empty', summary: 'La ubicacion esta vacia.', normalized: '' }
  }
  if (looksStructuredPayload) {
    return {
      ok: false,
      reason: 'payload',
      summary: 'Se detecto un payload de escaner y no una ubicacion valida.',
      normalized,
    }
  }
  if (!/^[A-Z0-9/"-]+$/.test(normalized)) {
    return {
      ok: false,
      reason: 'charset',
      summary: 'La ubicacion solo permite letras, numeros, "-", "/" y una " de separacion.',
      normalized,
    }
  }
  if (normalized.length > LOCATION_MAX_LENGTH) {
    return {
      ok: false,
      reason: 'length',
      summary: `La ubicacion excede el maximo permitido de ${LOCATION_MAX_LENGTH} caracteres.`,
      normalized,
    }
  }
  return { ok: true, normalized }
}

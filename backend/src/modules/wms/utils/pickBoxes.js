import { normalizeScanCode } from '../../../shared/utils/codeNormalization.js'

/**
 * Helpers del snapshot de cajas esperadas de una orden de surtido.
 *
 * Extraídos de wms.routes.js para que el commit de un lote
 * (services/pickBatchService.js) valide cada caja exactamente con las mismas
 * reglas que POST /scan-event, sin duplicar la lógica.
 */

export function normalizeOptionalText(value) {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

export function parsePositiveInt(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function compactCanonicalCode(raw) {
  return normalizeScanCode(raw).replace(/[^A-Z0-9]/g, '')
}

export function normalizeExpectedBoxes(value) {
  if (!Array.isArray(value)) return []
  const boxesByCanonical = new Map()
  for (const item of value) {
    const rawCodes = Array.isArray(item?.codes) ? item.codes : []
    const codes = [...new Set(rawCodes.map(compactCanonicalCode).filter(Boolean))]
    const canonical = compactCanonicalCode(item?.canonical || codes[0] || '')
    const quantity = parsePositiveInt(item?.quantity ?? item?.qty ?? item?.expectedQty, 1)
    if (!canonical || !codes.length) continue
    const existing = boxesByCanonical.get(canonical)
    if (existing) {
      // Repeated rows in the outbound detail are the only way a code can have
      // more than one allowed scan. Preserve that explicit source quantity.
      existing.quantity += quantity
      existing.codes = [...new Set([...existing.codes, ...codes, canonical])]
      continue
    }
    boxesByCanonical.set(canonical, {
      canonical,
      codes: codes.includes(canonical) ? codes : [canonical, ...codes],
      quantity,
    })
  }
  return [...boxesByCanonical.values()]
}

export function matchExpectedBox(expectedBoxes, scannedCode) {
  const scanned = compactCanonicalCode(scannedCode)
  if (!scanned) return null
  const matches = expectedBoxes.filter((box) => box.codes.includes(scanned))
  if (matches.length === 0) return null
  // A shared alias (for example a generic box type) cannot identify which box
  // is being validated. Never assign it to an arbitrary row from the order.
  if (new Set(matches.map((box) => box.canonical)).size !== 1) {
    return { ambiguous: true }
  }
  return matches[0]
}

import { normalizeCode, generateCodeVariations } from './normalizeCode'

/**
 * Searches a normalized-code Map with slash/dash fallback variants.
 * Returns { code, item, variant } where item is null if not found.
 * Ported from legacy vanilla WMS shared rules::findCodeInInventory
 *
 * @param {string} rawCode
 * @param {Map<string, unknown>} inventory
 * @returns {{ code: string, item: unknown | null, variant: string }}
 */
export function findCodeInInventory(rawCode, inventory) {
  const normalized = normalizeCode(rawCode)
  const variations = generateCodeVariations(normalized)

  for (const variant of variations) {
    const item = inventory.get(variant)
    if (!item) continue

    let matchVariant = 'original'
    if (variant !== normalized) {
      if (variant.includes('/') && normalized.includes('-')) matchVariant = 'slash'
      else if (variant.includes('-') && normalized.includes('/')) matchVariant = 'dash'
      else matchVariant = 'base'
    }
    return { code: variant, item, variant: matchVariant }
  }

  return { code: normalized, item: null, variant: 'none' }
}

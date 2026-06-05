import { normalizeCode } from './normalizeCode'

/**
 * Searches a normalized-code Map with slash/dash fallback variants.
 * Returns { code, item, variant } where item is null if not found.
 * Ported from upapex/shared/js/wms-utils.js::findCodeInInventory
 *
 * @param {string} rawCode
 * @param {Map<string, unknown>} inventory
 * @returns {{ code: string, item: unknown | null, variant: string }}
 */
export function findCodeInInventory(rawCode, inventory) {
  const normalized = normalizeCode(rawCode)

  let item = inventory.get(normalized)
  if (item) return { code: normalized, item, variant: 'original' }

  if (normalized.includes('/')) {
    const withDash = normalized.replace(/\//g, '-')
    item = inventory.get(withDash)
    if (item) return { code: withDash, item, variant: 'dash' }
  }

  if (normalized.includes('-')) {
    const withSlash = normalized.replace(/-/g, '/')
    item = inventory.get(withSlash)
    if (item) return { code: withSlash, item, variant: 'slash' }
  }

  return { code: normalized, item: null, variant: 'none' }
}

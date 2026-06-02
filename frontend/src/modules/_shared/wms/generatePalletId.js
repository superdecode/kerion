/**
 * Generates a unique pallet ID.
 * Format: {prefix}-{base36 timestamp}-{3-digit random}
 * Ported from upapex/shared/js/wms-utils.js::generatePalletId
 *
 * @param {string} prefix
 * @returns {string}
 */
export function generatePalletId(prefix = 'PLT') {
  const ts = Date.now().toString(36).toUpperCase()
  const rnd = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `${prefix}-${ts}-${rnd}`
}

/**
 * Generates a unique tab/session ID.
 * @returns {string}
 */
export function generateTabId() {
  const ts = Date.now().toString(36).toUpperCase()
  const rnd = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `TAB-${ts}-${rnd}`
}

import { normalizeCode } from '../../Shared/Wms/normalizeCode'

/**
 * Normalizes a raw scan and checks it against the OBC code set.
 *
 * The BD_CODES set in vanilla validate app stores `codeVariant + obc.toLowerCase()` concatenated.
 * Here we replicate that: for each variation of the normalized code, check if
 * `variation + obc.toLowerCase()` exists in the bdCodes Set.
 *
 * @param {string} rawCode
 * @param {string} activeOBC
 * @param {Set<string>} bdCodes - Set of concatenated `codeVariant + obc` strings
 * @returns {{ code: string, found: boolean }}
 */
export function processScanCode(rawCode, activeOBC, bdCodes) {
  const code = normalizeCode(rawCode)
  const obc = (activeOBC || '').toLowerCase()

  const variations = generateVariations(code)

  for (const variant of variations) {
    if (bdCodes.has(variant + obc)) {
      return { code, found: true }
    }
  }

  return { code, found: false }
}

function generateVariations(code) {
  if (!code) return []
  const variants = [code]
  if (code.includes('-')) variants.push(code.replace(/-/g, '/'))
  if (code.includes('/')) variants.push(code.replace(/\//g, '-'))
  return [...new Set(variants)]
}

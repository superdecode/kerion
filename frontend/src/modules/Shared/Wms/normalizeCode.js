/**
 * Normalizes a raw scanner code for WMS lookup.
 * Full normalization for scan events (not bulk data loading).
 * Ported from legacy vanilla WMS shared rules::normalizeCode
 */
export function normalizeCode(rawCode) {
  if (!rawCode) return ''

  let code = String(rawCode).trim()

  // Strip control chars and common scanner prefixes
  code = code.replace(/[\x00-\x1F\x7F]/g, '')
  code = code.replace(/^GS1:|^\]C1|^\]E0|^\]d2/i, '')

  // Unicode dash/slash normalization — must run before pattern matching so
  // full-width chars (exported by WMS systems) map to ASCII separators correctly
  code = code.replace(/／/g, '/')  // ／ full-width solidus
  code = code.replace(/[－‒–—―]/g, '-') // －‒–—― dashes

  // Top priority: extract ID from JSON blob first (before char normalization)
  const jsonMatch = code.match(/"ID"\s*:\s*"(\d+[\/\-]\d+)"/i)
  if (jsonMatch?.[1]) return jsonMatch[1]

  // Scanner character substitutions
  code = code.replace(/ö/gi, 'o')
  code = code.replace(/ï/gi, 'i')
  code = code.replace(/Ñ/g, ':')
  code = code.replace(/ñ/g, ':')
  code = code.replace(/\^/g, '')
  code = code.replace(/¨/g, '"')
  code = code.replace(/\[/g, '"')
  code = code.replace(/\]/g, '"')
  code = code.replace(/\'/g, '/')
  code = code.replace(/\*/g, '')
  code = code.replace(/&/g, '/')
  code = code.replace(/[""«»„‟‚‛''¨]/g, '"')
  code = code.replace(/\?/g, '_')

  const upper = code.toUpperCase()

  const patterns = [
    /"ID"\s*:\s*"?(\d+[\/\-]\d+)"?/i,
    /"REFERENCE_ID"\s*:\s*"?(\d+[\/\-]\d+)"?/i,
    /\[ID\[N\s*\[([\d]+[\/\-][\d]+)/i,
    /\[ID\[.*?\[([\d]+[\/\-][\d]+)/i,
    /"\[ID"N"([\d]+[\/\-][\d]+)/i,
    /"\[ID".*?"([\d]+[\/\-][\d]+)/i,
    /"ID"\s*[N:"]+\s*"([\d]+[\/\-][\d]+)"/i,
    /"CODE"\s*:\s*"([^"]+)"/i,
    /\bID\s*:\s*"?(\d+[\/\-]\d+)/i,
    /\bID"?"?(\d+[\/\-]\d+)/i,
    /^"?(\d+[\/\-]\d+)"?/,
    /(\d{6,}[\/\-]\d{1,4})/,
  ]

  for (const pattern of patterns) {
    const match = upper.match(pattern)
    if (match?.[1]) {
      const extracted = match[1].replace(/"/g, '')
      if (/^\d{6,}[\/\-]\d{1,4}$/.test(extracted)) return extracted
    }
  }

  const idPattern = /^ID(\d+[-\/]\d+)/i
  const idMatch = upper.match(idPattern)
  if (idMatch) return idMatch[1]

  return upper.replace(/[^A-Z0-9\-\/]/g, '')
}

/**
 * Fast normalization for bulk data loading (no complex pattern extraction).
 * Must match normalizeCode's character substitutions so inventory codes are consistent.
 */
export function normalizeCodeFast(rawCode) {
  if (!rawCode) return ''
  let code = String(rawCode).trim()

  // Unicode dash/slash normalization
  code = code.replace(/／/g, '/')
  code = code.replace(/[－‒–—―]/g, '-')

  // Character substitutions — same as normalizeCode to ensure consistency
  code = code.replace(/ö/gi, 'o')
  code = code.replace(/ï/gi, 'i')
  code = code.replace(/Ñ/g, ':')
  code = code.replace(/ñ/g, ':')
  code = code.replace(/\^/g, '')
  code = code.replace(/¨/g, '"')
  code = code.replace(/\[/g, '"')
  code = code.replace(/\]/g, '"')
  code = code.replace(/\'/g, '/') // Apóstrofes → slashes
  code = code.replace(/\*/g, '')
  code = code.replace(/&/g, '/')
  code = code.replace(/[""«»„‟‚‛''¨]/g, '"')
  code = code.replace(/\?/g, '_')

  return code.toUpperCase().replace(/[^A-Z0-9\-\/]/g, '')
}

/**
 * Extracts the base code without suffixes for flexible lookups.
 */
export function extractBaseCode(code) {
  if (!code) return ''
  let base = code.toUpperCase().split('/')[0].split('-')[0]
  const uMatch = base.match(/^(.+?)U\d+$/)
  if (uMatch) base = uMatch[1]
  const zeroMatch = base.match(/^(.+?)0{3,8}\d*$/)
  if (zeroMatch) base = zeroMatch[1]
  return base || code.toUpperCase()
}

/**
 * Generates lookup-safe code variations following the shared WMS rules.
 * Only slash/dash swaps are allowed. We intentionally do not collapse to
 * a "base code" because caja numbering is part of the unique identifier.
 */
export function generateCodeVariations(rawCode) {
  const code = normalizeCode(rawCode)
  if (!code) return []

  const variations = [code]

  if (code.includes('-')) variations.push(code.replace(/-/g, '/'))
  if (code.includes('/')) variations.push(code.replace(/\//g, '-'))

  return [...new Set(variations)]
}

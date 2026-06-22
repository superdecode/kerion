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
 * Normalizes scanner input using structured patterns only — no generic numeric fallback.
 * Handles composite barcodes (ID-prefixed, JSON-encoded, bracket formats) via explicit patterns.
 * Falls back to basic alphanumeric cleanup when no structured pattern matches.
 *
 * Use this for scan-vs-order validation (Surtido, Validacion) where exact matching is required.
 * Avoids the false-positive issue of normalizeCode's generic \d{6,} fallback, which would
 * accept any barcode that happens to contain a matching numeric sub-pattern.
 */
export function normalizeScanCode(rawCode) {
  if (!rawCode) return ''

  let code = String(rawCode).trim()
  code = code.replace(/[\x00-\x1F\x7F]/g, '')
  code = code.replace(/^GS1:|^\]C1|^\]E0|^\]d2/i, '')
  code = code.replace(/／/g, '/')
  code = code.replace(/[－‒–—―]/g, '-')

  const jsonMatch = code.match(/"ID"\s*:\s*"(\d+[\/\-]\d+)"/i)
  if (jsonMatch?.[1]) return jsonMatch[1]

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

  // Structured patterns only — deliberately excludes the generic \d{6,}[\/\-]\d{1,4} fallback
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
  ]

  for (const pattern of patterns) {
    const match = upper.match(pattern)
    if (match?.[1]) {
      const extracted = match[1].replace(/"/g, '')
      if (/^\d{6,}[\/\-]\d{1,4}$/.test(extracted)) return extracted
    }
  }

  const idMatch = upper.match(/^ID(\d+[-\/]\d+)/i)
  if (idMatch) return idMatch[1]

  const fallback = upper.replace(/[^A-Z0-9\-\/]/g, '')
  // Purely-alphabetic strings (no digits) are label field names, not product codes.
  // e.g. SELLERCONTAINERTYPEBOX from Amazon FBA labels.
  if (fallback.length > 4 && !/\d/.test(fallback)) return ''
  return fallback
}

/**
 * Fast normalization for bulk data loading (Google Sheets / WMS exports).
 * Intentionally minimal — preserves the exact code format from the source system.
 * Only normalizes Unicode variants of - and / to their ASCII counterparts.
 */
export function normalizeCodeFast(rawCode) {
  if (!rawCode) return ''
  let code = String(rawCode).trim()
  code = code.replace(/／/g, '/').replace(/[－‒–—―]/g, '-')
  const jsonIdMatch = code.match(/"(?:id|reference_id)"\s*:\s*"(\d+[\/\-]\d+)"/i)
  if (jsonIdMatch?.[1]) return jsonIdMatch[1].toUpperCase()
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
 *
 * When called with a scanner rawCode, pass normalize=true to apply full
 * scanner normalization first. When called with an already-clean code
 * (e.g. from Google Sheets via normalizeCodeFast), pass normalize=false
 * to avoid running scanner-specific transforms on WMS data.
 */
export function generateCodeVariations(rawCode, normalize = true) {
  const code = normalize ? normalizeCode(rawCode) : String(rawCode || '').toUpperCase()
  if (!code) return []

  const variations = [code]

  if (code.includes('-')) variations.push(code.replace(/-/g, '/'))
  if (code.includes('/')) variations.push(code.replace(/\//g, '-'))

  return [...new Set(variations)]
}

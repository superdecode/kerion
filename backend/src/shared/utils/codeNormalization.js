const BOX_CODE_RE = /^\d{6,}[/-]\d{1,4}$/
const STRUCTURED_CODE_PATTERNS = [
  /["'\[]?(?:REFERENCE_ID|ID|CODE)["'\]]?\s*(?:[:=Ññ]|["'\[]N\s*["'\[])+\s*["'\[]?([A-Z0-9_]+[\/\-&][A-Z0-9_]+)["'\]]?/i,
  /\[ID\[.*?\[([\d]+[\/\-&][\d]+)/i,
  /\bID\s*["']*([\d]+[\/\-&][\d]+)/i,
  /^"?(\d{6,}[\/\-&]\d{1,4})"?/i,
]

function normalizeSeparators(value) {
  return String(value || '')
    .replace(/／/g, '/')
    .replace(/[－‒–—―]/g, '-')
    .replace(/[&']/g, '/')
}

function cleanCode(value) {
  return normalizeSeparators(value).toUpperCase().replace(/[^A-Z0-9_/-]/g, '')
}

function extractFromJson(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    const values = []
    const collect = (value) => {
      if (typeof value === 'string') values.push(value)
      else if (Array.isArray(value)) value.forEach(collect)
      else if (value && typeof value === 'object') Object.values(value).forEach(collect)
    }
    collect(JSON.parse(trimmed))
    for (const value of values) {
      const candidate = cleanCode(value)
      if (BOX_CODE_RE.test(candidate)) return candidate
    }
    const fallback = values.find(value => value.trim())
    return fallback ? cleanCode(fallback) : null
  } catch {
    return null
  }
}

function extractStructuredCode(value) {
  const input = normalizeSeparators(value)
  for (const pattern of STRUCTURED_CODE_PATTERNS) {
    const match = input.match(pattern)
    if (!match?.[1]) continue
    const candidate = cleanCode(match[1])
    if (BOX_CODE_RE.test(candidate) || /\d/.test(candidate)) return candidate
  }
  return null
}

export function normalizeScanCode(rawCode) {
  if (!rawCode) return ''
  let code = normalizeSeparators(String(rawCode).trim().replace(/[\x00-\x1F\x7F]/g, ''))
  code = code.replace(/^GS1:|^\]C1|^\]E0|^\]d2/i, '')

  const extracted = extractFromJson(code) || extractStructuredCode(code)
  if (extracted) return extracted

  code = code
    .replace(/ö/gi, 'o').replace(/ï/gi, 'i')
    .replace(/[Ññ]/g, ':').replace(/\^/g, '')
    .replace(/¨/g, '"').replace(/[\[\]]/g, '"')
    .replace(/\*/g, '').replace(/[“”«»„‟‚‛]/g, '"').replace(/\?/g, '_')

  const normalized = extractStructuredCode(code) || cleanCode(code)
  if (normalized.length > 4 && !/\d/.test(normalized)) return ''
  return normalized
}

export function normalizeCode(rawCode) {
  if (!rawCode) return ''
  const strict = normalizeScanCode(rawCode)
  if (strict) return strict
  return cleanCode(rawCode)
}

export function generateCodeVariations(rawCode, normalize = true) {
  const code = normalize ? normalizeScanCode(rawCode) : cleanCode(rawCode)
  if (!code) return []
  const variations = [code]
  if (code.includes('-')) variations.push(code.replace(/-/g, '/'))
  if (code.includes('/')) variations.push(code.replace(/\//g, '-'))
  return [...new Set(variations)]
}

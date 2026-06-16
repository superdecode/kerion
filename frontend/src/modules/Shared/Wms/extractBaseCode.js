// Strips sequential-unit suffixes from WMS box barcodes.
// Pattern 1: separator (/ - _ . space) followed by digits → "52378103/5" → "52378103"
// Pattern 2: single letter + zero-padded digits → "PLEC26012969105U0001" → "PLEC26012969105"
export function extractBaseCode(code) {
  if (!code) return null
  const str = String(code).trim()
  let r = str.replace(/[/\-_.\s]\d+$/, '')
  if (r.length > 0 && r.length < str.length) return r
  r = str.replace(/[A-Za-z]0\d+$/, '')
  if (r.length > 0 && r.length < str.length) return r
  return str
}

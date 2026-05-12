/**
 * Tracking guide validator for Dropscan.
 *
 * Scores a scanned code to determine how likely it is to be a real
 * shipping tracking number (guía de paquetería), vs a SKU or unrelated barcode.
 *
 * Scoring breakdown (max 100):
 *   Length    0-30  pts  — 11-35 chars is the valid window for known carriers
 *   NumRatio  0-40  pts  — tracking numbers are heavily numeric (≥70%)
 *   Prefix    0-20  pts  — known carrier code prefixes
 *   Clean      0-10 pts  — purely alphanumeric (no hyphens/dots/spaces)
 *   Penalty   -35        — when >50% of characters are letters (SKU-like)
 *   Penalty   -20        — contains non-alphanumeric characters
 *
 * Confidence levels:
 *   high   ≥ 70  → proceed normally
 *   medium 40-69 → show confirmation modal
 *   low    < 40  → show strong warning modal
 *
 * Reference data used to calibrate:
 *   JMX500092536982         J&T Express MX    15 chars 80% numeric
 *   45803670006             Estafeta/other    11 chars 100% numeric
 *   1013486132691142...     GLS/Correos       34 chars 100% numeric
 *   705590945541C70O001FM3  Paquetexpress     22 chars 82% numeric
 *   GC2511262825790466      DHL/similar       18 chars 89% numeric
 *   IM08030002051804        iMail             16 chars 88% numeric
 *   977877950013            Correos postal    12 chars 100% numeric
 */

const KNOWN_PREFIXES = /^(JMX|GC[0-9]|IM[0-9]|1Z|EC|LP|RR|CX|EE|RA|CP|ST[0-9]|DHL|UPS|FDX|MEX|EST|PAQ|RED|SND|BOR|FLX|JTM|NET|WEL|VEL|AGE|MXE|[0-9]{3}590|977[0-9])/i

export function scoreTrackingCode(rawCode) {
  const code = rawCode.trim().toUpperCase()
  const len = code.length

  if (len < 8) return { score: 0, level: 'low', reason: 'too_short', numRatio: 0, alphaRatio: 0, len }
  if (/\s/.test(code)) return { score: 5, level: 'low', reason: 'has_spaces', numRatio: 0, alphaRatio: 0, len }

  const digits = (code.match(/\d/g) || []).length
  const letters = (code.match(/[A-Z]/g) || []).length
  const numRatio = digits / len
  const alphaRatio = letters / len

  let score = 0

  // 1. Length (0-30) — minimum 10 digits covers short carriers like FedEx 10-digit
  if (len >= 10 && len <= 35) score += 30
  else if (len >= 8 && len < 10) score += 15
  else if (len > 35 && len <= 50) score += 10

  // 2. Numeric proportion (0-40)
  if (numRatio >= 0.90) score += 40
  else if (numRatio >= 0.70) score += 30
  else if (numRatio >= 0.50) score += 15

  // 3. Known carrier prefix (0-20)
  if (KNOWN_PREFIXES.test(code)) score += 20

  // 4. Purely alphanumeric — no hyphens, dots, slashes (0-10)
  if (/^[A-Z0-9]+$/.test(code)) score += 10

  // Penalty: more than half letters → SKU / product label
  if (alphaRatio > 0.50) score -= 35

  // Penalty: contains non-alphanumeric chars → product code / formatted SKU
  if (/[^A-Z0-9]/.test(code)) score -= 20

  const finalScore = Math.max(0, Math.min(100, score))

  let level
  if (finalScore >= 70) level = 'high'
  else if (finalScore >= 40) level = 'medium'
  else level = 'low'

  return { score: finalScore, level, numRatio, alphaRatio, len }
}

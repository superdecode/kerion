import { toDateKey } from '../../../core/utils/dateFormat'

/** Returns the raw WMS datetime string (preserving time component) for storage. */
export function getOrderDateTimeRaw(order) {
  return String(order?.outboundTime || order?.expectedTime || order?.orderCreateTime || '').trim()
}

/** Returns "YYYY-MM-DD" from WMS order date fields, or '' if none available. */
export function getOrderDateKey(order) {
  const raw = order?.outboundTime || order?.expectedTime || order?.orderCreateTime || ''
  if (!raw) return ''
  const str = String(raw).trim()

  const isoLike = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (isoLike) {
    return `${isoLike[1]}-${String(isoLike[2]).padStart(2, '0')}-${String(isoLike[3]).padStart(2, '0')}`
  }

  const slashDate = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (slashDate) {
    const first  = Number(slashDate[1])
    const second = Number(slashDate[2])
    // Unambiguous: first > 12 → must be day (D/M/Y). second > 12 → must be day (M/D/Y).
    // Ambiguous (both ≤ 12): default D/M/Y — WMS and Mexican locale standard.
    let day, month
    if (first > 12)       { day = first; month = second }
    else if (second > 12) { month = first; day = second }
    else {
      // Both ≤ 12: Google Sheets exports date cells without leading zeros (M/D/Y);
      // zero-padded strings are D/M/Y text entries (Mexican/WMS locale).
      const hasLeadingZero = slashDate[1].startsWith('0') || slashDate[2].startsWith('0')
      if (hasLeadingZero) { day = first; month = second }
      else                { month = first; day = second }
    }
    return `${slashDate[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  try { const k = toDateKey(str); return (k && k !== '—') ? k : '' } catch { return '' }
}

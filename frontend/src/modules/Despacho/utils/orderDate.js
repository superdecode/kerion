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
    const a = Number(isoLike[2]), b = Number(isoLike[3])
    // Unambiguous: if second part > 12 it must be the day (YYYY-MM-DD standard).
    // If first part > 12 it must be the month with day second — also YYYY-MM-DD.
    if (a > 12 || b > 12) {
      return `${isoLike[1]}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
    }
    // Both ≤ 12: some WMS export YYYY-DD-MM instead of YYYY-MM-DD.
    // Use proximity to today: the interpretation whose date is closer wins.
    const stdKey = `${isoLike[1]}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
    const altKey = `${isoLike[1]}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
    const stdMs = new Date(stdKey + 'T12:00:00').getTime()
    const altMs = new Date(altKey + 'T12:00:00').getTime()
    if (!isNaN(stdMs) && !isNaN(altMs)) {
      const now = Date.now()
      return Math.abs(altMs - now) < Math.abs(stdMs - now) ? altKey : stdKey
    }
    return !isNaN(stdMs) ? stdKey : altKey
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
      // Both ≤ 12: ambiguous. Pick the interpretation whose date is closer to today —
      // WMS delivery dates are nearly always in the near term, so the nearer date wins.
      const yr = Number(slashDate[3])
      const dmyKey = `${slashDate[3]}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`
      const mdyKey = `${slashDate[3]}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`
      const dmyMs = new Date(dmyKey + 'T12:00:00').getTime()
      const mdyMs = new Date(mdyKey + 'T12:00:00').getTime()
      if (!isNaN(dmyMs) && !isNaN(mdyMs)) {
        const now = Date.now()
        return Math.abs(mdyMs - now) < Math.abs(dmyMs - now) ? mdyKey : dmyKey
      }
      return !isNaN(dmyMs) ? dmyKey : mdyKey
    }
    return `${slashDate[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  try { const k = toDateKey(str); return (k && k !== '—') ? k : '' } catch { return '' }
}

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
    // Google Sheets M/D/Y default. Only treat first as day when first > 12
    // (months can't exceed 12, so it must be the day in that case).
    const day   = first > 12 ? first : second
    const month = first > 12 ? second : first
    return `${slashDate[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  try { return toDateKey(str) } catch { return '' }
}

import { toDateKey } from '../../../core/utils/dateFormat'

/** Returns "YYYY-MM-DD" from WMS order date fields, or '' if none available. */
export function getOrderDateKey(order) {
  const raw = order?.outboundTime || order?.expectedTime || order?.orderCreateTime || ''
  if (!raw) return ''
  const str = String(raw).trim()

  const isoLike = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (isoLike) {
    return `${isoLike[1]}-${String(isoLike[2]).padStart(2, '0')}-${String(isoLike[3]).padStart(2, '0')}`
  }

  const slashDate = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashDate) {
    const first  = Number(slashDate[1])
    const second = Number(slashDate[2])
    const day    = first > 12 ? first : second
    const month  = first > 12 ? second : first
    return `${slashDate[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  try { return toDateKey(str) } catch { return '' }
}

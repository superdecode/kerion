// frontend/src/modules/Despacho/utils/despachoSession.js
const KEY = 'kirion_despacho_dates'

export function getDespachoDates() {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setDespachoDates(dateFrom, dateTo) {
  sessionStorage.setItem(KEY, JSON.stringify({ dateFrom, dateTo }))
}

export function clearDespachoDates() {
  sessionStorage.removeItem(KEY)
}

// Returns saved dates if present, otherwise computes today-3 → today+4
// and persists the result so subsequent calls reuse it within the same session.
export function getSmartDespachoDates() {
  const saved = getDespachoDates()
  if (saved?.dateFrom && saved?.dateTo) return saved

  const pad = n => String(n).padStart(2, '0')
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  const from = new Date()
  from.setDate(from.getDate() - 3)
  const to = new Date()
  to.setDate(to.getDate() + 4)

  const dateFrom = fmt(from)
  const dateTo   = fmt(to)
  setDespachoDates(dateFrom, dateTo)
  return { dateFrom, dateTo }
}

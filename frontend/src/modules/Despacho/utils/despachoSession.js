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

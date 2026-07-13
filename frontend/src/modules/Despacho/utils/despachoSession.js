// frontend/src/modules/Despacho/utils/despachoSession.js
const KEY = 'kirion_despacho_dates'

// Forward pool window: how many days around "today" the smart default covers.
// Dispatch validation always works next-day and a few days ahead, so the window
// leans forward. Kept in one place so the pool size is easy to tune.
const DAYS_BACK = 3
const DAYS_FORWARD = 7

const pad = n => String(n).padStart(2, '0')
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayKey = () => fmt(new Date())

export function getDespachoDates() {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Persist an explicit, user-chosen range. Tagged 'manual' so the smart default
// never overwrites a selection the operator made on purpose.
export function setDespachoDates(dateFrom, dateTo) {
  sessionStorage.setItem(KEY, JSON.stringify({ dateFrom, dateTo, mode: 'manual' }))
}

export function clearDespachoDates() {
  sessionStorage.removeItem(KEY)
}

function computeSmartDates() {
  const from = new Date()
  from.setDate(from.getDate() - DAYS_BACK)
  const to = new Date()
  to.setDate(to.getDate() + DAYS_FORWARD)
  return { dateFrom: fmt(from), dateTo: fmt(to) }
}

// Returns the operator's manual range if one is set; otherwise the smart pool
// window (today-DAYS_BACK to today+DAYS_FORWARD). The auto window is stamped with
// the day it was computed and recomputed when the day rolls over, so a session
// left open overnight refreshes to the new day instead of serving a stale range
// that excludes today's and tomorrow's orders.
export function getSmartDespachoDates() {
  const saved = getDespachoDates()
  if (saved?.mode === 'manual' && saved.dateFrom && saved.dateTo) {
    return { dateFrom: saved.dateFrom, dateTo: saved.dateTo }
  }
  if (saved?.mode === 'auto' && saved.day === todayKey() && saved.dateFrom && saved.dateTo) {
    return { dateFrom: saved.dateFrom, dateTo: saved.dateTo }
  }

  const { dateFrom, dateTo } = computeSmartDates()
  sessionStorage.setItem(KEY, JSON.stringify({ dateFrom, dateTo, mode: 'auto', day: todayKey() }))
  return { dateFrom, dateTo }
}

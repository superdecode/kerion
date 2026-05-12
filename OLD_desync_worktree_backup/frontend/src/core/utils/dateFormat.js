/**
 * Date formatting utilities — uses configurable timezone.
 * Import these instead of calling toLocaleString/toLocaleDateString/
 * toLocaleTimeString directly so all timestamps display consistently.
 *
 * Call setTimezone() when the user logs in or changes their preference.
 */

let _tz = 'America/Mexico_City'
const LOCALE = 'es-MX'

/** Set the active timezone for all formatting functions. */
export const setTimezone = (tz) => { _tz = tz }

/** Get the current active timezone. */
export const getTimezone = () => _tz

/** "HH:MM:SS" */
export const fmtTime = (date) =>
  new Date(date).toLocaleTimeString(LOCALE, { timeZone: _tz })

/** "HH:MM" */
export const fmtTimeShort = (date) =>
  new Date(date).toLocaleTimeString(LOCALE, { timeZone: _tz, hour: '2-digit', minute: '2-digit' })

/** "DD/MM/YYYY" */
export const fmtDate = (date) =>
  new Date(date).toLocaleDateString(LOCALE, { timeZone: _tz, day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * Format a date string that's already in the user's timezone (from backend).
 * Handles: YYYY-MM-DD, ISO timestamps (2026-04-06T00:00:00Z), and Date objects.
 * Returns "DD/MM/YYYY" without any timezone conversion.
 *
 * Use this for backend responses that already return dates in the user's timezone.
 */
export const fmtDateString = (input) => {
  if (!input) return ''

  let dateStr = input

  // If it's a Date object, convert to YYYY-MM-DD in local timezone
  if (input instanceof Date) {
    const y = input.getFullYear()
    const m = String(input.getMonth() + 1).padStart(2, '0')
    const d = String(input.getDate()).padStart(2, '0')
    dateStr = `${y}-${m}-${d}`
  } else {
    // If it's a string, extract just the YYYY-MM-DD part (handle ISO timestamps)
    dateStr = String(input).split('T')[0]
  }

  const parts = dateStr.split('-')
  if (parts.length !== 3) return String(input)

  const [year, month, day] = parts
  return `${day}/${month}/${year}`
}

/**
 * Format a date string as "lun. 6 abr" without timezone conversion.
 * Useful for backend date strings already in user's timezone.
 * Same format as fmtDateShort but without UTC conversion issues.
 */
export const fmtDateStringShort = (input) => {
  if (!input) return ''

  let dateStr = String(input).split('T')[0]  // Extract YYYY-MM-DD
  const parts = dateStr.split('-')
  if (parts.length !== 3) return String(input)

  const [year, month, day] = parts
  // Create a date at noon UTC to avoid day boundary issues
  const date = new Date(`${year}-${month}-${String(day).padStart(2,'0')}T12:00:00Z`)
  return date.toLocaleDateString(LOCALE, { timeZone: _tz, weekday: 'short', day: 'numeric', month: 'short' })
}

/** "lun. 1 ene." */
export const fmtDateShort = (date) =>
  new Date(date).toLocaleDateString(LOCALE, { timeZone: _tz, weekday: 'short', day: 'numeric', month: 'short' })

/** "DD/MM/YYYY, HH:MM:SS" */
export const fmtDateTime = (date) =>
  new Date(date).toLocaleString(LOCALE, { timeZone: _tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** "DD/MM, HH:MM" */
export const fmtDateTimeMini = (date) =>
  new Date(date).toLocaleString(LOCALE, { timeZone: _tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Returns today as 'YYYY-MM-DD' in the active timezone. */
export const getToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: _tz }).format(new Date())

/** @deprecated Use getToday() */
export const getTodayMX = getToday

/**
 * Returns a date string 'YYYY-MM-DD' in the active timezone that is `days`
 * before the given date string. Safe across DST boundaries.
 */
export const subtractDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T18:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return new Intl.DateTimeFormat('en-CA', { timeZone: _tz }).format(d)
}

/** @deprecated Use subtractDays() */
export const subtractDaysMX = subtractDays

/**
 * Date formatting utilities — uses configurable timezone.
 * Import these instead of calling toLocaleString/toLocaleDateString/
 * toLocaleTimeString directly so all timestamps display consistently.
 *
 * Call setTimezone() when the user logs in or changes their preference.
 */

let _tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City'
const LOCALE = 'es-MX'

const EMPTY_DATE_VALUES = new Set(['', '-', '--', '—', 'n/a', 'na', 'null', 'undefined', 'invalid date', '0000-00-00'])
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
const DAY_MS = 24 * 60 * 60 * 1000

function parseExcelSerialDate(value) {
  const wholeDays = Math.floor(value)
  const day = new Date(EXCEL_EPOCH_MS + wholeDays * DAY_MS)
  const seconds = Math.round((value - wholeDays) * DAY_MS / 1000)
  return new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, seconds)
}

function parseDateParts(year, month, day, hour = 0, minute = 0, second = 0) {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  const hh = Number(hour)
  const mm = Number(minute)
  const ss = Number(second)
  if (![y, m, d, hh, mm, ss].every(Number.isFinite)) return null
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > 31 || hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null

  const date = new Date(y, m - 1, d, hh, mm, ss)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return date
}

export function parseDateValue(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    if (value > 25569 && value < 60000) return parseExcelSerialDate(value)
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const raw = String(value).trim()
  if (EMPTY_DATE_VALUES.has(raw.toLowerCase())) return null

  const numeric = Number(raw)
  if (Number.isFinite(numeric) && raw.length >= 5 && raw.length <= 13) {
    if (numeric > 25569 && numeric < 60000) return parseExcelSerialDate(numeric)
    if (raw.length >= 10) {
      const date = new Date(numeric)
      if (!Number.isNaN(date.getTime())) return date
    }
  }

  const isoLike = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/)
  if (isoLike) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
      const date = new Date(raw)
      return Number.isNaN(date.getTime()) ? null : date
    }
    return parseDateParts(isoLike[1], isoLike[2], isoLike[3], isoLike[4] || 0, isoLike[5] || 0, isoLike[6] || 0)
  }

  // Normalize: strip AM/PM suffix (Google Sheets 12-hour format) before D/M/Y matching
  const normalized = raw.replace(/\s*[AaPp][Mm]$/, '').trim()

  // Google Sheets exports M/D/Y (US locale). Default: first=month, second=day.
  // Exception: if first > 12 it can't be a month, so format is D/M/Y (day first).
  const dmy = normalized.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (dmy) {
    const first = Number(dmy[1])
    const second = Number(dmy[2])
    const [day, month] = first > 12 ? [first, second] : [second, first]
    return parseDateParts(dmy[3], month, day, dmy[4] || 0, dmy[5] || 0, dmy[6] || 0)
  }

  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateValue(value, formatter) {
  const date = parseDateValue(value)
  if (!date) return '—'
  try {
    return formatter(date)
  } catch {
    return '—'
  }
}

/** Set the active timezone for all formatting functions. */
export const setTimezone = (tz) => { _tz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City' }

/** Get the current active timezone. */
export const getTimezone = () => _tz

/** "HH:MM:SS" */
export const fmtTime = (date) =>
  formatDateValue(date, d => d.toLocaleTimeString(LOCALE, { timeZone: _tz }))

/** "HH:MM" */
export const fmtTimeShort = (date) =>
  formatDateValue(date, d => d.toLocaleTimeString(LOCALE, { timeZone: _tz, hour: '2-digit', minute: '2-digit' }))

/** "DD/MM/YYYY" */
export const fmtDate = (date) =>
  formatDateValue(date, d => d.toLocaleDateString(LOCALE, { timeZone: _tz, day: '2-digit', month: '2-digit', year: 'numeric' }))

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
  formatDateValue(date, d => d.toLocaleDateString(LOCALE, { timeZone: _tz, weekday: 'short', day: 'numeric', month: 'short' }))

/** "DD/MM/YYYY, HH:MM:SS" */
export const fmtDateTime = (date) =>
  formatDateValue(date, d => d.toLocaleString(LOCALE, { timeZone: _tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }))

/** "DD/MM, HH:MM" */
export const fmtDateTimeMini = (date) =>
  formatDateValue(date, d => d.toLocaleString(LOCALE, { timeZone: _tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))

/** Returns today as 'YYYY-MM-DD' in the active timezone. */
export const getToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: _tz }).format(new Date())

/** Returns a date as 'YYYY-MM-DD' in the active timezone. */
export const toDateKey = (date = new Date()) =>
  formatDateValue(date, d => new Intl.DateTimeFormat('en-CA', { timeZone: _tz }).format(d))

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

export const addDays = (dateStr, days) => subtractDays(dateStr, -days)

/** @deprecated Use subtractDays() */
export const subtractDaysMX = subtractDays

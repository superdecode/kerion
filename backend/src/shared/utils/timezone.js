/**
 * Timezone helpers for DB writes and UI formatting.
 *
 * The database stores timestamps in UTC, but business rules often need
 * "end of day" in a tenant's local timezone. This module converts a local
 * date/time in a named IANA timezone to the corresponding UTC instant.
 */

function partsToObject(parts) {
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

function getOffsetMsAtInstant(instantMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })

  const parts = partsToObject(dtf.formatToParts(new Date(instantMs)))
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    Number(parts.fractionalSecond || 0)
  )

  return zonedAsUtc - instantMs
}

export function zonedDateTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }, timeZone) {
  const guessedUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
  let resolvedUtc = guessedUtc - getOffsetMsAtInstant(guessedUtc, timeZone)
  const resolvedOffset = getOffsetMsAtInstant(resolvedUtc, timeZone)

  if (resolvedOffset !== getOffsetMsAtInstant(guessedUtc, timeZone)) {
    resolvedUtc = guessedUtc - resolvedOffset
  }

  return new Date(resolvedUtc)
}

export function endOfDayInTimezone(dateInput, timeZone) {
  // Date-only strings (YYYY-MM-DD) must be treated as a calendar date in the
  // target timezone, not parsed as UTC midnight which shifts the date backward
  // for negative-offset timezones (e.g. America/Mexico_City UTC-6).
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-').map(Number)
    return zonedDateTimeToUtc({ year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 }, timeZone)
  }

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Fecha invalida')
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = partsToObject(formatter.formatToParts(date))

  return zonedDateTimeToUtc({
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
  }, timeZone)
}

export function formatDateTimeInTimezone(dateInput, timeZone, locale = 'es-MX') {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date)
}

const toMs = (value) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export const getTimeBounds = (items = [], { timestampKey = 'ts', fallbackStart = null, fallbackEnd = null } = {}) => {
  const timestamps = items
    .map((item) => toMs(item?.[timestampKey]))
    .filter((value) => value !== null)

  const start = timestamps.length > 0
    ? new Date(Math.min(...timestamps)).toISOString()
    : (fallbackStart || null)

  const end = timestamps.length > 0
    ? new Date(Math.max(...timestamps)).toISOString()
    : (fallbackEnd || start || null)

  return { start, end }
}


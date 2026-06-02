import { getToday } from '../../../shared/utils/dateUtils.js'

const DAY_MAP = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

export function dayLetter(date) {
  return DAY_MAP[date.getUTCDay()]
}

export function formatYMD(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function buildUtcDateFromTenantDay(tenantDate) {
  return new Date(`${tenantDate}T12:00:00Z`)
}

export async function generateDevCodigo(client, tenantId, prefijo, table, tenantTimezone = 'America/Mexico_City') {
  const tenantDate = getToday(tenantTimezone)
  const date = buildUtcDateFromTenantDay(tenantDate)
  const base = `${prefijo}${formatYMD(date)}${dayLetter(date)}`
  const { rows } = await client.query(
    `SELECT codigo
     FROM ${table}
     WHERE tenant_id = $1 AND codigo LIKE $2
     ORDER BY codigo DESC
     LIMIT 1
     FOR UPDATE`,
    [tenantId, `${base}%`]
  )
  const current = rows[0]?.codigo
  const next = current ? Number.parseInt(current.slice(base.length), 10) + 1 : 1
  return `${base}${String(next).padStart(3, '0')}`
}

export async function generateItemTrazabilidad(client, tenantId, sesionId, sesionCodigo) {
  const base = sesionCodigo.replace(/\d+$/, '') + '-'
  const { rows } = await client.query(
    `SELECT codigo_trazabilidad
     FROM dev_items
     WHERE tenant_id = $1 AND codigo_trazabilidad LIKE $2
     ORDER BY codigo_trazabilidad DESC
     LIMIT 1
     FOR UPDATE`,
    [tenantId, `${base}%`]
  )
  const current = rows[0]?.codigo_trazabilidad
  const next = current ? Number.parseInt(current.slice(base.length), 10) + 1 : 1
  return `${base}${String(next).padStart(3, '0')}`
}

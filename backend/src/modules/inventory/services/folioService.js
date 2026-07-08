import { format } from 'date-fns'

export async function generateRastreoFolio(tQuery, tenantId) {
  const today = format(new Date(), 'yyyyMMdd')
  const res = await tQuery(
    `SELECT COALESCE(MAX(NULLIF(substring(folio FROM '([0-9]+)$'), '')::integer), 0) AS seq
     FROM rastreo_ordenes
     WHERE tenant_id = $1
       AND to_char(created_at AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD') = $2`,
    [tenantId, today]
  )
  const seq = parseInt(res.rows[0].seq, 10) + 1
  return `TK-${today}-${String(seq).padStart(4, '0')}`
}

export async function generateRastreoFolioForClient(client, tenantId) {
  const today = format(new Date(), 'yyyyMMdd')
  const lockKey = `rastreo_folio:${tenantId}:${today}`

  // Serialize folio generation per tenant/day to avoid duplicate TK-YYYYMMDD-NNNN
  // values under double submit or concurrent requests.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey])

  const res = await client.query(
    `SELECT COALESCE(MAX(NULLIF(substring(folio FROM '([0-9]+)$'), '')::integer), 0) AS seq
     FROM rastreo_ordenes
     WHERE tenant_id = $1
       AND to_char(created_at AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD') = $2`,
    [tenantId, today]
  )
  const seq = parseInt(res.rows[0].seq, 10) + 1
  return `TK-${today}-${String(seq).padStart(4, '0')}`
}

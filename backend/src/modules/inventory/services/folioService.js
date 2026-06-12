import { format } from 'date-fns'

export async function generateRastreoFolio(tQuery, tenantId) {
  const today = format(new Date(), 'yyyyMMdd')
  const res = await tQuery(
    `SELECT COUNT(*) AS cnt FROM rastreo_ordenes
     WHERE tenant_id = $1
       AND to_char(created_at AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD') = $2`,
    [tenantId, today]
  )
  const seq = parseInt(res.rows[0].cnt, 10) + 1
  return `TK-${today}-${String(seq).padStart(4, '0')}`
}

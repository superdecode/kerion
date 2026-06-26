function getQueryRunner(source) {
  if (source && typeof source.query === 'function') return source
  if (source && typeof source.tQuery === 'function') {
    return { query: (...args) => source.tQuery(...args) }
  }
  throw new Error('Invalid query runner for recepcion order state refresh')
}

async function getOrderCounters(client, tenantId, orderId) {
  const runner = getQueryRunner(client)
  const result = await runner.query(
    `SELECT
       o.total_cajas,
       COALESCE((
         SELECT COUNT(*)::int
         FROM inbound_lines l
         WHERE l.order_id = o.id
           AND l.tenant_id = o.tenant_id
           AND l.estado_validacion = 'validada'
       ), 0) AS validas,
       COALESCE((
         SELECT COUNT(*)::int
         FROM inbound_lines l
         WHERE l.order_id = o.id
           AND l.tenant_id = o.tenant_id
           AND l.estado_validacion = 'faltante'
       ), 0) AS faltantes,
       COALESCE((
         SELECT COUNT(*)::int
         FROM inbound_novedades n
         WHERE n.order_id = o.id
           AND n.tenant_id = o.tenant_id
           AND COALESCE(n.cuenta_conteo, true) = true
       ), 0) AS forzadas
     FROM inbound_orders o
     WHERE o.id = $1 AND o.tenant_id = $2
     LIMIT 1`,
    [orderId, tenantId]
  )

  return result.rows[0] || null
}

export async function refreshRecepcionOrderState(client, tenantId, orderId) {
  const counters = await getOrderCounters(client, tenantId, orderId)
  if (!counters) return null

  const totalCajas = Number(counters.total_cajas || 0)
  const validas = Number(counters.validas || 0)
  const faltantes = Number(counters.faltantes || 0)
  const forzadas = Number(counters.forzadas || 0)
  const registradas = validas + forzadas

  let estado = 'pendiente_validacion'
  if (registradas > totalCajas) {
    estado = 'anormal'
  } else if (registradas >= totalCajas && totalCajas > 0 && faltantes === 0) {
    estado = 'completo'
  } else if (registradas > 0 || faltantes > 0) {
    estado = 'en_validacion'
  }

  const runner = getQueryRunner(client)
  const update = await runner.query(
    `UPDATE inbound_orders
     SET cajas_validadas=$3,
         cajas_forzadas=$4,
         cajas_registradas=$5,
         estado=$6,
         updated_at=now()
     WHERE id=$1 AND tenant_id=$2
     RETURNING *`,
    [orderId, tenantId, validas, forzadas, registradas, estado]
  )

  return {
    order: update.rows[0] || null,
    total_cajas: totalCajas,
    cajas_validadas: validas,
    cajas_forzadas: forzadas,
    cajas_registradas: registradas,
    faltantes,
    estado,
  }
}

export async function getRecepcionValidationRecordCount(client, tenantId, orderId) {
  const runner = getQueryRunner(client)
  const result = await runner.query(
    `SELECT
       COALESCE((
         SELECT COUNT(*)::int
         FROM inbound_scan_events e
         WHERE e.order_id = o.id
           AND e.tenant_id = o.tenant_id
           AND e.resultado = 'correcto'
       ), 0)
       +
       COALESCE((
         SELECT COUNT(*)::int
         FROM inbound_novedades n
         WHERE n.order_id = o.id
           AND n.tenant_id = o.tenant_id
           AND COALESCE(n.cuenta_conteo, true) = true
       ), 0) AS validation_records
     FROM inbound_orders o
     WHERE o.id = $1 AND o.tenant_id = $2
     LIMIT 1`,
    [orderId, tenantId]
  )

  return Number(result.rows[0]?.validation_records || 0)
}

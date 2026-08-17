import { normalizeOptionalText } from './pickBoxes.js'

/**
 * Snapshot de la orden en pick_order_tracking.
 *
 * Extraido de wms.routes.js para que el commit de un lote
 * (services/pickBatchService.js) actualice el tracking exactamente igual que
 * la validacion por orden. Las funciones aceptan un `queryable` que puede ser
 * `req` (usa req.tQuery) o un client de pg dentro de una transaccion.
 */

const _tableColumnCache = new Map()

export async function runDbQuery(queryable, text, params = []) {
  if (typeof queryable.tQuery === 'function') return queryable.tQuery(text, params)
  return queryable.query(text, params)
}

export async function getPublicTableColumns(queryable, tableName) {
  if (_tableColumnCache.has(tableName)) return _tableColumnCache.get(tableName)
  const allowedTables = new Set(['pick_order_tracking', 'pick_sessions'])
  if (!allowedTables.has(tableName)) {
    throw new Error(`Unsupported table for column introspection: ${tableName}`)
  }
  let cols
  try {
    const probe = await runDbQuery(queryable, `SELECT * FROM ${tableName} LIMIT 0`, [])
    cols = new Set((probe.fields || []).map((field) => field.name))
  } catch {
    const result = await runDbQuery(
      queryable,
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    )
    cols = new Set(result.rows.map((row) => row.column_name))
  }
  _tableColumnCache.set(tableName, cols)
  return cols
}

export async function upsertOrderTrackingSnapshot(queryable, tenantId, outboundOrderNo, snapshot = {}) {
  if (!outboundOrderNo) return
  const trackingColumns = await getPublicTableColumns(queryable, 'pick_order_tracking')
  const insertColumns = ['tenant_id', 'outbound_order_no']
  const insertValues = [tenantId, outboundOrderNo]
  const updates = []

  const snapshotFields = [
    ['third_order_no', normalizeOptionalText(snapshot.third_order_no)],
    ['receiver_name', normalizeOptionalText(snapshot.receiver_name)],
    ['logistics_track_no', normalizeOptionalText(snapshot.logistics_track_no)],
    ['logistics_channel', normalizeOptionalText(snapshot.logistics_channel)],
    ['outbound_delivery_at', normalizeOptionalText(snapshot.outbound_delivery_at)],
    ['outbound_box_count', Number.isFinite(Number(snapshot.outbound_box_count)) ? Number(snapshot.outbound_box_count) : null],
  ]

  for (const [field, value] of snapshotFields) {
    if (!trackingColumns.has(field)) continue
    insertColumns.push(field)
    insertValues.push(value)
    updates.push(`${field} = COALESCE(pick_order_tracking.${field}, EXCLUDED.${field})`)
  }

  if (trackingColumns.has('updated_at')) updates.push('updated_at = now()')
  const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ')

  await runDbQuery(
    queryable,
    `INSERT INTO pick_order_tracking (${insertColumns.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (tenant_id, outbound_order_no) DO UPDATE SET
       ${updates.join(', ')}`,
    insertValues
  )
}

import { query } from '../../config/database.js'

function parseUsageCount(row) {
  return parseInt(row?.count ?? row?.total ?? '0', 10)
}

/**
 * Returns middleware that checks the tenant has not exceeded a monthly operation limit.
 * Applies to endpoints where every call creates exactly one counted entity.
 * For bulk endpoints or conditional inserts, use checkModuleLimitForUpdate()
 * inside the same transaction as the write.
 *
 * @param {object} opts
 * @param {string} opts.limitField   - Column name in plans table (e.g. 'inventario_limit')
 * @param {string} opts.countQuery   - SQL with $1 = tenant_id; must SELECT COUNT(*) or integer 'count'
 * @param {string} [opts.errorCode]  - Error code returned in 402 response
 */
export function usageGuard({ limitField, countQuery, errorCode = 'PLAN_LIMIT_REACHED' }) {
  return async (req, res, next) => {
    if (!req.tenantId) return res.status(401).json({ error: 'Tenant no identificado' })
    try {
      const result = await checkModuleLimit(req.tenantId, limitField, countQuery)
      if (result.limited) {
        return res.status(402).json({
          error: 'Límite mensual del plan alcanzado para este módulo.',
          code: errorCode,
          used: result.used,
          limit: result.limit,
        })
      }
      next()
    } catch (err) {
      console.error('[usageGuard]', err.message)
      return res.status(500).json({ error: 'Error interno' })
    }
  }
}

/**
 * Checks whether a tenant has reached a monthly limit.
 * Returns { limited, used, limit }.
 * limited = false when limit is NULL (unlimited).
 */
export async function checkModuleLimit(tenantId, limitField, countQuery) {
  const planRes = await query(
    `SELECT p.${limitField} AS lim
     FROM tenants t
     LEFT JOIN plans p ON t.current_plan_id = p.id
     WHERE t.id = $1`,
    [tenantId]
  )
  const limit = planRes.rows[0]?.lim ?? null
  if (limit === null) return { limited: false, used: null, limit: null }

  const usageRes = await query(countQuery, [tenantId])
  const used = parseUsageCount(usageRes.rows[0])
  return { limited: used >= limit, used, limit }
}

/**
 * Transaction-safe limit check for write paths.
 * Caller must pass a client inside an open transaction.
 * Uses FOR UPDATE on the tenant row so concurrent writers serialize the
 * count+write critical section.
 */
export async function checkModuleLimitForUpdate(client, tenantId, limitField, countQuery, increment = 1) {
  const planRes = await client.query(
    `SELECT p.${limitField} AS lim
     FROM tenants t
     LEFT JOIN plans p ON t.current_plan_id = p.id
     WHERE t.id = $1
     FOR UPDATE OF t`,
    [tenantId]
  )
  const limit = planRes.rows[0]?.lim ?? null
  if (limit === null) return { limited: false, used: null, limit: null, increment }

  const usageRes = await client.query(countQuery, [tenantId])
  const used = parseUsageCount(usageRes.rows[0])
  return {
    limited: used + increment > limit,
    used,
    limit,
    increment,
  }
}

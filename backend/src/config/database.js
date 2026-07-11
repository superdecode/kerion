import pg from 'pg'
import env from './env.js'

const { Pool } = pg

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRANSIENT_DB_ERROR_CODES = new Set([
  '57P01', // admin shutdown
  '57P03', // cannot connect now
  '53300', // too many connections
  '08000', // connection exception
  '08003', // connection does not exist
  '08006', // connection failure
  '08001', // unable to establish connection
  'ECHECKOUTTIMEOUT',
  'DB_QUERY_DEADLINE',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
])
const DEFAULT_POOL_MAX = env.NODE_ENV === 'production' ? 4 : 5
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX, 10) || DEFAULT_POOL_MAX
const DB_IDLE_TIMEOUT_MS = parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 5000
const DB_CONNECTION_TIMEOUT_MS = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10) || 5000
const DB_QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS, 10) || 12000
const DB_STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS, 10) || 12000

function assertTenantId(tenantId) {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId: ${String(tenantId).slice(0, 40)}`)
  }
}

export function isDatabaseUnavailableError(error) {
  if (!error) return false
  if (TRANSIENT_DB_ERROR_CODES.has(error.code)) return true
  const message = String(error.message || '').toLowerCase()
  return (
    message.includes('not accepting connections') ||
    message.includes('terminating connection due to administrator command') ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection timeout') ||
    message.includes('authentication did not complete') ||
    message.includes('failed to connect to database') ||
    message.includes('timeout expired') ||
    message.includes('socket hang up')
  )
}

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: DB_POOL_MAX,
  idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
  query_timeout: DB_QUERY_TIMEOUT_MS,
  statement_timeout: DB_STATEMENT_TIMEOUT_MS,
  maxLifetimeSeconds: 60,
})

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client:', err)
  // Do NOT call process.exit() — it kills the Vercel serverless function
})

// Separate pool for long-running export queries.
// No query_timeout or statement_timeout so large exports don't get cancelled.
// max:2 — exports are infrequent; we don't want them to starve normal requests.
const exportPool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 2,
  idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
  query_timeout: 0,
  statement_timeout: 0,
  maxLifetimeSeconds: 60,
})
exportPool.on('error', (err) => console.error('❌ export pool idle error:', err))

export const query = (text, params) => pool.query(text, params)

export const getClient = () => pool.connect()

// Acquire a client from the export pool (no query timeout).
// Caller MUST release() in a finally block.
export const getExportClient = () => exportPool.connect()

// Execute a single query scoped to a tenant (SET LOCAL requires a transaction).
// Retries once on pool checkout timeout (ECHECKOUTTIMEOUT) after a short delay.
export async function tenantQuery(tenantId, text, params) {
  for (let attempt = 0; attempt <= 1; attempt++) {
    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')
      assertTenantId(tenantId)
      await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`)
      const result = await client.query(text, params)
      await client.query('COMMIT')
      return result
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK') } catch {}
        client.release()
        client = null
      }
      if (err.code === 'ECHECKOUTTIMEOUT' && attempt === 0) {
        await new Promise(r => setTimeout(r, 300))
        continue
      }
      throw err
    } finally {
      if (client) client.release()
    }
  }
}

// Run multiple statements in a transaction scoped to a tenant.
// cb receives a client already configured with SET LOCAL app.tenant_id.
export async function tenantTransaction(tenantId, cb) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    assertTenantId(tenantId)
    await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`)
    const result = await cb(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Middleware that provides tenant-scoped DB helpers on `req`:
 *   - req.tQuery(sql, params)  — single query with RLS context
 *   - req.tTransaction(cb)     — multi-statement transaction with RLS context
 *     cb receives a pg Client with app.tenant_id already SET LOCAL'd
 *   - req.tGetClient()         — manual client with RLS, must release yourself
 *
 * Must be mounted AFTER tenantContext (which sets req.tenantId).
 */
export function tenantDB(req, res, next) {
  const tid = req.tenantId

  req.tQuery = async (text, params) => {
    return tenantQuery(tid, text, params)
  }

  req.tTransaction = async (cb) => {
    return tenantTransaction(tid, cb)
  }

  // Acquire a client with RLS context for manual transaction control.
  // Caller MUST call client.release() in a finally block.
  // The client has BEGIN + SET LOCAL already executed.
  // Caller does COMMIT/ROLLBACK themselves.
  req.tGetClient = async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      assertTenantId(tid)
      await client.query(`SET LOCAL app.tenant_id = '${tid}'`)
    } catch (err) {
      client.release()
      throw err
    }
    return client
  }

  // Same as tGetClient but uses the no-timeout export pool.
  req.tGetExportClient = async () => {
    const client = await exportPool.connect()
    try {
      await client.query('BEGIN')
      assertTenantId(tid)
      await client.query(`SET LOCAL app.tenant_id = '${tid}'`)
    } catch (err) {
      client.release()
      throw err
    }
    return client
  }

  // Like tTransaction but uses the no-timeout export pool.
  // Use for exports and any long-running read that legitimately exceeds 12s.
  req.tExportTransaction = async (cb) => {
    const client = await exportPool.connect()
    try {
      await client.query('BEGIN')
      assertTenantId(tid)
      await client.query(`SET LOCAL app.tenant_id = '${tid}'`)
      const result = await cb(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      try { await client.query('ROLLBACK') } catch {}
      throw err
    } finally {
      client.release()
    }
  }

  next()
}

export default pool

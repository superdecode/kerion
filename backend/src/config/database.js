import pg from 'pg'
import env from './env.js'

const { Pool } = pg

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function assertTenantId(tenantId) {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId: ${String(tenantId).slice(0, 40)}`)
  }
}

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client:', err)
  // Do NOT call process.exit() — it kills the Vercel serverless function
})

export const query = (text, params) => pool.query(text, params)

export const getClient = () => pool.connect()

// Execute a single query scoped to a tenant (SET LOCAL requires a transaction).
export async function tenantQuery(tenantId, text, params) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    assertTenantId(tenantId)
    await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`)
    const result = await client.query(text, params)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
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
    await client.query('BEGIN')
    await client.query(`SET LOCAL app.tenant_id = '${tid}'`)
    return client
  }

  next()
}

export default pool

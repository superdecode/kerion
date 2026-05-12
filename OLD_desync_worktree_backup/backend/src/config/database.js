import pg from 'pg'
import env from './env.js'

const { Pool } = pg

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
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

export default pool

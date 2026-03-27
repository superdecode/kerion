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
  process.exit(-1)
})

export const query = (text, params) => pool.query(text, params)

export const getClient = () => pool.connect()

export default pool

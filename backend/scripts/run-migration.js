import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envFile = process.env.ENV_FILE || '.env.local'
dotenv.config({ path: path.join(__dirname, '../', envFile) })

const { Pool } = pg

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

async function tableExists(client, tableName) {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [tableName]
  )
  return res.rows.length > 0
}

async function getAppliedVersions(client) {
  const exists = await tableExists(client, 'schema_migrations')
  if (!exists) return new Set()
  const res = await client.query('SELECT version FROM schema_migrations')
  return new Set(res.rows.map(r => r.version))
}

function extractVersion(filename) {
  const match = filename.match(/^(\d+)/)
  // schema_migrations stores the zero-padded filename prefix (e.g. "089").
  // Stripping zeros made every applied migration look pending ("089" !== "89").
  return match ? match[1] : null
}

async function runMigration(filename) {
  const client = await pool.connect()
  try {
    console.log(`\n Running migration: ${filename}`)

    const migrationPath = path.join(__dirname, '../migrations', filename)
    const sql = fs.readFileSync(migrationPath, 'utf8')

    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')

    console.log(` Migration completed: ${filename}`)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(` Migration failed: ${filename}`)
    console.error(error)
    throw error
  } finally {
    client.release()
  }
}

async function main() {
  const client = await pool.connect()
  let appliedVersions
  try {
    appliedVersions = await getAppliedVersions(client)
    console.log(`Starting migrations... (${appliedVersions.size} already applied)`)
    console.log(`Connected to: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`)
  } finally {
    client.release()
  }

  try {
    const migrationsDir = path.join(__dirname, '../migrations')
    const requestedFiles = String(process.env.MIGRATION_FILES || '')
      .split(',').map((file) => file.trim()).filter(Boolean)
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .filter(f => requestedFiles.length === 0 || requestedFiles.includes(f))
      .sort()

    if (files.length === 0) {
      console.log('No migration files found')
      return
    }

    let skipped = 0
    let applied = 0

    for (const file of files) {
      const version = extractVersion(file)
      if (version && appliedVersions.has(version)) {
        console.log(` Skipping (already applied): ${file}`)
        skipped++
        continue
      }
      await runMigration(file)
      applied++
    }

    console.log(`\nDone. Applied: ${applied}, Skipped: ${skipped}`)
  } catch (error) {
    console.error('\nMigration process failed')
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()

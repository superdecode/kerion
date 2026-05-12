import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const { Pool } = pg

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

async function runMigration(filename) {
  const client = await pool.connect()
  try {
    console.log(`\n📄 Running migration: ${filename}`)
    
    const migrationPath = path.join(__dirname, '../migrations', filename)
    const sql = fs.readFileSync(migrationPath, 'utf8')
    
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    
    console.log(`✅ Migration completed successfully: ${filename}`)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`❌ Migration failed: ${filename}`)
    console.error(error)
    throw error
  } finally {
    client.release()
  }
}

async function main() {
  try {
    console.log('🚀 Starting database migrations...')
    console.log(`📡 Connected to: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`)
    
    const migrationsDir = path.join(__dirname, '../migrations')
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
    
    if (files.length === 0) {
      console.log('⚠️  No migration files found')
      return
    }
    
    for (const file of files) {
      await runMigration(file)
    }
    
    console.log('\n✨ All migrations completed successfully!')
  } catch (error) {
    console.error('\n💥 Migration process failed')
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()

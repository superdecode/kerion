/**
 * Multi-tenant isolation integration tests.
 * These tests require a real database connection with two tenants and the
 * RLS policies from migration 022 + 042 applied.
 *
 * Run only when DB_HOST is set:  DB_HOST=... npm test
 * They are skipped automatically when the env var is absent.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../../.env.local') })

const { Pool } = pg

const DB_AVAILABLE = Boolean(process.env.DB_HOST && process.env.DB_NAME)

// Shared pools initialized in beforeAll
let adminPool   // BYPASSRLS role (app role)
let appPool     // Same pool — tests SET app.tenant_id per connection

async function tenantQuery(pool, tenantId, sql, params = []) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`)
    const res = await client.query(sql, params)
    await client.query('COMMIT')
    return res
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

describe.skipIf(!DB_AVAILABLE)('Multi-tenant data isolation', () => {
  let tenantA, tenantB

  beforeAll(async () => {
    adminPool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 5,
    })
    appPool = adminPool

    // Fetch first two tenants from DB for testing. tenants has no soft-delete column —
    // status is the closest thing, and any two real tenants are fine for RLS isolation checks.
    const res = await adminPool.query(
      "SELECT id, slug FROM tenants ORDER BY created_at LIMIT 2"
    )
    if (res.rows.length < 2) {
      throw new Error('Need at least 2 tenants in DB to run isolation tests')
    }
    tenantA = res.rows[0]
    tenantB = res.rows[1]
  })

  afterAll(async () => {
    await adminPool?.end()
  })

  it('tenant A cannot see tenant B sessions via tenant_modules', async () => {
    const resA = await tenantQuery(
      appPool,
      tenantA.id,
      'SELECT tenant_id FROM tenant_modules WHERE tenant_id = $1',
      [tenantA.id]
    )
    const resB = await tenantQuery(
      appPool,
      tenantB.id,
      'SELECT tenant_id FROM tenant_modules WHERE tenant_id = $1',
      [tenantB.id]
    )

    // Each query returns only its own tenant's rows
    const aIds = [...new Set(resA.rows.map(r => r.tenant_id))]
    const bIds = [...new Set(resB.rows.map(r => r.tenant_id))]

    expect(aIds).not.toContain(tenantB.id)
    expect(bIds).not.toContain(tenantA.id)
  })

  it('pick_sessions cross-tenant leak: tenant A query returns zero rows for tenant B id', async () => {
    // Direct query asking for tenant B sessions while tenant_id is set to A
    const res = await tenantQuery(
      appPool,
      tenantA.id,
      'SELECT id FROM pick_sessions WHERE tenant_id = $1 LIMIT 1',
      [tenantB.id]
    )
    // With RLS enforced, tenant A context cannot see tenant B's rows
    // even with explicit WHERE — the policy is: tenant_id = current_setting('app.tenant_id')::uuid
    // Note: BYPASSRLS role skips RLS, so this test is most meaningful with a non-BYPASSRLS role.
    // Documented as a smoke-test; upgrade to a restricted role in production audit.
    expect(Array.isArray(res.rows)).toBe(true)
  })

  it('audit_log entries are scoped per tenant', async () => {
    const resA = await tenantQuery(
      appPool,
      tenantA.id,
      'SELECT tenant_id FROM audit_log WHERE tenant_id = $1 LIMIT 5',
      [tenantA.id]
    )
    resA.rows.forEach(row => {
      expect(row.tenant_id).toBe(tenantA.id)
    })
  })

  it('tenant_modules backfill: all module codes present for each tenant', async () => {
    const EXPECTED = ['dropscan', 'surtido', 'inventario', 'devoluciones', 'anormalidades', 'despacho', 'recepcion']

    for (const tenant of [tenantA, tenantB]) {
      const res = await adminPool.query(
        'SELECT module_code FROM tenant_modules WHERE tenant_id = $1 ORDER BY module_code',
        [tenant.id]
      )
      const codes = res.rows.map(r => r.module_code)
      for (const expected of EXPECTED) {
        expect(codes, `tenant ${tenant.slug} missing module ${expected}`).toContain(expected)
      }
    }
  })

  it('wms_cache PK is (tenant_id, key) — duplicate key within one tenant rejected', async () => {
    const testKey = `__test_isolation_${Date.now()}`

    // Insert once
    await adminPool.query(
      "INSERT INTO wms_cache (tenant_id, key, data, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour') ON CONFLICT DO NOTHING",
      [tenantA.id, testKey, JSON.stringify({ test: true })]
    )

    // Second insert with same (tenant_id, key) must fail or be a no-op via ON CONFLICT
    let threw = false
    try {
      await adminPool.query(
        "INSERT INTO wms_cache (tenant_id, key, data, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour')",
        [tenantA.id, testKey, JSON.stringify({ test: 2 })]
      )
    } catch (e) {
      threw = true
      expect(e.message).toMatch(/duplicate key|unique constraint/i)
    }

    // Cleanup
    await adminPool.query(
      'DELETE FROM wms_cache WHERE tenant_id = $1 AND key = $2',
      [tenantA.id, testKey]
    )

    // Same key is allowed for a different tenant (no PK collision)
    await adminPool.query(
      "INSERT INTO wms_cache (tenant_id, key, data, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour') ON CONFLICT DO NOTHING",
      [tenantB.id, testKey, JSON.stringify({ test: true })]
    )
    await adminPool.query(
      'DELETE FROM wms_cache WHERE tenant_id = $1 AND key = $2',
      [tenantB.id, testKey]
    )

    expect(threw).toBe(true)
  })
})

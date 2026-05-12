import env from '../config/env.js'
import pg from 'pg'

const { Client } = pg

const LEGACY_MAP = { total: 'eliminar', gestion: 'actualizar', escritura: 'crear', lectura: 'ver' }

/**
 * Deep-normalize all string values in a permissions object using LEGACY_MAP.
 * Also renames global.dashboard → global.inicio.
 */
function normalizePermisos(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = {}
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      const lower = val.toLowerCase()
      result[key] = LEGACY_MAP[lower] || lower
    } else {
      result[key] = normalizePermisos(val)
    }
  }
  return result
}

/**
 * Migration script to:
 * 1. Rename global.dashboard → global.inicio
 * 2. Replace old permission level names (total, gestion, escritura, lectura)
 *    with new names (eliminar, actualizar, crear, ver)
 */
async function migratePermissions() {
  const client = new Client({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  })

  try {
    await client.connect()
    console.log(`🔗 Connected to "${env.DB_NAME}"`)

    // ── Migrate roles table ──
    const rolesResult = await client.query('SELECT id, nombre, permisos FROM roles WHERE activo = true')
    console.log(`\n📋 Found ${rolesResult.rows.length} active roles`)

    let rolesUpdated = 0
    for (const role of rolesResult.rows) {
      const original = JSON.stringify(role.permisos)
      let permisos = role.permisos

      // Fix global.dashboard → global.inicio
      if (permisos?.global?.dashboard !== undefined) {
        permisos.global.inicio = permisos.global.dashboard
        delete permisos.global.dashboard
      }

      // Normalize all level values
      permisos = normalizePermisos(permisos)

      const normalized = JSON.stringify(permisos)
      if (original !== normalized) {
        await client.query(
          'UPDATE roles SET permisos = $1 WHERE id = $2',
          [JSON.stringify(permisos), role.id]
        )
        rolesUpdated++
        console.log(`   ✅ Role "${role.nombre}" updated`)
        console.log(`      Old: ${original}`)
        console.log(`      New: ${normalized}`)
      } else {
        console.log(`   ✓ Role "${role.nombre}" — no changes needed`)
      }
    }
    console.log(`\n   Roles updated: ${rolesUpdated}`)

    // ── Migrate usuarios.permisos_override ──
    const usersResult = await client.query(
      "SELECT id, nombre_completo, permisos_override FROM usuarios WHERE permisos_override IS NOT NULL AND permisos_override != '{}'::jsonb AND permisos_override != 'null'"
    )
    console.log(`\n👥 Found ${usersResult.rows.length} users with permisos_override`)

    let usersUpdated = 0
    for (const user of usersResult.rows) {
      const original = JSON.stringify(user.permisos_override)
      const normalized = JSON.stringify(normalizePermisos(user.permisos_override))

      if (original !== normalized) {
        await client.query(
          'UPDATE usuarios SET permisos_override = $1 WHERE id = $2',
          [normalized, user.id]
        )
        usersUpdated++
        console.log(`   ✅ User "${user.nombre_completo}" permisos_override updated`)
      }
    }
    console.log(`\n   Users updated: ${usersUpdated}`)

    console.log(`\n🎉 Migration complete!`)
    console.log(`   Roles: ${rolesUpdated} updated`)
    console.log(`   Users: ${usersUpdated} updated`)
    await client.end()
    process.exit(0)
  } catch (error) {
    console.error('❌ Error migrating permissions:', error.message)
    process.exit(1)
  }
}

migratePermissions()

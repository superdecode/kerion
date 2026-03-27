import env from './env.js'
import pg from 'pg'
import bcrypt from 'bcrypt'

const { Client } = pg

async function seedDatabase() {
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

    // Check if already seeded
    const existing = await client.query('SELECT COUNT(*) FROM roles')
    if (parseInt(existing.rows[0].count) > 0) {
      console.log('ℹ️ Database already seeded, skipping...')
      await client.end()
      process.exit(0)
    }

    // 1. Create roles
    const roles = [
      {
        nombre: 'Administrador',
        descripcion: 'Acceso total al sistema',
        permisos: {
          global: { dashboard: 'total', administracion: 'total' },
          dropscan: { dashboard: 'total', escaneo: 'total', historial: 'total', reportes: 'total' }
        }
      },
      {
        nombre: 'Jefe',
        descripcion: 'Supervisor de operaciones',
        permisos: {
          global: { dashboard: 'lectura', administracion: 'sin_acceso' },
          dropscan: { dashboard: 'lectura', escaneo: 'gestion', historial: 'gestion', reportes: 'escritura' }
        }
      },
      {
        nombre: 'Operador',
        descripcion: 'Operador de escaneo',
        permisos: {
          global: { dashboard: 'lectura', administracion: 'sin_acceso' },
          dropscan: { dashboard: 'lectura', escaneo: 'escritura', historial: 'lectura', reportes: 'sin_acceso' }
        }
      },
      {
        nombre: 'Usuario',
        descripcion: 'Solo consulta',
        permisos: {
          global: { dashboard: 'lectura', administracion: 'sin_acceso' },
          dropscan: { dashboard: 'lectura', escaneo: 'sin_acceso', historial: 'lectura', reportes: 'lectura' }
        }
      }
    ]

    for (const role of roles) {
      await client.query(
        'INSERT INTO roles (nombre, descripcion, permisos) VALUES ($1, $2, $3)',
        [role.nombre, role.descripcion, JSON.stringify(role.permisos)]
      )
    }
    console.log('✅ Roles created')

    // 2. Create admin user (password: admin123)
    const passwordHash = await bcrypt.hash('admin123', 10)
    await client.query(
      `INSERT INTO usuarios (codigo, nombre_completo, email, password_hash, rol_id, estado)
       VALUES ($1, $2, $3, $4, 1, 'ACTIVO')`,
      ['ADM001', 'Administrador', 'admin@wms.com', passwordHash]
    )

    // Create demo operator
    const opHash = await bcrypt.hash('operador123', 10)
    await client.query(
      `INSERT INTO usuarios (codigo, nombre_completo, email, password_hash, rol_id, estado)
       VALUES ($1, $2, $3, $4, 3, 'ACTIVO')`,
      ['OPR001', 'Operador Demo', 'operador@wms.com', opHash]
    )
    console.log('✅ Users created')

    // 3. DropScan configurations
    const configs = [
      // Empresas de paquetería
      { modulo: 'dropscan', tipo: 'empresa', codigo: 'DHL', nombre: 'DHL Express', descripcion: 'Paquetería internacional' },
      { modulo: 'dropscan', tipo: 'empresa', codigo: 'FEDEX', nombre: 'FedEx', descripcion: 'Paquetería y logística' },
      { modulo: 'dropscan', tipo: 'empresa', codigo: 'UPS', nombre: 'UPS', descripcion: 'United Parcel Service' },
      { modulo: 'dropscan', tipo: 'empresa', codigo: 'ESTAFETA', nombre: 'Estafeta', descripcion: 'Paquetería mexicana' },
      // Canales
      { modulo: 'dropscan', tipo: 'canal', codigo: 'CANAL-1', nombre: 'Canal 1', descripcion: 'Línea de escaneo 1' },
      { modulo: 'dropscan', tipo: 'canal', codigo: 'CANAL-2', nombre: 'Canal 2', descripcion: 'Línea de escaneo 2' },
      { modulo: 'dropscan', tipo: 'canal', codigo: 'CANAL-3', nombre: 'Canal 3', descripcion: 'Línea de escaneo 3' },
    ]

    for (const cfg of configs) {
      await client.query(
        `INSERT INTO configuraciones (modulo, tipo, codigo, nombre, descripcion) VALUES ($1, $2, $3, $4, $5)`,
        [cfg.modulo, cfg.tipo, cfg.codigo, cfg.nombre, cfg.descripcion]
      )
    }
    console.log('✅ Configurations created')

    await client.end()
    console.log('🎉 Seed complete')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error seeding database:', error.message)
    process.exit(1)
  }
}

seedDatabase()

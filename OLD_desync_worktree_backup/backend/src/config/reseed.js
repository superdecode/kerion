import env from './env.js'
import pg from 'pg'
import bcrypt from 'bcryptjs'

const { Client } = pg

async function reseedDatabase() {
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

    // Clear dependent tables first, then roles/users (RESTART resets serial IDs)
    await client.query('TRUNCATE alertas_duplicados, sesiones_escaneo, guias, tarimas, configuraciones, usuarios, roles RESTART IDENTITY CASCADE')
    console.log('🗑️  Cleared existing data')

    // 1. Roles
    const roles = [
      {
        nombre: 'Administrador',
        descripcion: 'Acceso total al sistema',
        permisos: {
          global: { inicio: 'eliminar', administracion: 'eliminar', wms: 'eliminar' },
          dropscan: { dashboard: 'eliminar', escaneo: 'eliminar', historial: 'eliminar', reportes: 'eliminar', configuracion: 'eliminar', folios: 'eliminar' },
          inventory: { escaneo: 'eliminar', historial: 'eliminar', reportes: 'eliminar' },
        }
      },
      {
        nombre: 'Jefe',
        descripcion: 'Supervisor de operaciones',
        permisos: {
          global: { inicio: 'ver', administracion: 'sin_acceso', wms: 'ver' },
          dropscan: { dashboard: 'ver', escaneo: 'actualizar', historial: 'actualizar', reportes: 'crear', configuracion: 'ver', folios: 'actualizar' },
          inventory: { escaneo: 'actualizar', historial: 'actualizar', reportes: 'crear' },
        }
      },
      {
        nombre: 'Operador',
        descripcion: 'Operador de escaneo',
        permisos: {
          global: { inicio: 'ver', administracion: 'sin_acceso', wms: 'sin_acceso' },
          dropscan: { dashboard: 'ver', escaneo: 'crear', historial: 'ver', reportes: 'sin_acceso', configuracion: 'sin_acceso', folios: 'crear' },
          inventory: { escaneo: 'crear', historial: 'ver', reportes: 'sin_acceso' },
        }
      },
      {
        nombre: 'Usuario',
        descripcion: 'Consulta operativa',
        permisos: {
          global: { inicio: 'ver', administracion: 'sin_acceso', wms: 'sin_acceso' },
          dropscan: { dashboard: 'ver', escaneo: 'sin_acceso', historial: 'ver', reportes: 'ver', configuracion: 'sin_acceso', folios: 'ver' },
          inventory: { escaneo: 'sin_acceso', historial: 'ver', reportes: 'ver' },
        }
      }
    ]

    for (const role of roles) {
      await client.query(
        'INSERT INTO roles (nombre, descripcion, permisos) VALUES ($1, $2, $3)',
        [role.nombre, role.descripcion, JSON.stringify(role.permisos)]
      )
    }
    console.log('✅ Roles created (Administrador, Jefe, Operador, Usuario)')

    // 2. Users
    const adminHash = await bcrypt.hash('admin123', 10)
    await client.query(
      `INSERT INTO usuarios (codigo, nombre_completo, email, password_hash, rol_id, estado)
       VALUES ($1, $2, $3, $4, 1, 'ACTIVO')`,
      ['ADM001', 'Administrador', 'admin@kirion.com', adminHash]
    )

    const jefeHash = await bcrypt.hash('jefe123', 10)
    await client.query(
      `INSERT INTO usuarios (codigo, nombre_completo, email, password_hash, rol_id, estado)
       VALUES ($1, $2, $3, $4, 2, 'ACTIVO')`,
      ['JEF001', 'Supervisor Demo', 'jefe@kirion.com', jefeHash]
    )

    const opHash = await bcrypt.hash('operador123', 10)
    await client.query(
      `INSERT INTO usuarios (codigo, nombre_completo, email, password_hash, rol_id, estado)
       VALUES ($1, $2, $3, $4, 3, 'ACTIVO')`,
      ['OPR001', 'Operador Demo', 'operador@kirion.com', opHash]
    )
    console.log('✅ Users created:')
    console.log('   admin@kirion.com / admin123')
    console.log('   jefe@kirion.com  / jefe123')
    console.log('   operador@kirion.com / operador123')

    // 3. Configurations
    const empresas = [
      { codigo: 'DHL',      nombre: 'DHL Express',  descripcion: 'Paquetería internacional', color: '#FFCC00' },
      { codigo: 'FEDEX',    nombre: 'FedEx',         descripcion: 'Paquetería y logística',   color: '#4D148C' },
      { codigo: 'UPS',      nombre: 'UPS',           descripcion: 'United Parcel Service',    color: '#351C15' },
      { codigo: 'ESTAFETA', nombre: 'Estafeta',      descripcion: 'Paquetería mexicana',      color: '#E31837' },
    ]
    for (const e of empresas) {
      await client.query(
        `INSERT INTO configuraciones (modulo, tipo, codigo, nombre, descripcion, config_json) VALUES ('dropscan','empresa',$1,$2,$3,$4)`,
        [e.codigo, e.nombre, e.descripcion, JSON.stringify({ color: e.color })]
      )
    }

    const canales = [
      { codigo: 'CANAL-1', nombre: 'Canal 1', descripcion: 'Línea de escaneo 1' },
      { codigo: 'CANAL-2', nombre: 'Canal 2', descripcion: 'Línea de escaneo 2' },
      { codigo: 'CANAL-3', nombre: 'Canal 3', descripcion: 'Línea de escaneo 3' },
    ]
    for (const c of canales) {
      await client.query(
        `INSERT INTO configuraciones (modulo, tipo, codigo, nombre, descripcion, config_json) VALUES ('dropscan','canal',$1,$2,$3,$4)`,
        [c.codigo, c.nombre, c.descripcion, JSON.stringify({ es_default: false, empresa_ids: [] })]
      )
    }
    console.log('✅ Configurations created (4 empresas, 3 canales)')

    await client.end()
    console.log('🎉 Reseed complete')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error reseeding database:', error.message)
    process.exit(1)
  }
}

reseedDatabase()

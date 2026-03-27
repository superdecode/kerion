import env from './env.js'
import pg from 'pg'

const { Client } = pg

async function initDatabase() {
  // Connect to postgres default database to create our database
  const client = new Client({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: 'postgres',
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  })

  try {
    await client.connect()
    console.log('🔗 Connected to PostgreSQL')

    // Check if database exists
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [env.DB_NAME]
    )

    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE ${env.DB_NAME}`)
      console.log(`✅ Database "${env.DB_NAME}" created`)
    } else {
      console.log(`ℹ️ Database "${env.DB_NAME}" already exists`)
    }

    await client.end()

    // Now connect to our database and create tables
    const dbClient = new Client({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    })

    await dbClient.connect()
    console.log(`🔗 Connected to "${env.DB_NAME}"`)

    // Create schema
    await dbClient.query(schema)
    console.log('✅ Schema created successfully')

    await dbClient.end()
    console.log('🎉 Database initialization complete')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error initializing database:', error.message)
    process.exit(1)
  }
}

const schema = `
-- ============================================
-- WMS PROFESIONAL - Schema
-- ============================================

-- CORE: Roles
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) UNIQUE NOT NULL,
  descripcion TEXT,
  permisos JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CORE: Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(20) UNIQUE NOT NULL,
  nombre_completo VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  estado VARCHAR(20) DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO')),
  permisos_override JSONB,
  avatar_url TEXT,
  ultimo_acceso TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_codigo ON usuarios(codigo);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol_id ON usuarios(rol_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON usuarios(estado);

-- CORE: Configuraciones compartidas
CREATE TABLE IF NOT EXISTS configuraciones (
  id SERIAL PRIMARY KEY,
  modulo VARCHAR(50) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  config_json JSONB,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(modulo, tipo, codigo)
);

CREATE INDEX IF NOT EXISTS idx_config_modulo ON configuraciones(modulo);
CREATE INDEX IF NOT EXISTS idx_config_tipo ON configuraciones(tipo);
CREATE INDEX IF NOT EXISTS idx_config_activo ON configuraciones(activo);

-- DROPSCAN: Tarimas
CREATE TABLE IF NOT EXISTS tarimas (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  empresa_id INTEGER REFERENCES configuraciones(id) ON DELETE RESTRICT NOT NULL,
  canal_id INTEGER REFERENCES configuraciones(id) ON DELETE RESTRICT NOT NULL,
  operador_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
  estado VARCHAR(20) DEFAULT 'EN_PROCESO' CHECK (estado IN ('EN_PROCESO', 'COMPLETA', 'CANCELADA')),
  cantidad_guias INTEGER DEFAULT 0 CHECK (cantidad_guias >= 0 AND cantidad_guias <= 100),
  fecha_inicio TIMESTAMP NOT NULL,
  fecha_cierre TIMESTAMP,
  tiempo_armado_segundos INTEGER,
  bloqueada BOOLEAN DEFAULT false,
  bloqueada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  bloqueada_fecha TIMESTAMP,
  bloqueada_razon TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tarimas_empresa ON tarimas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tarimas_canal ON tarimas(canal_id);
CREATE INDEX IF NOT EXISTS idx_tarimas_operador ON tarimas(operador_id);
CREATE INDEX IF NOT EXISTS idx_tarimas_estado ON tarimas(estado);
CREATE INDEX IF NOT EXISTS idx_tarimas_fecha ON tarimas(fecha_inicio);

-- DROPSCAN: Guías
CREATE TABLE IF NOT EXISTS guias (
  id SERIAL PRIMARY KEY,
  codigo_guia VARCHAR(100) NOT NULL,
  tarima_id INTEGER REFERENCES tarimas(id) ON DELETE CASCADE NOT NULL,
  posicion INTEGER NOT NULL CHECK (posicion >= 1 AND posicion <= 100),
  operador_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
  timestamp_escaneo TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guias_unique ON guias(codigo_guia, tarima_id);
CREATE INDEX IF NOT EXISTS idx_guias_tarima ON guias(tarima_id);
CREATE INDEX IF NOT EXISTS idx_guias_codigo ON guias(codigo_guia);
CREATE INDEX IF NOT EXISTS idx_guias_timestamp ON guias(timestamp_escaneo);

-- DROPSCAN: Sesiones de escaneo
CREATE TABLE IF NOT EXISTS sesiones_escaneo (
  id SERIAL PRIMARY KEY,
  operador_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
  empresa_id INTEGER REFERENCES configuraciones(id) ON DELETE RESTRICT NOT NULL,
  canal_id INTEGER REFERENCES configuraciones(id) ON DELETE RESTRICT NOT NULL,
  tarima_actual_id INTEGER REFERENCES tarimas(id) ON DELETE SET NULL,
  fecha_inicio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_fin TIMESTAMP,
  tarimas_completadas INTEGER DEFAULT 0,
  total_guias INTEGER DEFAULT 0,
  alertas_duplicados INTEGER DEFAULT 0,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sesiones_operador ON sesiones_escaneo(operador_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_activa ON sesiones_escaneo(activa);

-- DROPSCAN: Alertas de duplicados
CREATE TABLE IF NOT EXISTS alertas_duplicados (
  id SERIAL PRIMARY KEY,
  codigo_guia VARCHAR(100) NOT NULL,
  tarima_id INTEGER REFERENCES tarimas(id) ON DELETE CASCADE NOT NULL,
  operador_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
  guia_original_id INTEGER REFERENCES guias(id) ON DELETE SET NULL,
  tarima_original_id INTEGER REFERENCES tarimas(id) ON DELETE SET NULL,
  timestamp_alerta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alertas_tarima ON alertas_duplicados(tarima_id);
CREATE INDEX IF NOT EXISTS idx_alertas_timestamp ON alertas_duplicados(timestamp_alerta);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_roles_ts ON roles;
CREATE TRIGGER update_roles_ts BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_usuarios_ts ON usuarios;
CREATE TRIGGER update_usuarios_ts BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_config_ts ON configuraciones;
CREATE TRIGGER update_config_ts BEFORE UPDATE ON configuraciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tarimas_ts ON tarimas;
CREATE TRIGGER update_tarimas_ts BEFORE UPDATE ON tarimas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sesiones_ts ON sesiones_escaneo;
CREATE TRIGGER update_sesiones_ts BEFORE UPDATE ON sesiones_escaneo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-calculate tarima build time on close
CREATE OR REPLACE FUNCTION calcular_tiempo_armado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'COMPLETA' AND OLD.estado != 'COMPLETA' AND NEW.fecha_cierre IS NOT NULL THEN
    NEW.tiempo_armado_segundos = EXTRACT(EPOCH FROM (NEW.fecha_cierre - NEW.fecha_inicio))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tiempo_armado ON tarimas;
CREATE TRIGGER trigger_tiempo_armado BEFORE UPDATE ON tarimas
  FOR EACH ROW EXECUTE FUNCTION calcular_tiempo_armado();

-- Useful views
CREATE OR REPLACE VIEW v_tarimas_completas AS
SELECT 
  t.id, t.codigo, t.estado, t.cantidad_guias,
  t.fecha_inicio, t.fecha_cierre, t.tiempo_armado_segundos, t.bloqueada,
  t.bloqueada_razon,
  e.nombre as empresa_nombre, e.codigo as empresa_codigo,
  c.nombre as canal_nombre, c.codigo as canal_codigo,
  u.nombre_completo as operador_nombre, u.codigo as operador_codigo,
  ub.nombre_completo as bloqueada_por_nombre
FROM tarimas t
JOIN configuraciones e ON t.empresa_id = e.id
JOIN configuraciones c ON t.canal_id = c.id
JOIN usuarios u ON t.operador_id = u.id
LEFT JOIN usuarios ub ON t.bloqueada_por = ub.id;

CREATE OR REPLACE VIEW v_guias_completas AS
SELECT 
  g.id, g.codigo_guia, g.posicion, g.timestamp_escaneo,
  t.codigo as tarima_codigo, t.estado as tarima_estado,
  e.nombre as empresa_nombre, c.nombre as canal_nombre,
  u.nombre_completo as operador_nombre
FROM guias g
JOIN tarimas t ON g.tarima_id = t.id
JOIN configuraciones e ON t.empresa_id = e.id
JOIN configuraciones c ON t.canal_id = c.id
JOIN usuarios u ON g.operador_id = u.id;
`

initDatabase()

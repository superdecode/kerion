-- ============================================
-- Migration 003: Usuarios Internos (Internal Operators)
-- Description: PIN-based internal operator system for DropScan module
-- ============================================

-- Table: usuarios_internos (Internal Operators)
CREATE TABLE IF NOT EXISTS usuarios_internos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  activo BOOLEAN DEFAULT true,
  eliminado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES usuarios(id),
  updated_by INTEGER REFERENCES usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_internos_nombre
  ON usuarios_internos(nombre) WHERE eliminado = false;

CREATE INDEX IF NOT EXISTS idx_usuarios_internos_activo
  ON usuarios_internos(activo) WHERE eliminado = false;

CREATE TRIGGER update_usuarios_internos_updated_at
  BEFORE UPDATE ON usuarios_internos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Table: logs_usuarios_internos (Security logs)
CREATE TABLE IF NOT EXISTS logs_usuarios_internos (
  id SERIAL PRIMARY KEY,
  evento VARCHAR(50) NOT NULL,
  usuario_interno_id INTEGER REFERENCES usuarios_internos(id) ON DELETE SET NULL,
  usuario_interno_nombre VARCHAR(50),
  usuario_sistema_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_sistema_email VARCHAR(100),
  detalles JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_ui_evento ON logs_usuarios_internos(evento);
CREATE INDEX IF NOT EXISTS idx_logs_ui_usuario ON logs_usuarios_internos(usuario_interno_id);
CREATE INDEX IF NOT EXISTS idx_logs_ui_created ON logs_usuarios_internos(created_at);

-- Add operator context columns to sesiones_escaneo
ALTER TABLE sesiones_escaneo
  ADD COLUMN IF NOT EXISTS usuario_operador VARCHAR(100),
  ADD COLUMN IF NOT EXISTS usuario_interno_id INTEGER REFERENCES usuarios_internos(id),
  ADD COLUMN IF NOT EXISTS nivel_usuario VARCHAR(30);

-- Add operator context columns to guias
ALTER TABLE guias
  ADD COLUMN IF NOT EXISTS usuario_operador VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nivel_usuario VARCHAR(30);

-- Migrate existing data: set legacy values
UPDATE sesiones_escaneo
SET usuario_operador = (SELECT nombre_completo FROM usuarios WHERE id = sesiones_escaneo.operador_id),
    nivel_usuario = 'Legacy'
WHERE usuario_operador IS NULL;

UPDATE guias
SET usuario_operador = (SELECT nombre_completo FROM usuarios WHERE id = guias.operador_id),
    nivel_usuario = 'Legacy'
WHERE usuario_operador IS NULL;

-- Comments
COMMENT ON TABLE usuarios_internos IS 'Internal operators with PIN authentication for DropScan scanning sessions';
COMMENT ON TABLE logs_usuarios_internos IS 'Security audit log for internal operator events';
COMMENT ON COLUMN sesiones_escaneo.usuario_operador IS 'Display name of the operator who performed scans in this session';
COMMENT ON COLUMN sesiones_escaneo.usuario_interno_id IS 'Reference to internal operator if applicable';
COMMENT ON COLUMN sesiones_escaneo.nivel_usuario IS 'User level: Administrador, Gestion, Operador, Usuario, Legacy';
COMMENT ON COLUMN guias.usuario_operador IS 'Display name of the operator who scanned this guide';
COMMENT ON COLUMN guias.nivel_usuario IS 'User level at time of scan';

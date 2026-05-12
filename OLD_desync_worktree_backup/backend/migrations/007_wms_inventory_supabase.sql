-- Migration 007: WMS Credentials + Inventory Module for Supabase
-- Este archivo crea todas las tablas necesarias para el módulo de WMS e Inventory
-- Compatible con Supabase PostgreSQL

-- ── WMS Credentials Table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wms_credentials (
  id SERIAL PRIMARY KEY,
  app_key TEXT NOT NULL,
  app_secret_encrypted TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT 'https://api.xlwms.com/openapi/v1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── WMS Cache Table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wms_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wms_cache_expires ON wms_cache(expires_at);

-- ── Inventory Sessions Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
  origin_location TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','closed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inv_sessions_user ON inventory_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_status ON inventory_sessions(status);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_started_at ON inventory_sessions(started_at);

-- ── Inventory Scans Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES inventory_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT NOT NULL,
  barcode TEXT NOT NULL,
  sku TEXT,
  product_name TEXT,
  cell_no TEXT,
  available_stock INTEGER,
  status TEXT NOT NULL CHECK (status IN ('OK','Bloqueado','NoWMS')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_scans_session ON inventory_scans(session_id);
CREATE INDEX IF NOT EXISTS idx_inv_scans_user ON inventory_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_scans_barcode ON inventory_scans(barcode);
CREATE INDEX IF NOT EXISTS idx_inv_scans_created ON inventory_scans(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_scans_status ON inventory_scans(status);
CREATE INDEX IF NOT EXISTS idx_inv_scans_status_created ON inventory_scans(status, created_at);

-- ── RLS (Row Level Security) para Supabase ──────────────────────────────────────
-- NOTA: Este backend usa autenticación JWT propia, no RLS de Supabase
-- Estos triggers son solo para auditoría y sincronización si se requiere

-- ── Update Triggers para updated_at ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_wms_credentials_updated_at
  BEFORE UPDATE ON wms_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ── Cleanup Function para expirar cache antiguo ─────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_wms_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM wms_cache WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Crear extensión pg_cron si no existe para limpiar cache automáticamente
-- NOTA: pg_cron requiere acceso de superusuario, puede no estar disponible en todos los planes de Supabase
-- SELECT cron.schedule('cleanup-wms-cache', '*/15 * * * *', 'SELECT cleanup_expired_wms_cache()');

-- ── Vista para escaneos recientes con información de usuario y sesión ─────────────
CREATE OR REPLACE VIEW inventory_scans_with_details AS
SELECT
  s.id,
  s.session_id,
  s.user_id,
  s.barcode,
  s.sku,
  s.product_name,
  s.cell_no,
  s.available_stock,
  s.status,
  s.created_at,
  u.nombre_completo as user_name,
  u.email as user_email,
  sess.origin_location,
  sess.status as session_status,
  sess.started_at as session_started_at
FROM inventory_scans s
JOIN usuarios u ON s.user_id = u.id
JOIN inventory_sessions sess ON s.session_id = sess.id;

-- ── Vista para resumen de sesiones ────────────────────────────────────────────────
CREATE OR REPLACE VIEW inventory_sessions_summary AS
SELECT
  s.id,
  s.user_id,
  s.origin_location,
  s.status,
  s.started_at,
  s.ended_at,
  u.nombre_completo as user_name,
  COUNT(sc.id) as total_scans,
  COUNT(CASE WHEN sc.status = 'OK' THEN 1 END) as ok_count,
  COUNT(CASE WHEN sc.status = 'Bloqueado' THEN 1 END) as bloqueado_count,
  COUNT(CASE WHEN sc.status = 'NoWMS' THEN 1 END) as nowms_count,
  EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))::int as duration_seconds
FROM inventory_sessions s
LEFT JOIN usuarios u ON s.user_id = u.id
LEFT JOIN inventory_scans sc ON sc.session_id = s.id
GROUP BY s.id, u.nombre_completo;

-- ── Permisos de Inventory y WMS en Roles ──────────────────────────────────────────
-- Agregar permisos de WMS a roles existentes
UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"eliminar"', true)
WHERE nombre = 'Administrador' AND NOT (permisos -> 'global' ? 'wms');

UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"ver"', true)
WHERE nombre = 'Jefe' AND NOT (permisos -> 'global' ? 'wms');

UPDATE roles SET permisos = jsonb_set(permisos, '{global,wms}', '"sin_acceso"', true)
WHERE nombre NOT IN ('Administrador','Jefe') AND NOT (permisos -> 'global' ? 'wms');

-- Agregar permisos de Inventory a roles existentes
UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
  '{"escaneo":"eliminar","historial":"eliminar","reportes":"eliminar"}'::jsonb, true)
WHERE nombre = 'Administrador' AND NOT (permisos ? 'inventory');

UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
  '{"escaneo":"actualizar","historial":"actualizar","reportes":"crear"}'::jsonb, true)
WHERE nombre = 'Jefe' AND NOT (permisos ? 'inventory');

UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
  '{"escaneo":"crear","historial":"ver","reportes":"sin_acceso"}'::jsonb, true)
WHERE nombre = 'Operador' AND NOT (permisos ? 'inventory');

UPDATE roles SET permisos = jsonb_set(permisos, '{inventory}',
  '{"escaneo":"sin_acceso","historial":"ver","reportes":"ver"}'::jsonb, true)
WHERE nombre = 'Usuario' AND NOT (permisos ? 'inventory');

-- ── Comentarios de documentación ──────────────────────────────────────────────────
COMMENT ON TABLE wms_credentials IS 'Almacena credenciales encriptadas del sistema WMS (xlwms)';
COMMENT ON TABLE wms_cache IS 'Cache temporal de respuestas de la API de WMS';
COMMENT ON TABLE inventory_sessions IS 'Sesiones de escaneo de inventario';
COMMENT ON TABLE inventory_scans IS 'Registros individuales de escaneo de inventario';

COMMENT ON COLUMN wms_credentials.app_secret_encrypted IS 'App Secret encriptado con AES-256-CBC';
COMMENT ON COLUMN inventory_sessions.status IS 'Estado de la sesión: active, closed';
COMMENT ON COLUMN inventory_scans.status IS 'Estado del escaneo: OK (stock>0), Bloqueado (stock=0), NoWMS (no encontrado)';

-- ── Finalización ─────────────────────────────────────────────────────────────────
-- Esta migración es idempotente y puede ejecutarse múltiples veces sin errores

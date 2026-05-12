-- Migration: Create DropScan Configuration Tables
-- Description: Add tables for managing scan channels and carriers/shipping companies
-- Date: 2024-03-27

-- Table: canales_escaneo (Scan Channels)
CREATE TABLE IF NOT EXISTS canales_escaneo (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  es_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES usuarios(id),
  updated_by INTEGER REFERENCES usuarios(id)
);

-- Table: empresas_paqueteria (Carriers/Shipping Companies)
CREATE TABLE IF NOT EXISTS empresas_paqueteria (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(7) DEFAULT '#6366f1', -- Hex color for UI
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES usuarios(id),
  updated_by INTEGER REFERENCES usuarios(id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_canales_escaneo_activo ON canales_escaneo(activo);
CREATE INDEX IF NOT EXISTS idx_canales_escaneo_default ON canales_escaneo(es_default);
CREATE INDEX IF NOT EXISTS idx_empresas_paqueteria_activo ON empresas_paqueteria(activo);
CREATE INDEX IF NOT EXISTS idx_empresas_paqueteria_codigo ON empresas_paqueteria(codigo);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_canales_escaneo_updated_at BEFORE UPDATE ON canales_escaneo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_empresas_paqueteria_updated_at BEFORE UPDATE ON empresas_paqueteria
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Constraint: Only one default channel allowed
CREATE UNIQUE INDEX IF NOT EXISTS idx_canales_escaneo_unique_default 
  ON canales_escaneo(es_default) WHERE es_default = true;

-- Insert default data
INSERT INTO canales_escaneo (nombre, descripcion, activo, es_default, created_by) 
VALUES 
  ('Canal Principal', 'Canal de escaneo principal para operaciones generales', true, true, 1),
  ('Canal Secundario', 'Canal alternativo para operaciones especiales', true, false, 1)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO empresas_paqueteria (nombre, codigo, color, activo, created_by)
VALUES
  ('FedEx', 'FEDEX', '#4d148c', true, 1),
  ('DHL', 'DHL', '#ffcc00', true, 1),
  ('UPS', 'UPS', '#351c15', true, 1),
  ('Estafeta', 'ESTAFETA', '#e30613', true, 1),
  ('Redpack', 'REDPACK', '#ed1c24', true, 1)
ON CONFLICT (nombre) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE canales_escaneo IS 'Scan channels configuration for DropScan module';
COMMENT ON TABLE empresas_paqueteria IS 'Shipping companies/carriers configuration for DropScan module';
COMMENT ON COLUMN canales_escaneo.es_default IS 'Indicates if this is the default channel (only one allowed)';
COMMENT ON COLUMN empresas_paqueteria.color IS 'Hex color code for UI representation';

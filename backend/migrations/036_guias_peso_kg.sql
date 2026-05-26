-- Add peso_kg column to guias table for scale weight registration
ALTER TABLE guias ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(10,3);

-- Optional index for report queries that aggregate weight by tarima/folio
CREATE INDEX IF NOT EXISTS idx_guias_peso_kg ON guias (tenant_id, tarima_id) WHERE peso_kg IS NOT NULL;

-- Migration 073: Despacho — tarima validation mode + soft-delete for cancelled folios

-- Enable tarima-grouping mode on folios
ALTER TABLE dispatch_folios
  ADD COLUMN IF NOT EXISTS validar_por_tarimas BOOLEAN NOT NULL DEFAULT false;

-- Soft-delete support (only applied to cancelled folios)
ALTER TABLE dispatch_folios
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Track which tarima a scanned box belongs to (T01, T02, ...)
ALTER TABLE dispatch_order_scans
  ADD COLUMN IF NOT EXISTS tarima_ref TEXT;

-- Index for tarima queries
CREATE INDEX IF NOT EXISTS idx_dispatch_order_scans_tarima
  ON dispatch_order_scans(tenant_id, folio_order_id, tarima_ref)
  WHERE tarima_ref IS NOT NULL;

-- Exclude deleted folios from existing folio-number uniqueness index
DROP INDEX IF EXISTS idx_dispatch_folios_numero;
CREATE UNIQUE INDEX idx_dispatch_folios_numero
  ON dispatch_folios(tenant_id, folio_numero)
  WHERE deleted_at IS NULL;

INSERT INTO schema_migrations (version, description)
VALUES ('073', 'despacho_tarimas_softdelete')
ON CONFLICT (version) DO NOTHING;

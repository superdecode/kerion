-- Migration 074: Despacho — validación v2 (por_orden / por_destino, folio-level scans)

-- Add tipo and destino to folios
ALTER TABLE dispatch_folios
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'por_orden'
    CHECK (tipo IN ('por_orden', 'por_destino'));

ALTER TABLE dispatch_folios
  ADD COLUMN IF NOT EXISTS destino TEXT;

-- Attach scans directly to a folio (needed for por_destino where no order_id is required)
ALTER TABLE dispatch_order_scans
  ADD COLUMN IF NOT EXISTS folio_id UUID REFERENCES dispatch_folios(id) ON DELETE CASCADE;

-- Which order this scan was matched to (client-side match for por_destino)
ALTER TABLE dispatch_order_scans
  ADD COLUMN IF NOT EXISTS matched_order_no TEXT;

-- folio_order_id is now optional (null for por_destino scans)
ALTER TABLE dispatch_order_scans
  ALTER COLUMN folio_order_id DROP NOT NULL;

-- Populate folio_id for all existing rows (backfill from folio_order_id)
UPDATE dispatch_order_scans s
SET folio_id = fo.folio_id
FROM dispatch_folio_orders fo
WHERE s.folio_order_id = fo.id
  AND s.folio_id IS NULL;

-- Index: cross-folio same-day dedup check
CREATE INDEX IF NOT EXISTS idx_dispatch_scans_day_caja
  ON dispatch_order_scans(tenant_id, codigo_caja,
     (date_trunc('day', validated_at AT TIME ZONE 'America/Mexico_City')));

-- Index: fetch all scans for a folio quickly
CREATE INDEX IF NOT EXISTS idx_dispatch_scans_folio
  ON dispatch_order_scans(tenant_id, folio_id, validated_at DESC)
  WHERE folio_id IS NOT NULL;

INSERT INTO schema_migrations (version, description)
VALUES ('074', 'despacho_validar_v2')
ON CONFLICT (version) DO NOTHING;

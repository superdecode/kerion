-- Migration 110: número de lote legible para pick_batches
--
-- pick_batches solo tenía fecha_lote + un UUID: nada que un operador pudiera
-- anotar en un papel o leer en voz alta al confirmar. Se agrega lote_numero
-- con el mismo formato que folio_numero en despacho (LT + fecha + secuencia
-- del día), generado en el servicio al confirmar.

ALTER TABLE pick_batches ADD COLUMN IF NOT EXISTS lote_numero TEXT;

-- Backfill de lotes existentes: secuencia por tenant+día de creación, en el
-- orden en que se confirmaron.
WITH numerados AS (
  SELECT id,
         'LT' || to_char(created_at, 'YYYYMMDD') ||
           lpad(row_number() OVER (
             PARTITION BY tenant_id, to_char(created_at, 'YYYYMMDD')
             ORDER BY created_at
           )::text, 2, '0') AS numero
  FROM pick_batches
  WHERE lote_numero IS NULL
)
UPDATE pick_batches b
SET lote_numero = n.numero
FROM numerados n
WHERE b.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pick_batches_tenant_numero
  ON pick_batches(tenant_id, lote_numero) WHERE lote_numero IS NOT NULL;

INSERT INTO schema_migrations (version, description)
VALUES ('110', 'surtido_pick_batches_numero')
ON CONFLICT (version) DO NOTHING;

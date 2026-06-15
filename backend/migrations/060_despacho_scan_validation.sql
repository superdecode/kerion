-- Migration 060: Despacho - scan validation and destinatario field

-- Add destinatario (receiver/channel) and bultos_esperados (expected count from sheets)
ALTER TABLE dispatch_folio_orders
  ADD COLUMN IF NOT EXISTS destinatario      TEXT,
  ADD COLUMN IF NOT EXISTS bultos_esperados  INTEGER;

-- Scan validation records — one row per scanned box per folio order
CREATE TABLE IF NOT EXISTS dispatch_order_scans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  folio_order_id  UUID NOT NULL REFERENCES dispatch_folio_orders(id) ON DELETE CASCADE,
  codigo_caja     TEXT NOT NULL,
  validated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_by    INTEGER REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_order_scans_order
  ON dispatch_order_scans(tenant_id, folio_order_id, created_at DESC);

-- Prevent duplicate box codes per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_order_scans_unique_caja
  ON dispatch_order_scans(tenant_id, folio_order_id, codigo_caja);

INSERT INTO schema_migrations (version, description)
VALUES ('060', 'despacho_scan_validation')
ON CONFLICT (version) DO NOTHING;

-- ── pick_box_status: per-box incidence tracking ──────────────────────────────
CREATE TABLE IF NOT EXISTS pick_box_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  outbound_order_no TEXT NOT NULL,
  box_code TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','validada','faltante','anormalidad')),
  notas TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pick_box_status_unique
  ON pick_box_status(tenant_id, outbound_order_no, box_code);
CREATE INDEX IF NOT EXISTS idx_pick_box_status_order
  ON pick_box_status(tenant_id, outbound_order_no);

-- ── incidence summary flags on pick_order_tracking ───────────────────────────
ALTER TABLE pick_order_tracking
  ADD COLUMN IF NOT EXISTS tiene_faltantes     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiene_anormalidades BOOLEAN NOT NULL DEFAULT false;

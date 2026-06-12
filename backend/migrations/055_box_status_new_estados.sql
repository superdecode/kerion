-- ── Ensure pick_box_status exists before modifying it ────────────────────────
CREATE TABLE IF NOT EXISTS pick_box_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  outbound_order_no TEXT NOT NULL,
  box_code TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pick_box_status_unique
  ON pick_box_status(tenant_id, outbound_order_no, box_code);
CREATE INDEX IF NOT EXISTS idx_pick_box_status_order
  ON pick_box_status(tenant_id, outbound_order_no);

-- ── Expand pick_box_status CHECK constraint for new estados ─────────────────
ALTER TABLE pick_box_status
  DROP CONSTRAINT IF EXISTS pick_box_status_estado_check;

ALTER TABLE pick_box_status
  ADD CONSTRAINT pick_box_status_estado_check
  CHECK (estado IN ('pendiente','validada','faltante','anormalidad','reparacion','rastreo'));

-- ── Add per-incidence-type flags to pick_order_tracking ───────────────────
ALTER TABLE pick_order_tracking
  ADD COLUMN IF NOT EXISTS tiene_reparacion BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiene_rastreo    BOOLEAN NOT NULL DEFAULT false;

INSERT INTO schema_migrations (version, description)
VALUES ('55', 'box_status_new_estados')
ON CONFLICT (version) DO NOTHING;

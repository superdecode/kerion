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

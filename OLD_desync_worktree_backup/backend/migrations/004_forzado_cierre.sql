-- ============================================
-- Migration 004: Forzado Cierre
-- Description: Track manually force-closed tarimas and fix duration calculation
-- ============================================

-- Add forzado_cierre flag to tarimas
ALTER TABLE tarimas ADD COLUMN IF NOT EXISTS forzado_cierre BOOLEAN DEFAULT FALSE;

-- Backfill: tarimas that were finalized with < 100 guides are likely force-closed
-- (they couldn't have been auto-completed since auto-complete requires exactly 100)
UPDATE tarimas
SET forzado_cierre = true
WHERE estado = 'FINALIZADA'
  AND cantidad_guias < 100
  AND forzado_cierre = false;

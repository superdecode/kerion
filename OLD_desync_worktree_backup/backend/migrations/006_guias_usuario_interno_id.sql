-- ============================================
-- Migration 006: Add usuario_interno_id to guias table
-- Description: Store internal operator ID instead of just cached text name.
--              This allows name changes to propagate to all historical records.
-- ============================================

-- Step 1: Add the column
ALTER TABLE guias
  ADD COLUMN IF NOT EXISTS usuario_interno_id INTEGER REFERENCES usuarios_internos(id);

CREATE INDEX IF NOT EXISTS idx_guias_usuario_interno ON guias(usuario_interno_id);

-- Step 2: Backfill from sesiones_escaneo (most reliable source — has usuario_interno_id)
UPDATE guias g
SET usuario_interno_id = s.usuario_interno_id
FROM sesiones_escaneo s
JOIN tarimas t ON t.id = g.tarima_id
WHERE s.usuario_interno_id IS NOT NULL
  AND g.usuario_interno_id IS NULL
  AND s.operador_id = t.operador_id
  AND s.empresa_id = t.empresa_id
  AND s.canal_id = t.canal_id
  AND DATE(s.fecha_inicio) = DATE(t.fecha_inicio);

-- Step 3: Backfill remaining by matching text name to usuarios_internos
UPDATE guias g
SET usuario_interno_id = ui.id
FROM usuarios_internos ui
WHERE g.usuario_operador = ui.nombre
  AND g.usuario_interno_id IS NULL
  AND ui.eliminado = false;

-- Step 4: Also backfill sesiones_escaneo where usuario_interno_id is NULL but text matches
UPDATE sesiones_escaneo s
SET usuario_interno_id = ui.id
FROM usuarios_internos ui
WHERE s.usuario_operador = ui.nombre
  AND s.usuario_interno_id IS NULL
  AND ui.eliminado = false;

COMMENT ON COLUMN guias.usuario_interno_id IS 'FK to usuarios_internos — source of truth for operator name (propagates changes)';

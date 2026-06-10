-- Migration 049: Add per-module operation limits to plans.
--
-- Adds surtido_limit, inventario_limit, devoluciones_limit to the plans table.
-- FEP is a sub-module of DropScan and shares guide_limit — no separate column needed.
-- NULL means unlimited for any column.
--
-- User-specified values:
--   Trial (7d):     surtido=20,    inventario=1000,    devoluciones=5
--   Básico:         surtido=5000,  inventario=50000,   devoluciones=50
--   Profesional:    surtido=20000, inventario=500000,  devoluciones=500
--   Personalizado:  NULL (ilimitado)

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS surtido_limit      INTEGER,  -- OBCs nuevas/mes, NULL = ilimitado
  ADD COLUMN IF NOT EXISTS inventario_limit   INTEGER,  -- inventory_scans/mes, NULL = ilimitado
  ADD COLUMN IF NOT EXISTS devoluciones_limit INTEGER;  -- dev_sesiones confirmadas/mes, NULL = ilimitado

-- Set limits for known plan codes.  Plans whose code does NOT match keep NULL (unlimited).
UPDATE plans SET
  surtido_limit      = CASE
    WHEN code IN ('trial_7d', 'trial')  THEN 20
    WHEN code IN ('trial_30d')          THEN 20
    WHEN code IN ('basic', 'basico')    THEN 5000
    WHEN code IN ('pro', 'profesional') THEN 20000
    ELSE NULL
  END,
  inventario_limit   = CASE
    WHEN code IN ('trial_7d', 'trial')  THEN 1000
    WHEN code IN ('trial_30d')          THEN 1000
    WHEN code IN ('basic', 'basico')    THEN 50000
    WHEN code IN ('pro', 'profesional') THEN 500000
    ELSE NULL
  END,
  devoluciones_limit = CASE
    WHEN code IN ('trial_7d', 'trial')  THEN 5
    WHEN code IN ('trial_30d')          THEN 5
    WHEN code IN ('basic', 'basico')    THEN 50
    WHEN code IN ('pro', 'profesional') THEN 500
    ELSE NULL
  END;

-- Index for fast limit look-up (join from tenants → plans)
CREATE INDEX IF NOT EXISTS idx_plans_code ON plans(code);

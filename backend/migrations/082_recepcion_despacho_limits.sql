-- Migration 082: Add per-module operation limits for Recepción and Despacho.
--
-- recepcion_limit: inbound_orders created per month (entradas de recepción), NULL = unlimited
-- despacho_limit:  dispatch_folios created per month (folios de despacho),   NULL = unlimited
--
-- Values are left NULL on all plans intentionally — admin must set per plan.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS recepcion_limit INTEGER, -- inbound_orders/mes, NULL = ilimitado
  ADD COLUMN IF NOT EXISTS despacho_limit  INTEGER; -- dispatch_folios/mes, NULL = ilimitado

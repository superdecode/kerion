-- Migration 039: Add Google Sheets data-source configuration to wms_config
-- Idempotent, safe to re-run.

ALTER TABLE wms_config
  ADD COLUMN IF NOT EXISTS sheet_inventory_url text,
  ADD COLUMN IF NOT EXISTS sheet_outbound_url  text;

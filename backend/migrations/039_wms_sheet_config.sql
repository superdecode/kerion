-- Migration 039: Normalize WMS config for Google Sheets data sources
-- Idempotent, safe to re-run.

ALTER TABLE wms_config
  ADD COLUMN IF NOT EXISTS app_key text,
  ADD COLUMN IF NOT EXISTS base_url text DEFAULT 'https://api.xlwms.com/openapi',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS app_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS sheet_inventory_url text,
  ADD COLUMN IF NOT EXISTS sheet_outbound_url  text;

ALTER TABLE wms_config
  ALTER COLUMN app_key DROP NOT NULL,
  ALTER COLUMN base_url DROP NOT NULL;

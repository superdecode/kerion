-- Extend plans table with new fields for full plan management
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS guide_limit INTEGER,
  ADD COLUMN IF NOT EXISTS warehouse_count INTEGER,
  ADD COLUMN IF NOT EXISTS price_annual NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- Update existing plans with defaults
UPDATE plans SET
  guide_limit = NULL,
  warehouse_count = 1,
  price_annual = ROUND(price_amount * 12 * 0.80, 2),
  is_visible = true,
  display_order = CASE code WHEN 'trial_7d' THEN 0 WHEN 'basic' THEN 1 ELSE 2 END
WHERE guide_limit IS NULL;

-- Add request_type and volume to signup_requests for renewal tracking
ALTER TABLE tenant_signup_requests
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'new_tenant'
    CHECK (request_type IN ('new_tenant','renewal')),
  ADD COLUMN IF NOT EXISTS volume TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

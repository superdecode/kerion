-- Migration 031: subscription history fields + inventory tarimas rename
-- Idempotent, safe to re-run.

-- ── Subscriptions: add immutable history fields ─────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS subscription_type TEXT NOT NULL DEFAULT 'monthly'
    CHECK (subscription_type IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS price_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_currency TEXT;

-- Backfill codes and historical metadata for existing rows.
UPDATE subscriptions s
SET
  code = COALESCE(s.code, 'SUB-' || UPPER(SUBSTRING(REPLACE(s.id::text, '-', ''), 1, 12))),
  subscription_type = COALESCE(
    s.subscription_type,
    CASE WHEN p.duration_days IS NOT NULL AND p.duration_days >= 180 THEN 'annual' ELSE 'monthly' END
  ),
  price_amount = COALESCE(s.price_amount, CASE WHEN p.duration_days IS NOT NULL AND p.duration_days >= 180 THEN p.price_annual ELSE p.price_amount END),
  price_currency = COALESCE(s.price_currency, p.price_currency)
FROM plans p
WHERE p.id = s.plan_id;

ALTER TABLE subscriptions
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN subscription_type SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_code ON subscriptions(code);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_expires ON subscriptions(tenant_id, expires_at DESC);

-- ── Rename inventory.historial permission key to inventory.tarimas ──────────
-- Keep the old key as an alias only for legacy compatibility during rollout.
UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{inventory}',
  (permisos->'inventory') || jsonb_build_object(
    'tarimas',
    COALESCE(permisos->'inventory'->'historial', '"sin_acceso"'::jsonb)
  )
)
WHERE permisos->'inventory' IS NOT NULL
  AND NOT (permisos->'inventory' ? 'tarimas');

UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{dropscan}',
  (permisos->'dropscan') || jsonb_build_object(
    'tarimas',
    COALESCE(permisos->'dropscan'->'historial', '"sin_acceso"'::jsonb)
  )
)
WHERE permisos->'dropscan' IS NOT NULL
  AND NOT (permisos->'dropscan' ? 'tarimas');

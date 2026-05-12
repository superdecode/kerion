-- Migration 032: monthly trial
-- Changes default trial from 7 days to 30 days.

-- Update TRIAL_PLAN_CODE to match 'trial_30d' if we decide to change the code too,
-- but for now we'll just update the existing 'trial_7d' duration or add 'trial_30d'.

-- 1. Create trial_30d plan if it doesn't exist
INSERT INTO plans (code, name, duration_days, price_amount, price_currency, is_visible, display_order)
VALUES ('trial_30d', 'Prueba 30 días', 30, 0, 'USD', false, -1)
ON CONFLICT (code) DO UPDATE SET duration_days = 30;

-- 2. Update existing 'trial_7d' to 30 days just in case some logic still points to it
UPDATE plans SET duration_days = 30, name = 'Prueba 30 días' WHERE code = 'trial_7d';

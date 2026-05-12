-- Add timezone field to tenants table
-- Tenants can specify their timezone for subscription expiry calculations
-- Defaults to Mexico City (America/Mexico_City)

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS zona_horaria VARCHAR(50) DEFAULT 'America/Mexico_City';
COMMENT ON COLUMN tenants.zona_horaria IS 'Timezone for subscription expiry display and calculations (e.g. America/Mexico_City)';

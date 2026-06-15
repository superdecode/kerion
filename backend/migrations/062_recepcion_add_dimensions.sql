-- Add OMS dimension and weight columns to inbound_lines
-- Safe to run multiple times (IF NOT EXISTS guards)
ALTER TABLE inbound_lines ADD COLUMN IF NOT EXISTS length_oms     NUMERIC(10,3);
ALTER TABLE inbound_lines ADD COLUMN IF NOT EXISTS width_oms      NUMERIC(10,3);
ALTER TABLE inbound_lines ADD COLUMN IF NOT EXISTS height_oms     NUMERIC(10,3);
ALTER TABLE inbound_lines ADD COLUMN IF NOT EXISTS dimension_unit TEXT;
ALTER TABLE inbound_lines ADD COLUMN IF NOT EXISTS weight_oms     NUMERIC(10,3);
ALTER TABLE inbound_lines ADD COLUMN IF NOT EXISTS weight_unit    TEXT;

INSERT INTO schema_migrations (version, description)
VALUES ('062', 'recepcion_add_dimensions')
ON CONFLICT (version) DO NOTHING;

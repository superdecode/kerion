ALTER TABLE inbound_orders
  ADD COLUMN IF NOT EXISTS validation_config JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO schema_migrations (version, description)
VALUES ('075', 'recepcion_validation_config')
ON CONFLICT (version) DO NOTHING;

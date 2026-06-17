-- Migration 068: Fix inbound_novedades.tenant_id type (was INTEGER, must be UUID)
-- Production table was created by 065 with wrong column types; since all INSERTs
-- failed due to the type mismatch there is no valid data to preserve.
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name   = 'inbound_novedades'
    AND column_name  = 'tenant_id';

  IF col_type = 'integer' THEN
    DROP TABLE IF EXISTS inbound_novedades;

    CREATE TABLE inbound_novedades (
      id          BIGSERIAL PRIMARY KEY,
      tenant_id   UUID NOT NULL REFERENCES tenants(id),
      order_id    UUID NOT NULL REFERENCES inbound_orders(id) ON DELETE CASCADE,
      tipo        VARCHAR(100) NOT NULL,
      codigo      VARCHAR(255),
      ubicacion   VARCHAR(255),
      created_by  INTEGER REFERENCES usuarios(id),
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_inbound_novedades_order ON inbound_novedades(order_id, tenant_id);
  END IF;
END;
$$;

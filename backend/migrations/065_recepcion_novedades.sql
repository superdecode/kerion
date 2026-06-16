-- Tabla de novedades manuales por orden de recepción
CREATE TABLE IF NOT EXISTS inbound_novedades (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  order_id    UUID NOT NULL REFERENCES inbound_orders(id) ON DELETE CASCADE,
  tipo        VARCHAR(100) NOT NULL,
  codigo      VARCHAR(255),
  ubicacion   VARCHAR(255),
  created_by  INTEGER REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_novedades_order ON inbound_novedades(order_id, tenant_id);

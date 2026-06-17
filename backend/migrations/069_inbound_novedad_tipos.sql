-- Migration 069: Dynamic novedad tipos per tenant (recepcion module)
CREATE TABLE IF NOT EXISTS inbound_novedad_tipos (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  nombre     VARCHAR(100) NOT NULL,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_novedad_tipos_nombre
  ON inbound_novedad_tipos(tenant_id, lower(nombre));

CREATE INDEX IF NOT EXISTS idx_inbound_novedad_tipos_tenant
  ON inbound_novedad_tipos(tenant_id, activo);

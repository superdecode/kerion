-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 056 — Submódulo Rastreo (dentro de Inventario)
-- Tablas: rastreo_ordenes, rastreo_cajas, rastreo_historial
-- Seed: código INV-07 en anormalidades_codigos
-- Permisos: inventario.rastreo → role Administrador
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. rastreo_ordenes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rastreo_ordenes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  folio            TEXT NOT NULL,
  outbound_order_no TEXT NULL,
  customer_code    TEXT NULL,
  estado           TEXT NOT NULL DEFAULT 'abierta'
                   CHECK (estado IN ('abierta','en_proceso','resuelta','cerrada')),
  asignado_a       INTEGER NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_por       INTEGER NOT NULL REFERENCES usuarios(id),
  notas            TEXT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, folio)
);

CREATE INDEX IF NOT EXISTS idx_rastreo_ordenes_tenant
  ON rastreo_ordenes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rastreo_ordenes_tenant_estado
  ON rastreo_ordenes (tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_rastreo_ordenes_tenant_asignado
  ON rastreo_ordenes (tenant_id, asignado_a);
CREATE INDEX IF NOT EXISTS idx_rastreo_ordenes_tenant_obn
  ON rastreo_ordenes (tenant_id, outbound_order_no);

ALTER TABLE rastreo_ordenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON rastreo_ordenes;
CREATE POLICY tenant_isolation ON rastreo_ordenes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── 2. rastreo_cajas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rastreo_cajas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rastreo_orden_id    UUID NOT NULL REFERENCES rastreo_ordenes(id) ON DELETE CASCADE,
  box_code            TEXT NOT NULL,
  box_code_normalized TEXT NOT NULL,
  estado_caja         TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado_caja IN ('pendiente','localizada','no_encontrada')),
  ubicacion           TEXT NULL,
  producto            TEXT NULL,
  cantidad_disponible NUMERIC NULL,
  validada_en_surtido BOOLEAN NOT NULL DEFAULT false,
  anormalidad_id      INTEGER NULL REFERENCES anormalidades(id) ON DELETE SET NULL,
  notas               TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rastreo_cajas_orden
  ON rastreo_cajas (tenant_id, rastreo_orden_id);
CREATE INDEX IF NOT EXISTS idx_rastreo_cajas_code
  ON rastreo_cajas (tenant_id, box_code_normalized);

ALTER TABLE rastreo_cajas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON rastreo_cajas;
CREATE POLICY tenant_isolation ON rastreo_cajas
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── 3. rastreo_historial ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rastreo_historial (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rastreo_orden_id UUID NOT NULL REFERENCES rastreo_ordenes(id) ON DELETE CASCADE,
  rastreo_caja_id  UUID NULL REFERENCES rastreo_cajas(id) ON DELETE CASCADE,
  accion           TEXT NOT NULL,
  descripcion      TEXT,
  actor_id         INTEGER NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rastreo_hist_orden
  ON rastreo_historial (tenant_id, rastreo_orden_id, created_at DESC);

ALTER TABLE rastreo_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON rastreo_historial;
CREATE POLICY tenant_isolation ON rastreo_historial
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── 4. Seed INV-07 en anormalidades_codigos ──────────────────────────────────
INSERT INTO anormalidades_codigos (tenant_id, codigo, nombre_es, nombre_zh, proceso, nivel_sugerido, descripcion, activo, es_default)
SELECT
  id,
  'INV-07',
  'Caja en rastreo no encontrada',
  '追踪箱未找到',
  'Inventario',
  'L3',
  'Caja registrada en rastreo confirmada como no localizable',
  true,
  true
FROM tenants
ON CONFLICT (tenant_id, codigo) DO NOTHING;

-- ── 5. Agregar inventario.rastreo al role Administrador de cada tenant ────────
UPDATE roles
SET permisos = jsonb_set(
  COALESCE(permisos, '{}'::jsonb),
  '{inventario,rastreo}',
  '"eliminar"'::jsonb
)
WHERE nombre = 'Administrador';

-- ── 6. schema_migrations record ───────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES (56) ON CONFLICT DO NOTHING;

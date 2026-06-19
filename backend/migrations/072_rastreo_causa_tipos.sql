-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 072 — Catálogo rastreo_causa_tipos + causa_rastreo_id en cajas
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. rastreo_causa_tipos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rastreo_causa_tipos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  area        TEXT NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rastreo_causa_tipos_tenant
  ON rastreo_causa_tipos (tenant_id);

ALTER TABLE rastreo_causa_tipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON rastreo_causa_tipos;
CREATE POLICY tenant_isolation ON rastreo_causa_tipos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── 2. Agregar causa_rastreo_id a rastreo_cajas ───────────────────────────────
ALTER TABLE rastreo_cajas
  ADD COLUMN IF NOT EXISTS causa_rastreo_id UUID NULL
    REFERENCES rastreo_causa_tipos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rastreo_cajas_causa
  ON rastreo_cajas (tenant_id, causa_rastreo_id)
  WHERE causa_rastreo_id IS NOT NULL;

-- ── 3. Permisos administrador ─────────────────────────────────────────────────
UPDATE roles
SET permisos = jsonb_set(
  COALESCE(permisos, '{}'::jsonb),
  '{inventario,rastreo_causas}',
  '"eliminar"'::jsonb
)
WHERE nombre = 'Administrador';

-- ── 4. schema_migrations ──────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES (72) ON CONFLICT DO NOTHING;

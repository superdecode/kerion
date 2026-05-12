-- Migration: Create FEP (Folios de Entrega a Paqueterías) tables
-- Description: Tables for managing delivery folios grouped by carrier (empresa)
-- Date: 2025-01-20

-- ── Folios FEP ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS folios_fep (
  id SERIAL PRIMARY KEY,
  folio VARCHAR(20) NOT NULL UNIQUE,             -- Format: FEP-00001
  empresa_id INTEGER NOT NULL REFERENCES configuraciones(id) ON DELETE RESTRICT,
  estado VARCHAR(20) NOT NULL DEFAULT 'CREADO'   -- CREADO, IMPRESO, CANCELADO
    CHECK (estado IN ('CREADO','IMPRESO','CANCELADO')),
  canal_id INTEGER REFERENCES configuraciones(id) ON DELETE SET NULL,  -- optional filter
  fecha_inicio DATE NOT NULL,                    -- date range filter used during creation
  fecha_fin DATE NOT NULL,
  total_tarimas INTEGER NOT NULL DEFAULT 0,
  total_guias INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  creado_por INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  editado_en TIMESTAMPTZ,
  cancelado_en TIMESTAMPTZ,
  cancelado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  cancelado_razon TEXT,
  impreso_en TIMESTAMPTZ,
  impreso_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ── Junction: folios ↔ tarimas ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS folios_fep_tarimas (
  id SERIAL PRIMARY KEY,
  folio_id INTEGER NOT NULL REFERENCES folios_fep(id) ON DELETE CASCADE,
  tarima_id INTEGER NOT NULL REFERENCES tarimas(id) ON DELETE RESTRICT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (folio_id, tarima_id)
);

-- ── Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_folios_fep_estado ON folios_fep(estado);
CREATE INDEX IF NOT EXISTS idx_folios_fep_empresa ON folios_fep(empresa_id);
CREATE INDEX IF NOT EXISTS idx_folios_fep_creado_por ON folios_fep(creado_por);
CREATE INDEX IF NOT EXISTS idx_folios_fep_creado_en ON folios_fep(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_folios_fep_tarimas_folio ON folios_fep_tarimas(folio_id);
CREATE INDEX IF NOT EXISTS idx_folios_fep_tarimas_tarima ON folios_fep_tarimas(tarima_id);

-- ── Comments ────────────────────────────────────────────────────────────
COMMENT ON TABLE folios_fep IS 'Folios de Entrega a Paqueterías — consolidates tarimas by carrier';
COMMENT ON TABLE folios_fep_tarimas IS 'Junction table linking FEP folios to their tarimas';
COMMENT ON COLUMN folios_fep.folio IS 'Sequential human-readable folio number (FEP-00001)';
COMMENT ON COLUMN folios_fep.estado IS 'Lifecycle: CREADO → IMPRESO → (CANCELADO). Edit only in CREADO state same-day.';
COMMENT ON COLUMN folios_fep.canal_id IS 'Optional channel filter applied during folio creation';

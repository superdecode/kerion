-- Migration 108: Surtido — validación por lote (pick_batches + tarimas)
--
-- Una validación por lote confirma N órdenes a la vez. Cada orden sigue
-- generando su propia pick_sessions con sus pick_events, igual que la
-- validación por orden — pick_batches solo las agrupa y guarda las tarimas
-- con su ubicación. Así Registros, Historial, pick_order_tracking y los
-- exports siguen funcionando sin cambios.

CREATE TABLE IF NOT EXISTS pick_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  fecha_lote DATE NOT NULL,
  operator_id INTEGER REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado','cancelado')),
  total_ordenes INTEGER NOT NULL DEFAULT 0,
  total_cajas INTEGER NOT NULL DEFAULT 0,
  total_tarimas INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  confirmed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pick_batch_tarimas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES pick_batches(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  tarima_ref TEXT NOT NULL,
  ubicacion_nota TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (batch_id, tarima_ref)
);

ALTER TABLE pick_sessions ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES pick_batches(id);
ALTER TABLE pick_events   ADD COLUMN IF NOT EXISTS tarima_ref TEXT;
ALTER TABLE pick_events   ADD COLUMN IF NOT EXISTS forced_date_mismatch BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pick_events   ADD COLUMN IF NOT EXISTS client_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pick_batches_tenant_fecha ON pick_batches(tenant_id, fecha_lote DESC);
CREATE INDEX IF NOT EXISTS idx_pick_batch_tarimas_batch ON pick_batch_tarimas(tenant_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_pick_sessions_batch ON pick_sessions(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pick_events_tarima ON pick_events(session_id, tarima_ref) WHERE tarima_ref IS NOT NULL;

-- Idempotencia del commit: reintentar el mismo lote (por ejemplo si la red se
-- cae justo después del COMMIT) no puede duplicar eventos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pick_events_client_event
  ON pick_events(tenant_id, client_event_id) WHERE client_event_id IS NOT NULL;

-- RLS, mismo patrón que la migración 103.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pick_batches', 'pick_batch_tarimas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('108', 'surtido_pick_batches')
ON CONFLICT (version) DO NOTHING;

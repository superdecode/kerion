-- Migration 109: Surtido — trazabilidad de rechazos en validación por lote
--
-- En el modo por lote, un código escaneado que no se pudo asignar a ninguna
-- caja (o que sí se asignó pero no cuenta como una unidad nueva) no genera un
-- pick_events: no hay sesión a la que atarlo hasta que se sepa a qué orden
-- pertenece. Sin este registro esos escaneos se perdían apenas se cerraba o
-- cancelaba el lote. Se registran en tiempo real, independientes del ciclo de
-- vida del lote (batch_id es opcional y se completa si el lote llega a
-- confirmarse).

CREATE TABLE IF NOT EXISTS pick_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  batch_id UUID REFERENCES pick_batches(id) ON DELETE SET NULL,
  fecha_lote DATE NOT NULL,
  operator_id INTEGER REFERENCES usuarios(id),
  scanned_code TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('not_found', 'ambiguous', 'already_validated', 'duplicate')),
  related_order_no TEXT,
  tarima_ref TEXT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pick_rejections_tenant_fecha ON pick_rejections(tenant_id, fecha_lote DESC);
CREATE INDEX IF NOT EXISTS idx_pick_rejections_batch ON pick_rejections(batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE pick_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pick_rejections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pick_rejections;
CREATE POLICY tenant_isolation ON pick_rejections
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

INSERT INTO schema_migrations (version, description)
VALUES ('109', 'surtido_pick_rejections')
ON CONFLICT (version) DO NOTHING;

-- Reception forced-entry anomalies and effective count tracking

ALTER TABLE inbound_orders
  ADD COLUMN IF NOT EXISTS cajas_registradas INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cajas_forzadas INT NOT NULL DEFAULT 0;

ALTER TABLE inbound_orders
  DROP CONSTRAINT IF EXISTS inbound_orders_estado_check;

ALTER TABLE inbound_orders
  ADD CONSTRAINT inbound_orders_estado_check
  CHECK (estado IN ('pendiente_validacion','en_validacion','completo','parcial','cancelado','anormal'));

ALTER TABLE inbound_novedades
  ADD COLUMN IF NOT EXISTS es_forzada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cuenta_conteo BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_inbound_novedades_order_conteo
  ON inbound_novedades(order_id, tenant_id, cuenta_conteo);

UPDATE inbound_orders o
SET cajas_forzadas = COALESCE((
      SELECT COUNT(*)::int
      FROM inbound_novedades n
      WHERE n.order_id = o.id
        AND n.tenant_id = o.tenant_id
        AND COALESCE(n.cuenta_conteo, true) = true
    ), 0),
    cajas_registradas = COALESCE((
      SELECT COUNT(*)::int
      FROM inbound_lines l
      WHERE l.order_id = o.id
        AND l.tenant_id = o.tenant_id
        AND l.estado_validacion = 'validada'
    ), 0)
      + COALESCE((
        SELECT COUNT(*)::int
        FROM inbound_novedades n
        WHERE n.order_id = o.id
          AND n.tenant_id = o.tenant_id
          AND COALESCE(n.cuenta_conteo, true) = true
      ), 0)
WHERE TRUE;

INSERT INTO schema_migrations (version, description)
VALUES ('088', 'recepcion_anormalidad_forzada')
ON CONFLICT (version) DO NOTHING;

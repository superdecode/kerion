ALTER TABLE rastreo_cajas
  DROP CONSTRAINT IF EXISTS rastreo_cajas_estado_caja_check;

ALTER TABLE rastreo_cajas
  ADD CONSTRAINT rastreo_cajas_estado_caja_check
  CHECK (estado_caja IN ('pendiente','localizada','no_encontrada','cancelada'));

INSERT INTO schema_migrations (version, description)
VALUES ('080', 'rastreo_cajas_cancelada_estado')
ON CONFLICT (version) DO NOTHING;

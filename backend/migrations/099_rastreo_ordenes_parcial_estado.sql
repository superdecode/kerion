-- rastreo_ordenes.estado never allowed 'parcial', even though VALID_ESTADOS /
-- ESTADO_TRANSITIONS in rastreo.routes.js and the frontend estado dropdown have
-- treated it as a valid status since it was introduced. Every attempt to save an
-- order as 'parcial' hits this CHECK constraint and fails with an uncaught 23514
-- (check_violation), which the route's generic catch turns into an opaque 500.
ALTER TABLE rastreo_ordenes
  DROP CONSTRAINT IF EXISTS rastreo_ordenes_estado_check;

ALTER TABLE rastreo_ordenes
  ADD CONSTRAINT rastreo_ordenes_estado_check
  CHECK (estado IN ('abierta','en_proceso','parcial','resuelta','cerrada'));

INSERT INTO schema_migrations (version, description)
VALUES ('099', 'rastreo_ordenes_parcial_estado')
ON CONFLICT (version) DO NOTHING;

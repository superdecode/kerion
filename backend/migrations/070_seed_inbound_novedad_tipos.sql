-- Migration 070: Seed default novedad tipos for all tenants with recepcion module
INSERT INTO inbound_novedad_tipos (tenant_id, nombre)
SELECT t.id, u.nombre
FROM tenants t
CROSS JOIN (VALUES
  ('Caja con Daños'),
  ('Faltante'),
  ('Sobrante'),
  ('Caja Vacía'),
  ('Mercancía Suelta'),
  ('Caja Con Faltante'),
  ('Código Duplicado'),
  ('Producto Dañado'),
  ('Caja Sin Etiqueta'),
  ('SKU Sueltos')
) AS u(nombre)
WHERE EXISTS (
  SELECT 1 FROM tenant_modules tm
  WHERE tm.tenant_id = t.id
    AND tm.module_code = 'recepcion'
    AND tm.enabled = true
)
ON CONFLICT (tenant_id, lower(nombre)) DO NOTHING;

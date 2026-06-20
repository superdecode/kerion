-- Migration 079: Backfill extended module catalog for multi-tenant rollout
-- Ensures tenant_modules and plan module arrays include the newer modules:
-- anormalidades, despacho, recepcion.

INSERT INTO tenant_modules (tenant_id, module_code, enabled, enabled_at, enabled_by, notes)
SELECT t.id, m.module_code, true, now(), 'migration_079', 'backfilled extended module catalog'
FROM tenants t
CROSS JOIN (
  VALUES
    ('dropscan'),
    ('surtido'),
    ('inventario'),
    ('devoluciones'),
    ('anormalidades'),
    ('despacho'),
    ('recepcion')
) AS m(module_code)
LEFT JOIN tenant_modules tm
  ON tm.tenant_id = t.id
 AND tm.module_code = m.module_code
WHERE tm.tenant_id IS NULL;

UPDATE plans
SET modules = COALESCE(modules, '[]'::jsonb)
  || CASE WHEN COALESCE(modules, '[]'::jsonb) @> '["anormalidades"]'::jsonb THEN '[]'::jsonb ELSE '["anormalidades"]'::jsonb END
  || CASE WHEN COALESCE(modules, '[]'::jsonb) @> '["despacho"]'::jsonb THEN '[]'::jsonb ELSE '["despacho"]'::jsonb END
  || CASE WHEN COALESCE(modules, '[]'::jsonb) @> '["recepcion"]'::jsonb THEN '[]'::jsonb ELSE '["recepcion"]'::jsonb END
WHERE modules IS NULL
   OR NOT (modules @> '["anormalidades"]'::jsonb)
   OR NOT (modules @> '["despacho"]'::jsonb)
   OR NOT (modules @> '["recepcion"]'::jsonb);

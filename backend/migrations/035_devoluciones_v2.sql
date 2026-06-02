BEGIN;

-- Per-SKU dimensions (previously at item level, now per individual SKU in multicaja)
ALTER TABLE dev_item_skus
  ADD COLUMN IF NOT EXISTS peso NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS largo NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS ancho NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alto NUMERIC(10,2);

-- Multicaja unique code on items for labeling/search
ALTER TABLE dev_items
  ADD COLUMN IF NOT EXISTS codigo_multicaja TEXT;

CREATE INDEX IF NOT EXISTS idx_dev_items_multicaja ON dev_items(tenant_id, codigo_multicaja)
  WHERE codigo_multicaja IS NOT NULL;

-- Propagated to inventory for filtering/search
ALTER TABLE dev_inventario
  ADD COLUMN IF NOT EXISTS codigo_multicaja TEXT;

CREATE INDEX IF NOT EXISTS idx_dev_inventario_multicaja ON dev_inventario(tenant_id, codigo_multicaja)
  WHERE codigo_multicaja IS NOT NULL;

-- External order reference on salidas
ALTER TABLE dev_salidas
  ADD COLUMN IF NOT EXISTS referencia TEXT;

CREATE INDEX IF NOT EXISTS idx_dev_salidas_referencia ON dev_salidas(tenant_id, referencia)
  WHERE referencia IS NOT NULL;

COMMIT;

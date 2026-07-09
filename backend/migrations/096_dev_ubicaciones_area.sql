-- dev_ubicaciones is shared by two modules (Devoluciones and Inventario). Adds an
-- informational "area" column recording which module's UI created each location,
-- shown as a column/filter in the shared management modal. Existing rows predate
-- this concept and are backfilled as 'inventario' per product decision.
ALTER TABLE dev_ubicaciones ADD COLUMN IF NOT EXISTS area VARCHAR(20) NOT NULL DEFAULT 'inventario';

ALTER TABLE dev_ubicaciones DROP CONSTRAINT IF EXISTS dev_ubicaciones_area_check;
ALTER TABLE dev_ubicaciones ADD CONSTRAINT dev_ubicaciones_area_check
  CHECK (area IN ('devoluciones', 'inventario'));

CREATE INDEX IF NOT EXISTS idx_dev_ubicaciones_area ON dev_ubicaciones(tenant_id, area);

-- Migration 028: Audit tenant_id and protect default records
-- Adds tenant_id to tables that were missing it and adds is_default to roles/usuarios.

-- 1. Protect default records
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- 2. Audit folios_entrega_tarimas
ALTER TABLE folios_entrega_tarimas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
-- Backfill tenant_id from parent folio
UPDATE folios_entrega_tarimas fet
SET tenant_id = fe.tenant_id
FROM folios_entrega fe
WHERE fe.id = fet.folio_id AND fet.tenant_id IS NULL;

-- 3. Audit folios_entrega_log
ALTER TABLE folios_entrega_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
-- Backfill tenant_id from parent folio
UPDATE folios_entrega_log fel
SET tenant_id = fe.tenant_id
FROM folios_entrega fe
WHERE fe.id = fel.folio_id AND fel.tenant_id IS NULL;

-- 4. Ensure indexes and constraints
CREATE INDEX IF NOT EXISTS idx_fet_tenant ON folios_entrega_tarimas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fel_tenant ON folios_entrega_log(tenant_id);

-- 5. Add RLS (already defined in 022 but good to re-ensure if column was missing)
-- RLS policies use 'app.tenant_id' context.

-- 6. Seed is_default for existing admins
-- We'll assume the first user of each tenant might be the default one, 
-- but it's safer to let the provisioning flow handle it for new ones.
-- For existing ones, we can mark es_admin_tenant as is_default if they are the only ones.
UPDATE usuarios SET is_default = true WHERE es_admin_tenant = true;
UPDATE roles SET is_default = true WHERE nombre = 'Administrador';

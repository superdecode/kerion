-- Migration 044: Fix wms_cache primary key to be composite (tenant_id, key).
--
-- Background: wms_cache was created with PK on key TEXT alone. After tenant_id was
-- added (migration 021), two tenants caching the same key string (e.g. a shared WMS
-- endpoint URL) would collide — only one tenant's entry could exist for a given key.
-- The PK must be (tenant_id, key) to allow per-tenant cache entries with the same key.

-- Ensure tenant_id is NOT NULL (should already be from mig 021, but defensive)
ALTER TABLE wms_cache ALTER COLUMN tenant_id SET NOT NULL;

-- Replace single-column PK with composite PK
ALTER TABLE wms_cache DROP CONSTRAINT IF EXISTS wms_cache_pkey;
ALTER TABLE wms_cache ADD PRIMARY KEY (tenant_id, key);

-- Migration 030: Tenant ID Audit Fixes
-- Addresses gaps found during multi-tenant isolation audit.
-- Idempotent: all statements use IF NOT EXISTS / DO NOTHING / IF EXISTS.
-- PREREQ: Migrations 020–028 must be applied.

-- ── 1. wms_cache: missing index on tenant_id ─────────────────────────────────
-- Migration 021 added the tenant_id column and NOT NULL but did not create an index.
CREATE INDEX IF NOT EXISTS idx_wms_cache_tenant ON wms_cache(tenant_id);

-- ── 2. folios_entrega: enforce NOT NULL on tenant_id ─────────────────────────
-- Migration 025 added the column and index but did not enforce NOT NULL.
-- Backfill any remaining NULLs from the creating user's tenant before constraining.
UPDATE folios_entrega fe
SET tenant_id = u.tenant_id
FROM usuarios u
WHERE u.id = fe.creado_por
  AND fe.tenant_id IS NULL
  AND u.tenant_id IS NOT NULL;

-- Only apply NOT NULL if no NULLs remain (guard for environments with orphaned rows).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM folios_entrega WHERE tenant_id IS NULL) THEN
    ALTER TABLE folios_entrega ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END;
$$;

-- ── 3. folios_entrega_tarimas: enforce NOT NULL on tenant_id ─────────────────
-- Migration 028 added the column and index but did not enforce NOT NULL.
-- Backfill any remaining NULLs from parent folio.
UPDATE folios_entrega_tarimas fet
SET tenant_id = fe.tenant_id
FROM folios_entrega fe
WHERE fe.id = fet.folio_id
  AND fet.tenant_id IS NULL
  AND fe.tenant_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM folios_entrega_tarimas WHERE tenant_id IS NULL) THEN
    ALTER TABLE folios_entrega_tarimas ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END;
$$;

-- ── 4. folios_entrega_log: enforce NOT NULL on tenant_id ─────────────────────
-- Migration 028 added the column and index but did not enforce NOT NULL.
-- Backfill any remaining NULLs from parent folio.
UPDATE folios_entrega_log fel
SET tenant_id = fe.tenant_id
FROM folios_entrega fe
WHERE fe.id = fel.folio_id
  AND fel.tenant_id IS NULL
  AND fe.tenant_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM folios_entrega_log WHERE tenant_id IS NULL) THEN
    ALTER TABLE folios_entrega_log ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END;
$$;

-- ── 5. Rename dropscan.historial → dropscan.tarimas in roles.permisos ────────
-- The frontend and new backend code reference 'dropscan.tarimas' but seed data
-- (seed.js, reseed.js, provisioningService.js) used 'historial'.
-- Copy the historial value into a new tarimas key; keep historial for rollback.
-- A follow-up migration should remove historial once all code is updated.
UPDATE roles
SET permisos = jsonb_set(
  permisos,
  '{dropscan}',
  (permisos->'dropscan') || jsonb_build_object(
    'tarimas',
    COALESCE(permisos->'dropscan'->'historial', '"sin_acceso"'::jsonb)
  )
)
WHERE permisos->'dropscan' IS NOT NULL
  AND NOT (permisos->'dropscan' ? 'tarimas');

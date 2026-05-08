# Tenant ID Isolation Audit

Audit date: 2026-05-08  
Scope: All tenant-scoped tables in the Kirion multi-tenant backend.  
Migrations reviewed: 001–028.  
Backend routes reviewed: dropscan, fep, inventory, core modules.

## Legend

| Status | Meaning |
|--------|---------|
| OK | Column exists, FK present, index present, NOT NULL enforced, all backend inserts pass tenant_id |
| FIXED | Gap found; addressed in migration 030 |
| MISSING_IN_CODE | Schema is correct but one or more backend insert paths do not pass tenant_id |

## Table Status

| Table | tenant_id | FK to tenants | Index | NOT NULL | Code inserts | Status |
|-------|-----------|---------------|-------|----------|--------------|--------|
| roles | YES (021) | YES | YES | YES | YES | OK |
| usuarios | YES (021) | YES | YES | YES | YES | OK |
| configuraciones | YES (021) | YES | YES | YES | PARTIAL | MISSING_IN_CODE |
| tarimas | YES (021) | YES | YES | YES | YES | OK |
| guias | YES (021) | YES | YES | YES | YES | OK |
| sesiones_escaneo | YES (021) | YES | YES | YES | YES | OK |
| alertas_duplicados | YES (021) | YES | YES | YES | YES | OK |
| usuarios_internos | YES (021) | YES | YES | YES | YES | OK |
| logs_usuarios_internos | YES (021) | YES | YES | YES | YES | OK |
| wms_credentials | YES (021) | YES | YES | YES | YES | OK |
| wms_cache | YES (021) | YES | NO | YES | N/A (service layer) | FIXED |
| inventory_sessions | YES (021) | YES | YES | YES | YES | OK |
| inventory_scans | YES (021) | YES | YES | YES | YES | OK |
| folios_entrega | YES (025) | YES | YES | NO | YES | FIXED |
| folios_entrega_tarimas | YES (028) | YES | YES | NO | YES | FIXED |
| folios_entrega_log | YES (028) | YES | YES | NO | YES | FIXED |

## Fixes Applied in Migration 030

1. **wms_cache — missing index**: Migration 021 added `tenant_id` column and NOT NULL but omitted the index. Added `idx_wms_cache_tenant`.

2. **folios_entrega — NOT NULL missing**: Migration 025 added `tenant_id` with index but no NOT NULL constraint. Migration 030 backfills NULLs from the creating user's tenant and applies the constraint.

3. **folios_entrega_tarimas — NOT NULL missing**: Migration 028 added `tenant_id` with index but no NOT NULL. Backfilled from parent folio and constraint applied.

4. **folios_entrega_log — NOT NULL missing**: Same situation as folios_entrega_tarimas.

5. **roles.permisos: dropscan.historial renamed to dropscan.tarimas**: The permissions key was inconsistent across code paths. `setup.routes.js` and the frontend use `tarimas`; `seed.js`, `reseed.js`, and `provisioningService.js` still use `historial`. Migration 030 copies the `historial` value into a `tarimas` key for all existing roles that do not already have it, preserving `historial` for rollback safety.

## MISSING_IN_CODE Detail

### configuraciones

The `configuraciones` table has `tenant_id NOT NULL` in the schema, but several insert paths do not supply it:

| File | Line | Issue |
|------|------|-------|
| `src/core/routes/config.routes.js` | 47 | POST /api/config omits tenant_id |
| `src/core/routes/setup.routes.js` | 90 | Initial setup seed omits tenant_id |
| `src/config/seed.js` | 109 | Seed script omits tenant_id |
| `src/config/reseed.js` | 108, 120 | Reseed script omits tenant_id |

The dropscan module routes (`src/modules/dropscan/routes/config.routes.js`) and `provisioningService.js` correctly pass `tenant_id`.

**Action required**: Update the four files above to include `req.tenantId` (or the equivalent tenant context variable) in all INSERT statements for `configuraciones`. The `setup.routes.js` and seed files are run in a context where `req.tenantId` may not be available — they should accept a tenant UUID parameter or be scoped to a specific tenant.

## Permissions Key Inconsistency

The `dropscan.historial` permission key is used in:
- `src/config/seed.js`
- `src/config/reseed.js`
- `src/services/provisioningService.js`
- `src/modules/dropscan/routes/dashboard.routes.js` (requirePermission guard)
- `src/modules/dropscan/routes/tarimas.routes.js` (requirePermission guard)

The `dropscan.tarimas` permission key is used in:
- `src/core/routes/setup.routes.js`
- `src/core/routes/admin.routes.js`

Migration 030 adds the `tarimas` key to all existing role records in the database so that both keys are present during the transition. Once all code references are unified on `tarimas`, a cleanup migration should remove the `historial` key.

## System Tables (No tenant_id Required)

The following tables are system-level and correctly have no tenant_id:
- `tenants`
- `plans`
- `tenant_signup_requests`
- `subscriptions`
- `super_admins`
- `provisioning_log`
- `notifications_outbox`
- `system_audit_log`
- `token_blacklist`
- `audit_log`

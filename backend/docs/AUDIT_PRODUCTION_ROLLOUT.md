# Kirion — Auditoría Pre-Producción Multi-Tenant

**Fecha**: 2026-06-09  
**Auditor**: Arquitecto de Software Senior (Claude Opus, plan mode)  
**Alcance**: Backend, Frontend, Base de Datos, Multi-Tenant, Seguridad  
**Estado**: Fixes críticos aplicados ✓ — Ver sección "Cambios aplicados en esta sesión"

---

## Resumen Ejecutivo

El sistema está bien fundamentado como multi-tenant. El aislamiento de datos vía RLS + JWT está correctamente implementado en los módulos principales. Se identificaron **3 issues críticos**, **8 altos**, **13 medios** y **6 bajos**. Los tres críticos ya fueron corregidos en esta sesión.

---

## CRÍTICOS (corregidos)

### C-1 — Fuga cross-tenant en inventory/history.routes.js
**Archivo**: `backend/src/modules/inventory/routes/history.routes.js` (eliminado)  
**Descripción**: El archivo usaba la función `query()` global (no `req.tQuery`) para consultar `inventory_scans` sin filtro `WHERE tenant_id = $N`. Si el backend se conectara con un rol que no es BYPASSRLS, o si RLS fuera deshabilitada temporalmente, todas las filas de todos los tenants serían visibles.  
**Agravante**: El archivo ni siquiera estaba montado en `server.js` — era código muerto (`/api/inventory/historial` usa `invTarimasRoutes` correctamente). La ruta de reportes dentro del mismo archivo también carecía del filtro.  
**Corrección**: Archivo eliminado. El endpoint `/api/inventory/historial` ya está cubierto por `tarimas.routes.js` con `req.tQuery` y filtro explícito.  
**Verificación**: `ls backend/src/modules/inventory/routes/` — el archivo no debe existir.

### C-2 — pick_events e inv_scans sin tenant_id
**Archivos**: `backend/migrations/041_pick_events_inv_scans_tenant_id.sql`  
**Descripción**: Ambas tablas solo tenían `session_id` FK para derivar el tenant. Cualquier consulta que accediera a ellas directamente sin hacer JOIN con la tabla padre (que sí tiene `tenant_id`) podía exponer datos cross-tenant. La defensa-en-profundidad requería `tenant_id` propio.  
**Corrección**: Migración 041 agrega `tenant_id UUID NOT NULL FK`, backfill desde la tabla padre, índices `(tenant_id)` y `(tenant_id, session_id)`.

### C-3 — God-mode por string en permissions.js
**Archivos**: `backend/src/shared/middleware/permissions.js`, `backend/src/core/stores/authStore.js`  
**Descripción**: `requirePermission` y todos los selectores del frontend bypassaban el sistema de permisos si `rol_nombre === 'Administrador'`. Cualquier operador de un tenant que tuviera un rol con ese string exacto ganaba acceso total, independientemente de sus permisos configurados.  
**Corrección**: Se reemplazó el check de string por `user.es_admin_tenant === true` (booleano en DB). Se mantiene fallback temporal para tokens legacy (`es_admin_tenant === undefined`). `es_admin_tenant` se añadió al JWT payload y a las respuestas de `/auth/login` y `/auth/me`.

---

## ALTOS

### A-1 — RLS sin políticas en tablas operativas nuevas
**Migración**: `042_rls_policies_extended.sql`  
**Tablas**: `pick_sessions, pick_events, inv_sessions, inv_scans, pick_surtidores, pick_order_tracking, pick_manual_reasons, wms_config`  
**Descripción**: El sweep de `server.js:810-818` habilita RLS en todas las tablas públicas pero NO crea políticas `tenant_isolation`. Estas tablas tenían "deny-all para no-BYPASSRLS" de facto, pero sin policy explícita documentada.  
**Corrección**: Migración 042 crea `CREATE POLICY tenant_isolation` con `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` en las 8 tablas.

### A-2 — No existe tenant_modules — módulos a nivel plan global
**Migración**: `043_tenant_modules.sql`  
**Descripción**: No existía forma de habilitar/deshabilitar un módulo para un tenant específico sin editar el plan compartido (afectando todos los tenants del mismo plan). Sin audit trail de quién activó un módulo y cuándo.  
**Corrección**: Tabla `tenant_modules (tenant_id, module_code, enabled, enabled_at/by, disabled_at/by, notes)`. Backfill: todos los tenants existentes obtienen los 4 módulos habilitados. **Nota**: `moduleGuard.js` aún no está cableado a esta tabla (siguiente sesión).

### A-3 — PK de wms_cache colisiona entre tenants
**Migración**: `044_wms_cache_pk_fix.sql`  
**Descripción**: `wms_cache` tiene PK en `key TEXT`. Dos tenants que cachen la misma clave (ej. URL de sheet) se pisan mutuamente; solo un tenant puede tener esa entrada.  
**Corrección**: Migración 044 cambia PK a `(tenant_id, key)`.

### A-4 — JWT sin refresh token, tokens de 24h
**Archivo**: `backend/src/core/routes/auth.routes.js`  
**Descripción**: No existe refresh token. Si el JWT es comprometido, es válido 24h sin revocación posible (salvo logout explícito que blacklistea el `jti`). La blacklist solo se limpia probabilísticamente (10% por logout).  
**Estado**: Documentado como riesgo. Corrección recomendada para siguiente sesión: reducir `JWT_EXPIRES_IN` a 1h y agregar `refresh_tokens` table + endpoint.

### A-5 — Inconsistencia semántica ON DELETE en FKs de tenants
**Descripción**: `dev_*` y `subscriptions/provisioning_log` tienen `ON DELETE CASCADE`. Todas las demás tablas tenant-scoped bloquean el delete. Si algún proceso elimina un tenant, pierde historial de devoluciones pero bloquea en roles/usuarios/etc. No existe `tenants.deleted_at` para soft delete.  
**Recomendación**: Añadir `deleted_at TIMESTAMPTZ` a tenants y cambiar todas las FKs a `ON DELETE RESTRICT`, con proceso de purga documentado.

### A-6 — Admin JWT sin blacklist (super_admin)
**Archivo**: `backend/src/core/routes/admin.routes.js`  
**Descripción**: El token de super_admin no tiene `jti` y no se blacklistea en logout. Una sesión admin comprometida no puede revocarse hasta expirar (12h).  
**Recomendación**: Añadir `jti` al JWT admin + tabla `admin_token_blacklist` con el mismo patrón de `token_blacklist`.

### A-7 — Contraseña inicial en texto plano en notifications_outbox
**Archivo**: `backend/src/services/provisioningService.js:238`  
**Descripción**: La contraseña temporal del tenant admin se almacena en `notifications_outbox.payload` como JSON plano. Si `notifications_outbox` es accesible, la contraseña queda expuesta hasta que el tenant la cambie.  
**Recomendación**: Enviar la contraseña solo por email y almacenar en el outbox únicamente el link de primer acceso (one-time-use token).

### A-8 — Endpoints debug/seed expuestos si NODE_ENV es incorrecto
**Archivo**: `backend/src/config/env.js:13`, `backend/src/core/routes/admin.routes.js:115-156`  
**Descripción**: `/api/admin/seed` y `/api/admin/debug` solo se protegen por `NODE_ENV !== 'production'`. `env.js` defaulta `NODE_ENV` a `'development'`. Un deploy mal configurado (sin `NODE_ENV=production`) expone estos endpoints.  
**Corrección**: Cambiar el default a `'production'` en `env.js` o añadir un check explícito que falle si no se setea.

---

## MEDIOS

### M-1 — Migraciones inline en server.js:165-828 (~650 líneas)
**Descripción**: ~30 tablas/columnas se crean/alteran en `runMigrations()` dentro de `server.js`. Errores se silencian (`console.error('warning: non-fatal')`). No hay rollback, no hay idempotencia garantizada, se ejecutan en cada cold start.  
**Estado**: Documentado. Limpieza planificada para sesión posterior (crear archivos 048..06X).

### M-2 — Migraciones 021 con placeholder REPLACE_WITH_LEGACY_UUID
**Archivo**: `backend/migrations/021_tenant_scope_existing.sql`  
**Descripción**: El backfill de tablas pre-multi-tenant usa el literal `'REPLACE_WITH_LEGACY_UUID'`. Si se corre el SQL file directamente sin sustitución, el backfill inserta UUID inválidos.  
**Recomendación**: Documentar en scripts/run-migration.js que esta migración requiere sustitución.

### M-3 — Composite indexes faltantes
**Migración**: `045_composite_indexes.sql`  
**Tablas afectadas**: `tarimas, sesiones_escaneo, audit_log, folios_entrega, inventory_sessions, dev_item_fotos, dev_salida_items`  
**Corrección**: Migración 045 añade los 7 índices compuestos necesarios para los patrones de consulta más frecuentes.

### M-4 — audit_log sin CHECK constraint para user actions
**Migración**: `047_audit_log_constraint.sql`  
**Descripción**: `audit_log.tenant_id` es nullable. Un error de programación puede generar un log de acción de usuario sin tenant_id, haciendo incompleta la auditoría por tenant.  
**Corrección**: Migración 047 agrega `CHECK (tenant_id IS NOT NULL OR user_id IS NULL)`.

### M-5 — Sin tabla schema_migrations para tracking
**Migración**: `046_schema_migrations_table.sql`  
**Descripción**: No existe registro de qué migraciones se han aplicado en cada entorno. Combinado con las migraciones inline, es imposible conocer el estado exacto del schema.  
**Corrección**: Migración 046 crea la tabla y hace backfill de 001..046.

### M-6 — In-memory Maps sin límite de tamaño
**Archivos**: `backend/src/shared/services/wmsApiClient.js:8,12,15`, `backend/src/modules/wms/routes/wms.routes.js:17-32`  
**Descripción**: `_configCache`, `_inFlight`, `_fieldLogDone`, `_csvCache` son Maps globales de proceso que crecen indefinidamente. En instancias de larga vida (no serverless), esto puede causar memory leak.  
**Recomendación**: Añadir LRU eviction con límite de 1000 entradas o usar un Map con TTL cleanup.

### M-7 — Clave de encriptación WMS acepta claves cortas
**Archivo**: `backend/src/shared/services/wmsCredentials.js:7-10`  
**Descripción**: Si `WMS_ENCRYPTION_KEY` tiene menos de 32 bytes, se rellena con `0x30`. Una clave de 16 bytes resulta en AES-256 con 128 bits efectivos de entropía.  
**Corrección**: Validar en `env.js` que `WMS_ENCRYPTION_KEY.length >= 32` o rechazar el startup.

### M-8 — Rate limiting no aísla tenants ruidosos
**Archivo**: `backend/src/server.js:120-128`  
**Descripción**: Los rate limits son por IP global. Un tenant con muchos usuarios puede DoS a otros tenants si comparten IP (NAT corporativo).  
**Recomendación**: Añadir rate limit por `req.tenantId` en endpoints de alta frecuencia (`/dropscan/scan`, `/wmshub/*`).

### M-9 — console.logs de PII y datos de negocio en producción
**Archivos**:  
- `backend/src/modules/middleware/tenantContext.js:46` — loga Host header + tenant slug  
- `backend/src/core/routes/auth.routes.js:37,44` — loga Host header  
- `frontend/src/modules/SuperAdmin/pages/AdminTenantDetalle.jsx:993` — loga stats de tenant  
- `frontend/src/modules/DropScan/pages/Escaneo.debug.jsx` — loga detalles de guías  
**Recomendación**: Eliminar o rodear con `if (process.env.NODE_ENV !== 'production')`.

### M-10 — localStorage no está scoped por tenant en el frontend
**Archivo**: `frontend/src/core/stores/authStore.js`  
**Descripción**: Varias claves de localStorage no incluyen el slug del tenant: `kirion_surtido_tabs`, `kirion_surtido_active_tab`, `kirion_surtido_dedup`, `kirion_wmshub_outbound_recent_v1`. En workstations compartidas, cambiar de tenant no limpia estas claves.  
**Recomendación**: Usar `${slug}_kirion_surtido_tabs` etc., o limpiar todas las claves `kirion_*` en logout.

### M-11 — Logout incompleto en el frontend
**Archivo**: `frontend/src/core/stores/authStore.js:157-163`  
**Descripción**: El logout limpia `wms-auth` pero no borra: admin token, `kirion_surtido_*`, `kirion_wmshub_outbound_recent_v1`, claves de tour/banner.  
**Recomendación**: En `logout()`, iterar `localStorage` y eliminar todas las claves con prefijo `kirion_`.

### M-12 — usePermissionSync.MODULE_ROUTES está desactualizado
**Archivo**: `frontend/src/core/hooks/usePermissionSync.js:5-17`  
**Descripción**: La lista de rutas modulares no incluye `devoluciones.*`, `surtido.*`, rutas reales de Inventario, y lista rutas inexistentes (`/wms`, `/Inventory/escaneo`). Un usuario cuyo permiso se revoca mientras está en `/Devoluciones/inventario` NO es redirigido.  
**Recomendación**: Actualizar MODULE_ROUTES con las rutas reales de todos los módulos actuales.

### M-13 — JWT en URL durante SSO cross-subdomain
**Archivo**: `frontend/src/core/stores/authStore.js:107`  
**Descripción**: Al hacer login en el dominio principal y redirigir al subdomain del tenant, el JWT se pasa como `?token=` en la URL. El token aparece en browser history, server access logs y Referer headers antes de que `replaceState` lo limpie.  
**Recomendación**: Usar `postMessage` entre ventanas o un token one-time de corta duración para el handoff de subdominio.

---

## BAJOS

### B-1 — Token blacklist con limpieza probabilística
**Archivo**: `backend/src/core/routes/auth.routes.js:366-368`  
**Descripción**: La limpieza de `token_blacklist` tiene 10% de probabilidad por logout. Bajo carga baja, la tabla crece sin límite. Bajo carga alta, se limpia frecuentemente (ineficiente en operación).  
**Recomendación**: Mover la limpieza al `lifecycleScheduler.js` (cron diario).

### B-2 — setTokenFromUrl decodifica JWT sin verificación
**Archivo**: `frontend/src/core/stores/authStore.js:130-137`  
**Descripción**: El JWT del handoff de subdominio se decodifica con `atob` y popula `user` antes de que `/auth/me` responda. Un token manipulado puede brevemente poblar el UI con datos maliciosos.  
**Mitigación actual**: `/auth/me` sobrescribe los datos en la misma animación de frame. Riesgo bajo pero real.

### B-3 — VITE_USE_MOCK_DATA puede quedar activo en producción
**Archivo**: `frontend/src/core/stores/authStore.js:75`, `frontend/src/core/services/mockAuth.js`  
**Descripción**: Si `VITE_USE_MOCK_DATA=true` en producción, cualquiera puede autenticarse con `admin@wms.com / admin123`.  
**Recomendación**: Verificar que el build de producción tiene `VITE_USE_MOCK_DATA=false` o que la variable no exista. Considerar un check de fail-fast en `main.jsx`.

### B-4 — Subscription lookup por started_at (no expires_at)
**Archivo**: `backend/src/modules/middleware/moduleGuard.js`  
**Descripción**: El módulo se resuelve con `ORDER BY started_at DESC LIMIT 1`. Si un tenant tiene dos suscripciones (renovación), gana la más nueva por fecha de inicio, no la de mayor vigencia.  
**Recomendación**: Cambiar a `WHERE status = 'active' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1`.

### B-5 — default NODE_ENV='development' en env.js
**Archivo**: `backend/src/config/env.js:13`  
**Descripción**: Un deploy olvidando setear `NODE_ENV` expone los endpoints debug/seed y activa el fallback CORS de localhost.  
**Corrección**: Cambiar default a `'production'`.

### B-6 — Permiso dropscan.historial vs dropscan.tarimas inconsistente
**Archivo**: `backend/src/shared/middleware/permissions.js:25` (MODULE_ALIASES)  
**Descripción**: El alias existe y resuelve correctamente, pero la clave `historial` sigue siendo usada en el frontend. Debería unificarse a `tarimas` en todos los archivos.  
**Referencia**: `backend/docs/AUDIT_TENANT_ID.md` ya lo documenta.

---

## Tabla de Aislamiento por Tabla

| tabla | fuente | tenant_col | fk | index | not_null | rls_policy | status |
|-------|--------|------------|----|-------|----------|------------|--------|
| roles | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ (mig 022) | ISOLATED |
| usuarios | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| configuraciones | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| tarimas | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| guias | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| sesiones_escaneo | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| alertas_duplicados | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| canales_escaneo | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| empresas_paqueteria | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| usuarios_internos | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| logs_usuarios_internos | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| wms_credentials | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| wms_cache | mig 021/030/044 | tenant_id | ✓ | ✓ (PK compuesta) | ✓ | ✓ | ISOLATED (PK fix mig 044) |
| inventory_sessions | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| inventory_scans | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| folios_fep | mig 021 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| folios_entrega | mig 025/030 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| folios_entrega_tarimas | mig 028/030 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| folios_entrega_log | mig 028/030 | tenant_id | ✓ | ✓ | ✓ | ✓ | ISOLATED |
| dev_* (11 tablas) | mig 034/035/037/038 | tenant_id | ✓ (CASCADE) | ✓ | ✓ | ✓ | ISOLATED |
| pick_sessions | server.js:433 | tenant_id | ✓ | ✓ | ✓ | ✓ (mig 042) | ISOLATED |
| **pick_events** | server.js:454 + **mig 041** | tenant_id | ✓ | ✓ | ✓ | ✓ (mig 042) | **CORREGIDO** |
| inv_sessions | server.js:489 | tenant_id | ✓ | ✓ | ✓ | ✓ (mig 042) | ISOLATED |
| **inv_scans** | server.js:510 + **mig 041** | tenant_id | ✓ | ✓ | ✓ | ✓ (mig 042) | **CORREGIDO** |
| pick_surtidores | server.js:532 | tenant_id | ✓ | ✓ | ✓ | ✓ (mig 042) | ISOLATED |
| pick_order_tracking | server.js:543 | tenant_id | ✓ | ✓ | ✓ | ✓ (mig 042) | ISOLATED |
| pick_manual_reasons | server.js:568 | tenant_id | ✓ | ✓ | ✓ | ✓ (mig 042) | ISOLATED |
| wms_config | server.js + mig 039 | tenant_id | ✓ | ✓ | ✓ | ✓ (mig 042) | ISOLATED |
| **tenant_modules** | **mig 043** | tenant_id | ✓ (CASCADE) | ✓ | ✓ | ✓ | **NUEVO** |
| token_blacklist | mig 021 | tenant_id | ✓ | - | nullable | - | PARTIAL (intencional) |
| audit_log | mig 021/033/047 | tenant_id | ✓ | ✓ | CHECK (mig 047) | - | PARTIAL (nullable para sistema) |
| tenants, plans, subscriptions, super_admins, etc. | mig 020 | - | - | - | - | - | GLOBAL (intencional) |

---

## Cambios Aplicados en Esta Sesión

| # | Tipo | Archivo | Descripción |
|---|------|---------|-------------|
| 1 | Migración | `migrations/041_pick_events_inv_scans_tenant_id.sql` | tenant_id + backfill + NOT NULL + indexes |
| 2 | Migración | `migrations/042_rls_policies_extended.sql` | Políticas tenant_isolation para 8 tablas |
| 3 | Migración | `migrations/043_tenant_modules.sql` | Nueva tabla + backfill todos los módulos |
| 4 | Migración | `migrations/044_wms_cache_pk_fix.sql` | PK compuesta (tenant_id, key) |
| 5 | Migración | `migrations/045_composite_indexes.sql` | 7 índices compuestos en hot tables |
| 6 | Migración | `migrations/046_schema_migrations_table.sql` | Tabla de tracking + backfill 001..046 |
| 7 | Migración | `migrations/047_audit_log_constraint.sql` | CHECK constraint tenant_or_system |
| 8 | Eliminación | `modules/inventory/routes/history.routes.js` | Dead code con fuga cross-tenant |
| 9 | Backend | `shared/middleware/auth.js` | Expone es_admin_tenant en req.fullUser |
| 10 | Backend | `shared/middleware/permissions.js` | Bypass por es_admin_tenant + fallback |
| 11 | Backend | `core/routes/auth.routes.js` | es_admin_tenant en JWT + /auth/me |
| 12 | Frontend | `core/stores/authStore.js` | isTenantAdmin() + 6 selectores actualizados |

---

## Pendientes Para Próximas Sesiones

### Sesión 2 — moduleGuard + Super Admin UI

**Objetivo**: Cablear `tenant_modules` en la aplicación y dar control de módulos al Super Admin.

**Backend**:
- `backend/src/modules/middleware/moduleGuard.js`: leer `tenant_modules` en lugar de `plans.modules`. Mantener fallback a `plans.modules` para tenants sin filas en `tenant_modules` (retrocompatibilidad).
- Nuevo endpoint `GET /api/admin/tenants/:id/modules` — devuelve estado de módulos del tenant.
- Nuevo endpoint `PUT /api/admin/tenants/:id/modules` — enable/disable módulos, registra `enabled_by/disabled_by`.
- Incluir `tenant_modules` en `provisioningService.js` al crear tenant (seed con módulos del plan seleccionado, no todos).

**Frontend**:
- `frontend/src/modules/SuperAdmin/pages/AdminTenants.jsx` — agregar selector de módulos en `CreateTenantModal` (checkboxes para los 4 módulos).
- `frontend/src/modules/SuperAdmin/pages/AdminTenantDetalle.jsx` — agregar `ModulesPanel` con toggle por módulo + audit trail.
- `/auth/me` debería devolver los módulos habilitados del tenant desde `tenant_modules` para el token refresh.

### Sesión 3 — Frontend Module Gating

**Objetivo**: Que el frontend no muestre módulos no habilitados para el tenant.

- `Sidebar.jsx`: filtrar items por `user.modules.includes(moduleCode)` además de `canView`.
- `PermissionRoute.jsx`: agregar check `modulesEnabled.includes(module)` además del permiso.
- `usePermissionSync.js`: actualizar `MODULE_ROUTES` con todas las rutas actuales y hacer redirect si módulo deshabilitado.
- Logout: limpiar todas las claves `kirion_*` de `localStorage`.
- Scoping por tenant en localStorage: prefixar claves por `${user.slug}`.

### Sesión 4 — Cleanup de Migraciones Inline

**Objetivo**: Eliminar el bloque `runMigrations()` de `server.js`.

- Extraer las ~650 líneas de `server.js:165-828` a archivos `048..06X.sql`.
- Actualizar `backend/scripts/run-migration.js` para usar `schema_migrations` (check-before-run).
- Eliminar el bloque de `server.js`, dejar solo la llamada al runner externo.
- Testing en staging antes de deploy a producción.

### Sesión 5 — Tests

**Objetivo**: Suite de tests de aislamiento multi-tenant antes del rollout masivo.

- **Vitest integration tests**:
  - Crear 2 tenants de prueba, verificar que queries de uno NO devuelven datos del otro.
  - Test de `moduleGuard`: tenant con módulo deshabilitado recibe 403.
  - Test de `requirePermission`: usuario sin `es_admin_tenant` con rol="Administrador" SÍ falla (regresión del bypass).
  - Test de provisioning: nuevo tenant tiene 4 filas en `tenant_modules`.
- **Playwright E2E**:
  - Login → navegar módulo habilitado → 200.
  - Deshabilitar módulo via Super Admin → refresh → módulo no visible.
  - URL directa a módulo deshabilitado → redirect a dashboard.
  - Logout → re-login como otro tenant → no residuos de localStorage.

---

## Verificación de Esta Sesión

```bash
# 1. Aplicar migraciones
cd backend && npm run db:migrate

# 2. Verificar correcciones
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pick_events WHERE tenant_id IS NULL;"
# Resultado esperado: 0

psql $DATABASE_URL -c "SELECT COUNT(*) FROM inv_scans WHERE tenant_id IS NULL;"
# Resultado esperado: 0

psql $DATABASE_URL -c "SELECT tenant_id, COUNT(*) FROM tenant_modules GROUP BY tenant_id;"
# Resultado esperado: cada tenant con 4 filas

psql $DATABASE_URL -c "\d wms_cache" | grep PRIMARY
# Resultado esperado: PRIMARY KEY (tenant_id, key)

# 3. Verificar que history.routes.js fue eliminado
ls backend/src/modules/inventory/routes/
# NO debe aparecer history.routes.js

# 4. Build sin errores
cd frontend && npx vite build
# ✓ built in Xs

# 5. Verificar campo en /auth/me (manual)
# Login → GET /api/auth/me → respuesta debe incluir "es_admin_tenant": true/false
```

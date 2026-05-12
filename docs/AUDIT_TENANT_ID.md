# Audit: tenant_id en creación de registros

## Resumen ejecutivo

Auditoría completa de todos los endpoints de escritura para verificar que los nuevos registros almacenan `tenant_id` correctamente, que el middleware RLS está montado correctamente, y que no se usan conexiones raw que bypaseen RLS.

---

## Metodología

Para cada tabla se verificó:
1. Middleware montado correctamente (`tenantContext, tenantDB`)
2. `req.tenantId` defensivo antes de escrituras
3. `tenant_id` explícito en INSERTs
4. Uso de `req.tQuery` / `req.tGetClient` (no `getClient()` raw)
5. RLS activo vía `SET LOCAL app.tenant_id`

---

## Tabla de auditoría

| Tabla | Módulo / Ruta | Bug encontrado | Estado | Corrección aplicada |
|-------|--------------|----------------|--------|---------------------|
| `sesiones_escaneo` | `dropscan/scan.routes.js` POST /sessions/start | Usaba `getClient()` raw (bypass RLS). No filtraba por `tenant_id` en checks previos | CORREGIDO | Migrado a `req.tGetClient()`, filtros `AND tenant_id = $n` en empCheck, canCheck, stale sessions |
| `tarimas` | `dropscan/scan.routes.js` POST /sessions/start | Idem (mismo cliente raw) | CORREGIDO | `req.tGetClient()`, `tenant_id` explícito en INSERT |
| `guias` | `dropscan/scan.routes.js` POST /sessions/:id/scan | Usaba `getClient()` raw + `dupId`/`dupTarimaId` undefined (ReferenceError) | CORREGIDO | `req.tGetClient()`, variables undefined corregidas con `origLocal.id, tarima.id` y `orig.id, orig.tarima_id` |
| `alertas_duplicados` | `dropscan/scan.routes.js` POST /sessions/:id/scan | `dupId`/`dupTarimaId` undefined, INSERT fallaba en cualquier duplicado | CORREGIDO | Variables undefined resueltas, `tenant_id = req.tenantId` explícito |
| `tarimas` (add) | `dropscan/scan.routes.js` POST /sessions/:id/add-tarima | Usaba `getClient()` raw, `empresa_id`/`canal_id` fuera de scope | CORREGIDO | `req.tGetClient()`, valores leídos del objeto `sesion` |
| `tarimas` (switch) | `dropscan/scan.routes.js` POST /sessions/:id/switch-tarima | Usaba `query()` global sin filtro tenant | CORREGIDO | Migrado a `req.tQuery()` con RLS |
| `sesiones_escaneo` (end) | `dropscan/scan.routes.js` POST /sessions/:id/end | Usaba `query()` global sin filtro tenant | CORREGIDO | Migrado a `req.tQuery()` con RLS |
| `sesiones_escaneo` (active) | `dropscan/scan.routes.js` GET /sessions/active | Usaba `query()` global sin filtro tenant | CORREGIDO | Migrado a `req.tQuery()` con RLS |
| `sesiones_escaneo` (all-active) | `dropscan/scan.routes.js` GET /sessions/all-active | Usaba `query()` global sin filtro tenant | CORREGIDO | Migrado a `req.tQuery()` con RLS |
| `folios_entrega_log` | `fep/folios.routes.js` GET /folios/:id/pdf | Usaba `getClient()` raw para log de impresión, `tenant_id` no pasado | CORREGIDO | Migrado a `req.tQuery()` con `tenant_id = req.tenantId` explícito |
| `roles` | `backend/server.js` + `provisioningService.js` | Columna `is_default` no existía → `column "is_default" does not exist` | CORREGIDO | `ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false` en runMigrations() |
| `usuarios` | `backend/server.js` + `provisioningService.js` | Columna `is_default` y `force_password_change` no existían | CORREGIDO | `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false` y `force_password_change BOOLEAN DEFAULT false` |
| `usuarios_internos` | `dropscan/scan.routes.js` | Leído vía `req.tQuery()` con JOIN filtrando `tenant_id` | OK | Sin cambios requeridos |
| `configuraciones` | `dropscan/scan.routes.js` | Filtrado con `AND tenant_id = $n` en todos los SELECTs | OK | Sin cambios requeridos |
| `empresas_paqueteria` | `dropscan/` | Filtrado por RLS en tQuery | OK | Sin cambios requeridos |
| `canales_escaneo` | `dropscan/` | Filtrado por RLS en tQuery | OK | Sin cambios requeridos |
| `folios_entrega` | `fep/folios.routes.js` | `req.tGetClient()` + `tenant_id` explícito en INSERTs principales | OK | Sin cambios requeridos |
| `folios_entrega_tarimas` | `fep/folios.routes.js` | `tenant_id` explícito en INSERT | OK | Sin cambios requeridos |
| `subscriptions` | `admin.routes.js` | Creado por super admin con `tenant_id` explícito | OK | Sin cambios requeridos |
| `tenants` | `admin.routes.js` | Tabla raíz, no requiere `tenant_id` propio | OK | Sin cambios requeridos |
| `notifications_outbox` | `admin.routes.js` | `tenant_id` explícito en INSERT | OK | Sin cambios requeridos |
| `provisioning_log` | `admin.routes.js` | `tenant_id` explícito en INSERT | OK | Sin cambios requeridos |

---

## Correcciones de esquema (migrations)

Añadidas al final del array `runMigrations()` en `backend/src/server.js`:

```sql
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;
```

---

## SQL para registros legacy (sin tenant_id)

Si existen registros históricos con `tenant_id = NULL`, asignar el tenant por defecto:

```sql
-- Reemplazar '550e8400-e29b-41d4-a716-666666888888' con el UUID del tenant principal
UPDATE guias               SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE sesiones_escaneo    SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE tarimas             SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE alertas_duplicados  SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE folios_entrega      SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE folios_entrega_tarimas SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE folios_entrega_log  SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE roles               SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE usuarios            SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE configuraciones     SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE empresas_paqueteria SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
UPDATE canales_escaneo     SET tenant_id = '550e8400-e29b-41d4-a716-666666888888' WHERE tenant_id IS NULL;
```

---

## Patrón correcto para escrituras con tenant

```js
// CORRECTO — tenant-scoped client (incluye BEGIN + SET LOCAL)
const client = await req.tGetClient()
try {
  await client.query('INSERT INTO tabla (col, tenant_id) VALUES ($1, $2)', [val, req.tenantId])
  await client.query('COMMIT')
} catch (err) {
  await client.query('ROLLBACK')
  throw err
} finally {
  client.release()
}

// CORRECTO — para single queries sin transacción
await req.tQuery('INSERT INTO tabla (col, tenant_id) VALUES ($1, $2)', [val, req.tenantId])

// INCORRECTO — bypasea RLS
const client = await getClient()  // NO usar en rutas de tenant
```

---

## Estado final

- **Bugs críticos corregidos:** 10 (undefined vars, raw getClient, missing tenant filters)
- **Tablas sin issues:** 10
- **Migraciones de esquema:** 3 columnas añadidas
- **Fecha de auditoría:** 2026-05-12

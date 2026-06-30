# Configuración de Base de Datos en Supabase

Este documento describe cómo configurar y migrar la base de datos de Kirion a Supabase.

## Pasos de Configuración

### 1. Crear Proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com)
2. Crea un nuevo proyecto
3. Espera a que la base de datos esté lista (puede tomar 2-3 minutos)
4. Copia la siguiente información del dashboard de Supabase:
   - Project URL
   - Database Password
   - API URL (host de PostgreSQL)

### 2. Ejecutar Migraciones en Supabase

> Estado actual: este repo todavía usa el layout legado `backend/migrations/` con
> `backend/scripts/run-migration.js`. No agregues migraciones permanentes desde el
> SQL Editor del dashboard. Para migrar al flujo Supabase CLI, sigue
> `docs/supabase-migrations.md`.

#### Via CLI de Supabase

```bash
# Instalar Supabase CLI si no está instalado
npm install -g supabase

# Login en Supabase
supabase login

# Conectar al proyecto
supabase link --project-ref YOUR_PROJECT_ID

# Ejecutar migraciones gestionadas por CLI despues del cutover
supabase db push
```

#### Via runner legado actual

```bash
cd backend
npm run db:migrate
```

### 3. Configurar Variables de Entorno

Crea el archivo `.env.production` en el directorio `backend/`:

```bash
cp .env.production.example .env.production
```

Edita `.env.production` con tus credenciales de Supabase:

```env
NODE_ENV=production
PORT=3001

# PostgreSQL / Supabase
DB_HOST=db.xxxxxxxxxxxx.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=tu_password_de_supabase
DB_SSL=true

# JWT
JWT_SECRET=usa_un_secreto_seguro_largo_para_produccion
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# CORS - Reemplaza con tu dominio de frontend
CORS_ORIGIN=https://tu-dominio-frontend.com

# WMS encryption key (32 caracteres exactos)
WMS_ENCRYPTION_KEY=usa_32_caracteres_seguros_aqui

# Supabase (opcional)
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=tu_anon_key_aqui
```

### 4. Verificar la Migración

Conéctate a Supabase via SQL Editor y ejecuta:

```sql
-- Verificar tablas creadas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('wms_credentials', 'wms_cache', 'inventory_sessions', 'inventory_scans')
ORDER BY table_name;

-- Verificar vistas creadas
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name LIKE 'inventory_%'
ORDER BY table_name;

-- Verificar índices
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('wms_cache', 'inventory_sessions', 'inventory_scans')
ORDER BY tablename, indexname;

-- Verificar permisos en roles
SELECT nombre, permisos
FROM roles
WHERE permisos ? 'inventory' OR permisos -> 'global' ? 'wms';
```

### 5. Configurar Vercel para Producción

Si estás desplegando en Vercel, agrega las variables de entorno:

1. Ve a tu proyecto en Vercel
2. Settings > Environment Variables
3. Agrega todas las variables del `.env.production`
4. Las variables con "password", "secret", "key" deberían marcarse como "Sensitive"

### 6. Probar la Conexión

Después del despliegue, prueba el endpoint de health:

```bash
curl https://tu-backend-url.vercel.app/api/health
```

Debería retornar:
```json
{
  "status": "ok",
  "timestamp": "2026-04-27T...",
  "version": "1.0.0"
}
```

## Tablas Creadas

### wms_credentials
Almacena las credenciales encriptadas del sistema WMS (xlwms).
- `app_key`: Clave de la API de WMS
- `app_secret_encrypted`: Secret encriptado con AES-256-CBC
- `base_url`: URL base de la API de WMS
- `is_active`: Indica si las credenciales están activas

### wms_cache
Cache temporal de respuestas de la API de WMS.
- `key`: Clave única del cache
- `data`: Datos en formato JSONB
- `expires_at`: Timestamp de expiración

### inventory_sessions
Sesiones de escaneo de inventario.
- `id`: UUID de la sesión
- `user_id`: ID del usuario que inició la sesión
- `origin_location`: Ubicación de origen (opcional)
- `status`: 'active' o 'closed'
- `started_at`: Timestamp de inicio
- `ended_at`: Timestamp de fin (null si está activa)

### inventory_scans
Registros individuales de escaneo de inventario.
- `id`: UUID del escaneo
- `session_id`: UUID de la sesión
- `user_id`: ID del usuario
- `barcode`: Código de barras escaneado
- `sku`: SKU del producto (si existe en WMS)
- `product_name`: Nombre del producto (si existe en WMS)
- `cell_no`: Ubicación en almacén (si existe en WMS)
- `available_stock`: Stock disponible en WMS
- `status`: 'OK', 'Bloqueado', o 'NoWMS'

## Vistas Creadas

### inventory_scans_with_details
Vista que combina escaneos con información de usuario y sesión.

### inventory_sessions_summary
Vista que resume sesiones con contadores de escaneos y duración.

## Funciones Creadas

### update_updated_at_column()
Trigger que actualiza automáticamente el campo `updated_at`.

### cleanup_expired_wms_cache()
Función que elimina entradas de cache expiradas.

## Permisos Agregados

Los siguientes permisos se agregaron automáticamente a los roles existentes:

#### Administrador
- `global.wms`: "eliminar"
- `inventory.escaneo`: "eliminar"
- `inventory.historial`: "eliminar"
- `inventory.reportes`: "eliminar"

#### Jefe
- `global.wms`: "ver"
- `inventory.escaneo`: "actualizar"
- `inventory.historial`: "actualizar"
- `inventory.reportes`: "crear"

#### Operador
- `global.wms`: "sin_acceso"
- `inventory.escaneo`: "crear"
- `inventory.historial`: "ver"
- `inventory.reportes`: "sin_acceso"

#### Usuario
- `global.wms`: "sin_acceso"
- `inventory.escaneo`: "sin_acceso"
- `inventory.historial`: "ver"
- `inventory.reportes`: "ver"

## Troubleshooting

### Error: SSL connection required
Asegúrate de tener `DB_SSL=true` en tus variables de entorno.

### Error: connection timeout
Verifica que el host de Supabase sea correcto y que tu IP tenga acceso (Supabase tiene whitelist de IPs por defecto en algunos planes).

### Error: permission denied for table xxx
Las tablas se crean con el usuario dueño de la base de datos. Si usas un usuario diferente, otorga permisos:

```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tu_usuario;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tu_usuario;
```

### Error: gen_random_uuid() does not exist
Activa la extensión pgcrypto:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## Seguridad

- **Nunca** commitee `.env.production` con contraseñas reales
- Usa variables de entorno en Vercel/GitHub Actions/otros servicios
- El `app_secret` está encriptado con AES-256-CBC en la base de datos
- Usa `DB_SSL=true` en producción para conexiones encriptadas
- El `WMS_ENCRYPTION_KEY` debe ser diferente entre entornos

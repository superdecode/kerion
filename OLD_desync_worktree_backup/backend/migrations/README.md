# DropScan Configuration Module - Migration Guide

## Overview
This migration adds configuration management capabilities to the DropScan module, allowing administrators to manage scan channels and shipping carriers/companies.

## Database Tables Created

### 1. `canales_escaneo` (Scan Channels)
Manages different scanning channels for the DropScan module.

**Columns:**
- `id` - Primary key (auto-increment)
- `nombre` - Channel name (unique, required)
- `descripcion` - Channel description (optional)
- `activo` - Active status (boolean, default: true)
- `es_default` - Default channel flag (boolean, only one allowed)
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp
- `created_by` - User who created the record
- `updated_by` - User who last updated the record

**Features:**
- Only one channel can be marked as default
- Unique constraint on channel names
- Automatic timestamp updates via trigger
- Soft delete support through `activo` flag

### 2. `empresas_paqueteria` (Carriers/Shipping Companies)
Manages shipping companies and carriers for package tracking.

**Columns:**
- `id` - Primary key (auto-increment)
- `nombre` - Company name (unique, required)
- `codigo` - Company code (unique, required, uppercase)
- `color` - Hex color code for UI (default: #6366f1)
- `activo` - Active status (boolean, default: true)
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp
- `created_by` - User who created the record
- `updated_by` - User who last updated the record

**Features:**
- Unique constraints on both name and code
- Color-coded for visual identification in UI
- Automatic timestamp updates via trigger
- Soft delete support through `activo` flag

## Running the Migration

### Option 1: Using the migration script
```bash
cd backend
npm run db:migrate
```

### Option 2: Manual execution
```bash
psql -h <host> -U <user> -d <database> -f migrations/001_create_dropscan_config_tables.sql
```

## Default Data
The migration automatically creates sample data:

**Channels:**
- Canal Principal (default)
- Canal Secundario

**Carriers:**
- FedEx (purple)
- DHL (yellow)
- UPS (brown)
- Estafeta (red)
- Redpack (red)

## API Endpoints

### Channels
- `GET /api/dropscan/config/canales` - List all channels
- `GET /api/dropscan/config/canales/:id` - Get single channel
- `POST /api/dropscan/config/canales` - Create channel
- `PUT /api/dropscan/config/canales/:id` - Update channel
- `DELETE /api/dropscan/config/canales/:id` - Delete channel

### Carriers
- `GET /api/dropscan/config/empresas` - List all carriers
- `GET /api/dropscan/config/empresas/:id` - Get single carrier
- `POST /api/dropscan/config/empresas` - Create carrier
- `PUT /api/dropscan/config/empresas/:id` - Update carrier
- `DELETE /api/dropscan/config/empresas/:id` - Delete carrier

## Permissions Required

All configuration operations require the `dropscan.configuracion` permission with appropriate access levels:
- **leer** (read) - View channels and carriers
- **crear** (create) - Create new channels and carriers
- **editar** (edit) - Modify existing channels and carriers
- **eliminar** (delete) - Delete channels and carriers

## UI Access

The Configuration module is accessible from:
1. Navigate to **DropScan** module in the sidebar
2. Click on **Configuración** menu item
3. Use tabs to switch between:
   - **Canales de Escaneo** - Manage scan channels
   - **Empresas de Paquetería** - Manage carriers

## Business Rules

### Channels
- At least one active channel must exist
- Only one channel can be marked as default
- Cannot delete the default channel (must reassign first)
- Cannot delete channels that are in use by existing tarimas

### Carriers
- Company codes are automatically converted to uppercase
- Color must be a valid hex code (e.g., #FF0000)
- Cannot delete carriers that are in use by existing tarimas

## Rollback

To rollback this migration, execute:

```sql
DROP TABLE IF EXISTS canales_escaneo CASCADE;
DROP TABLE IF EXISTS empresas_paqueteria CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
```

## Future Extensibility

The Configuration module is designed with a tabbed layout that can easily accommodate additional configuration sections without refactoring:

1. Add new database tables as needed
2. Create corresponding API endpoints
3. Add new tab in the UI component
4. Implement CRUD operations following the existing pattern

Example future sections:
- Warehouse locations
- Package types
- Alert thresholds
- Integration settings

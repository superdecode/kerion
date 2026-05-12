#!/bin/bash

# Script para ejecutar la migración de WMS/Inventory en Supabase
# Uso: ./scripts/run-migration-supabase.sh

set -e

echo "🚀 Ejecutando migración de WMS/Inventory en Supabase..."
echo ""

# Verificar que las variables de entorno estén configuradas
if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
  echo "❌ Error: Variables de entorno de base de datos no configuradas"
  echo "Asegúrate de tener las siguientes variables:"
  echo "  - DB_HOST"
  echo "  - DB_USER"
  echo "  - DB_PASSWORD"
  echo ""
  echo "Puedes establecerlas en .env.production o exportarlas:"
  echo "  export DB_HOST=db.xxxxxxxx.supabase.co"
  echo "  export DB_USER=postgres"
  echo "  export DB_PASSWORD=tu_password"
  exit 1
fi

# Cargar variables de entorno si existe .env.production
if [ -f ".env.production" ]; then
  echo "📄 Cargando variables de .env.production..."
  export $(cat .env.production | grep -v '^#' | xargs)
fi

# Verificar que psql esté instalado
if ! command -v psql &> /dev/null; then
  echo "❌ Error: psql no está instalado"
  echo "Instala PostgreSQL o usa el SQL Editor de Supabase directamente"
  exit 1
fi

# Ruta del archivo de migración
MIGRATION_FILE="./migrations/007_wms_inventory_supabase.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Error: No se encuentra el archivo de migración: $MIGRATION_FILE"
  exit 1
fi

# Construir la conexión string
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-postgres}

echo "🔗 Conectando a Supabase..."
echo "  Host: $DB_HOST"
echo "  Puerto: $DB_PORT"
echo "  Base de datos: $DB_NAME"
echo "  Usuario: $DB_USER"
echo ""

# Ejecutar la migración
echo "📝 Ejecutando migración..."
PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migración ejecutada exitosamente"
  echo ""
  echo "📊 Verificando tablas creadas..."
  PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('wms_credentials', 'wms_cache', 'inventory_sessions', 'inventory_scans')
    ORDER BY table_name;
  "
  echo ""
  echo "✨ Listo! El módulo de WMS/Inventory está configurado en Supabase"
else
  echo ""
  echo "❌ Error ejecutando la migración"
  echo "Revisa el mensaje de error arriba para más detalles"
  exit 1
fi

#!/bin/bash

# 🚀 Pixxi Quick Start Script
# Este script inicia todos los servicios necesarios para testing

echo "🚀 Iniciando Pixxi Order App - Localhost Testing"
echo "=================================================="

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Verificar MySQL
echo -e "\n${YELLOW}[1/4] Verificando MySQL...${NC}"
if brew services list | grep -q "mysql.*started"; then
    echo -e "${GREEN}✓ MySQL está corriendo${NC}"
else
    echo -e "${YELLOW}→ Iniciando MySQL...${NC}"
    brew services start mysql
    sleep 3
    echo -e "${GREEN}✓ MySQL iniciado${NC}"
fi

# 2. Verificar Base de Datos
echo -e "\n${YELLOW}[2/4] Verificando Base de Datos...${NC}"
if mysql -u root -e "USE pixxi_ordering_app;" 2>/dev/null; then
    echo -e "${GREEN}✓ Base de datos 'pixxi_ordering_app' existe${NC}"
else
    echo -e "${RED}✗ Base de datos no encontrada${NC}"
    echo -e "${YELLOW}→ Por favor ejecuta:${NC}"
    echo "  mysql -u root -e 'CREATE DATABASE pixxi_ordering_app;'"
    echo "  mysql -u root pixxi_ordering_app < database/pixxi_ordering_app.sql"
    exit 1
fi

# 3. Verificar si el puerto 8000 está en uso
echo -e "\n${YELLOW}[3/4] Verificando Puerto 8000...${NC}"
if lsof -i :8000 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Servidor PHP ya está corriendo en puerto 8000${NC}"
    echo -e "${YELLOW}→ Si necesitas reiniciarlo, ejecuta: pkill -f 'php -S localhost:8000'${NC}"
else
    echo -e "${YELLOW}→ Iniciando servidor PHP...${NC}"
    cd ordering_app-Backend
    php -S localhost:8000 > /tmp/pixxi-php-server.log 2>&1 &
    PHP_PID=$!
    sleep 2
    
    if lsof -i :8000 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Servidor PHP iniciado (PID: $PHP_PID)${NC}"
        echo -e "${GREEN}  Logs: /tmp/pixxi-php-server.log${NC}"
    else
        echo -e "${RED}✗ Error al iniciar servidor PHP${NC}"
        exit 1
    fi
    cd ..
fi

# 4. Test API
echo -e "\n${YELLOW}[4/4] Probando API...${NC}"
API_RESPONSE=$(curl -s http://localhost:8000/api/settings)
if echo "$API_RESPONSE" | grep -q "status"; then
    echo -e "${GREEN}✓ API respondiendo correctamente${NC}"
else
    echo -e "${RED}✗ API no responde correctamente${NC}"
    echo "Response: $API_RESPONSE"
fi

# Resumen
echo -e "\n${GREEN}=================================================="
echo "✅ Todo listo para testing!"
echo "==================================================${NC}"
echo ""
echo "📱 Credenciales de prueba:"
echo "   Email: test@pixxi.com"
echo "   Password: 123456"
echo ""
echo "🌐 URLs importantes:"
echo "   Backend API: http://localhost:8000"
echo "   Admin Panel: http://localhost:8000/auth/login"
echo "   API Test: http://localhost:8000/api/settings"
echo ""
echo "📱 Para el emulador Android:"
echo "   URL API: http://10.0.2.2:8000/"
echo ""
echo "📖 Ver guía completa: cat LOCALHOST_TESTING_GUIDE.md"
echo ""
echo "🛑 Para detener el servidor PHP:"
echo "   pkill -f 'php -S localhost:8000'"
echo ""

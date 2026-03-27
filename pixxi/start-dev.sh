#!/bin/bash
# Pixxi Dev Environment - Start Script

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKEND_DIR="/Users/quiron/CascadeProjects/pixxi/ordering_app-Backend"
LOG_FILE="/tmp/pixxi-php-server.log"

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Pixxi Dev Environment Startup      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}\n"

# 1. MySQL
echo -e "${YELLOW}[1/3] MySQL...${NC}"
if brew services list | grep -q "mysql.*started"; then
    echo -e "${GREEN}✓ MySQL corriendo${NC}"
else
    brew services start mysql
    sleep 3
    echo -e "${GREEN}✓ MySQL iniciado${NC}"
fi

# 2. PHP Server
echo -e "\n${YELLOW}[2/3] Servidor PHP (puerto 8000)...${NC}"
if lsof -i :8000 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ PHP server ya corriendo${NC}"
    echo -e "  (para reiniciar: pkill -f 'php -S localhost:8000')"
else
    cd "$BACKEND_DIR"
    php -S localhost:8000 router.php > "$LOG_FILE" 2>&1 &
    PHP_PID=$!
    sleep 2
    if lsof -i :8000 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PHP server iniciado (PID: $PHP_PID)${NC}"
    else
        echo -e "${RED}✗ Error al iniciar PHP server${NC}"
        cat "$LOG_FILE"
        exit 1
    fi
    cd -
fi

# 3. Test API
echo -e "\n${YELLOW}[3/3] Verificando API...${NC}"
RESP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/settings)
if [ "$RESP" = "200" ]; then
    echo -e "${GREEN}✓ API respondiendo (HTTP 200)${NC}"
else
    echo -e "${RED}✗ API no responde (HTTP $RESP)${NC}"
fi

# Summary
echo -e "\n${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Backend listo para testing${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}\n"
echo -e "📌 URLs:"
echo -e "   Admin Panel:  ${BLUE}http://localhost:8000/admin${NC}"
echo -e "   API Base:     ${BLUE}http://localhost:8000/Api/${NC}"
echo -e "   API Test:     ${BLUE}http://localhost:8000/api/settings${NC}"
echo -e "   Emulador:     ${BLUE}http://10.0.2.2:8000/${NC}\n"
echo -e "🔑 Credenciales admin:"
echo -e "   Email:    test@pixxi.com"
echo -e "   Password: 123456\n"
echo -e "📱 Para Android Studio:"
echo -e "   1. Abrir Android Studio"
echo -e "   2. File > Open > /Users/quiron/CascadeProjects/pixxi/PixxiOrderApp"
echo -e "   3. Crear emulador: Tools > Device Manager > Add (Pixel 5, API 33)"
echo -e "   4. Run ▶️\n"
echo -e "🛑 Para detener: pkill -f 'php -S localhost:8000'\n"

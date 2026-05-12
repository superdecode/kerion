#!/bin/bash

# WMS Hub + Inventory Implementation Verification Script
# Run from monorepo root: ./kerion/docs/verify-implementation.sh

set -e

echo "========================================="
echo "WMS Hub + Inventory Verification"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BACKEND="kerion/backend"
FRONTEND="kerion/frontend"

# Counters
PASS=0
FAIL=0

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $1 (MISSING)"
    ((FAIL++))
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✓${NC} $1 (directory exists)"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $1 (directory missing)"
    ((FAIL++))
  fi
}

echo "=== Backend Files ==="
check_file "$BACKEND/src/shared/services/wmsClient.js"
check_file "$BACKEND/src/shared/services/wmsCredentials.js"
check_file "$BACKEND/src/core/routes/wms.routes.js"
check_file "$BACKEND/src/modules/inventory/routes/scan.routes.js"
check_file "$BACKEND/src/modules/inventory/routes/history.routes.js"
echo ""

echo "=== Backend Directories ==="
check_dir "$BACKEND/src/modules/inventory/routes"
echo ""

echo "=== Frontend Files ==="
check_file "$FRONTEND/src/pages/WmsHub.jsx"
check_file "$FRONTEND/src/core/services/wmsHubService.js"
check_file "$FRONTEND/src/modules/inventory/services/inventoryService.js"
check_file "$FRONTEND/src/modules/inventory/pages/Escaneo.jsx"
check_file "$FRONTEND/src/modules/inventory/pages/Historial.jsx"
check_file "$FRONTEND/src/modules/inventory/pages/Reportes.jsx"
echo ""

echo "=== Frontend Directories ==="
check_dir "$FRONTEND/src/modules/inventory/services"
check_dir "$FRONTEND/src/modules/inventory/pages"
echo ""

echo "=== Modified Files ==="
check_file "$BACKEND/src/server.js"
check_file "$BACKEND/src/config/seed.js"
check_file "$FRONTEND/src/App.jsx"
check_file "$FRONTEND/src/core/components/layout/Sidebar.jsx"
check_file "$FRONTEND/src/core/stores/i18nStore.js"
check_file "$FRONTEND/src/pages/Administracion.jsx"
echo ""

echo "=== Documentation ==="
check_file "kerion/docs/migration-summary.md"
check_file "kerion/docs/test-plan.md"
echo ""

echo "=== Environment ==="
if [ -f "$BACKEND/.env.development" ]; then
  echo -e "${GREEN}✓${NC} $BACKEND/.env.development exists"
  ((PASS++))
else
  echo -e "${YELLOW}⚠${NC} $BACKEND/.env.development not found (may be gitignored)"
fi
echo ""

echo "=== Syntax Check (Backend) ==="
for file in \
  "$BACKEND/src/server.js" \
  "$BACKEND/src/shared/services/wmsClient.js" \
  "$BACKEND/src/shared/services/wmsCredentials.js" \
  "$BACKEND/src/core/routes/wms.routes.js" \
  "$BACKEND/src/modules/inventory/routes/scan.routes.js" \
  "$BACKEND/src/modules/inventory/routes/history.routes.js"
do
  if node -c "$file" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Syntax OK: $file"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} Syntax ERROR: $file"
    ((FAIL++))
  fi
done
echo ""

echo "=== Git Branch ==="
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "feature/wms-hub-inventory" ]; then
  echo -e "${GREEN}✓${NC} On correct branch: $BRANCH"
  ((PASS++))
else
  echo -e "${YELLOW}⚠${NC} Current branch: $BRANCH (expected: feature/wms-hub-inventory)"
fi
echo ""

echo "========================================="
echo "Summary: $PASS passed, $FAIL failed"
echo "========================================="

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}All checks passed!${NC}"
  exit 0
else
  echo -e "${RED}Some checks failed. Please review above.${NC}"
  exit 1
fi

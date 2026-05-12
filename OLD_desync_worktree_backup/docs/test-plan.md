# WMS Hub + Inventory Module — Test Plan

**Date:** 2026-04-27
**Branch:** `feature/wms-hub-inventory`
**Environment:** Development (http://localhost:3001 backend, http://localhost:5173 frontend)

---

## Prerequisites

### 1. Start Services
```bash
# Terminal 1: Backend
cd /Users/quiron/CascadeProjects/kerion/backend
npm start
# Expected: "🏭 WMS Backend v1.0.0 📡 Server running on http://localhost:3001"

# Terminal 2: Frontend
cd /Users/quiron/CascadeProjects/kerion/frontend
npm run dev
# Expected: "VITE v5.x.x ready in xxx ms ➜ Local: http://localhost:5173/"
```

### 2. Verify Database
```bash
# Connect to PostgreSQL
psql -U quiron -d wms_dev

# Check tables exist
\d wms_credentials
\d wms_cache
\d inventory_sessions
\d inventory_scans

# Should show: id, app_key, app_secret_encrypted, base_url, is_active, created_at, updated_at
```

### 3. Verify Environment Variables
```bash
# Backend .env.development should contain:
# WMS_ENCRYPTION_KEY=kirion_wms_dev_key_change_in_prod
# DB_USER=quiron
# DB_PASSWORD=
# DB_NAME=wms_dev
```

---

## Test 1: WMS Hub (Conexión WMS)

### 1.1 Access WMS Hub Page
1. Login as `admin@wms.com` / `admin123`
2. Navigate to **WMS Hub** in sidebar (should see Wifi icon)
3. Expected: Page shows "WMS no configurado" (yellow/amber status)

### 1.2 Configure WMS Credentials
1. Fill in form with test WMS credentials:
   - App Key: `[your-test-app-key]`
   - App Secret: `[your-test-app-secret]`
   - Base URL: `https://api.xlwms.com/openapi/v1` (or test env URL)
2. Click "Guardar"
3. Expected:
   - Toast: "Credenciales guardadas"
   - Status card changes to green: "WMS configurado"
   - Base URL displayed below status

### 1.3 Test WMS Connection
1. Click "Probar conexión"
2. Expected:
   - If WMS is reachable: Toast "Conexión WMS exitosa", green checkmark
   - If WMS down/invalid: Toast with error message, red X
   - Check network tab for POST to `/api/wms/test`

### 1.4 Verify Persistence
1. Refresh page
2. Expected: Credentials still configured (green status), form pre-filled with App Key and Base URL (App Secret masked)

### 1.5 Permission Check
1. Logout and login as `operador@wms.com` / `operador123`
2. Navigate to WMS Hub
3. Expected: Should NOT see WMS Hub in sidebar (Operador role has `global.wms=sin_acceso`)
4. Login as Jefe/Supervisor — should see but not edit (`global.wms=ver`)

---

## Test 2: Inventory Escaneo

### 2.1 Start Session
1. Login as any user with `inventory.escaneo` permission (Admin, Jefe, Operador)
2. Navigate to **Inventario → Escaneo**
3. Click "Iniciar sesión"
4. Expected:
   - Toast: "Sesión iniciada"
   - Timer starts (0:00 increments)
   - Counters show: 0 OK, 0 Bloqueado, 0 NoWMS
   - Barcode input field appears and auto-focuses
5. Check `inventory_sessions` table:
   ```sql
   SELECT * FROM inventory_sessions WHERE status = 'active';
   -- Should show 1 row with user_id, started_at, origin_location=NULL
   ```

### 2.2 Scan OK Item
1. Ensure WMS is configured
2. Scan a barcode that EXISTS in WMS with `availableQty > 0`
3. Expected:
   - Last scan card appears: GREEN, "OK", shows product details (name, SKU, location, stock)
   - Counter increments: 1 OK
   - Input field clears, remains focused
4. Check `inventory_scans` table:
   ```sql
   SELECT * FROM inventory_scans ORDER BY created_at DESC LIMIT 1;
   -- Should show status='OK', available_stock > 0
   ```

### 2.3 Scan Bloqueado Item
1. Scan a barcode that EXISTS in WMS with `availableQty = 0`
2. Expected:
   - Last scan card: AMBER, "Bloqueado", shows product with stock=0
   - Counter: 1 Bloqueado

### 2.4 Scan NoWMS Item
1. Scan a barcode NOT found in WMS inventory
2. Expected:
   - Last scan card: RED, "No en WMS", no product details
   - Counter: 1 NoWMS

### 2.5 Scan Table
1. Scroll below last scan card
2. Expected: Table shows all scans for session with columns:
   - Código (barcode), SKU, Producto, Ubicación (cell_no), Stock, Estado

### 2.6 Close Session
1. Click "Cerrar sesión"
2. Expected:
   - Toast: "Sesión cerrada"
   - Timer stops
   - Input field disappears
   - Button changes back to "Iniciar sesión"
3. Check database:
   ```sql
   SELECT * FROM inventory_sessions WHERE user_id = [your-user-id];
   -- Should show status='closed', ended_at=NOW()
   ```

### 2.7 Auto-Close Stale Sessions
1. Manually update a session to be old (>24h):
   ```sql
   UPDATE inventory_sessions SET started_at = NOW() - INTERVAL '25 hours'
   WHERE status = 'active' AND user_id = [test-user-id];
   ```
2. Try to start new session for same user
3. Expected: Old session auto-closes, new session starts (check logs for "Migration step warning")

### 2.8 Permission Check
1. Login as `Usuario` role (has `inventory.escaneo=sin_acceso`)
2. Try to access Inventario → Escaneo
3. Expected: Redirected to dashboard or 403 error (no sidebar link visible)

---

## Test 3: Inventory Historial

### 3.1 Access History Page
1. Navigate to **Inventario → Historial**
2. Expected: Page loads, table empty or shows previous scans

### 3.2 View All Scans
1. Without filters, observe table
2. Expected: Shows all scans with columns:
   - Código, SKU, Producto, Ubicación, Stock, Estado, Usuario, Fecha

### 3.3 Filter by Status
1. Select "OK" from Estado dropdown
2. Click "Buscar"
3. Expected: Table shows only OK scans, URL updates with `?status=OK`

### 3.4 Filter by Barcode
1. Enter a partial barcode in search field
2. Click "Buscar"
3. Expected: Table shows matching barcodes (ILIKE)

### 3.5 Filter by Date Range
1. Set "Desde" and "Hasta" dates
2. Click "Buscar"
3. Expected: Table shows scans within range (inclusive)

### 3.6 Combined Filters
1. Set status="OK", barcode partial match, date range
2. Click "Buscar"
3. Expected: Results match ALL conditions

### 3.7 Pagination
1. If total > 50, verify pagination controls
2. Click "Next" (chevron right)
3. Expected: Next page loads, URL `?page=2`
4. Click "Previous" (chevron left)
5. Expected: Back to page 1

---

## Test 4: Inventory Reportes

### 4.1 Access Reports Page
1. Navigate to **Inventario → Reportes**
2. Expected: Page loads with KPI cards and charts

### 4.2 Default Date Range
1. Observe default date filters
2. Expected: "Desde" = 7 days ago, "Hasta" = today

### 4.3 KPI Cards
1. Verify 6 cards display:
   - Total escaneos (number)
   - OK (green), Bloqueado (amber), NoWMS (red)
   - Sesiones (purple), Usuarios (violet)
2. Expected: Numbers match total scans in database

### 4.4 Charts Render
1. Check "Escaneos por día" chart (stacked bar)
2. Expected: Bars show OK (green), Bloqueado (amber), NoWMS (red) stacked
3. Check "Distribución por estado" chart (pie)
4. Expected: Pie slices with percentages

### 4.5 Change Date Range
1. Change "Desde" to 30 days ago
2. Click "Aplicar"
3. Expected: Charts refresh with new data, KPIs update

### 4.6 Top 20 Table
1. Scroll to "Top 20 códigos más escaneados"
2. Expected: Table shows rank, barcode, SKU, product, scan count, last status

### 4.7 Empty State
1. Set date range to a future date (no data)
2. Click "Aplicar"
3. Expected: All KPIs show "—", charts show "Sin datos" or empty

---

## Test 5: Integration Tests

### 5.1 End-to-End Scan Flow
1. Login as Operador
2. Go to Inventario → Escaneo
3. Start session
4. Scan 5 barcodes: 2 OK, 1 Bloqueado, 2 NoWMS
5. Close session
6. Go to Historial
7. Filter by date = today
8. Verify all 5 scans appear
9. Go to Reportes
10. Verify KPIs show: 5 total, 2 OK, 1 Bloqueado, 2 NoWMS, 1 session, 1 user

### 5.2 Cache Verification
1. Start a new session
2. Scan a barcode (OK)
3. Immediately scan same barcode again
4. Expected: Second scan returns quickly (cached WMS lookup, 10-min TTL)
5. Wait 10+ minutes, scan again
6. Expected: Still fast (in-memory 5-min credential cache)
7. Check `wms_cache` table:
   ```sql
   SELECT * FROM wms_cache WHERE key = 'inventory:full';
   -- Should exist with expires_at > NOW()
   ```

### 5.3 Error Handling
1. Stop backend server
2. Try to scan barcode
3. Expected: Toast "Error procesando escaneo", network error in console
4. Start backend again
5. Try again
6. Expected: Works normally

---

## Test 6: Permission Matrix

| Rol   | WMS Hub | Inv. Escaneo | Inv. Historial | Inv. Reportes |
|-------|---------|--------------|----------------|---------------|
| Admin | Total   | Total        | Total          | Total         |
| Jefe  | Lectura | Gestion      | Gestion        | Escritura     |
| Oper  | No      | Escritura    | Lectura        | No            |
| User  | No      | No           | Lectura        | Lectura       |

**Test each role:**
1. Login as each role
2. Check sidebar: only visible modules should appear
3. Try to access hidden URLs directly:
   - `/wms` for Operador → 403
   - `/inventory/escaneo` for User → 403
   - `/inventory/reportes` for Operador → 403

---

## Test 7: Backend API Tests (cURL)

### 7.1 WMS Credentials
```bash
# Get credentials (no auth)
curl http://localhost:3001/api/wms/credentials
# Expected: 401 Unauthorized

# Get credentials (with auth)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wms.com","password":"admin123"}' | jq -r '.token')
curl http://localhost:3001/api/wms/credentials \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"configured":false} or {"configured":true,"app_key":"...","base_url":"..."}

# Save credentials
curl -X PUT http://localhost:3001/api/wms/credentials \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"app_key":"test","app_secret":"secret123","base_url":"https://api.xlwms.com/openapi/v1"}'
# Expected: {"ok":true}

# Test connection
curl -X POST http://localhost:3001/api/wms/test \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"ok":true,"message":"Conexión WMS exitosa"} or error
```

### 7.2 Inventory API
```bash
# Start session
SESSION=$(curl -s -X POST http://localhost:3001/api/inventory/sessions/start \
  -H "Authorization: Bearer $TOKEN" | jq -r '.session.id')
echo "Session: $SESSION"

# Get active session
curl http://localhost:3001/api/inventory/sessions/active \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"session":{"id":"$SESSION",...}}

# Scan barcode (replace with real barcode)
curl -X POST http://localhost:3001/api/inventory/scans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION\",\"barcode\":\"TEST123\"}"
# Expected: {"scan":{"id":"uuid","barcode":"TEST123","status":"NoWMS",...}}

# Get session scans
curl http://localhost:3001/api/inventory/scans/$SESSION \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"scans":[...]}

# Close session
curl -X POST http://localhost:3001/api/inventory/sessions/$SESSION/close \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"session":{"id":"$SESSION","status":"closed",...}}

# History
curl "http://localhost:3001/api/inventory/history?page=1&limit=50" \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"scans":[...],"total":N,"page":1,"limit":50}

# Reports
curl "http://localhost:3001/api/inventory/reports" \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"kpi":{...},"by_status":[...],"by_day":[...],"top_scanned":[...]}
```

---

## Test 8: Database Integrity

```sql
-- 1. Check foreign keys
INSERT INTO inventory_scans (session_id, user_id, barcode, status)
VALUES ('00000000-0000-0000-0000-000000000000', 1, 'TEST', 'OK');
-- Expected: ERROR: insert or update on table violates foreign key constraint

-- 2. Check status constraints
INSERT INTO inventory_scans (session_id, user_id, barcode, status)
VALUES (
  (SELECT id FROM inventory_sessions LIMIT 1),
  1, 'TEST', 'INVALID'
);
-- Expected: ERROR: new row for relation violates check constraint

-- 3. Check cascades
-- Delete a session
DELETE FROM inventory_sessions WHERE id = '[session-uuid]';
-- Expected: All related scans deleted (ON DELETE CASCADE)

-- 4. Check permissions JSONB
SELECT nombre, permisos->'global'->'wms' as wms_perm,
       permisos->'inventory' as inv_perm
FROM roles;
-- Expected: Admin has 'eliminar' for both, Operador has 'sin_acceso'/'crear'
```

---

## Test 9: Performance

### 9.1 Cache Hit Rate
```sql
-- Check cache table
SELECT COUNT(*) FROM wms_cache WHERE expires_at > NOW();
-- Expected: 1 row (inventory:full)

-- Scan same barcode 100 times in session
-- Expected: < 5 seconds total (cached WMS lookup)
```

### 9.2 Pagination Performance
```sql
-- Insert 10,000 test scans
-- Then query history
EXPLAIN ANALYZE SELECT * FROM inventory_scans
ORDER BY created_at DESC LIMIT 50 OFFSET 9500;
-- Expected: Uses index on created_at, < 10ms
```

---

## Test 10: Edge Cases

### 10.1 Empty Barcode
1. Leave barcode field blank, click "Escanear"
2. Expected: No action, input remains focused

### 10.2 Duplicate Scans
1. Scan same barcode twice in same session
2. Expected: Both records appear in scans table (no deduplication)

### 10.3 Session Timeout
1. Start session, wait > 24h
2. Try to scan
3. Expected: Error "Sesión inválida o cerrada"

### 10.4 Invalid Session ID
1. Manually change session_id in localStorage to invalid UUID
2. Try to scan
3. Expected: Error handling, auto-redirect or clear state

### 10.5 WMS Offline
1. Block WMS API in network tab
2. Try to scan
3. Expected: Scan still saved with status='NoWMS' (graceful degradation)

---

## Success Criteria

- [ ] All WMS Hub tests pass (configure, test, persist)
- [ ] All Escaneo tests pass (start, scan 3 statuses, close)
- [ ] All Historial filters work (status, barcode, date, pagination)
- [ ] All Reportes charts render correctly with accurate data
- [ ] Permission matrix enforced for all 4 roles
- [ ] Database constraints prevent invalid data
- [ ] Cache reduces WMS API calls
- [ ] Error handling prevents app crashes
- [ ] End-to-end flow works (session → scan → history → reports)

---

## Bug Report Template

If you find issues, document:

```
**Issue:** [Short description]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**

**Actual Behavior:**

**Environment:**
- Browser: 
- User Role: 
- WMS Status: 

**Console Errors:**

**Database State:**
```

---

## Next Steps After Testing

1. **Fix any critical bugs** found during testing
2. **Update test plan** with any additional edge cases
3. **Create PR** from `feature/wms-hub-inventory` to main
4. **Deploy to staging** for UAT with real WMS credentials
5. **Monitor** production metrics after deployment

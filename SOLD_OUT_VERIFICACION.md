# Verificación del Sistema Sold-Out

## ✅ Cambios Implementados

### 1. **Hooks de WooCommerce Agregados**

Se implementaron 5 hooks críticos para controlar la disponibilidad en el front-end:

#### Hook 1: `woocommerce_product_is_in_stock`
- **Función:** `fb_soldout_check_stock()`
- **Propósito:** Controla el estado de stock del producto
- **Línea:** 930

#### Hook 2: `woocommerce_is_purchasable` ⭐ CRÍTICO
- **Función:** `fb_soldout_check_purchasable()`
- **Propósito:** Deshabilita la capacidad de compra del producto
- **Línea:** 926
- **Efecto:** Oculta botones "Agregar al carrito" y previene compras

#### Hook 3: `woocommerce_product_get_stock_status`
- **Función:** `fb_soldout_modify_stock_status()`
- **Propósito:** Cambia el status a 'outofstock' para productos agotados
- **Línea:** 953

#### Hook 4: `woocommerce_add_to_cart_validation`
- **Función:** `fb_soldout_prevent_add_to_cart()`
- **Propósito:** Previene agregar productos agotados al carrito
- **Línea:** 978
- **Efecto:** Muestra mensaje de error personalizado

#### Hook 5: `woocommerce_loop_add_to_cart_link`
- **Función:** `fb_soldout_hide_add_to_cart_button()`
- **Propósito:** Reemplaza botón de compra con badge "🚫 Agotado"
- **Línea:** 1004

### 2. **Sistema de Sincronización Mejorado**

#### Endpoint AJAX: `fb_soldout_sync_branch`
- **Función:** `fb_soldout_ajax_sync_branch()`
- **Línea:** 701
- **Propósito:** Sincroniza la sucursal desde localStorage del modal
- **Acciones:**
  - Guarda en `$_SESSION['foodbook_selected_branch']`
  - Crea cookie `muqui_branch_id` (30 días)
  - Crea cookie `foodbook_branch` (30 días)

#### Función Mejorada: `fb_soldout_get_current_branch()`
- **Línea:** 1063
- **Orden de prioridad:**
  1. Mapping desde Modal Muqui
  2. Parámetros GET/POST (`branch_id`)
  3. Sesión FoodBook
  4. Cookie FoodBook
  5. Cookie Muqui (`muqui_branch_id`)
  6. Fallback: Primera sucursal publicada

### 3. **Estilos CSS para Badge**
- **Función:** `fb_soldout_frontend_styles()`
- **Línea:** 898
- **Clase:** `.fb-soldout-badge`
- **Diseño:** Badge rojo con gradiente y sombra

---

## 🧪 Pruebas de Verificación

### Paso 1: Verificar Persistencia de Datos

```php
// En el admin de WordPress, edita un producto
// Marca una sucursal como "agotada"
// Guarda el producto
// Verifica en la base de datos:

SELECT post_id, meta_key, meta_value 
FROM wp_postmeta 
WHERE post_id = [ID_DEL_PRODUCTO] 
AND meta_key IN ('_fb_sold_out_branches', '_fb_global_sold_out');
```

**Resultado esperado:**
- `_fb_sold_out_branches`: Array con `[branch_id] => 'yes'` o `'no'`
- `_fb_global_sold_out`: `'yes'` o `'no'`

### Paso 2: Verificar Hooks en Front-End

#### A. Activar Modo Debug
Agrega `?debug_soldout` a cualquier URL del sitio:
```
https://tusitio.com/?debug_soldout
```

**Verás un panel negro en la esquina inferior izquierda con:**
- Sucursal actual
- Datos del localStorage del Modal
- Mapping de sedes
- Lista de productos agotados

#### B. Verificar en Consola del Navegador
Abre DevTools (F12) y busca estos mensajes:

```javascript
🚀 Muqui Sold Out: Datos cargados
  - Branch Actual: [ID]
  - Productos agotados: [array]
  - Mapping Sedes: [object]

🔄 Sincronizando sucursal: [Nombre] → ID: [ID]
✅ Sucursal sincronizada en servidor: [data]
✅ Productos agotados actualizados: [N] productos
```

### Paso 3: Verificar Comportamiento en Front-End

#### Test 1: Página de Producto Individual
1. Navega a un producto marcado como agotado
2. **Resultado esperado:**
   - ❌ Botón "Agregar al carrito" NO visible o deshabilitado
   - ✅ Mensaje "Agotado" visible
   - ✅ Overlay azul sobre la imagen (si usas el sistema JS)

#### Test 2: Listado de Productos (Shop/Categorías)
1. Navega a la página de tienda
2. **Resultado esperado:**
   - ❌ Productos agotados muestran badge "🚫 Agotado" en lugar del botón
   - ✅ Badge tiene estilo rojo con gradiente

#### Test 3: Intentar Agregar al Carrito
1. Intenta agregar un producto agotado al carrito (si el botón está visible)
2. **Resultado esperado:**
   - ❌ Producto NO se agrega al carrito
   - ✅ Mensaje de error: "Este producto está agotado en [Sucursal]"

#### Test 4: Cambio de Sucursal
1. Cambia la sucursal en el modal de ubicación
2. Recarga la página
3. **Resultado esperado:**
   - ✅ Los productos agotados cambian según la nueva sucursal
   - ✅ La consola muestra la sincronización

---

## 🔍 Verificación de Datos en Base de Datos

### Query 1: Ver todos los productos con estado agotado
```sql
SELECT p.ID, p.post_title, 
       pm1.meta_value as global_soldout,
       pm2.meta_value as branches_soldout
FROM wp_posts p
LEFT JOIN wp_postmeta pm1 ON p.ID = pm1.post_id AND pm1.meta_key = '_fb_global_sold_out'
LEFT JOIN wp_postmeta pm2 ON p.ID = pm2.post_id AND pm2.meta_key = '_fb_sold_out_branches'
WHERE p.post_type = 'product'
AND p.post_status = 'publish'
AND (pm1.meta_value = 'yes' OR pm2.meta_value IS NOT NULL);
```

### Query 2: Ver sucursales disponibles
```sql
SELECT ID, post_title 
FROM wp_posts 
WHERE post_type = 'branches' 
AND post_status = 'publish'
ORDER BY post_title ASC;
```

---

## 🐛 Troubleshooting

### Problema: Los cambios no se reflejan en el front-end

**Soluciones:**
1. **Limpiar caché de WordPress/WooCommerce:**
   ```php
   // En wp-admin, ir a WooCommerce > Estado > Herramientas
   // Limpiar caché de transients
   ```

2. **Verificar que los hooks se están ejecutando:**
   ```php
   // Agregar al inicio de fb_soldout_check_purchasable():
   error_log('🔍 Hook purchasable ejecutado para producto: ' . $product_id);
   ```

3. **Verificar sesión/cookies:**
   ```javascript
   // En consola del navegador:
   console.log('Cookies:', document.cookie);
   console.log('localStorage:', localStorage.getItem('muqui_location'));
   ```

### Problema: La sucursal no se sincroniza

**Soluciones:**
1. **Verificar el mapping de sedes:**
   - Activar `?debug_soldout`
   - Revisar la sección "Mapping Sedes Modal → WordPress"
   - Verificar que el nombre del modal coincida exactamente

2. **Forzar sincronización manual:**
   ```javascript
   // En consola del navegador:
   fetch('/wp-admin/admin-ajax.php', {
       method: 'POST',
       headers: {'Content-Type': 'application/x-www-form-urlencoded'},
       body: 'action=fb_soldout_sync_branch&location_name=Neiva - San Pedro Plaza'
   })
   .then(r => r.json())
   .then(d => console.log('Sync result:', d));
   ```

### Problema: Los productos siguen apareciendo disponibles

**Verificar:**
1. ¿El producto tiene `_fb_global_sold_out = 'yes'`?
2. ¿El producto tiene la sucursal actual marcada como `'yes'` en `_fb_sold_out_branches`?
3. ¿La función `fb_soldout_get_current_branch()` retorna el ID correcto?

**Test rápido:**
```php
// Agregar temporalmente en functions.php:
add_action('wp_footer', function() {
    if (current_user_can('manage_options')) {
        $branch = fb_soldout_get_current_branch();
        echo '<div style="position:fixed;top:10px;right:10px;background:red;color:white;padding:10px;z-index:9999;">';
        echo 'Branch actual: ' . $branch . ' (' . get_the_title($branch) . ')';
        echo '</div>';
    }
});
```

---

## 📋 Checklist Final

- [ ] Los datos se guardan correctamente en la base de datos
- [ ] El modo debug muestra la información correcta
- [ ] Los productos agotados NO tienen botón "Agregar al carrito"
- [ ] Aparece el badge "🚫 Agotado" en listados
- [ ] No se puede agregar productos agotados al carrito
- [ ] El cambio de sucursal actualiza los productos agotados
- [ ] Las cookies y sesión se crean correctamente
- [ ] El mapping de sedes funciona correctamente

---

## 🎯 Resumen de Archivos Modificados

- **Archivo:** `/Users/quiron/CascadeProjects/Sold-out.php`
- **Líneas modificadas:** 894-1057 (aprox.)
- **Funciones agregadas:**
  - `fb_soldout_frontend_styles()` - Estilos CSS
  - `fb_soldout_check_purchasable()` - Hook purchasable
  - `fb_soldout_modify_stock_status()` - Hook stock status
  - `fb_soldout_prevent_add_to_cart()` - Hook validación carrito
  - `fb_soldout_hide_add_to_cart_button()` - Hook botón en listados
  - `fb_soldout_ajax_sync_branch()` - Endpoint sincronización

---

## 💡 Recomendaciones

1. **Activar WP_DEBUG temporalmente** para ver logs:
   ```php
   // En wp-config.php:
   define('WP_DEBUG', true);
   define('WP_DEBUG_LOG', true);
   define('WP_DEBUG_DISPLAY', false);
   ```

2. **Usar el modo debug** durante las pruebas:
   ```
   https://tusitio.com/?debug_soldout
   ```

3. **Verificar compatibilidad con caché:**
   - Si usas un plugin de caché, exclúyelo de las páginas de productos
   - O configura para que no cachee cookies/sesiones

4. **Monitorear logs de error:**
   ```bash
   tail -f wp-content/debug.log
   ```

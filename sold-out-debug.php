<?php
/**
 * SCRIPT DE DIAGNÓSTICO TEMPORAL - SOLD OUT SYSTEM
 * Agregar este código al final de sold-out.php o incluirlo en functions.php
 * 
 * USO: Agregar ?debug_soldout_deep a cualquier URL
 */

// ============================================
// DIAGNÓSTICO PROFUNDO
// ============================================

add_action('wp_footer', 'fb_soldout_deep_diagnostic', 999);
function fb_soldout_deep_diagnostic() {
    if (!isset($_GET['debug_soldout_deep'])) return;
    
    ?>
    <script>
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DIAGNÓSTICO PROFUNDO - SOLD OUT SYSTEM');
    console.log('═══════════════════════════════════════════════════════');
    </script>
    
    <div id="deep-diagnostic" style="position: fixed; top: 50px; right: 10px; background: #1a1a1a; color: #00ff00; padding: 20px; z-index: 99999; font-family: 'Courier New', monospace; font-size: 11px; max-width: 500px; max-height: 80vh; overflow-y: auto; border: 3px solid #00ff00; border-radius: 8px;">
        <h3 style="color: #00ff00; margin: 0 0 15px 0; border-bottom: 2px solid #00ff00; padding-bottom: 10px;">
            🔍 DIAGNÓSTICO PROFUNDO
        </h3>
        
        <?php
        // TEST 1: Verificar que el archivo está cargado
        echo '<div style="margin-bottom: 15px; padding: 10px; background: #0a0a0a; border-left: 3px solid #00ff00;">';
        echo '<strong style="color: #ffff00;">TEST 1: Archivo Cargado</strong><br>';
        if (function_exists('fb_soldout_check_purchasable')) {
            echo '<span style="color: #00ff00;">✅ sold-out.php está cargado correctamente</span><br>';
        } else {
            echo '<span style="color: #ff0000;">❌ ERROR: sold-out.php NO está cargado</span><br>';
        }
        echo '</div>';
        
        // TEST 2: Verificar sucursal actual
        echo '<div style="margin-bottom: 15px; padding: 10px; background: #0a0a0a; border-left: 3px solid #00ff00;">';
        echo '<strong style="color: #ffff00;">TEST 2: Sucursal Actual</strong><br>';
        $current_branch = fb_soldout_get_current_branch();
        if ($current_branch > 0) {
            $branch_name = get_the_title($current_branch);
            echo '<span style="color: #00ff00;">✅ Sucursal detectada: <strong>' . $branch_name . '</strong> (ID: ' . $current_branch . ')</span><br>';
        } else {
            echo '<span style="color: #ff0000;">❌ ERROR: No se detectó sucursal (ID: 0)</span><br>';
        }
        
        // Mostrar fuentes de detección
        echo '<br><strong>Fuentes de detección:</strong><br>';
        echo '• SESSION: ' . (isset($_SESSION['foodbook_selected_branch']) ? $_SESSION['foodbook_selected_branch'] : 'No definida') . '<br>';
        echo '• COOKIE foodbook_branch: ' . (isset($_COOKIE['foodbook_branch']) ? $_COOKIE['foodbook_branch'] : 'No definida') . '<br>';
        echo '• COOKIE muqui_branch_id: ' . (isset($_COOKIE['muqui_branch_id']) ? $_COOKIE['muqui_branch_id'] : 'No definida') . '<br>';
        echo '</div>';
        
        // TEST 3: Verificar hooks registrados
        echo '<div style="margin-bottom: 15px; padding: 10px; background: #0a0a0a; border-left: 3px solid #00ff00;">';
        echo '<strong style="color: #ffff00;">TEST 3: Hooks Registrados</strong><br>';
        
        global $wp_filter;
        
        $hooks_to_check = [
            'woocommerce_is_purchasable' => 'fb_soldout_check_purchasable',
            'woocommerce_product_is_in_stock' => 'fb_soldout_check_stock',
            'woocommerce_product_get_stock_status' => 'fb_soldout_modify_stock_status',
            'woocommerce_add_to_cart_validation' => 'fb_soldout_prevent_add_to_cart',
            'woocommerce_loop_add_to_cart_link' => 'fb_soldout_hide_add_to_cart_button'
        ];
        
        foreach ($hooks_to_check as $hook => $function) {
            if (isset($wp_filter[$hook])) {
                $found = false;
                foreach ($wp_filter[$hook]->callbacks as $priority => $callbacks) {
                    foreach ($callbacks as $callback) {
                        if (is_array($callback['function']) && $callback['function'][1] === $function) {
                            $found = true;
                            break 2;
                        } elseif ($callback['function'] === $function) {
                            $found = true;
                            break 2;
                        }
                    }
                }
                if ($found) {
                    echo '<span style="color: #00ff00;">✅ ' . $hook . '</span><br>';
                } else {
                    echo '<span style="color: #ff9900;">⚠️ ' . $hook . ' (registrado pero función no encontrada)</span><br>';
                }
            } else {
                echo '<span style="color: #ff0000;">❌ ' . $hook . ' (NO registrado)</span><br>';
            }
        }
        echo '</div>';
        
        // TEST 4: Verificar productos agotados
        echo '<div style="margin-bottom: 15px; padding: 10px; background: #0a0a0a; border-left: 3px solid #00ff00;">';
        echo '<strong style="color: #ffff00;">TEST 4: Productos Agotados</strong><br>';
        
        $all_products = get_posts([
            'post_type' => 'product',
            'post_status' => 'publish',
            'posts_per_page' => 10,
            'fields' => 'ids'
        ]);
        
        echo 'Analizando primeros 10 productos...<br><br>';
        
        $soldout_count = 0;
        foreach ($all_products as $product_id) {
            $is_global = get_post_meta($product_id, '_fb_global_sold_out', true) === 'yes';
            $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
            
            $is_soldout_current = false;
            if ($is_global) {
                $is_soldout_current = true;
            } elseif (is_array($sold_out_data) && isset($sold_out_data[$current_branch]) && $sold_out_data[$current_branch] === 'yes') {
                $is_soldout_current = true;
            }
            
            if ($is_soldout_current) {
                $soldout_count++;
                $product_name = get_the_title($product_id);
                echo '<span style="color: #ff9900;">🚫 ' . $product_name . ' (ID: ' . $product_id . ')</span><br>';
                
                if ($is_global) {
                    echo '   └─ Tipo: <strong>GLOBAL</strong><br>';
                } else {
                    echo '   └─ Tipo: <strong>SEDE ESPECÍFICA</strong><br>';
                }
            }
        }
        
        if ($soldout_count === 0) {
            echo '<span style="color: #00ff00;">✅ No hay productos agotados en esta sucursal</span><br>';
        } else {
            echo '<br><strong>Total agotados: ' . $soldout_count . '</strong><br>';
        }
        echo '</div>';
        
        // TEST 5: Probar hook en producto específico
        if (is_product()) {
            global $product;
            if ($product) {
                echo '<div style="margin-bottom: 15px; padding: 10px; background: #0a0a0a; border-left: 3px solid #ffff00;">';
                echo '<strong style="color: #ffff00;">TEST 5: Producto Actual (Página Individual)</strong><br>';
                echo 'Producto: <strong>' . $product->get_name() . '</strong> (ID: ' . $product->get_id() . ')<br><br>';
                
                // Verificar datos en BD
                $is_global = get_post_meta($product->get_id(), '_fb_global_sold_out', true);
                $sold_out_data = get_post_meta($product->get_id(), '_fb_sold_out_branches', true);
                
                echo '<strong>Datos en BD:</strong><br>';
                echo '• _fb_global_sold_out: ' . ($is_global === 'yes' ? '<span style="color: #ff0000;">YES</span>' : '<span style="color: #00ff00;">NO</span>') . '<br>';
                echo '• _fb_sold_out_branches: ';
                if (is_array($sold_out_data)) {
                    echo '<br>';
                    foreach ($sold_out_data as $branch_id => $status) {
                        $branch_name = get_the_title($branch_id);
                        $color = $status === 'yes' ? '#ff0000' : '#00ff00';
                        $icon = $status === 'yes' ? '🚫' : '✅';
                        echo '   ' . $icon . ' ' . $branch_name . ' (ID: ' . $branch_id . '): <span style="color: ' . $color . ';">' . strtoupper($status) . '</span><br>';
                    }
                } else {
                    echo 'No definido<br>';
                }
                
                echo '<br><strong>Resultado de Hooks:</strong><br>';
                
                // Test is_purchasable
                $is_purchasable = $product->is_purchasable();
                echo '• is_purchasable(): <span style="color: ' . ($is_purchasable ? '#00ff00' : '#ff0000') . ';">' . ($is_purchasable ? 'TRUE (comprable)' : 'FALSE (NO comprable)') . '</span><br>';
                
                // Test is_in_stock
                $is_in_stock = $product->is_in_stock();
                echo '• is_in_stock(): <span style="color: ' . ($is_in_stock ? '#00ff00' : '#ff0000') . ';">' . ($is_in_stock ? 'TRUE (en stock)' : 'FALSE (sin stock)') . '</span><br>';
                
                // Test stock_status
                $stock_status = $product->get_stock_status();
                echo '• get_stock_status(): <span style="color: ' . ($stock_status === 'instock' ? '#00ff00' : '#ff0000') . ';">' . strtoupper($stock_status) . '</span><br>';
                
                echo '</div>';
            }
        }
        
        // TEST 6: Verificar mapping de sedes
        echo '<div style="margin-bottom: 15px; padding: 10px; background: #0a0a0a; border-left: 3px solid #00ff00;">';
        echo '<strong style="color: #ffff00;">TEST 6: Mapping de Sedes</strong><br>';
        $branches_mapping = fb_soldout_get_branches_mapping();
        if (!empty($branches_mapping)) {
            echo '<span style="color: #00ff00;">✅ Mapping configurado (' . count($branches_mapping) . ' entradas)</span><br><br>';
            foreach ($branches_mapping as $modal_name => $wp_id) {
                $wp_name = get_the_title($wp_id);
                echo '• <strong>' . $modal_name . '</strong> → ID: ' . $wp_id . ' (' . $wp_name . ')<br>';
            }
        } else {
            echo '<span style="color: #ff0000;">❌ No hay mapping configurado</span><br>';
        }
        echo '</div>';
        
        ?>
        
        <div style="margin-top: 20px; padding: 10px; background: #0a0a0a; border: 2px solid #ffff00;">
            <strong style="color: #ffff00;">💡 ACCIONES RECOMENDADAS:</strong><br><br>
            1. Revisa la consola del navegador (F12)<br>
            2. Verifica que WooCommerce esté activo<br>
            3. Limpia el caché de WordPress/WooCommerce<br>
            4. Verifica que el producto tenga stock > 0<br>
            5. Comprueba que no haya otros plugins conflictivos<br>
        </div>
        
        <button onclick="document.getElementById('deep-diagnostic').remove();" style="margin-top: 15px; padding: 10px 20px; background: #ff0000; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
            CERRAR DIAGNÓSTICO
        </button>
    </div>
    
    <script>
    // Log adicional en consola
    console.log('📊 Sucursal actual:', <?php echo $current_branch; ?>);
    console.log('📦 Productos analizados:', <?php echo count($all_products); ?>);
    console.log('🚫 Productos agotados:', <?php echo $soldout_count; ?>);
    console.log('═══════════════════════════════════════════════════════');
    </script>
    <?php
}

// ============================================
// LOGS EN HOOKS (para debug en consola PHP)
// ============================================

add_filter('woocommerce_is_purchasable', 'fb_soldout_debug_purchasable', 999, 2);
function fb_soldout_debug_purchasable($is_purchasable, $product) {
    if (isset($_GET['debug_soldout_deep']) && defined('WP_DEBUG') && WP_DEBUG) {
        $product_id = $product->get_id();
        $current_branch = fb_soldout_get_current_branch();
        
        error_log('🔍 [PURCHASABLE DEBUG] Producto: ' . $product_id . ' | Branch: ' . $current_branch . ' | Purchasable: ' . ($is_purchasable ? 'YES' : 'NO'));
        
        $is_global = get_post_meta($product_id, '_fb_global_sold_out', true);
        $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
        
        error_log('🔍 [PURCHASABLE DEBUG] Global: ' . $is_global . ' | Sold Out Data: ' . print_r($sold_out_data, true));
    }
    
    return $is_purchasable;
}

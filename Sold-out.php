/**
 * FoodBook Sold Out Management - SISTEMA DUAL COMPLETO CORREGIDO
 * 
 * ✅ EDICIÓN RÁPIDA: Sistema simplificado con dropdown
 * ✅ EDITOR INDIVIDUAL: Marca agotado por sede específica
 * 🔧 CORREGIDO: Guardado correcto de sedes individuales
 */

// ============================================
// PARTE 1: META BOX - Control Individual por Sede
// ============================================

add_action('add_meta_boxes', 'fb_soldout_add_meta_box');
function fb_soldout_add_meta_box() {
    add_meta_box(
        'fb_soldout_meta',
        '🚫 Control de Disponibilidad por Sucursal',
        'fb_soldout_render_meta_box',
        'product',
        'side',
        'high'
    );
}

function fb_soldout_render_meta_box($post) {
    wp_nonce_field('fb_soldout_save', 'fb_soldout_nonce');
    
    $product_id = $post->ID;
    $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
    $is_global = get_post_meta($product_id, '_fb_global_sold_out', true) === 'yes';
    
    if (!is_array($sold_out_data)) {
        $sold_out_data = array();
    }
    
    $branches = get_posts(array(
        'post_type' => 'branches',
        'post_status' => 'publish',
        'posts_per_page' => -1,
        'orderby' => 'title',
        'order' => 'ASC'
    ));
    
    ?>
    <div class="fb-soldout-box">
        
        <?php if ($is_global): ?>
            <div class="fb-soldout-global-notice">
                <strong>⚠️ AGOTADO GLOBAL ACTIVO</strong>
                <p>Este producto está marcado como agotado en TODAS las sedes desde Edición Rápida.</p>
                <p>Para activar control individual, desactiva primero el agotado global desde la lista de productos.</p>
            </div>
        <?php endif; ?>
        
        <div class="fb-soldout-individual-control" <?php echo $is_global ? 'style="opacity: 0.5; pointer-events: none;"' : ''; ?>>
            <h4 style="margin: 10px 0;">Control Individual por Sucursal:</h4>
            
            <?php if (empty($branches)): ?>
                <p style="color: #999;">⚠️ No hay sucursales creadas.</p>
            <?php else: ?>
                <?php foreach ($branches as $branch): ?>
                    <?php 
                    $branch_id = $branch->ID;
                    $is_sold_out = isset($sold_out_data[$branch_id]) && $sold_out_data[$branch_id] === 'yes';
                    ?>
                    <div class="fb-soldout-item">
                        <label>
                            <input 
                                type="checkbox" 
                                name="fb_sold_out_branches[<?php echo $branch_id; ?>]" 
                                value="yes"
                                <?php checked($is_sold_out, true); ?>
                                <?php disabled($is_global, true); ?>
                            >
                            <strong><?php echo esc_html($branch->post_title); ?></strong>
                            <span class="fb-soldout-status <?php echo $is_sold_out ? 'status-soldout' : 'status-available'; ?>">
                                <?php echo $is_sold_out ? '🚫 Agotado' : '✅ Disponible'; ?>
                            </span>
                        </label>
                    </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
        
    </div>
    
    <style>
        .fb-soldout-box { padding: 10px 0; }
        
        .fb-soldout-global-notice {
            background: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 15px;
        }
        
        .fb-soldout-global-notice strong {
            color: #856404;
            display: block;
            margin-bottom: 8px;
            font-size: 13px;
        }
        
        .fb-soldout-global-notice p {
            margin: 5px 0;
            font-size: 12px;
            color: #856404;
        }
        
        .fb-soldout-individual-control h4 {
            font-size: 13px;
            color: #555;
            font-weight: 600;
        }
        
        .fb-soldout-item { 
            display: flex; 
            align-items: center; 
            padding: 10px; 
            background: #f9f9f9; 
            margin-bottom: 8px; 
            border-radius: 5px;
            border-left: 3px solid #D0DAE0;
            transition: all 0.2s ease;
        }
        
        .fb-soldout-item:hover {
            background: #f0f0f0;
            border-left-color: #004AFF;
        }
        
        .fb-soldout-item label { 
            display: flex; 
            align-items: center; 
            width: 100%; 
            cursor: pointer; 
            margin: 0;
        }
        
        .fb-soldout-item input[type="checkbox"] { 
            margin-right: 10px;
            width: 18px;
            height: 18px;
            accent-color: #004AFF;
            cursor: pointer;
        }
        
        .fb-soldout-item input[type="checkbox"]:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
        
        .fb-soldout-status { 
            margin-left: auto; 
            padding: 4px 10px; 
            border-radius: 12px; 
            font-size: 11px; 
            font-weight: 600;
        }
        
        .status-soldout { 
            background: #ffebee; 
            color: #c62828; 
            border: 1px solid #ffcdd2;
        }
        
        .status-available { 
            background: #e8f5e9; 
            color: #2e7d32; 
            border: 1px solid #c8e6c9;
        }
    </style>
    <?php
}

add_action('save_post_product', 'fb_soldout_save_meta', 10, 2);
function fb_soldout_save_meta($post_id, $post) {
    if (!isset($_POST['fb_soldout_nonce']) || !wp_verify_nonce($_POST['fb_soldout_nonce'], 'fb_soldout_save')) {
        return;
    }
    
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
        return;
    }
    
    if (!current_user_can('edit_post', $post_id)) {
        return;
    }
    
    // Solo guardar si NO está en modo global
    $is_global = get_post_meta($post_id, '_fb_global_sold_out', true) === 'yes';
    
    if (!$is_global) {
        // 🔧 CORRECCIÓN: Obtener TODAS las sedes para verificar cuáles están marcadas
        $branches = get_posts(array(
            'post_type' => 'branches',
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'fields' => 'ids'
        ));
        
        // Crear array limpio con el estado de CADA sede
        $sold_out_branches = array();
        
        foreach ($branches as $branch_id) {
            // Si el checkbox está marcado, se recibe en POST
            if (isset($_POST['fb_sold_out_branches'][$branch_id]) && $_POST['fb_sold_out_branches'][$branch_id] === 'yes') {
                $sold_out_branches[$branch_id] = 'yes';
            }
            // Si NO está en POST, significa que fue desmarcado o nunca se marcó
            // En lugar de omitirlo, explícitamente lo marcamos como 'no'
            else {
                $sold_out_branches[$branch_id] = 'no';
            }
        }
        
        update_post_meta($post_id, '_fb_sold_out_branches', $sold_out_branches);
        
        // Log para debug
        if (defined('WP_DEBUG') && WP_DEBUG) {
            $marked_count = count(array_filter($sold_out_branches, function($v) { return $v === 'yes'; }));
            error_log('🔧 Muqui Save: Producto #' . $post_id . ' → ' . $marked_count . ' sedes marcadas como agotadas de ' . count($sold_out_branches) . ' totales');
        }
    }
}

// ============================================
// PARTE 2: EDICIÓN RÁPIDA - SISTEMA SIMPLIFICADO CON DROPDOWN
// ============================================

add_filter('manage_product_posts_columns', 'fb_soldout_add_quick_edit_column');
function fb_soldout_add_quick_edit_column($columns) {
    $new_columns = array();
    
    foreach ($columns as $key => $value) {
        $new_columns[$key] = $value;
        if ($key === 'name') {
            $new_columns['fb_soldout_global'] = '🚫 Estado Global';
        }
    }
    
    return $new_columns;
}

add_action('manage_product_posts_custom_column', 'fb_soldout_show_quick_edit_column', 10, 2);
function fb_soldout_show_quick_edit_column($column, $post_id) {
    if ($column === 'fb_soldout_global') {
        $is_global_soldout = get_post_meta($post_id, '_fb_global_sold_out', true) === 'yes';
        
        $sold_out_data = get_post_meta($post_id, '_fb_sold_out_branches', true);
        $individual_count = 0;
        
        // 🔧 CORRECCIÓN: Solo contar sedes explícitamente marcadas como 'yes'
        if (is_array($sold_out_data)) {
            foreach ($sold_out_data as $branch_id => $status) {
                if ($status === 'yes') {
                    $individual_count++;
                }
            }
        }
        
        if ($is_global_soldout) {
            $status_class = 'fb-soldout-global-yes';
            $status_text = '🚫 AGOTADO GLOBAL';
            $data_status = 'soldout';
        } elseif ($individual_count > 0) {
            $status_class = 'fb-soldout-partial';
            $status_text = '⚠️ ' . $individual_count . ' sede(s)';
            $data_status = 'partial';
        } else {
            $status_class = 'fb-soldout-global-no';
            $status_text = '✅ DISPONIBLE';
            $data_status = 'available';
        }
        
        echo '<span class="fb-soldout-global-status ' . $status_class . '" data-product-id="' . $post_id . '" data-status="' . $data_status . '">' . $status_text . '</span>';
    }
}

add_action('quick_edit_custom_box', 'fb_soldout_quick_edit_field', 10, 2);
function fb_soldout_quick_edit_field($column_name, $post_type) {
    if ($post_type !== 'product') return;
    
    static $rendered = false;
    if ($rendered) return;
    $rendered = true;
    
    wp_nonce_field('fb_soldout_quick_edit', 'fb_soldout_quick_edit_nonce');
    ?>
    <fieldset class="inline-edit-col-right inline-edit-categories">
        <div class="inline-edit-col">
            <div class="inline-edit-group wp-clearfix">
                <label class="alignleft fb-soldout-quick-label">
                    <span class="title">Estado Global</span>
                    <span class="input-text-wrap">
                        <input type="hidden" name="fb_soldout_submitted" value="1" />
                        
                        <select name="fb_soldout_global_status" id="fb_soldout_global_status" style="width: 100%; margin-top: 5px;">
                            <option value="nochange">— Sin cambios —</option>
                            <option value="soldout">🚫 Agotado en todas las sedes</option>
                            <option value="available">✅ Disponible en todas las sedes</option>
                        </select>
                    </span>
                </label>
            </div>
        </div>
    </fieldset>
    <?php
}

add_action('save_post', 'fb_soldout_quick_edit_save');
function fb_soldout_quick_edit_save($post_id) {
    // Solo procesar en edición rápida
    if (!isset($_POST['action']) || $_POST['action'] !== 'inline-save') {
        return;
    }
    
    // Verificar nonce
    if (!isset($_POST['fb_soldout_quick_edit_nonce']) || 
        !wp_verify_nonce($_POST['fb_soldout_quick_edit_nonce'], 'fb_soldout_quick_edit')) {
        return;
    }
    
    // Verificaciones estándar
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    if (!current_user_can('edit_post', $post_id)) return;
    if (get_post_type($post_id) !== 'product') return;
    
    // Solo procesar si el campo fue enviado
    if (!isset($_POST['fb_soldout_submitted'])) {
        return;
    }
    
    // Procesar dropdown
    $selected_status = isset($_POST['fb_soldout_global_status']) ? sanitize_text_field($_POST['fb_soldout_global_status']) : 'nochange';
    
    // Log para debug
    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('🔥 Muqui Quick Edit: Producto #' . $post_id . ' → Estado: ' . $selected_status);
    }
    
    if ($selected_status === 'soldout') {
        // ✅ MARCAR COMO AGOTADO GLOBAL
        update_post_meta($post_id, '_fb_global_sold_out', 'yes');
        
        // Obtener todas las sedes y marcarlas como agotadas
        $branches = get_posts(array(
            'post_type' => 'branches',
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'fields' => 'ids'
        ));
        
        $sold_out_all = array();
        foreach ($branches as $branch_id) {
            $sold_out_all[$branch_id] = 'yes';
        }
        
        update_post_meta($post_id, '_fb_sold_out_branches', $sold_out_all);
        
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('✅ Muqui: Marcado como AGOTADO GLOBAL en ' . count($sold_out_all) . ' sedes');
        }
        
    } elseif ($selected_status === 'available') {
        // ✅ MARCAR COMO DISPONIBLE (limpiar todo)
        update_post_meta($post_id, '_fb_global_sold_out', 'no');
        
        // 🔧 CORRECCIÓN: Marcar todas las sedes como 'no' en lugar de array vacío
        $branches = get_posts(array(
            'post_type' => 'branches',
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'fields' => 'ids'
        ));
        
        $available_all = array();
        foreach ($branches as $branch_id) {
            $available_all[$branch_id] = 'no';
        }
        
        update_post_meta($post_id, '_fb_sold_out_branches', $available_all);
        
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('✅ Muqui: Marcado como DISPONIBLE (limpiado agotado global)');
        }
    }
    // Si es 'nochange', no hacer nada
}

add_action('admin_footer', 'fb_soldout_quick_edit_script');
function fb_soldout_quick_edit_script() {
    global $current_screen;
    
    if ($current_screen->id !== 'edit-product') return;
    ?>
    <script type="text/javascript">
    (function($) {
        'use strict';
        
        console.log('🔥 Muqui Quick Edit: Sistema con dropdown cargado');
        
        var $wp_inline_edit = inlineEditPost.edit;
        
        inlineEditPost.edit = function(id) {
            $wp_inline_edit.apply(this, arguments);
            
            var post_id = 0;
            if (typeof(id) === 'object') {
                post_id = parseInt(this.getId(id));
            }
            
            if (post_id > 0) {
                console.log('✅ Abriendo Quick Edit para producto #' + post_id);
                
                var $edit_row = $('#edit-' + post_id);
                var $post_row = $('#post-' + post_id);
                
                // Leer estado actual desde data-status
                var $status_span = $post_row.find('.fb-soldout-global-status');
                var current_status = $status_span.attr('data-status');
                
                console.log('🔍 Estado actual: ' + current_status);
                
                // Esperar renderizado del DOM
                setTimeout(function() {
                    var $dropdown = $edit_row.find('#fb_soldout_global_status');
                    
                    if ($dropdown.length) {
                        // Configurar dropdown según estado actual
                        $dropdown.val('nochange'); // Por defecto "Sin cambios"
                        
                        console.log('✅ Dropdown configurado a: Sin cambios');
                        
                    } else {
                        console.error('❌ No se encontró el dropdown');
                    }
                }, 100);
            }
        };
        
        // Log al guardar
        $('#posts-filter').on('click', '.save', function() {
            var $button = $(this);
            var $row = $button.closest('tr');
            var $dropdown = $row.find('#fb_soldout_global_status');
            
            if ($dropdown.length) {
                var selected_value = $dropdown.val();
                console.log('💾 Guardando con estado: ' + selected_value);
            }
        });
        
    })(jQuery);
    </script>
    
    <style type="text/css">
        .column-fb_soldout_global {
            width: 160px;
            text-align: center;
        }
        
        .fb-soldout-global-status {
            padding: 5px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            display: inline-block;
            min-width: 120px;
            text-align: center;
        }
        
        .fb-soldout-global-yes {
            background: #ffebee;
            color: #c62828;
            border: 2px solid #ef5350;
            font-weight: 700;
        }
        
        .fb-soldout-partial {
            background: #fff3e0;
            color: #e65100;
            border: 2px solid #ff9800;
            font-weight: 600;
        }
        
        .fb-soldout-global-no {
            background: #e8f5e9;
            color: #2e7d32;
            border: 2px solid #66bb6a;
        }
        
        .fb-soldout-quick-label {
            width: 100% !important;
        }
        
        .fb-soldout-quick-label .title {
            font-weight: 600;
            color: #333;
            font-size: 13px;
            display: block;
            margin-bottom: 5px;
        }
        
        .fb-soldout-quick-label .input-text-wrap {
            display: block !important;
        }
        
        #fb_soldout_global_status {
            height: 32px;
            border-radius: 4px;
            border: 1px solid #ddd;
            padding: 0 8px;
        }
        
        .inline-edit-categories {
            border-top: 1px solid #ddd;
            padding-top: 15px;
            margin-top: 10px;
        }
    </style>
    <?php
}

// ============================================
// PARTE 3: INYECTAR DATOS DE PRODUCTOS AGOTADOS
// ============================================

add_action('wp_head', 'fb_soldout_inject_soldout_data');
function fb_soldout_inject_soldout_data() {
    $current_branch = fb_soldout_get_current_branch();
    if (!$current_branch) return;
    
    $all_products = get_posts(array(
        'post_type' => 'product',
        'post_status' => 'publish',
        'posts_per_page' => -1,
        'fields' => 'ids'
    ));
    
    $sold_out_products = array();
    
    foreach ($all_products as $product_id) {
        // Primero verificar agotado global
        $is_globally_soldout = get_post_meta($product_id, '_fb_global_sold_out', true) === 'yes';
        
        if ($is_globally_soldout) {
            $sold_out_products[] = $product_id;
        } else {
            // Verificar si está agotado en la sede actual
            $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
            
            // 🔧 CORRECCIÓN: Verificar explícitamente que sea 'yes'
            if (is_array($sold_out_data) && 
                isset($sold_out_data[$current_branch]) && 
                $sold_out_data[$current_branch] === 'yes') {
                $sold_out_products[] = $product_id;
            }
        }
    }
    
    // 🔧 MAPPING: Nombres del Modal Muqui → Branch IDs de WordPress
    $branches_mapping = fb_soldout_get_branches_mapping();
    
    ?>
    <script type="text/javascript">
    window.muquiSoldOut = {
        soldOutProducts: <?php echo json_encode($sold_out_products); ?>,
        currentBranch: <?php echo $current_branch; ?>,
        branchesMapping: <?php echo json_encode($branches_mapping); ?>,
        debug: <?php echo isset($_GET['debug_soldout']) ? 'true' : 'false'; ?>
    };
    
    if (window.muquiSoldOut.debug) {
        console.log('🚀 Muqui Sold Out: Datos cargados');
        console.log('  - Branch Actual:', window.muquiSoldOut.currentBranch);
        console.log('  - Productos agotados:', window.muquiSoldOut.soldOutProducts);
        console.log('  - Mapping Sedes:', window.muquiSoldOut.branchesMapping);
    }
    
    // 🔧 SINCRONIZACIÓN MEJORADA: Actualizar branch desde localStorage del Modal
    (function() {
        const storedLocation = localStorage.getItem('muqui_location');
        if (storedLocation) {
            try {
                const locationData = JSON.parse(storedLocation);
                const locationName = locationData.name;
                
                if (window.muquiSoldOut.debug) {
                    console.log('🔍 localStorage detectado:', locationName);
                }
                
                // Buscar el Branch ID correspondiente
                if (window.muquiSoldOut.branchesMapping[locationName]) {
                    const correctBranchId = window.muquiSoldOut.branchesMapping[locationName];
                    
                    if (correctBranchId !== window.muquiSoldOut.currentBranch) {
                        console.log('🔄 Sincronizando sucursal:', locationName, '→ ID:', correctBranchId);
                        
                        // PASO 1: Sincronizar con el servidor (guardar en sesión/cookie)
                        fetch('<?php echo admin_url('admin-ajax.php'); ?>', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                            body: 'action=fb_soldout_sync_branch&location_name=' + encodeURIComponent(locationName)
                        })
                        .then(r => r.json())
                        .then(syncData => {
                            if (syncData.success) {
                                console.log('✅ Sucursal sincronizada en servidor:', syncData.data);
                                window.muquiSoldOut.currentBranch = syncData.data.branch_id;
                                
                                // PASO 2: Recargar productos agotados con el branch correcto
                                return fetch('<?php echo admin_url('admin-ajax.php'); ?>', {
                                    method: 'POST',
                                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                                    body: 'action=fb_soldout_get_products&branch_id=' + syncData.data.branch_id
                                });
                            } else {
                                console.warn('⚠️ No se pudo sincronizar:', syncData.data);
                                throw new Error('Sync failed');
                            }
                        })
                        .then(r => r.json())
                        .then(data => {
                            if (data.success) {
                                window.muquiSoldOut.soldOutProducts = data.data.sold_out_products;
                                console.log('✅ Productos agotados actualizados:', window.muquiSoldOut.soldOutProducts.length, 'productos');
                                
                                // PASO 3: Reinicializar overlays
                                if (typeof initMuquiSoldOut === 'function') {
                                    setTimeout(initMuquiSoldOut, 100);
                                }
                            }
                        })
                        .catch(e => {
                            console.error('❌ Error en sincronización:', e);
                            // Fallback: actualizar solo localmente
                            window.muquiSoldOut.currentBranch = correctBranchId;
                        });
                    } else {
                        if (window.muquiSoldOut.debug) {
                            console.log('✓ Sucursal ya sincronizada:', correctBranchId);
                        }
                    }
                } else {
                    console.warn('⚠️ Sucursal no encontrada en mapping:', locationName);
                    console.log('Mappings disponibles:', Object.keys(window.muquiSoldOut.branchesMapping));
                }
            } catch(e) {
                console.error('❌ Error al parsear muqui_location:', e);
            }
        } else {
            if (window.muquiSoldOut.debug) {
                console.log('ℹ️ No hay ubicación guardada en localStorage');
            }
        }
    })();
    </script>
    <?php
}

// 🔧 NUEVA FUNCIÓN: Crear mapping entre nombres del Modal y Branch IDs
function fb_soldout_get_branches_mapping() {
    $branches = get_posts(array(
        'post_type' => 'branches',
        'post_status' => 'publish',
        'posts_per_page' => -1
    ));
    
    $mapping = array();
    
    foreach ($branches as $branch) {
        $title = $branch->post_title;
        $mapping[$title] = $branch->ID;
        
        // Agregar variantes comunes del nombre
        // Ejemplo: "Neiva - San Pedro Plaza" también como "Cc San Pedro Plaza"
        if (strpos($title, ' - ') !== false) {
            $parts = explode(' - ', $title);
            if (count($parts) === 2) {
                $mapping['Cc ' . trim($parts[1])] = $branch->ID;
                $mapping[trim($parts[1])] = $branch->ID;
            }
        }
    }
    
    return $mapping;
}

// 🔧 AJAX: Obtener productos agotados para un branch específico
add_action('wp_ajax_fb_soldout_get_products', 'fb_soldout_ajax_get_products');
add_action('wp_ajax_nopriv_fb_soldout_get_products', 'fb_soldout_ajax_get_products');

function fb_soldout_ajax_get_products() {
    $branch_id = isset($_POST['branch_id']) ? intval($_POST['branch_id']) : 0;
    
    if (!$branch_id) {
        wp_send_json_error(array('message' => 'Branch ID no válido'));
        return;
    }
    
    $all_products = get_posts(array(
        'post_type' => 'product',
        'post_status' => 'publish',
        'posts_per_page' => -1,
        'fields' => 'ids'
    ));
    
    $sold_out_products = array();
    
    foreach ($all_products as $product_id) {
        $is_globally_soldout = get_post_meta($product_id, '_fb_global_sold_out', true) === 'yes';
        
        if ($is_globally_soldout) {
            $sold_out_products[] = $product_id;
        } else {
            $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
            
            if (is_array($sold_out_data) && 
                isset($sold_out_data[$branch_id]) && 
                $sold_out_data[$branch_id] === 'yes') {
                $sold_out_products[] = $product_id;
            }
        }
    }
    
    wp_send_json_success(array(
        'sold_out_products' => $sold_out_products,
        'branch_id' => $branch_id,
        'branch_name' => get_the_title($branch_id)
    ));
}

// 🔧 AJAX: Sincronizar sucursal desde localStorage del Modal Muqui
add_action('wp_ajax_fb_soldout_sync_branch', 'fb_soldout_ajax_sync_branch');
add_action('wp_ajax_nopriv_fb_soldout_sync_branch', 'fb_soldout_ajax_sync_branch');

function fb_soldout_ajax_sync_branch() {
    $location_name = isset($_POST['location_name']) ? sanitize_text_field($_POST['location_name']) : '';
    
    if (empty($location_name)) {
        wp_send_json_error(array('message' => 'Nombre de ubicación no válido'));
        return;
    }
    
    // Obtener el mapping de sedes
    $branches_mapping = fb_soldout_get_branches_mapping();
    
    // Buscar el Branch ID correspondiente
    if (isset($branches_mapping[$location_name])) {
        $branch_id = $branches_mapping[$location_name];
        
        // Guardar en sesión
        if (!session_id()) {
            session_start();
        }
        $_SESSION['foodbook_selected_branch'] = $branch_id;
        
        // Guardar en cookie (30 días)
        setcookie('muqui_branch_id', $branch_id, time() + (30 * 24 * 60 * 60), '/');
        setcookie('foodbook_branch', $branch_id, time() + (30 * 24 * 60 * 60), '/');
        
        wp_send_json_success(array(
            'branch_id' => $branch_id,
            'branch_name' => get_the_title($branch_id),
            'location_name' => $location_name,
            'message' => 'Sucursal sincronizada correctamente'
        ));
    } else {
        wp_send_json_error(array(
            'message' => 'No se encontró la sucursal en el mapping',
            'location_name' => $location_name,
            'available_mappings' => array_keys($branches_mapping)
        ));
    }
}

// ============================================
// PARTE 4: JAVASCRIPT FUNCIONAL - Aplicar Overlay
// ============================================

add_action('wp_footer', 'fb_soldout_functional_script');
function fb_soldout_functional_script() {
    ?>
    <script type="text/javascript">
    (function() {
        'use strict';
        
        console.log('🔥 Muqui Sold Out: Iniciando script...');
        
        function initMuquiSoldOut() {
            if (!window.muquiSoldOut) {
                console.log('❌ Muqui: No hay datos cargados');
                return;
            }
            
            var productElements = document.querySelectorAll('[data-pid]');
            
            if (window.muquiSoldOut.debug) {
                console.log('🔍 Muqui: Elementos con data-pid encontrados:', productElements.length);
            }
            
            productElements.forEach(function(element) {
                var productId = parseInt(element.getAttribute('data-pid'));
                
                if (window.muquiSoldOut.soldOutProducts.includes(productId)) {
                    if (window.muquiSoldOut.debug) {
                        console.log('🎯 Muqui: Producto agotado detectado:', productId, element);
                    }
                    
                    var productContainer = element.closest('.fb_single_product_item');
                    
                    if (productContainer && !productContainer.classList.contains('muqui-soldout-processed')) {
                        applySoldOutDesign(productContainer, productId);
                    }
                }
            });
        }
        
        function applySoldOutDesign(container, productId) {
            container.classList.add('muqui-soldout-processed');
            
            var overlay = document.createElement('div');
            overlay.className = 'muqui-soldout-overlay';
            
            var centerButton = document.createElement('div');
            centerButton.className = 'muqui-center-button';
            centerButton.innerHTML = `
                <div class="muqui-button-content">
                    <span class="muqui-button-icon">🚫</span>
                    <span class="muqui-button-text">Agotado</span>
                </div>
            `;
            
            var imageContainer = container.querySelector('.fb_product_top');
            if (imageContainer) {
                imageContainer.style.position = 'relative';
                imageContainer.appendChild(overlay);
                imageContainer.appendChild(centerButton);
                
                var productImage = imageContainer.querySelector('img');
                if (productImage) {
                    productImage.style.filter = 'blur(2px) brightness(0.95)';
                    productImage.style.transition = 'filter 0.3s ease';
                }
            }
            
            var orderButtons = container.querySelectorAll('.fb_order_button, .fb_order_cart_button, button');
            orderButtons.forEach(function(button) {
                button.style.pointerEvents = 'none';
                button.style.cursor = 'not-allowed';
                button.style.opacity = '0.5';
            });
            
            if (window.muquiSoldOut.debug) {
                console.log('✅ Muqui: Diseño aplicado a:', productId, container);
            }
        }
        
        setTimeout(initMuquiSoldOut, 100);
        setTimeout(initMuquiSoldOut, 500);
        setTimeout(initMuquiSoldOut, 1000);
        setTimeout(initMuquiSoldOut, 2000);
        
        var observer = new MutationObserver(function(mutations) {
            var shouldCheck = false;
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1 && (node.classList.contains('fb_single_product_item') || node.querySelector('.fb_single_product_item'))) {
                            shouldCheck = true;
                        }
                    });
                }
            });
            if (shouldCheck) {
                setTimeout(initMuquiSoldOut, 300);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        if (typeof jQuery !== 'undefined') {
            jQuery(document).ajaxComplete(function() {
                setTimeout(initMuquiSoldOut, 500);
            });
        }
        
    })();
    </script>
    
    <style type="text/css">
        .muqui-soldout-overlay {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background: linear-gradient(135deg, rgba(0, 74, 255, 0.35) 0%, rgba(0, 57, 204, 0.45) 100%) !important;
            backdrop-filter: blur(2px) !important;
            z-index: 10 !important;
            pointer-events: none !important;
            border-radius: 8px !important;
        }
        
        .muqui-center-button {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            z-index: 11 !important;
            pointer-events: none !important;
        }
        
        .muqui-button-content {
            background: linear-gradient(135deg, #004AFF 0%, #0039CC 100%) !important;
            color: #FFFFFF !important;
            padding: 16px 28px !important;
            border-radius: 50px !important;
            font-weight: 700 !important;
            font-size: 15px !important;
            text-transform: uppercase !important;
            letter-spacing: 1px !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            box-shadow: 0 8px 25px rgba(0, 74, 255, 0.5) !important;
            border: 2px solid rgba(255, 255, 255, 0.4) !important;
            animation: muqui-button-pulse 2.5s ease-in-out infinite !important;
            min-width: 160px !important;
            justify-content: center !important;
        }
        
        .muqui-button-icon {
            font-size: 16px !important;
        }
        
        .muqui-button-text {
            font-weight: 700 !important;
            text-transform: capitalize !important;
        }
        
        @keyframes muqui-button-pulse {
            0%, 100% { 
                transform: scale(1);
                box-shadow: 0 8px 25px rgba(0, 74, 255, 0.5);
            }
            50% { 
                transform: scale(1.05);
                box-shadow: 0 12px 30px rgba(0, 74, 255, 0.7);
            }
        }
        
        .muqui-soldout-processed {
            overflow: visible !important;
        }
        
        @media (max-width: 768px) {
            .muqui-button-content {
                padding: 12px 20px !important;
                font-size: 13px !important;
                min-width: 140px !important;
            }
        }
    </style>
    <?php
}

// ============================================
// ESTILOS PARA BADGE DE AGOTADO EN FRONT-END
// ============================================

add_action('wp_head', 'fb_soldout_frontend_styles');
function fb_soldout_frontend_styles() {
    ?>
    <style type="text/css">
        .fb-soldout-badge {
            display: inline-block;
            padding: 8px 16px;
            background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);
            color: #ffffff;
            font-weight: 700;
            font-size: 13px;
            text-transform: uppercase;
            border-radius: 20px;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 12px rgba(255, 68, 68, 0.3);
            border: 2px solid rgba(255, 255, 255, 0.3);
            cursor: not-allowed;
        }
        
        .fb-soldout-badge:hover {
            background: linear-gradient(135deg, #cc0000 0%, #990000 100%);
            box-shadow: 0 6px 16px rgba(255, 68, 68, 0.4);
        }
    </style>
    <?php
}

// ============================================
// PARTE 5: WOOCOMMERCE STANDARD - HOOKS COMPLETOS
// ============================================

// 🔧 HOOK 1: Control de stock status
add_filter('woocommerce_product_is_in_stock', 'fb_soldout_check_stock', 10, 2);
function fb_soldout_check_stock($is_in_stock, $product) {
    if (!$is_in_stock) return false;
    
    $current_branch = fb_soldout_get_current_branch();
    if (!$current_branch) return $is_in_stock;
    
    $product_id = $product->get_id();
    
    // VERIFICAR AGOTADO GLOBAL
    $is_globally_soldout = get_post_meta($product_id, '_fb_global_sold_out', true) === 'yes';
    if ($is_globally_soldout) {
        return false;
    }
    
    // 🔧 CORRECCIÓN: VERIFICAR AGOTADO POR SEDE
    $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
    if (is_array($sold_out_data) && 
        isset($sold_out_data[$current_branch]) && 
        $sold_out_data[$current_branch] === 'yes') {
        return false;
    }
    
    return $is_in_stock;
}

// 🔧 HOOK 2: Control de capacidad de compra (CRÍTICO)
add_filter('woocommerce_is_purchasable', 'fb_soldout_check_purchasable', 10, 2);
function fb_soldout_check_purchasable($is_purchasable, $product) {
    if (!$is_purchasable) return false;
    
    $current_branch = fb_soldout_get_current_branch();
    if (!$current_branch) return $is_purchasable;
    
    $product_id = $product->get_id();
    
    // VERIFICAR AGOTADO GLOBAL
    $is_globally_soldout = get_post_meta($product_id, '_fb_global_sold_out', true) === 'yes';
    if ($is_globally_soldout) {
        return false;
    }
    
    // VERIFICAR AGOTADO POR SEDE
    $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
    if (is_array($sold_out_data) && 
        isset($sold_out_data[$current_branch]) && 
        $sold_out_data[$current_branch] === 'yes') {
        return false;
    }
    
    return $is_purchasable;
}

// 🔧 HOOK 3: Modificar stock status text
add_filter('woocommerce_product_get_stock_status', 'fb_soldout_modify_stock_status', 10, 2);
function fb_soldout_modify_stock_status($status, $product) {
    $current_branch = fb_soldout_get_current_branch();
    if (!$current_branch) return $status;
    
    $product_id = $product->get_id();
    
    // VERIFICAR AGOTADO GLOBAL
    $is_globally_soldout = get_post_meta($product_id, '_fb_global_sold_out', true) === 'yes';
    if ($is_globally_soldout) {
        return 'outofstock';
    }
    
    // VERIFICAR AGOTADO POR SEDE
    $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
    if (is_array($sold_out_data) && 
        isset($sold_out_data[$current_branch]) && 
        $sold_out_data[$current_branch] === 'yes') {
        return 'outofstock';
    }
    
    return $status;
}

// 🔧 HOOK 4: Prevenir agregar al carrito
add_filter('woocommerce_add_to_cart_validation', 'fb_soldout_prevent_add_to_cart', 10, 3);
function fb_soldout_prevent_add_to_cart($passed, $product_id, $quantity) {
    $current_branch = fb_soldout_get_current_branch();
    if (!$current_branch) return $passed;
    
    // VERIFICAR AGOTADO GLOBAL
    $is_globally_soldout = get_post_meta($product_id, '_fb_global_sold_out', true) === 'yes';
    if ($is_globally_soldout) {
        wc_add_notice(__('Este producto está agotado en todas las sucursales.', 'woocommerce'), 'error');
        return false;
    }
    
    // VERIFICAR AGOTADO POR SEDE
    $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
    if (is_array($sold_out_data) && 
        isset($sold_out_data[$current_branch]) && 
        $sold_out_data[$current_branch] === 'yes') {
        $branch_name = get_the_title($current_branch);
        wc_add_notice(sprintf(__('Este producto está agotado en %s.', 'woocommerce'), $branch_name), 'error');
        return false;
    }
    
    return $passed;
}

// 🔧 HOOK 5: Ocultar botón "Agregar al carrito" en listados
add_filter('woocommerce_loop_add_to_cart_link', 'fb_soldout_hide_add_to_cart_button', 10, 2);
function fb_soldout_hide_add_to_cart_button($html, $product) {
    $current_branch = fb_soldout_get_current_branch();
    if (!$current_branch) return $html;
    
    $product_id = $product->get_id();
    
    // VERIFICAR AGOTADO GLOBAL
    $is_globally_soldout = get_post_meta($product_id, '_fb_global_sold_out', true) === 'yes';
    if ($is_globally_soldout) {
        return '<span class="fb-soldout-badge">🚫 Agotado</span>';
    }
    
    // VERIFICAR AGOTADO POR SEDE
    $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
    if (is_array($sold_out_data) && 
        isset($sold_out_data[$current_branch]) && 
        $sold_out_data[$current_branch] === 'yes') {
        return '<span class="fb-soldout-badge">🚫 Agotado</span>';
    }
    
    return $html;
}

// ============================================
// PARTE 6: FUNCIÓN HELPER - INTEGRADO CON MODAL MUQUI
// ============================================

function fb_soldout_get_current_branch() {
    // 🔧 PASO 1: Intentar obtener desde el mapping de Modal Muqui
    $branch_id = fb_soldout_get_branch_from_muqui_modal();
    if ($branch_id) {
        return $branch_id;
    }
    
    // PASO 2: Verificar parámetro GET (para sincronización AJAX)
    if (isset($_GET['branch_id']) && intval($_GET['branch_id']) > 0) {
        return intval($_GET['branch_id']);
    }
    
    if (isset($_POST['branch_id']) && intval($_POST['branch_id']) > 0) {
        return intval($_POST['branch_id']);
    }
    
    // PASO 3: Verificar sesión de FoodBook
    if (!session_id()) {
        add_action('init', function() {
            if (!session_id()) {
                session_start();
            }
        }, 1);
    }

    if (!empty($_SESSION['foodbook_selected_branch'])) {
        return intval($_SESSION['foodbook_selected_branch']);
    }

    // PASO 4: Cookie de FoodBook
    if (!empty($_COOKIE['foodbook_branch'])) {
        return intval($_COOKIE['foodbook_branch']);
    }
    
    // PASO 5: Cookie de Muqui (sincronizada desde localStorage)
    if (!empty($_COOKIE['muqui_branch_id'])) {
        return intval($_COOKIE['muqui_branch_id']);
    }

    // PASO 6: Fallback - primer branch publicado
    $branches = get_posts(array(
        'post_type'      => 'branches',
        'post_status'    => 'publish',
        'posts_per_page' => 1,
        'orderby'        => 'title',
        'order'          => 'ASC'
    ));

    return !empty($branches) ? intval($branches[0]->ID) : 0;
}

// 🔧 NUEVA FUNCIÓN: Obtener Branch ID desde localStorage del Modal Muqui
function fb_soldout_get_branch_from_muqui_modal() {
    // Esta función será llamada desde JavaScript para sincronizar
    // Por ahora, retornamos null y dejamos que JS haga la sincronización
    return null;
}

// ============================================
// PARTE 7: DEBUG MEJORADO
// ============================================

add_action('wp_footer', 'fb_soldout_debug_info');
function fb_soldout_debug_info() {
    if (current_user_can('manage_options') && isset($_GET['debug_soldout'])) {
        $current_branch = fb_soldout_get_current_branch();
        $branch_name = $current_branch ? get_the_title($current_branch) : 'No branch';
        
        $all_products = get_posts(array(
            'post_type' => 'product',
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'fields' => 'ids'
        ));
        
        $sold_out_products = array();
        $global_sold_out = array();
        $branch_sold_out = array();
        
        foreach ($all_products as $product_id) {
            $is_globally_soldout = get_post_meta($product_id, '_fb_global_sold_out', true) === 'yes';
            
            if ($is_globally_soldout) {
                $sold_out_products[] = $product_id . ' - ' . get_the_title($product_id) . ' [GLOBAL]';
                $global_sold_out[] = $product_id;
            } else {
                $sold_out_data = get_post_meta($product_id, '_fb_sold_out_branches', true);
                
                // 🔧 CORRECCIÓN: Verificar explícitamente 'yes'
                if (is_array($sold_out_data) && 
                    isset($sold_out_data[$current_branch]) && 
                    $sold_out_data[$current_branch] === 'yes') {
                    $sold_out_products[] = $product_id . ' - ' . get_the_title($product_id) . ' [SEDE: ' . $branch_name . ']';
                    $branch_sold_out[] = $product_id;
                }
            }
        }
        
        // 🔧 MOSTRAR MAPPING DE SEDES
        $branches_mapping = fb_soldout_get_branches_mapping();
        
        echo '<div style="position: fixed; bottom: 10px; left: 10px; background: #000; color: #fff; padding: 15px; z-index: 9999; font-size: 12px; font-family: monospace; max-width: 600px; max-height: 500px; overflow: auto; border-radius: 8px;">';
        echo '<strong>✅ DEBUG Muqui Sold Out - Sistema Dual:</strong><br>';
        echo 'Sucursal Actual: <span style="color: #4ade80;">' . $branch_name . '</span> (ID: ' . $current_branch . ')<br>';
        
        // Mostrar info del localStorage del Modal
        echo '<script>
            (function() {
                const stored = localStorage.getItem("muqui_location");
                if (stored) {
                    const data = JSON.parse(stored);
                    const debugDiv = document.querySelector("div[style*=\'position: fixed; bottom: 10px\']");
                    if (debugDiv) {
                        const modalInfo = document.createElement("div");
                        modalInfo.style.cssText = "background: #1e40af; padding: 8px; margin: 10px 0; border-radius: 4px;";
                        modalInfo.innerHTML = "<strong>🔄 Modal Muqui localStorage:</strong><br>" +
                            "Sede: <span style=\'color: #60a5fa;\'>" + data.name + "</span><br>" +
                            "Index: " + data.index + "<br>" +
                            "Servicio: " + data.service;
                        debugDiv.insertBefore(modalInfo, debugDiv.children[1]);
                    }
                }
            })();
        </script>';
        
        echo '<br>Productos agotados: ' . count($sold_out_products) . '<br>';
        echo ' - Agotado Global: ' . count($global_sold_out) . '<br>';
        echo ' - Agotado en esta Sede: ' . count($branch_sold_out) . '<br>';
        
        echo '<hr style="border-color: #444; margin: 10px 0;">';
        echo '<strong>🗺️ Mapping Sedes Modal → WordPress:</strong><br>';
        echo '<div style="max-height: 150px; overflow-y: auto; margin: 5px 0; padding: 5px; background: #1a1a1a; border-radius: 4px;">';
        foreach ($branches_mapping as $modal_name => $wp_id) {
            $wp_name = get_the_title($wp_id);
            echo '<span style="color: #60a5fa;">' . $modal_name . '</span> → ID: ' . $wp_id . ' (' . $wp_name . ')<br>';
        }
        echo '</div>';
        
        echo '<hr style="border-color: #444; margin: 10px 0;">';
        if (count($sold_out_products) > 0) {
            echo '<strong>📦 Lista de productos agotados:</strong><br>';
            echo '<div style="max-height: 150px; overflow-y: auto;">';
            foreach ($sold_out_products as $product) {
                echo '• ' . $product . '<br>';
            }
            echo '</div>';
        } else {
            echo '<em>No hay productos agotados</em>';
        }
        echo '</div>';
    }
}

// ============================================
// PARTE 8: BULK ACTIONS (BONUS)
// ============================================

add_filter('bulk_actions-edit-product', 'fb_soldout_bulk_actions');
function fb_soldout_bulk_actions($actions) {
    $actions['mark_global_soldout'] = '🚫 Marcar como Agotado Global';
    $actions['unmark_global_soldout'] = '✅ Marcar como Disponible';
    return $actions;
}

add_filter('handle_bulk_actions-edit-product', 'fb_soldout_handle_bulk_actions', 10, 3);
function fb_soldout_handle_bulk_actions($redirect_to, $action, $post_ids) {
    if ($action === 'mark_global_soldout') {
        foreach ($post_ids as $post_id) {
            update_post_meta($post_id, '_fb_global_sold_out', 'yes');
            
            // Marcar en todas las sedes
            $branches = get_posts(array(
                'post_type' => 'branches',
                'post_status' => 'publish',
                'posts_per_page' => -1,
                'fields' => 'ids'
            ));
            
            $sold_out_all = array();
            foreach ($branches as $branch_id) {
                $sold_out_all[$branch_id] = 'yes';
            }
            
            update_post_meta($post_id, '_fb_sold_out_branches', $sold_out_all);
        }
        
        $redirect_to = add_query_arg('bulk_soldout_marked', count($post_ids), $redirect_to);
    }
    
    if ($action === 'unmark_global_soldout') {
        foreach ($post_ids as $post_id) {
            update_post_meta($post_id, '_fb_global_sold_out', 'no');
            
            // 🔧 CORRECCIÓN: Marcar todas como 'no' en lugar de array vacío
            $branches = get_posts(array(
                'post_type' => 'branches',
                'post_status' => 'publish',
                'posts_per_page' => -1,
                'fields' => 'ids'
            ));
            
            $available_all = array();
            foreach ($branches as $branch_id) {
                $available_all[$branch_id] = 'no';
            }
            
            update_post_meta($post_id, '_fb_sold_out_branches', $available_all);
        }
        
        $redirect_to = add_query_arg('bulk_soldout_unmarked', count($post_ids), $redirect_to);
    }
    
    return $redirect_to;
}

add_action('admin_notices', 'fb_soldout_bulk_action_notices');
function fb_soldout_bulk_action_notices() {
    if (!empty($_REQUEST['bulk_soldout_marked'])) {
        $count = intval($_REQUEST['bulk_soldout_marked']);
        printf(
            '<div class="notice notice-success is-dismissible"><p>' .
            _n(
                '%s producto marcado como agotado global.',
                '%s productos marcados como agotado global.',
                $count
            ) . '</p></div>',
            $count
        );
    }
    
    if (!empty($_REQUEST['bulk_soldout_unmarked'])) {
        $count = intval($_REQUEST['bulk_soldout_unmarked']);
        printf(
            '<div class="notice notice-success is-dismissible"><p>' .
            _n(
                '%s producto marcado como disponible.',
                '%s productos marcados como disponibles.',
                $count
            ) . '</p></div>',
            $count
        );
    }
}

// ============================================
// DIAGNÓSTICO PROFUNDO - ACTIVAR CON ?debug_soldout_deep
// ============================================

add_action('wp_footer', 'fb_soldout_deep_diagnostic', 999);
function fb_soldout_deep_diagnostic() {
    if (!isset($_GET['debug_soldout_deep'])) return;
    if (!current_user_can('manage_options')) return;
    
    $current_branch = fb_soldout_get_current_branch();
    
    ?>
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
        if ($current_branch > 0) {
            $branch_name = get_the_title($current_branch);
            echo '<span style="color: #00ff00;">✅ Sucursal detectada: <strong>' . $branch_name . '</strong> (ID: ' . $current_branch . ')</span><br>';
        } else {
            echo '<span style="color: #ff0000;">❌ ERROR: No se detectó sucursal (ID: 0)</span><br>';
        }
        
        echo '<br><strong>Fuentes de detección:</strong><br>';
        if (!session_id()) session_start();
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
                echo '<span style="color: #00ff00;">✅ ' . $hook . '</span><br>';
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
                echo '<strong style="color: #ffff00;">TEST 5: Producto Actual</strong><br>';
                echo 'Producto: <strong>' . $product->get_name() . '</strong> (ID: ' . $product->get_id() . ')<br><br>';
                
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
                $is_purchasable = $product->is_purchasable();
                echo '• is_purchasable(): <span style="color: ' . ($is_purchasable ? '#00ff00' : '#ff0000') . ';">' . ($is_purchasable ? 'TRUE (comprable)' : 'FALSE (NO comprable)') . '</span><br>';
                
                $is_in_stock = $product->is_in_stock();
                echo '• is_in_stock(): <span style="color: ' . ($is_in_stock ? '#00ff00' : '#ff0000') . ';">' . ($is_in_stock ? 'TRUE' : 'FALSE') . '</span><br>';
                
                $stock_status = $product->get_stock_status();
                echo '• get_stock_status(): <span style="color: ' . ($stock_status === 'instock' ? '#00ff00' : '#ff0000') . ';">' . strtoupper($stock_status) . '</span><br>';
                
                echo '</div>';
            }
        }
        
        ?>
        
        <button onclick="document.getElementById('deep-diagnostic').remove();" style="margin-top: 15px; padding: 10px 20px; background: #ff0000; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
            CERRAR
        </button>
    </div>
    
    <script>
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DIAGNÓSTICO PROFUNDO - SOLD OUT SYSTEM');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 Sucursal actual:', <?php echo $current_branch; ?>);
    console.log('═══════════════════════════════════════════════════════');
    </script>
    <?php
}
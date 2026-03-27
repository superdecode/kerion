<!--begin::Form-->
<form class="form" method="POST" enctype="multipart/form-data" id="calc_form_<?= $query->id ?>">
    <!--begin::Toolbar-->
    <div class="toolbar" id="kt_toolbar">
        <!--begin::Container-->
        <div id="kt_toolbar_container" class="container-fluid d-flex flex-stack">
            <!--begin::Page title-->
            <div data-kt-place="true" data-kt-place-mode="prepend" data-kt-place-parent="{default: '#kt_content_container', 'lg': '#kt_toolbar_container'}" class="page-title d-flex align-items-left me-3 flex-wrap mb-5 mb-lg-0 lh-1">
                <!--begin::Title-->
                <h1 class="d-flex align-items-center text-dark fw-bolder my-1 fs-3"><?= $header['site_title'] ?></h1>
                <!--end::Title-->
                <!--begin::Separator-->
                <span class="h-20px border-gray-200 border-start mx-4"></span>
                <!--end::Separator-->
                <!--begin::Breadcrumb-->
                <ul class="breadcrumb breadcrumb-separatorless fw-bold fs-7 my-1">
                    <li class="breadcrumb-item text-muted">
                        <a href="<?= base_url() ?>" class="text-muted text-hover-primary">Inicio</a>
                    </li>
                    <li class="breadcrumb-item">
                        <span class="bullet bg-gray-200 w-5px h-2px"></span>
                    </li>
                    <li class="breadcrumb-item text-muted">
                        <a href="<?= base_url('Products/listing') ?>" class="text-muted text-hover-primary">Listado de productos</a>
                    </li>
                    <li class="breadcrumb-item">
                        <span class="bullet bg-gray-200 w-5px h-2px"></span>
                    </li>
                    <li class="breadcrumb-item text-dark"><?= $header['site_title'] ?></li>
                </ul>
                <!--end::Breadcrumb-->
            </div>
            <!--end::Page title-->
            <!--begin::Actions-->
            <div class="d-flex align-items-center py-1">
                <div class="">
                    <?php if($query->id!='') {?>
                    <button class="btn btn-primary" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
Acciones
                    </button> <?php } ?>
                    <?php
                    if($query->id!='') {
                    $id = base64_encode($query->id);
                    $delete_link = base_url('Products/remove/' . $id);?>
                    <ul class="dropdown-menu" aria-labelledby="dropdownMenuButton">
                   <li class=""><a href="javascript:void(0)" class="dropdown-item" onclick="return removeDataFromDetails('<?= $query->id ?>');"> Borrar</a></li>
                   </ul>
                    <?php } ?>
                    <a href="<?= base_url('Products/listing') ?>" class="btn btn-white btn-active-light-danger me-2">Atrás</a>
                    <button type="submit" class="btn btn-primary" id="kt_account_profile_details_submit">Ahorrar</button>
                </div>
            </div>
            <!--end::Actions-->
        </div>
        <!--end::Container-->
    </div>
    <!--end::Toolbar-->
    <!--begin::Post-->
    <div class="post d-flex flex-column-fluid" id="kt_post">
        <!--begin::Container-->
        <div id="kt_content_container" class="container-fluid row">

            <div class=" col-md-12">

                <div class="card mb-5 mb-xl-10">
                    <!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert'); ?><!--END::ALERT MESSAGE -->
                    <!--begin::Card header-->
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#product_info" aria-expanded="true" aria-controls="product_info">
                        <!--begin::Card title-->
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">Información del Producto </h3>
                        </div>
                        <!--end::Card title-->

                    </div>
                    <!--begin::Card header-->
                    <!--begin::Content-->
                    <div id="product_info" class="collapse show">
                        <!--begin::Card body-->
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <!--begin::Content-->
                                <div class="col-md-12">
                                    <div class="row">
                                    <div class="col-md-10">    
                                    <div class="row mb-6  <?=$this->session->userdata('user_id')!='1'?'d-none':''?>">
                                        <label class="col-lg-2 col-form-label required fw-bold fs-6">Seleccionar Vendedor</label>
                                        <div class="col-lg-6">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <select name="seller_id" id="seller_id" required="true" class="form-select" onchange="return get_category(this.value)">
                                                        <option value="">Seleccionar Vendedor</option>
                                                        <?php
                                                        if (!empty($seller_name)) {
                                                            foreach ($seller_name as $k => $seller_name_list) {
                                                        ?>
                                                                <option value="<?= $seller_name_list->id ?>" <?= $seller_name_list->id == $query->seller_id ? 'selected' : '' ?>><?= $seller_name_list->seller_name ?></option>
                                                        <?php }
                                                        } ?>
                                                    </select>
                                                   
                                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                         
                                    <div class="row mb-6">
                                        <?php if($this->session->userdata('user_id')==1) {?>
                                        <input type="hidden" name="for_tag_insert" id="for_tag_insert" value=""/>
                                        <?php } else {?>
                                        <input type="hidden" name="for_tag_insert" id="for_tag_insert" value="<?=$this->session->userdata('seller_id')?>"/>
                                        <?php }?>
                                        <label class="col-lg-2 col-form-label required fw-bold fs-6">Categoría</label>
                                        <div class="col-lg-6">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <select name="category_id" id="category_id" class="form-control form-control-lg  js-example-basic-single" >
                                                        <?= $categories ?>
                                                    </select>
                                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                                </div>

                                            </div>
                                        </div>
                                       
                                    </div>
                                    <div class="row mb-6">
                                        <label class="col-lg-2 col-form-label required fw-bold fs-6 mb-3">Productos</label>
                                        <div class="col-lg-6 mb-3">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <input type="text" name="title" class="form-control " placeholder="Productos" value="<?= $query->title ?>" required>
                                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                                </div>

                                            </div>
                                        </div>
                                        
                                    </div>
                                    </div>
                                        <div class="col-md-2">
                                           
                                            <div class="row">
                                                <div class="product_preview" ></div>
                                           
                                                
                                                <?php
                                                if(!empty($query->photos)){
                                                    $photos = explode(',',$query->photos); 
                                                     $photos = generate_ids_string($photos);
                                                    $feat_image= $this->Product_model->getFeaturedImage($photos);
                                                     $img = base_url('assets/uploads/files_manager/' . $feat_image->file_name);
                                                     ?>
                                                <img src="<?=$img?>" class="img-thumbnail removedata"/>
                                                <?php   
                                                }
                                                ?>
                                                

                                            </div>
                                        
                                        </div>
                                    </div>   
                                    
                                </div>
                                <!--end::Content-->
                            </div>

                        </div>
                        <!--end::Card body-->
                    </div>
                    <!--end::Content-->
                </div>

                <div class="card mb-5 mb-xl-10">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#product_desc" aria-expanded="true" aria-controls="product_desc">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">Descripción del Producto </h3>
                        </div>
                    </div>
                    <div id="product_desc" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">
                                    <div class="row mb-6">
                                        <label class="col-lg-2 col-form-label required fw-bold fs-6 mb-3">Descripción del Producto</label>
                                        <div class="col-lg-10 mb-3">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <textarea name="description" class="form-control  editor" rows="5" placeholder="Product Description"><?= $query->description ?></textarea>
                                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                                </div>

                                            </div>
                                        </div>
                                        <!--<label class="col-lg-2 col-form-label required fw-bold fs-6">Description in Turkish</label>
<div class="col-lg-10">
<div class="row">
<div class="col-lg-12 fv-row fv-plugins-icon-container">
<textarea name="description_tr" class="form-control  editor" rows="5" placeholder="Description"><?= $query->description_tr ?></textarea>
<div class="fv-plugins-message-container invalid-feedback"></div>
</div>

</div>
</div>-->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mb-5 mb-xl-10">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#product_img" aria-expanded="true" aria-controls="product_img">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">Imagen del Producto </h3>
                        </div>
                    </div>
                    <div id="product_img" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">
                                    <div class="row mb-6">
                                        <label class="col-lg-2 col-form-label fw-bold fs-6">Imagen de la Galería (600x600)</label>
                                        <div class="col-lg-10">
                                            <div class="input-group" data-toggle="aizuploader" data-type="image" data-multiple="true" data-bs-toggle="modal" data-bs-target="#aizUploaderModal">
                                                <div class="input-group-prepend">
                                                    <div class="input-group-text bg-soft-secondary font-weight-medium" >Buscar</div>
                                                </div>
                                                <div class="form-control form-control-aiz file-amount">Seleccione Archivo</div>
                                                <input type="hidden" name="photos" class="selected-files" value="<?= $query->photos ?>">
                                            </div>
                                            <div class="file-preview box sm"></div>
                                            <small class="text-muted">Usar Tamaño de la Imagen (600x600.)</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card mb-5 mb-xl-10" id="simple">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#product_price_stock" aria-expanded="true" aria-controls="product_price_stock">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">Precio del Artículo</h3>
                        </div>
                    </div>
                    <div id="product_price_stock" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">
                                    <div class="row mb-6">
                                        <label class="col-lg-2 col-form-label fw-bold fs-6 required" id="price_lebel">Precio</label>
                                        <div class="col-lg-10">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <!--<input type="number" name="unit_price" id="unit_price" class="form-control " step="0.01" min=".01" placeholder="Price" value="<?= $query->unit_price ?>">-->
                                                    <input type="number" name="unit_price" id="unit_price" class="form-control " step="0.01" placeholder="Price" required value="<?= $query->unit_price ?>">
                                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                    <div class="row mb-6">
                                        <label class="col-lg-2 col-form-label fw-bold fs-6">Descuento </label>
                                        <div class="col-lg-10">
                                            <div class="row">
                                                <div class="col-lg-8 fv-row fv-plugins-icon-container">
                                                    <input type="number" step="0.01" placeholder="Discount" name="discount" class="form-control " value="<?= $query->discount ?>">
                                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                                </div>
                                                <div class="col-lg-4 fv-row fv-plugins-icon-container">
                                                    <select class="form-select form-select-solid form-select-lg" name="discount_type" tabindex="-98">
                                                        <option value="flat" <?= $query->discount_type == 'flat' ? 'selected' : '' ?>>Plano</option>
                                                        <option value="percent" <?= $query->discount_type == 'percent' ? 'selected' : '' ?>>Porcentaje</option>
                                                    </select>
                                                </div>

                                            </div>
                                        </div>
                                    </div>

                                    <div class="row mb-6">
                                        <label class="col-lg-2 col-form-label fw-bold fs-6">SKU</label>
                                        <div class="col-lg-10">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <input type="text" placeholder="SKU" value="<?= $query->sku ?>" name="sku" class="form-control">
                                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                    <div class="row mb-6">
                                        <label class="col-lg-2 col-form-label fw-bold fs-6">Artículo de Inventario</label>
                                        <div class="col-lg-10">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <label for="dine_in" class="form-label fs-6 fw-bolder mb-3"></label>
                                                    <label class="form-check form-switch form-switch-sm form-check-custom form-check-solid d-block">
                                                        <input class="form-check-input" id="inventory_item" name="inventory_item" type="checkbox" value="1" <?= $query->inventory_item == '1' ? 'checked' : '' ?>>
                                                    </label>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                    <div class="row mb-6 " style="display:none;" id="inventory_stock">
                                        <label class="col-lg-2 col-form-label fw-bold fs-6">Acción</label>
                                        <div class="col-lg-10">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <input type="number" name="current_stock" step="1" min="0" class="form-control" placeholder="Acción" value="<?= $query->current_stock ?>">
                                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                    <div class="row mb-6 d-none">
                                        <label class="col-lg-2 col-form-label fw-bold fs-6">Low Stock Limit (For stock notification)</label>
                                        <div class="col-lg-10">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <input type="number" name="low_stock_quantity" step="1" min="0" class="form-control " placeholder="Low Stock" value="<?= $query->low_stock_quantity ?>">
                                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mb-5 mb-xl-10">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#product_size_att" aria-expanded="true" aria-controls="product_size_att">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-5">Tamaño del Producto </h3>
                            <div class="form-check-solid form-switch">
                                <input class="form-check-input" type="checkbox" name="variant_product" id="size_attributes" <?php if ($query->variant_product == 1) { ?> checked="true" <?php } ?> value="1" />
                            </div>
                        </div>

                    </div>

                </div>
                <div class="card mb-5 mb-xl-10" style="display:none;" id="variable">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#product_price_stock" aria-expanded="true" aria-controls="product_price_stock">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">Tamaño</h3>

                        </div>
                    </div>
                    <div id="product_price_stock" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">
                                    <div class="row">
                                        <div class=" mb-2  mt-7">
                                            <div class="d-flex float-end py-1">
                                                <div class="">

                                                    <button type="button" class="btn btn-info" onclick="return clone_each_task(event)" id="task_each_clone">Agregar Opciones</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row mb-6">

                                        <div class="col-lg-10">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <table class="table table-row-dashed table-bordered table-hover text-nowrap" width="100%">
                                                        <!--begin::Table head-->
                                                        <thead class="">
                                                            <!--begin::Table row-->
                                                            <tr class="text-start text-gray-400 fw-bolder fs-7 gs-0">
                                                                <th class="fw-bold fs-6">Tamaño</th>
                                                                <th class="fw-bold fs-6" id="variant_price">Precio</th>
                                                                <!--<th class="fw-bold fs-6">Stock</th>-->
                                                                <th class="fw-bold fs-6">SKU</th>
                                                                <th>Acciones</th>
                                                            </tr>
                                                            <!--end::Table row-->
                                                        </thead>
                                                        <!--end::Table head-->
                                                        <!--begin::Table body-->
                                                        <tbody class="fw-bold text-gray-600" id="clone_each_repeter">
                                                            <input type="hidden" name="product_id" value="<?= $query->id ?>" />
                                                            <?php
                                                            if (!empty($size)) {
                                                                foreach ($size as $k => $rows) {
                                                            ?>
                                                                    <input type="hidden" name="variation_id[]" value="<?= $rows->id ?>" />
                                                                    <tr class="clone_each_repeat" id="clone_each_repeat_1">
                                                                        <td><input class="form-control" type="text" value="<?= $rows->variation_name ?>" name="size[]" id="size_1" placeholder="Size" autocomplete="off"></td>
                                                                        <td><input class="form-control" type="text" value="<?= $rows->price ?>" name="price[]" id="price_1" placeholder="Price" autocomplete="off" required=""></td>
                                                                        <!--<td><input class="form-control" type="text" value="<?= $rows->stock ?>" name="stock[]" id="stock_1"  placeholder="Stock" autocomplete="off" ></td>-->
                                                                        <td><input class="form-control" type="text" value="<?= $rows->sku ?>" name="variantion_sku[]" id="sku_1" placeholder="SKU" autocomplete="off"></td>
                                                                        <td>
                                                                            <button type="button" class="remove btn btn-icon btn-bg-light btn-active-color-primary btn-sm" tabindex="13" onclick="return removeVariation('<?= $rows->id ?>','1');"><span class="svg-icon svg-icon-3">
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
                                                                                        <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                                                                                            <rect x="0" y="0" width="24" height="24"></rect>
                                                                                            <path d="M6,8 L6,20.5 C6,21.3284271 6.67157288,22 7.5,22 L16.5,22 C17.3284271,22 18,21.3284271 18,20.5 L18,8 L6,8 Z" fill="#000000" fill-rule="nonzero"></path>
                                                                                            <path d="M14,4.5 L14,4 C14,3.44771525 13.5522847,3 13,3 L11,3 C10.4477153,3 10,3.44771525 10,4 L10,4.5 L5.5,4.5 C5.22385763,4.5 5,4.72385763 5,5 L5,5.5 C5,5.77614237 5.22385763,6 5.5,6 L18.5,6 C18.7761424,6 19,5.77614237 19,5.5 L19,5 C19,4.72385763 18.7761424,4.5 18.5,4.5 L14,4.5 Z" fill="#000000" opacity="0.3"></path>
                                                                                        </g>
                                                                                    </svg>
                                                                                </span></button>
                                                                        </td>
                                                                    </tr>
                                                                <?php }
                                                            } else { ?>
                                                                <tr class="clone_each_repeat" id="clone_each_repeat_1">
                                                                    <td><input class="form-control" type="text" name="size[]" id="size_1" placeholder="Size" autocomplete="off"></td>
                                                                    <td><input class="form-control" type="text" name="price[]" id="price_1" placeholder="Price" autocomplete="off"></td>
                                                                    <!--<td><input class="form-control" type="text"  name="stock[]" id="stock_1"  placeholder="Stock" autocomplete="off" ></td>-->
                                                                    <td><input class="form-control" type="text" name="variantion_sku[]" id="sku_1" placeholder="SKU" autocomplete="off"></td>
                                                                    <td>
                                                                        <button type="button" class="remove btn btn-icon btn-bg-light btn-active-color-primary btn-sm" tabindex="13" onclick="return removeRow('1','1');"><span class="svg-icon svg-icon-3">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
                                                                                    <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                                                                                        <rect x="0" y="0" width="24" height="24"></rect>
                                                                                        <path d="M6,8 L6,20.5 C6,21.3284271 6.67157288,22 7.5,22 L16.5,22 C17.3284271,22 18,21.3284271 18,20.5 L18,8 L6,8 Z" fill="#000000" fill-rule="nonzero"></path>
                                                                                        <path d="M14,4.5 L14,4 C14,3.44771525 13.5522847,3 13,3 L11,3 C10.4477153,3 10,3.44771525 10,4 L10,4.5 L5.5,4.5 C5.22385763,4.5 5,4.72385763 5,5 L5,5.5 C5,5.77614237 5.22385763,6 5.5,6 L18.5,6 C18.7761424,6 19,5.77614237 19,5.5 L19,5 C19,4.72385763 18.7761424,4.5 18.5,4.5 L14,4.5 Z" fill="#000000" opacity="0.3"></path>
                                                                                    </g>
                                                                                </svg>
                                                                            </span></button>
                                                                    </td>
                                                                </tr>
                                                            <?php } ?>
                                                        </tbody>
                                                        <!--end::Table body-->
                                                    </table>
                                                </div>

                                            </div>
                                        </div>
                                    </div>




                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mb-5 mb-xl-10">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#product_options" aria-expanded="true" aria-controls="product_options">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">Opciones</h3>
                        </div>
                    </div>
                    <div id="product_options" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">

                                     <div class="row mb-6" id="seller_parameters">
                                     </div>
                                    

                                     <div class="row mb-6" id="edit_parameters">
                                         <input type="hidden" name="store_prod_id" id="store_prod_id" value="<?= $query->id ?>"/> 
                                         
                                        <?php
                                        if (!empty($p_option)) {
                                            $optionArr = explode(',', $query->option_ids);
                                            foreach ($p_option as $k_b => $p_option) {
                                            $attid = base64_encode($p_option->id);    
                                            $att_options = $this->Product_model->getConfigurationList($attid);
                                        ?>

                                                <div class="col-lg-4">
                                                    <div class="row">
                                                        <div class="fv-row fv-plugins-icon-container mt-2">
                                                            <input onclick="saveClick('<?= $p_option->id ?>')" class="form-check-input" type="checkbox" name="product_option[]" value="<?= $p_option->id ?>" id="parentclick_<?= $p_option->id ?>" <?php if (in_array($p_option->id, $optionArr)) {
                                                                                                                                                                                            echo 'checked';
                                                                                                                                                                                        } ?>>
                                                            <label class="form-check-label fs-4 fw-bold ps-2" for="flexCheckDefault">
                                                                <?= $p_option->attribute_name ?>
                                                            </label>
                                                        </div>
                                                        <?php
                                                        if (!empty($att_options)) {
                                                           $attArr = explode(',', $product_attributes->attributes_options);
                                                            //print_r($attArr);
                                                            foreach ($att_options as $k_t => $att_option) {
                                                                
                                                                
                                                        ?>
                                                        <div class="fv-row fv-plugins-icon-container mt-2 ps-12">
                                                            <input onclick="childClick('<?= $p_option->id ?>')" id="clickcheck_<?= $p_option->id ?>" class="form-check-input child_<?= $p_option->id ?>" type="checkbox" name="att_options[]" value="<?= $att_option->id ?>" id="att_options" <?php if (in_array($att_option->id, $attArr)) {
                                                                                                                                                                                            echo 'checked';
                                                                                                                                                                                        } ?>>
                                                            <label class="form-check-label ps-2 " for="flexCheckDefault">
                                                                <?= $att_option->configuration_name ?>
                                                            </label>
                                                        </div>
                                                        <?php } } ?>
                                                        
                                                    </div>
                                                </div>
                                        <?php }
                                        } ?>
                                        
                                     </div>



                                    <div class="row mb-6 mt-20">

                                        <div class="col-lg-10">
                                            <div class="row">
                                                <div class="col-lg-4 fv-row fv-plugins-icon-container">
                                                    <div class="fv-row mb-5 fv-plugins-icon-container">
                                                        <label for="dine_in" class="form-label fs-6 fw-bolder mb-3">Comer Aquí</label>
                                                        <label class="form-check form-switch form-switch-sm form-check-custom form-check-solid d-block">
                                                            <input class="form-check-input" name="dine_in" type="checkbox" value="1" <?= $query->dine_in == '1' ? 'checked' : '' ?>>
                                                        </label>
                                                    </div>
                                                </div>
                                                <div class="col-lg-4 fv-row fv-plugins-icon-container">
                                                    <div class="fv-row mb-5 fv-plugins-icon-container">
                                                        <label for="message" class="form-label fs-6 fw-bolder mb-3">Para Llevar</label>
                                                        <label class="form-check form-switch form-switch-sm form-check-custom form-check-solid d-block">
                                                            <input class="form-check-input" name="take_out" type="checkbox" value="1" <?= $query->take_out == '1' ? 'checked' : '' ?>>
                                                        </label>
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mb-5 mb-xl-10">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#cross_sell" aria-expanded="true" aria-controls="cross_sell">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">También te podria gustar  </h3>
                        </div>
                    </div>
                    <div id="product_options" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">


                                    <div class="row mb-6">
                                        <label class="fs-6 fw-bold mb-2">Seleccionar Productos</label>
                                        <select class="form-select" id="cross_sell_id" data-control="select2" data-placeholder="Seleccionar Productos" data-allow-clear="true" multiple="multiple" name="cross_sell_ids[]">

                                            <?= $products ?>

                                        </select>
                                    </div>




                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card mb-5 mb-xl-10 <?=$this->session->userdata('user_id')!='1'?'d-none':''?>">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#best_selling" aria-expanded="true" aria-controls="best_selling">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">Productos Recomendados En La Página De Inicio</h3>
                        </div>
                    </div>
                    <div id="best_selling" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">


                                    <div class="row mb-6">
                                        <label class="fs-6 fw-bold mb-2">Mostrar en la Página de Inicio</label>
                                        <div class="form-check-solid form-switch">
                                            <input class="form-check-input" type="checkbox" name="recommended_product" id="display_homepage" <?php if ($query->recommended_product == 1) { ?> checked="true" <?php } ?> value="1" />
                                        </div>
                                    </div>

                                    <div class="row mb-6" style="display:none;" id="position_order">
                                        <label class="fs-6 fw-bold mb-2">Posición</label>
                                        <div class="">
                                            <input class="form-control form-control-solid" type="number" value="<?php if ($query->recommended_product == 1) {
                                                                                                                    echo $query->order_no;
                                                                                                                } ?>" name="order_no" placeholder="Nº De Pedido" autocomplete="off" min="1">
                                        </div>
                                    </div>



                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-5 pf-2">

            </div>

        </div>
        <!--end::Container-->
    </div>
    <!--end::Post-->
</form>
<!--end::Form-->


<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('admin/_js', $this->data);
$this->load->view('templates/admin/_file_manager', $this->data);
?>
<script>
    function get_category(id) {
        $('#for_tag_insert').val(id);
        
        if (id != '') {
            
           var p_id= $('#store_prod_id').val();
          
            $('#edit_parameters').hide(); 
            $.ajax({
                type: 'POST',
                url: "<?= base_url('Products/getAllcategoryData') ?>" + "/" + id,
                data: '',
                success: function(result) {
                    //alert(result);
                    //result = JSON.parse(result);
                    //console.log(result);
                    $('#category_id').html(result);
                }
            });
            $.ajax({
                type: 'POST',
                url: "<?= base_url('Products/getAllcrossSellproduct') ?>" + "/" + id,
                data: '',
                success: function(result) {
                    //alert(result);
                    //result = JSON.parse(result);
                    //console.log(result);
                    $('#cross_sell_id').html(result);
                }
            });
            
            $.ajax({
                type: 'POST',
                url: "<?= base_url('Products/getSellerProductsParameters') ?>" + "/" + id + "/" + p_id,
                data: '',
                success: function(result) {
                    //alert(result);
                   
                    $('#seller_parameters').html(result);
                }
            });
        }
    }
</script>

<!--<script>
<?php if ($query->product_type == 0) { ?>
$('#simple').show();
<?php } ?> 
<?php if ($query->product_type == 1) { ?>
$('#variable').show();
<?php } ?>    
function get_producttype(type){
if(type==0){
$('#simple').show(); 
$('#variable').hide(); 
$('#price_lebel').addClass('required');
$("#unit_price").attr("required", true);
}
if(type==1){
$('#variable').show();

$('#variant_price').addClass('required');
$("#price_1").attr("required", true);
$('#simple').hide(); 
}

}
</script>-->

<script>
    <?php if ($query->variant_product == 1) { ?>
        $('#variable').show();
    <?php } ?>

    $("#size_attributes").click(function() {
        if ($(this).is(":checked")) {
            $("#variable").show();
        } else {
            $("#variable").hide();
        }
    });
    <?php if ($query->inventory_item == 1) { ?>
        $('#inventory_stock').show();
    <?php } ?>
    $("#inventory_item").click(function() {
        if ($(this).is(":checked")) {
            $("#inventory_stock").show();
        } else {
            $("#inventory_stock").hide();
        }
    });

    <?php if ($query->recommended_product == 1) { ?>
        $('#position_order').show();
    <?php } ?>
    $("#display_homepage").click(function() {
        if ($(this).is(":checked")) {
            $("#position_order").show();
        } else {
            $("#position_order").hide();
        }
    });
</script>

<script>
function saveClick(e){
      if($('#parentclick_'+e).is(":checked")) {
            $(".child_"+e).prop("checked", true);
            
         } else {
             $(".child_"+e).prop("checked", false);
            
         }
         //var check= $('#parentclick_'+e).attr('checked', true);
         //alert(check);
          //$(".child_"+e).prop("checked", true);
        }
        
        function childClick(e){
      
        //if($('#parentclick_'+e).is(":checked")) {
            $("#parentclick_"+e).prop("checked", true);
            
        
        }
 
       
</script>
<?php if($query->id!='') {?>
<style>
    /*.select2-container .select2-selection--single .select2-selection__rendered {
    margin-top: -8px!important;
    }*/
</style>
<?php }?>

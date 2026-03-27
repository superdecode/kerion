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
                        <a href="<?= base_url() ?>" class="text-muted text-hover-primary">Ordering App</a>
                    </li>
                    <li class="breadcrumb-item">
                        <span class="bullet bg-gray-200 w-5px h-2px"></span>
                    </li>
                    <li class="breadcrumb-item text-muted">
                        <a href="<?= base_url('Products/listing') ?>" class="text-muted text-hover-primary">Product Listing</a>
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
                    <a href="<?= base_url('Products/listing') ?>" class="btn btn-white btn-active-light-danger me-2">Back</a>
                    <button type="submit" class="btn btn-primary" id="kt_account_profile_details_submit">Save</button>
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
                            <h3 class="fw-bolder m-0">Product information</h3>
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
                <div class="row mb-6">
    <label class="col-lg-2 col-form-label required fw-bold fs-6">Select Seller</label>
    <div class="col-lg-10">
        <div class="row">
            <div class="col-lg-12 fv-row fv-plugins-icon-container">
                <select name="seller_id" id="seller_id" required="true" class="form-select" onchange="return get_category(this.value)">
                <option value="">Select Seller</option>  
                <?php
                if(!empty($seller_name)){
                        foreach($seller_name as $k=>$seller_name_list){
                ?>
                <option value="<?=$seller_name_list->id?>" <?= $seller_name_list->id == $query->seller_id ? 'selected' : '' ?>><?=$seller_name_list->seller_name?></option>
               <?php } }?>
            </select>
                <div class="fv-plugins-message-container invalid-feedback"></div>
            </div>

        </div>
    </div>
</div>   
<div class="row mb-6">
    <label class="col-lg-2 col-form-label required fw-bold fs-6">Category</label>
    <div class="col-lg-10">
        <div class="row">
            <div class="col-lg-12 fv-row fv-plugins-icon-container">
                <select name="category_id" id="category_id" class="form-select " >
                <?=$categories?>
                </select>
                <div class="fv-plugins-message-container invalid-feedback"></div>
            </div>

        </div>
    </div>
</div>                
<div class="row mb-6">
    <label class="col-lg-2 col-form-label required fw-bold fs-6 mb-3">Product</label>
    <div class="col-lg-10 mb-3">
        <div class="row">
            <div class="col-lg-12 fv-row fv-plugins-icon-container">
                <input type="text" name="title" class="form-control " placeholder="Product" value="<?= $query->title ?>" required>
                <div class="fv-plugins-message-container invalid-feedback"></div>
            </div>

        </div>
    </div>

</div>
             

<div class="row mb-6 d-none">
    <label class="col-lg-2 col-form-label fw-bold fs-6">Brand</label>
    <div class="col-lg-10">
        <div class="row">
            <div class="col-lg-12 fv-row fv-plugins-icon-container">
                <select class="form-select " tabindex="-1" aria-hidden="true" id="" name="brand_id" >
                    <option value="" >Select Brand</option>
                    <?php
                    if (!empty($brands)) {
                        foreach ($brands as $k_b => $brand) {
                            ?>
                            <option value="<?= $brand->id ?>" <?= $brand->id == $query->brand_id ? 'selected' : '' ?> ><?= $brand->title ?></option>												
                            <?php
                        }
                    }
                    ?>
                </select>
                <div class="fv-plugins-message-container invalid-feedback"></div>
            </div>

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
                            <h3 class="fw-bolder m-0">Product description </h3>
                        </div>
                    </div>
                    <div id="product_desc" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">
                                    <div class="row mb-6">
                                        <label class="col-lg-2 col-form-label required fw-bold fs-6 mb-3">Product description</label>
                                        <div class="col-lg-10 mb-3">
                                            <div class="row">
                                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                                    <textarea name="description" class="form-control  editor" rows="5" placeholder="Ürün açıklaması"><?= $query->description ?></textarea>
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
                            <h3 class="fw-bolder m-0">Product image </h3>
                        </div>
                    </div>
                    <div id="product_img" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">
                                    <div class="row mb-6">
                                        <label class="col-lg-2 col-form-label fw-bold fs-6">Gallery image (600x600)</label>
                                        <div class="col-lg-10">
                                            <div class="input-group" data-toggle="aizuploader" data-type="image" data-multiple="true" data-bs-toggle="modal" data-bs-target="#aizUploaderModal">
                                                <div class="input-group-prepend">
                                                    <div class="input-group-text bg-soft-secondary font-weight-medium">ara</div>
                                                </div>
                                                <div class="form-control form-control-aiz file-amount">Select file</div>
                                                <input type="hidden" name="photos" class="selected-files" value="<?= $query->photos ?>">
                                            </div>
                                            <div class="file-preview box sm"></div>
                                            <small class="text-muted">Use 600x600 sizes images.</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card mb-5 mb-xl-10"  id="simple">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#product_price_stock" aria-expanded="true" aria-controls="product_price_stock">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">Item price</h3>
                        </div>
                    </div>
                    <div id="product_price_stock" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">							
                                    <div class="row mb-6">
                                        <label class="col-lg-2 col-form-label fw-bold fs-6 required" id="price_lebel">Price</label>
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
                                        <label class="col-lg-2 col-form-label fw-bold fs-6">Discount </label>
                                        <div class="col-lg-10">
                                            <div class="row">
                                                <div class="col-lg-8 fv-row fv-plugins-icon-container">
                                                    <input type="number" step="0.01" placeholder="Discount" name="discount" class="form-control " value="<?= $query->discount ?>" >
                                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                                </div>
                                                <div class="col-lg-4 fv-row fv-plugins-icon-container">
                                                    <select class="form-select form-select-solid form-select-lg" name="discount_type" tabindex="-98">
                                                        <option value="amount" <?= $query->discount_type == 'amount' ? 'selected' : '' ?>>Flat</option>
                                                        <option value="percent" <?= $query->discount_type == 'percent' ? 'selected' : '' ?>>Percent</option>
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

                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card mb-5 mb-xl-10">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#product_size_att" aria-expanded="true" aria-controls="product_size_att">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">Product Size</h3>
                        </div>
                        <input type="checkbox" name="variant_product" id="size_attributes" <?php if($query->variant_product==1){?> checked="true" <?php }?> value="1"/>
                    </div>
                    
                </div>
                <div class="card mb-5 mb-xl-10" style="display:none;" id="variable">
                    <div class="card-header border-0 cursor-pointer " role="button" data-bs-toggle="collapse" data-bs-target="#product_price_stock" aria-expanded="true" aria-controls="product_price_stock">
                        <div class="card-title m-0 ">
                            <h3 class="fw-bolder m-0">Size</h3>
                            
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
                                        
                                        <button type="button" class="btn btn-info" onclick="return clone_each_task(event)" id="task_each_clone">Add Options</button>
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
                        <th class="fw-bold fs-6">Size</th>
                        <th class="fw-bold fs-6" id="variant_price">Price</th>
                        <th class="fw-bold fs-6">Stock</th>
                        <th class="fw-bold fs-6">SKU</th>
                        <th>Action</th>
                        </tr>
                        <!--end::Table row-->
                        </thead>
                        <!--end::Table head-->
                        <!--begin::Table body-->
                        <tbody class="fw-bold text-gray-600" id="clone_each_repeter">
                         <input type="hidden" name="product_id" value="<?=$query->id?>" />     
                        <?php
                        if (!empty($size)) {
                        foreach ($size as $k => $rows) {
                        ?>
                        <input type="hidden" name="variation_id[]" value="<?=$rows->id?>" /> 
                        <tr class="clone_each_repeat" id="clone_each_repeat_1">	
                        <td><input class="form-control" type="text" value="<?=$rows->variation_name?>" name="size[]" id="size_1"  placeholder="Size" autocomplete="off" ></td>
                        <td><input class="form-control" type="text" value="<?=$rows->price?>" name="price[]" id="price_1"  placeholder="Price" autocomplete="off" required="" ></td>
                        <td><input class="form-control" type="text" value="<?=$rows->stock?>" name="stock[]" id="stock_1"  placeholder="Stock" autocomplete="off" ></td>
                        <td><input class="form-control" type="text" value="<?=$rows->sku?>" name="variantion_sku[]" id="sku_1"  placeholder="SKU" autocomplete="off" ></td>
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
                        <?php } } else {?>
                        <tr class="clone_each_repeat" id="clone_each_repeat_1">	
                        <td><input class="form-control" type="text"  name="size[]" id="size_1"  placeholder="Size" autocomplete="off" ></td>
                        <td><input class="form-control" type="text"  name="price[]" id="price_1"  placeholder="Price" autocomplete="off" ></td>
                        <td><input class="form-control" type="text"  name="stock[]" id="stock_1"  placeholder="Stock" autocomplete="off" ></td>
                        <td><input class="form-control" type="text"   name="variantion_sku[]" id="sku_1"  placeholder="SKU" autocomplete="off" ></td>
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
                            <h3 class="fw-bolder m-0">Options</h3>
                        </div>
                    </div>
                    <div id="product_options" class="collapse show">
                        <div class="card-body border-top p-9">
                            <div class="d-flex flex-column flex-lg-row">
                                <div class="col-md-12">							
                                    
                                    
                                    <div class="row mb-6">
                                        <?php
                                        if (!empty($p_option)) {
                                            $optionArr = explode(',',$query->option_ids);
                                        foreach ($p_option as $k_b => $p_option) {
                                        ?>
                                       
                                        <div class="col-lg-4">
                                            <div class="row">
                                                <div class="fv-row fv-plugins-icon-container mt-2">
                                                    <input class="form-check-input" type="checkbox" name="product_option[]" value="<?= $p_option->id ?>" id="flexCheckDefault" <? if(in_array($p_option->id,$optionArr)){ echo 'checked'; } ?>>
                                                    <label class="form-check-label" for="flexCheckDefault">
                                                      <?= $p_option->attribute_name ?>
                                                    </label>
                                                </div>
                                               

                                            </div>
                                        </div>
                                        <?php } }?>
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
function get_category(id){
    
	if (id != '') {
		$.ajax({
			type: 'POST',
			url: "<?= base_url('Products/getAllcategoryData') ?>" + "/" + id,
			data: '',
			success: function (result) {
                            //alert(result);
				//result = JSON.parse(result);
				//console.log(result);
				$('#category_id').html(result);
			}
		});
	}
}
</script>

<!--<script>
<?php if($query->product_type==0) {?>
    $('#simple').show();
<?php } ?> 
<?php if($query->product_type==1) {?>
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
<?php if($query->variant_product==1) {?>
    $('#variable').show();
<?php } ?> 

$("#size_attributes").click(function() {
    if($(this).is(":checked")) {
        $("#variable").show();
    } else {
        $("#variable").hide();
    }
});
</script>
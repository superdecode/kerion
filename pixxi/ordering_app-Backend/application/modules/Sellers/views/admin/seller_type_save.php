<!--begin::Form-->
<form class="form" id="update_form_<?=$query->id?>" method="POST" action="<?=base_url('Sellers/sellerTypeSave/'.$query->id)?>" id="" data-kt-redirect="<?=base_url('Sellers/sellerTypeSave/'.$query->id)?>" enctype="multipart/form-data">
	<!--begin::Modal header-->
	<div class="modal-header" id="kt_modal_edit_header">
		<!--begin::Modal title-->
		<h2 class="fw-bolder">Guardar vendedor</h2>
		<!--end::Modal title-->
		<!--begin::Close-->
		<div id="" class="btn btn-icon btn-sm btn-active-icon-primary" data-bs-dismiss="modal" aria-label="Close">
			<!--begin::Svg Icon | path: icons/duotone/Navigation/Close.svg-->
			<span class="svg-icon svg-icon-1">
				<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
					<g transform="translate(12.000000, 12.000000) rotate(-45.000000) translate(-12.000000, -12.000000) translate(4.000000, 4.000000)" fill="#000000">
						<rect fill="#000000" x="0" y="7" width="16" height="2" rx="1" />
						<rect fill="#000000" opacity="0.5" transform="translate(8.000000, 8.000000) rotate(-270.000000) translate(-8.000000, -8.000000)" x="0" y="7" width="16" height="2" rx="1" />
					</g>
				</svg>
			</span>
			<!--end::Svg Icon-->
		</div>
		<!--end::Close-->
	</div>
	<!--end::Modal header-->
	<!--begin::Modal body-->
	<div class="modal-body py-10 px-lg-17">
		<!--begin::Scroll-->
		<div class="scroll-y me-n7 pe-7" id="kt_modal_edit_scroll" data-kt-scroll="true" data-kt-scroll-activate="{default: false, lg: true}" data-kt-scroll-max-height="auto" data-kt-scroll-dependencies="#kt_modal_edit_header" data-kt-scroll-wrappers="#kt_modal_edit_scroll" data-kt-scroll-offset="300px">
			<!--<div class="fv-row mb-7">
                            <label class="required fs-6 fw-bold mb-2">Seller Type</label>
                            <select name="seller_type" id="seller_type" required="true" class="form-select">
                                <option value=""> Please select</option>
                                <option value="Restaurants" <?= ($query->seller_type == 'Restaurants') ? 'selected' : '' ?>> Restaurants</option>
                                <option value="Drinks" <?= ($query->seller_type == 'Drinks') ? 'selected' : '' ?>> Drinks</option>
                                <option value="Dessert" <?= ($query->seller_type == 'Restaurants') ? 'selected' : '' ?>> Dessert</option>
                                <option value="Bars" <?= ($query->seller_type == 'Bars') ? 'selected' : '' ?>> Bars</option>
                            </select>
			</div>-->
                        <div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Categoría Principal</label>
				<select class="form-select form-select-solid form-select-lg " tabindex="-1" aria-hidden="true" id="" name="parent_id">
					<option value="0" >Sin Categoria Maestro</option>
					<?php
					if(!empty($parent_categories)){
						foreach($parent_categories as $k=>$parent_category){
					?>
					<option value="<?=$parent_category->id?>" <?=$parent_category->id==$query->parent_id?'selected':''?>><?=$parent_category->seller_type?></option>
					<?php
						}
					}
					?>
				</select>
			</div>
                        <div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Título</label>
				 <input class="form-control form-control-solid" type="text" value="<?=$query->seller_type?>" name="seller_type" placeholder="Title" autocomplete="off" required>
			</div>
                        
                        
                        <div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2">Imagen</label>
				<input type="file" class="form-control" name="seller_type_images" <?=!empty($query->image)?'':''?>>
				<input type="hidden" value="<?=$query->image?>" name="image" >
				<?php if(!empty($query->image)){?><img class="img-fluid w150" src="<?=base_url('assets/uploads/seller_type_images/' . $query->image)?>" alt=""><?php } ?>
			</div>
			
		</div>
		<!--end::Scroll-->
	</div>
	<!--end::Modal body-->
	<!--begin::Modal footer-->
	<div class="modal-footer flex-center">
		<!--begin::Button-->
		<button type="reset" class="btn btn-white me-3">Descartar</button>
		<!--end::Button-->
		<!--begin::Button-->
		<button type="submit" class="btn btn-primary" data-kt-indicator="off" >
			<span class="indicator-label">Entregar</span>
			<span class="indicator-progress">Espere por favor...
			<span class="spinner-border spinner-border-sm align-middle ms-2"></span></span>
		</button>
		<!--end::Button-->
	</div>
	<!--end::Modal footer-->
</form>
<!--end::Form-->
<script>

</script>
<!--begin::Form-->
<form class="form" id="update_form_<?=$query->id?>" method="POST" action="<?=base_url('Banners/save/'.$query->id)?>" id="" data-kt-redirect="<?=base_url('Banners/save/'.$query->id)?>" enctype="multipart/form-data">
	<!--begin::Modal header-->
	<div class="modal-header" id="kt_modal_edit_header">
		<!--begin::Modal title-->
		<h2 class="fw-bolder">Save Banner</h2>
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
			<div class="fv-row mb-7">
                            <label class="required fs-6 fw-bold mb-2">Ubicación del Banner</label>
                            <select name="location" id="location" required="true" class="form-select">
                                <option value=""> Please select</option>
                                <option value="homepage" <?= ($query->location == 'homepage') ? 'selected' : '' ?>> página de inicio</option>
                                <option value="dashboard" <?= ($query->location == 'dashboard') ? 'selected' : '' ?>> Panel</option>    
                                <option value="seller_menu" <?= ($query->location == 'seller_menu') ? 'selected' : '' ?>> Menú del vendedor</option>
                            </select>
			</div>
                        <div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Banner</label>
				<input type="file" class="form-control" name="banner_image" <?=!empty($query->image)?'':'required'?>>
				<input type="hidden" value="<?=$query->image?>" name="image" >
				<?php if(!empty($query->image)){?><img class="img-fluid w150" src="<?=base_url('assets/uploads/banner_images/' . $query->image)?>" alt=""><?php } ?>
			</div>
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2">Título</label>
				<input class="form-control form-control-solid" type="text" value="<?=$query->title?>" name="title" placeholder="Título de la pancarta" autocomplete="off">
			</div>
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2">Nº De Pedido</label>
				<input class="form-control form-control-solid" type="number" value="<?=$query->order_no?>" name="order_no" placeholder="Nº De Pedido No" autocomplete="off" min="1" required>
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
			<span class="indicator-label">Enviar</span>
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
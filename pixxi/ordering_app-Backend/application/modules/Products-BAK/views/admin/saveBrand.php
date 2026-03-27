<!--begin::Form-->
<form class="form" id="update_form_<?=$query->id?>" method="POST" action="<?=base_url('Products/saveBrand/'.$query->id)?>" id="" data-kt-redirect="<?=base_url('Products/saveBrand/'.$query->id)?>" enctype="multipart/form-data">
	<!--begin::Modal header-->
	<div class="modal-header" id="kt_modal_edit_header">
		<!--begin::Modal title-->
		<h2 class="fw-bolder">Save Brand</h2>
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
				<label class="required fs-6 fw-bold mb-2">Title</label>
				<input class="form-control form-control-solid" type="text" value="<?=$query->title?>" name="title" placeholder="Title" autocomplete="off" required>
			</div>
			<div class="fv-row mb-7">
				<label class=" fs-6 fw-bold mb-2">Slug</label>
				<input class="form-control form-control-solid" type="text" value="<?=$query->slug?>" name="slug" placeholder="Slug" autocomplete="off" >
			</div>
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2">Order No</label>
				<input class="form-control form-control-solid" type="number" value="<?=$query->order_no?>" name="order_no" placeholder="Order No" autocomplete="off" min="0" required>
			</div>
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2" for="signinSrEmail">Logo <small>(200x200)</small></label>
				<div class="">
					<div class="input-group" data-toggle="aizuploader" data-type="image" data-multiple="false" data-bs-toggle="modal" data-bs-target="#aizUploaderModal">
						<div class="input-group-prepend">
							<div class="input-group-text bg-soft-secondary font-weight-medium">Browse</div>
						</div>
						<div class="form-control form-control-aiz file-amount">Choose file</div>
						<input type="hidden" name="banner" class="selected-files" value="<?=$query->banner?>">
					</div>
					<div class="file-preview box sm"></div>
					<small class="text-muted">Use 200x200 sizes images.</small>
				</div>
			</div>
			<div class="fv-row mb-7 d-none">
				<label class="fs-6 fw-bold mb-2" for="signinSrEmail">Icon <small>(32x32)</small></label>
				<div class="">
					<div class="input-group" data-toggle="aizuploader" data-type="image" data-multiple="false" data-bs-toggle="modal" data-bs-target="#aizUploaderModal">
						<div class="input-group-prepend">
							<div class="input-group-text bg-soft-secondary font-weight-medium">Browse</div>
						</div>
						<div class="form-control form-control-aiz file-amount">Choose file</div>
						<input type="hidden" name="icon" class="selected-files" value="">
					</div>
					<div class="file-preview box sm"></div>
					<small class="text-muted">Use 32x32 sizes images.</small>
				</div>
			</div>
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2">Meta Title</label>
				<input class="form-control form-control-solid" type="text" value="<?=$query->meta_title?>" name="meta_title" placeholder="Meta Title" autocomplete="off" >
			</div>			
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2">Meta Description</label>
				<textarea name="meta_description" class="form-control form-control-solid " rows="5" placeholder="Meta Description"><?=$query->meta_description?></textarea>
			</div>
			
		</div>
		<!--end::Scroll-->
	</div>
	<!--end::Modal body-->
	<!--begin::Modal footer-->
	<div class="modal-footer flex-center">
		<!--begin::Button-->
		<button type="reset" class="btn btn-white me-3">Discard</button>
		<!--end::Button-->
		<!--begin::Button-->
		<button type="submit" class="btn btn-primary" data-kt-indicator="off" >
			<span class="indicator-label">Submit</span>
			<span class="indicator-progress">Please wait...
			<span class="spinner-border spinner-border-sm align-middle ms-2"></span></span>
		</button>
		<!--end::Button-->
	</div>
	<!--end::Modal footer-->
</form>
<!--end::Form-->
<script>

</script>
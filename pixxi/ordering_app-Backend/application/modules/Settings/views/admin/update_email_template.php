<!--begin::Form-->
<form class="form" id="edit_form_<?=$query->id?>" method="POST" action="<?=base_url('Settings/saveEmailTemplate/'.$query->id)?>" id="" data-kt-redirect="<?=base_url('Settings/saveEmailTemplate/'.$query->id)?>">
	<!--begin::Modal header-->
	<div class="modal-header" id="kt_modal_edit_header">
		<!--begin::Modal title-->
		<h2 class="fw-bolder">Update Email Template</h2>
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
				<label class="required fs-6 fw-bold mb-2">Template Name</label>
				<input class="form-control form-control-solid" type="text" value="<?=$query->name?>" name="name" required placeholder="Template Name" autocomplete="off">
			</div>
			<div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Email Subject</label>
				<input class="form-control form-control-solid" type="text" value="<?=$query->email_subject?>" name="email_subject" required placeholder="Email Subject" autocomplete="off">
			</div>
			<div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Email From</label>
				<input class="form-control form-control-solid" type="email" value="<?=$query->email_from?>" name="email_from" required placeholder="Email From" autocomplete="off">
			</div>
			<div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Email Content</label>
				<textarea class="form-control form-control-solid editor" name="content" placeholder="Email Content" required><?=$query->content?></textarea>
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

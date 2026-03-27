<!--begin::Form-->
<form class="form" id="update_form_<?=$query->id?>" method="POST" action="<?=base_url('Messages/save/'.$query->id)?>" id="" data-kt-redirect="<?=base_url('Messages/save/'.$query->id)?>" enctype="multipart/form-data">
	<!--begin::Modal header-->
	<div class="modal-header" id="kt_modal_edit_header">
		<!--begin::Modal title-->
		<h2 class="fw-bolder">Enviar Mensaje</h2>
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
			
                    <div class="fv-row mb-7 <?=$this->session->userdata('user_id')!='1'?'d-none':''?>">
				<label class="required fs-6 fw-bold mb-2 ">Seleccionar Vendedor</label>
				
                            
                                <div class="col-lg-12 fv-row fv-plugins-icon-container">
                                    <select name="seller_id" id="seller_id" <?php if($this->session->userdata('user_id')==1) {?>required="true" <?php } ?>class="form-select" onchange="return get_category(this.value)">
                                    <option value="">Seleccionar Vendedor</option>  
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
			
			<!--<div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Title</label>
				<input class="form-control form-control-solid" type="text" value="<?=$query->title?>" name="title" placeholder="Title" autocomplete="off" required>
			</div>-->
			
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2">Descripción</label>
				<textarea name="description" class="form-control form-control-solid" rows="5" placeholder="Descripción"><?=$query->description?></textarea>
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
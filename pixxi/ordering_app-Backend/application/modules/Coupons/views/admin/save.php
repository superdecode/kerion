<!--begin::Form-->
<form class="form" id="update_form_<?=$query->id?>" method="POST" action="<?=base_url('Coupons/save/'.$query->id)?>" id="" data-kt-redirect="<?=base_url('Coupons/save/'.$query->id)?>" enctype="multipart/form-data">
	<!--begin::Modal header-->
	<div class="modal-header" id="kt_modal_edit_header">
		<!--begin::Modal title-->
		<h2 class="fw-bolder">Guardar cupón</h2>
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
				<label class="required fs-6 fw-bold mb-2">Select Sellers</label>
				<select class="form-select" id="seller_ids" data-control="select2" data-placeholder="Select restaurants" data-allow-clear="true" name="seller_ids">
					<?php
					if(!empty($restaurantList)){
						if($this->session->userdata('user_id')!='1'){$query->seller_ids = $this->session->userdata('seller_id');}
						$catsArr = explode(',',$query->seller_ids);
						foreach($restaurantList as $k1=>$restaurant){
					?>
					<option value="<?=$restaurant->id?>"<?php if(in_array($restaurant->id,$catsArr)){ echo 'selected'; } ?> ><?=$restaurant->seller_name?></option>
					<?php
						}
					}
					?>
				</select>
			</div>
			<div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Código de Cupón</label>
				<input class="form-control " type="text" value="<?=$query->code?>" name="code" placeholder="Código de Cupón" autocomplete="off" required>
			</div>
			<div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Título</label>
				<input class="form-control " type="text" value="<?=$query->title?>" name="title" placeholder="Cupón Título" autocomplete="off" required>
			</div>
			<div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Subtítulo</label>
				<input class="form-control " type="text" value="<?=$query->subtitle?>" name="subtitle" placeholder="Subtítulo" autocomplete="off" required>
			</div>
			<div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Fecha de Validación</label>
				<?php
				$enable = ($query->enable_date!='0000-00-00' && !empty($query->enable_date))?date('Y-m-d',strtotime($query->enable_date)):date('Y-m-d');
				$disable = ($query->disable_date!='0000-00-00' && !empty($query->disable_date))?date('Y-m-d',strtotime($query->disable_date)):'';
				?>
				<input class="form-control  flatpickr-input" type="text" value="<?=$enable.' to '.$disable?>" name="enable_disable_date" required placeholder="Fecha de activación del cupón" autocomplete="off">
			</div>
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2">Importe Mínimo del Pedido</label>
				<input class="form-control " type="number" min="0" value="<?=$query->min_order?>" name="min_order" placeholder="Cantidad Mínima del Pedido Del Cupón" autocomplete="off">
			</div>
			<!--<div class="fv-row mb-7">
				<label class="required fs-6 fw-bold mb-2">Coupon Discount Value (%)</label>
				<input class="form-control " type="number" min="0" value="<?=$query->value?>" name="value" placeholder="Coupon value" autocomplete="off" required>
			</div>-->
                    
                    <div class="row mb-6">
                    <label class="col-lg-2 col-form-label fw-bold fs-6">Valor de Descuento del Cupón</label>
                    <div class="col-lg-10">
                        <div class="row">
                            <div class="col-lg-8 fv-row fv-plugins-icon-container">
                                <input type="number" step="0.01" placeholder="Descuento" name="value" class="form-control " value="<?= $query->value ?>" >
                                <div class="fv-plugins-message-container invalid-feedback"></div>
                            </div>
                            <div class="col-lg-4 fv-row fv-plugins-icon-container">
                                <select class="form-select form-select-solid form-select-lg" name="discount_type" tabindex="-98">
                                    <option value="percent" <?= $query->discount_type == 'percent' ? 'selected' : '' ?>>Porcentaje</option>
                                    <option value="flat" <?= $query->discount_type == 'flat' ? 'selected' : '' ?>>Plano</option>
                                    
                                </select>
                            </div>

                        </div>
                    </div>
                </div>
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2">Valor Máximo De Descuento</label>
				<input class="form-control" type="number" min="0" value="<?=$query->max_discount?>" name="max_discount" placeholder="Valor Máximo De Descuento" autocomplete="off">
			</div>
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2" for="signinSrEmail">Coupon Image <small>(200x200)</small></label>
				<div class="">
					<div class="input-group" data-toggle="aizuploader" data-type="image" data-multiple="false" data-bs-toggle="modal" data-bs-target="#aizUploaderModal">
						<div class="input-group-prepend">
							<div class="input-group-text bg-soft-secondary font-weight-medium">Buscar</div>
						</div>
						<div class="form-control form-control-aiz file-amount">Elegir Archivo</div>
						<input type="hidden" name="banner" class="selected-files" value="<?=$query->banner?>">
					</div>
					<div class="file-preview box sm"></div>
					<small class="text-muted">Utilice una imagen de tamaño 200x200.</small>
				</div>
			</div>
			<div class="fv-row mb-7">
				<label class="fs-6 fw-bold mb-2">Descripción</label>
				<textarea name="description" class="form-control editor" rows="5" placeholder="Descripción"><?=$query->description?></textarea>
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
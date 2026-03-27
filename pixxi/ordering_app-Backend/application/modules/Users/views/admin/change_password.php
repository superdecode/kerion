<!--begin::Form-->
<form id="" class="form" method="POST" enctype="multipart/form-data">
<!--begin::Toolbar-->
<div class="toolbar" id="kt_toolbar">
	<!--begin::Container-->
	<div id="kt_toolbar_container" class="container-fluid d-flex flex-stack">
		<!--begin::Page title-->
		<div data-kt-place="true" data-kt-place-mode="prepend" data-kt-place-parent="{default: '#kt_content_container', 'lg': '#kt_toolbar_container'}" class="page-title d-flex align-items-left me-3 flex-wrap mb-5 mb-lg-0 lh-1">
			<!--begin::Title-->
			<h1 class="d-flex align-items-center text-dark fw-bolder my-1 fs-3">Cambiar Contraseña</h1>
			<!--end::Title-->
			<!--begin::Separator-->
			<span class="h-20px border-gray-200 border-start mx-4"></span>
			<!--end::Separator-->
			<!--begin::Breadcrumb-->
			<ul class="breadcrumb breadcrumb-separatorless fw-bold fs-7 my-1">
				<!--begin::Item-->
				<li class="breadcrumb-item text-muted">
					<a href="<?=base_url()?>" class="text-muted text-hover-primary">Panel</a>
				</li>
				<!--end::Item-->
				<!--begin::Item-->
				<li class="breadcrumb-item">
					<span class="bullet bg-gray-200 w-5px h-2px"></span>
				</li>
				<!--end::Item-->
				<!--begin::Item-->
				<li class="breadcrumb-item text-muted">
                                            <a href="<?=base_url('Users/profile')?>" class="text-muted text-hover-primary">Perfil</a>
				</li>
				<!--end::Item-->
				<!--begin::Item-->
				<li class="breadcrumb-item">
					<span class="bullet bg-gray-200 w-5px h-2px"></span>
				</li>
				<!--end::Item-->
				<!--begin::Item-->
				<li class="breadcrumb-item text-dark">Cambiar Contraseña</li>
				<!--end::Item-->
			</ul>
			<!--end::Breadcrumb-->
		</div>
		<!--end::Page title-->
		<!--begin::Actions-->
		<div class="d-flex align-items-center py-1">
			<div class="">
				<button type="reset" class="btn btn-white btn-active-light-primary me-2 d-none">Descartar</button>
				<button type="submit" class="btn btn-primary" id="kt_account_profile_details_submit">ahorrar</button>
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
	<div id="kt_content_container" class="container-fluid">
		<!--begin::Navbar-->
		<div class="card mb-5 mb-xl-10">
			<div class="card-body pt-0 pb-0">
				
				<!--begin::Navs-->
				<div class="d-flex overflow-auto h-55px">
					<ul class="nav nav-stretch nav-line-tabs nav-line-tabs-2x border-transparent fs-5 fw-bolder flex-nowrap">						
						<!--begin::Nav item-->
						<li class="nav-item">
							<a class="nav-link text-active-primary me-6" href="<?=base_url('Users/profile')?>">Informacion personal</a>
						</li>
						<!--end::Nav item-->
						<!--begin::Nav item-->
						<li class="nav-item d-none">
							<a class="nav-link text-active-primary me-6" href="<?=base_url('Users/account_settings')?>">Configuraciones de la cuenta</a>
						</li>
						<!--end::Nav item-->
						<!--begin::Nav item-->
						<li class="nav-item">
							<a class="nav-link text-active-primary me-6 active" href="<?=base_url('Users/change_password')?>">Cambiar Contraseña</a>
						</li>
						<!--end::Nav item-->
					</ul>
				</div>
				<!--begin::Navs-->
			</div>
		</div>
		<!--end::Navbar-->
		<!--begin::Basic info-->
		<div class="card mb-5 mb-xl-10">
		<!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert');?><!--END::ALERT MESSAGE -->
			<!--begin::Card header-->
			<div class="card-header border-0 cursor-pointer" role="button" data-bs-toggle="collapse" data-bs-target="#kt_account_profile_details" aria-expanded="true" aria-controls="kt_account_profile_details">
				<!--begin::Card title-->
				<div class="card-title m-0">
					<h3 class="fw-bolder m-0">Cambiar Contraseña</h3>
				</div>
				<!--end::Card title-->
				
			</div>
			<!--begin::Card header-->
			<!--begin::Content-->
			<div id="kt_account_profile_details" class="collapse show">					
			<input type="hidden" name="password_strength" id="password_strength" value="0" >
					<!--begin::Card body-->
					<div class="card-body border-top p-9">
						<!--begin::Input group-->
						<div class="row mb-6">
							<!--begin::Label-->
							<label class="col-lg-4 col-form-label fw-bold fs-6 required ">Contraseña Actual</label>
							<!--end::Label-->
							<!--begin::Col-->
							<div class="col-lg-8 fv-row">
								<input class="form-control form-control-lg form-control-solid" type="password" name="current_password" id="current_password" autocomplete="off" placeholder="Current password" required>
							</div>
							<!--end::Col-->
						</div>
						<!--end::Input group-->	
						<!--begin::Input group-->
						<div class="row mb-6">
							<!--begin::Label-->
							<label class="col-lg-4 col-form-label fw-bold fs-6 required ">Nueva Contraseña</label>
							<!--end::Label-->
							<!--begin::Col-->
							<div class="col-lg-8 fv-row">
								<input class="form-control form-control-lg form-control-solid" type="password" name="new_password" id="new_password" placeholder="Nueva Contraseña" required onKeyUp="checkPasswordStrength();" autocomplete="off">
								<div class="progress progress-sm mt-2">
									<div class="progress-bar bg-green" role="progressbar" id="password_progressbar" aria-volumenow="0" aria-volumemin="0" aria-volumemax="100" style="width: 0%"></div>
								</div>
							</div>
							<!--end::Col-->
						</div>
						<!--end::Input group-->
						<!--begin::Input group-->
						<div class="row mb-6">
							<!--begin::Label-->
							<label class="col-lg-4 col-form-label fw-bold fs-6 required ">Verificar Contraseña</label>
							<!--end::Label-->
							<!--begin::Col-->
							<div class="col-lg-8 fv-row">
								<input class="form-control form-control-lg form-control-solid" type="password" name="verify_password" id="verify_password" placeholder="Verificar Contraseña" required autocomplete="off">
							</div>
							<!--end::Col-->
						</div>
						<!--end::Input group-->	
					</div>
					<!--end::Card body-->
			</div>
			<!--end::Content-->			
		</div>
		<!--end::Basic info-->
		
	</div>
	<!--end::Container-->
</div>
<!--end::Post-->
</form>
<!--end::Form-->


<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
?>
<script>
function checkPasswordStrength() {
	var number = /([0-9])/;
	var alphabets = /([a-zA-Z])/;
	var special_characters = /([~,!,@,#,$,%,^,&,*,-,_,+,=,?,>,<])/;
	if($('#new_password').val().length > 0){
		if ($('#new_password').val().length < 6) {
			$('#password_progressbar').removeClass('bg-green');
			$('#password_progressbar').removeClass('bg-orange');
			$('#password_progressbar').addClass('bg-red');
			$('#password_progressbar').css("width", "30%");
			$('#password_help').html("Weak (should be atleast 6 characters.)");
		} else {
			if ($('#new_password').val().match(number) && $('#new_password').val().match(alphabets) && $('#new_password').val().match(special_characters)) {
				$('#password_strength').val('1');
				$('#password_progressbar').removeClass('bg-red');
				$('#password_progressbar').removeClass('bg-orange');
				$('#password_progressbar').addClass('bg-green');
				if ($('#new_password').val().length > 9) {
					$('#password_progressbar').css("width", "99%");
				}else{
					$('#password_progressbar').css("width", "75%");
				}
				$('#password_help').html("");
			} else {
				$('#password_progressbar').removeClass('bg-red');
				$('#password_progressbar').removeClass('bg-green');
				$('#password_progressbar').addClass('bg-orange');
				$('#password_progressbar').css("width", "60%");
				$('#password_help').html("Medium (should include alphabets, numbers and special characters.)");
			}
		}
	}else{
		$('#password_progressbar').removeClass('bg-green');
		$('#password_progressbar').removeClass('bg-orange');
		$('#password_progressbar').removeClass('bg-red');
		$('#password_progressbar').css("width", "0%");
	}
}
</script>
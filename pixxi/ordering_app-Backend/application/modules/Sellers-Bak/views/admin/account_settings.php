<!--begin::Form-->
<form id="" class="form" method="POST" enctype="multipart/form-data">
<!--begin::Toolbar-->
<div class="toolbar" id="kt_toolbar">
	<!--begin::Container-->
	<div id="kt_toolbar_container" class="container-fluid d-flex flex-stack">
		<!--begin::Page title-->
		<div data-kt-place="true" data-kt-place-mode="prepend" data-kt-place-parent="{default: '#kt_content_container', 'lg': '#kt_toolbar_container'}" class="page-title d-flex align-items-left me-3 flex-wrap mb-5 mb-lg-0 lh-1">
			<!--begin::Title-->
			<h1 class="d-flex align-items-center text-dark fw-bolder my-1 fs-3"><?=$header['site_title']?></h1>
			<!--end::Title-->
			<!--begin::Separator-->
			<span class="h-20px border-gray-200 border-start mx-4"></span>
			<!--end::Separator-->
			<!--begin::Breadcrumb-->
			<ul class="breadcrumb breadcrumb-separatorless fw-bold fs-7 my-1">
				<!--begin::Item-->
				<li class="breadcrumb-item text-muted">
					<a href="<?=base_url()?>" class="text-muted text-hover-primary">Home</a>
				</li>
				<!--end::Item-->
				<!--begin::Item-->
				<li class="breadcrumb-item">
					<span class="bullet bg-gray-200 w-5px h-2px"></span>
				</li>
				<!--end::Item-->
				<!--begin::Item-->
				<li class="breadcrumb-item text-muted">
					<a href="<?=base_url('Users/profile')?>" class="text-muted text-hover-primary">Profile</a>
				</li>
				<!--end::Item-->
				<!--begin::Item-->
				<li class="breadcrumb-item">
					<span class="bullet bg-gray-200 w-5px h-2px"></span>
				</li>
				<!--end::Item-->
				<!--begin::Item-->
				<li class="breadcrumb-item text-dark"><?=$header['site_title']?></li>
				<!--end::Item-->
			</ul>
			<!--end::Breadcrumb-->
		</div>
		<!--end::Page title-->
		<!--begin::Actions-->
		<div class="d-flex align-items-center py-1">
			<div class="">
				<button type="reset" class="btn btn-white btn-active-light-primary me-2">Discard</button>
				<button type="submit" class="btn btn-primary" id="kt_account_profile_details_submit">Save Changes</button>
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
							<a class="nav-link text-active-primary me-6" href="<?=base_url('Users/profile')?>">Personal Information</a>
						</li>
						<!--end::Nav item-->
						<!--begin::Nav item-->
						<li class="nav-item">
							<a class="nav-link text-active-primary me-6 active" href="<?=base_url('Users/account_settings')?>">Account Settings</a>
						</li>
						<!--end::Nav item-->
						<!--begin::Nav item-->
						<li class="nav-item">
							<a class="nav-link text-active-primary me-6" href="<?=base_url('Users/change_password')?>">Change Password</a>
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
					<h3 class="fw-bolder m-0">Account Information</h3>
				</div>
				<!--end::Card title-->
				
			</div>
			<!--begin::Card header-->
			<!--begin::Content-->
			<div id="kt_account_profile_details" class="collapse show">
					<?php 
					$image = $profile->profile_image;
					if (!empty($image)) {
						$img = base_url('assets/uploads/user_images/' . $image);
					} else {
						$img = base_url('assets/admin/dist/img/avatar5.png');
					}
					?>
					<!--begin::Card body-->
					<div class="card-body border-top p-9">
						
						<!--begin::Input group-->
						<div class="row mb-6">
							<!--begin::Label-->
							<label class="col-lg-4 col-form-label required fw-bold fs-6">Language</label>
							<!--end::Label-->
							<!--begin::Col-->
							<div class="col-lg-8 fv-row">
								<select name="language_id" aria-label="Select a Language" data-control="select2" data-placeholder="Select a Language..." class="form-select form-select-solid form-select-lg fw-bold" required>
									<option value="">Select Language</option>
									<?php
									foreach($languageList as $lang_k=>$lang){
									?>
									<option value="<?=$lang->id?>" <?= ($lang->id == $profile->settings->language_id) ? 'selected' : '' ?>><?=$lang->name?> </option>
									<?php
									}
									?>
								</select>
							</div>
							<!--end::Col-->
						</div>
						<!--end::Input group-->
						
						<!--begin::Input group-->
						<div class="row mb-6">
							<!--begin::Label-->
							<label class="col-lg-4 col-form-label fw-bold fs-6">Time Zone</label>
							<!--end::Label-->
							<!--begin::Col-->
							<div class="col-lg-8 fv-row">
								<select name="time_zone" aria-label="Select a Time Zone" data-control="select2" data-placeholder="Select a Time Zone..." class="form-select form-select-solid form-select-lg fw-bold" >
									<?php $timezones = timezone_identifiers_list();
									if (!empty($timezones)):
										foreach ($timezones as $timezone):?>
									<option value="<?php echo $timezone; ?>" <?php echo ($timezone == $profile->settings->time_zone) ? 'selected' : ''; ?>><?php echo $timezone; ?></option>
									<?php endforeach;
									endif; ?>
								</select>
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
		<!--begin::Sign-in Method-->
		<div class="card mb-5 mb-xl-10">
			<!--begin::Card header-->
			<div class="card-header border-0 cursor-pointer" role="button" data-bs-toggle="collapse" data-bs-target="#kt_account_signin_method">
				<div class="card-title m-0">
					<h3 class="fw-bolder m-0">Sign-in Method</h3>
				</div>
			</div>
			<!--end::Card header-->
			<!--begin::Content-->
			<div id="kt_account_signin_method" class="collapse show">
				<!--begin::Card body-->
				<div class="card-body border-top p-9">
					<!--begin::Email Address-->
					<div class="d-flex flex-wrap align-items-center">
						<!--begin::Label-->
						<div id="kt_signin_email">
							<div class="fs-6 fw-bolder mb-1">Email Address</div>
							<div class="fw-bold text-gray-600"><?=$profile->email?></div>
						</div>
						<!--end::Label-->
					</div>
					<!--end::Email Address-->
					<!--begin::Separator-->
					<div class="separator separator-dashed my-6"></div>
					<!--end::Separator-->
					<!--begin::Input group-->
					<div class="row mb-0">
						<!--begin::Label-->
						<label class="col-lg-4 col-form-label fw-bold fs-6">
							<span class="">Login Verification</span>
							<i class="fas fa-exclamation-circle ms-1 fs-7" data-bs-toggle="tooltip" title="After you log in, you will be asked for additional information to confirm your identity and protect your account from being compromised."></i>
						</label>
						<!--begin::Label-->
						<!--begin::Label-->
						<div class="col-lg-8 d-flex align-items-center">
							<div class="form-check form-check-solid form-switch fv-row">
								<input class="form-check-input w-45px h-30px" type="checkbox" name="multifactor_authenticate" id="multifactor_authenticate" <?=($profile->settings->multifactor_authenticate=='1')?'checked':'';?> />
								<label class="form-check-label" for="multifactor_authenticate"></label>
							</div>
						</div>
						<!--begin::Label-->
					</div>
					<!--end::Input group-->
					<!--begin::Input group-->
					<div class="row mb-0" id="authenticate_using_google_div" style="display:<?=($profile->settings->multifactor_authenticate=='1')?'flex':'none';?>; ">
						<!--begin::Label-->
						<label class="col-lg-4 col-form-label fw-bold fs-6">
							<span class="">Verification Via Google Authenticater</span>
						</label>
						<!--begin::Label-->
						<!--begin::Label-->
						<div class="col-lg-8 d-flex align-items-center">
							<div class="form-check form-check-solid form-switch fv-row">
								<input class="form-check-input w-45px h-30px" type="checkbox" name="authenticate_using_google" id="authenticate_using_google" <?=($profile->settings->authenticate_using_google=='1')?'checked':'';?> />
								<label class="form-check-label" for="authenticate_using_google"></label>
							</div>
						</div>
						<!--begin::Label-->
					</div>
					<!--end::Input group-->
					<!--begin::Input group-->
					<div class="row mb-0" id="authenticate_using_google_div" style="display:<?=($profile->settings->multifactor_authenticate=='1')?'flex':'none';?>; ">
						<!--begin::Label-->
						<label class="col-lg-4 col-form-label fw-bold fs-6">
							<span class="">Verification Via Google Authenticator</span>
						</label>
						<!--begin::Label-->
						<!--begin::Label-->
						<div class="col-lg-8 d-flex align-items-center">
							<div class="form-check form-check-solid form-switch fv-row">
								<input class="form-check-input w-45px h-30px" type="checkbox" name="authenticate_using_google" id="authenticate_using_google" <?=($profile->settings->authenticate_using_google=='1')?'checked':'';?> />
								<label class="form-check-label" for="authenticate_using_google"></label>
							</div>
						</div>
						<!--begin::Label-->
					</div>
					<!--end::Input group-->
					<!--begin::Input group-->
					<div class="row mb-6" id="google_id_div" style="display:<?=($profile->settings->multifactor_authenticate=='1' && ($profile->settings->authenticate_using_google=='1') )?'flex':'none';?>; ">
						<!--begin::Label-->
						<label class="col-lg-4 col-form-label fw-bold fs-6">Secret Code</label>
						<!--end::Label-->
						<!--begin::Col-->
						<div class="col-lg-8 fv-row">
							<input class="form-control form-control-lg form-control-solid" type="text" value="<?=empty($profile->settings->google_auth_code)?$google_auth_code:$profile->settings->google_auth_code;?>" name="google_auth_code" placeholder="Google Auth Code" readonly>
						</div>
						<!--end::Col-->
					</div>
					<!--end::Input group-->
					<!--begin::Input group-->
					<div class="row mb-6" id="google_qr_code_div" style="display:<?=($profile->settings->multifactor_authenticate=='1' && ($profile->settings->authenticate_using_google=='1') )?'flex':'none';?>; ">
						<!--begin::Label-->
						<label class="col-lg-4 col-form-label fw-bold fs-6">QR Code</label>
						<!--end::Label-->
						<!--begin::Col-->
						<div class="col-lg-8 fv-row">
							<img class="text-center" src='<?php echo $qrCode; ?>' />
						</div>
						<!--end::Col-->
					</div>
					<!--end::Input group-->
					
					<!--begin::Input group-->
					<div class="row mb-6" id="google_auth_code_div" style="display:<?=($profile->settings->multifactor_authenticate=='1' && ($profile->settings->authenticate_using_google=='1') )?'flex':'none';?>; ">
						<!--begin::Label-->
						<label class="col-lg-4 col-form-label fw-bold fs-6">Google Auth Code</label>
						<!--end::Label-->
						<!--begin::Col-->
						<div class="col-lg-8 fv-row">
							<input type="number" class="form-control form-control-lg form-control-solid " placeholder="<?=($this->session->flashdata('error_msg')!='')?$this->session->flashdata('error_msg'):'Enter Google Authenticator Code';?>" name="code" id="code" autocomplete="off">
						</div>
						<!--end::Col-->
					</div>
					<!--end::Input group-->
					<!--begin::Input group-->
					<div class="row mb-6" id="google_app_download_div" style="display:<?=($profile->settings->multifactor_authenticate=='1' && ($profile->settings->authenticate_using_google=='1') )?'flex':'none';?>; ">
						<!--begin::Label-->
						<label class="col-lg-4 col-form-label fw-bold fs-6">Get Google Authenticator on your phone</label>
						<!--end::Label-->
						<!--begin::Col-->
						<div class="col-lg-8">
							<!--begin::Row-->
							<div class="row">
								<!--begin::Col-->
								<div class="col-lg-6 fv-row">
									<a  class=""href="https://itunes.apple.com/us/app/google-authenticator/id388497605?mt=8" target="_blank">
										<img class="col-12 " src="<?=base_url('assets/admin/media/social/iphone.png')?>" />
									</a>
								</div>
								<!--end::Col-->
								<!--begin::Col-->
								<div class="col-lg-6 fv-row">
									<a  class=""href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2&hl=en" target="_blank">
										<img class="col-12 " src="<?=base_url('assets/admin/media/social/android.png')?>" />
									</a>
								</div>
								<!--end::Col-->
							</div>
							<!--end::Row-->
						</div>
						<!--end::Col-->
					</div>
					<!--end::Input group-->
												
				</div>
				<!--end::Card body-->
			</div>
			<!--end::Content-->
		</div>
		<!--end::Sign-in Method-->
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
$('#multifactor_authenticate').on('change', function (event, state) {
	if($("#multifactor_authenticate").is(':checked')) {
		//$('#authenticate_using_otp_div').show();
		$('#authenticate_using_google_div').show();
	} else {
		//$('#authenticate_using_otp_div').hide();
		$('#authenticate_using_google_div').hide();
		$('#google_id_div').hide();
		$('#google_qr_code_div').hide();
		$('#google_auth_code_div').hide();
		$("#code").prop('required',false);
	}
});
$('#authenticate_using_otp').on('change', function (event, state) {
	if($("#authenticate_using_otp").is(':checked')) {
		$('#otp_phone_div').show();
	} else {
		$('#otp_phone_div').hide();
	}
});
$('#authenticate_using_google').on('change', function (event, state) {
	if($("#authenticate_using_google").is(':checked')) {
		$('#google_id_div').show();
		$('#google_qr_code_div').show();
		$('#google_auth_code_div').show();
		$('#google_app_download_div').show();
		$("#code").prop('required',true);
	} else {
		$('#google_id_div').hide();
		$('#google_qr_code_div').hide();
		$('#google_auth_code_div').hide();
		$('#google_app_download_div').hide();
		$("#code").prop('required',false);
	}
});
</script>
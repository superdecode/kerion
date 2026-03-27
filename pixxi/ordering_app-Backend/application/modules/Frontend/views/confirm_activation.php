<!DOCTYPE html>
<html lang="en">
<head>	
	<base href="<?=base_url()?>">
	<meta charset="utf-8" />
	<title><?=get_settings_value('system_name')?> | Login ID Confirmation</title>
<?php 
	$image = get_settings_value('logo');
	if (!empty($image)) {
		$sys_img = base_url('assets/uploads/system_images/' . $image);
	} else {
		$sys_img = base_url('assets/admin/dist/media/logos/logo-default.png');
	} 
	$favicon = get_settings_value('favicon');
	if (!empty($favicon)) {
		$fav_img = base_url('assets/uploads/system_images/' . $favicon);
	} else {
		$fav_img = base_url('assets/admin/dist/media/logos/logo-default.png');
	} 
	$bg = base_url('assets/admin/media/illustrations/bg8.jpg');
?>		
	<meta name="description" content="" />
	<meta name="keywords" content="" />
	<link rel="canonical" href="" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<link rel="shortcut icon" href="<?=$fav_img?>" />
	<!--begin::Fonts-->
	<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Poppins:300,400,500,600,700" />
	<!--end::Fonts-->
	<!--begin::Global Stylesheets Bundle(used by all pages)-->
	<link href="<?=base_url('assets/admin/plugins/global/plugins.bundle.css')?>" rel="stylesheet" type="text/css" />
	<link href="<?=base_url('assets/admin/css/style.bundle.css')?>" rel="stylesheet" type="text/css" />
	<!--end::Global Stylesheets Bundle-->

</head>

<body id="kt_body" class="bg-white header-fixed header-tablet-and-mobile-fixed toolbar-enabled toolbar-fixed toolbar-tablet-and-mobile-fixed aside-enabled aside-fixed" style="--kt-toolbar-height:55px;--kt-toolbar-height-tablet-and-mobile:55px">
		<!--begin::Root-->
		<div class="d-flex flex-column flex-root" id="kt_app_root">
			<!--begin::Page bg image-->
			<style>body { background-image: url('<?=$bg?>'); } [data-theme="dark"] body { background-image: url('<?=$bg?>'); }</style>
			<!--end::Page bg image-->
			<!--begin::Authentication - Signup Welcome Message -->
			<div class="d-flex flex-column flex-center flex-column-fluid">
				<!--begin::Content-->
				<div class="d-flex flex-column flex-center text-center p-10">
					<!--begin::Wrapper-->
					<div class="card card-flush w-md-650px py-5 text-white" style="background-color: #A6191E;">
						<div class="card-body py-15 py-lg-20">
							<!--begin::Logo-->
							<div class="mb-7">
								<a href="Javascript:void(0)" class="">
									<img alt="Logo" src="<?=$sys_img?>" class="" />
								</a>
							</div>
							<!--end::Logo-->
							<div class="sec-heading center">
								<h2>Congratulations! </h2>
							</div>
							<div class="text-center mb-5">
								<p>You have successfully verified a new account with us.</p>
								<!--<p>We have sent you an email with your Username and Password.</p>
								<p>Please check your email once again</p>-->
								<p>Warm Regards,<br />
								The <?=get_settings_value('system_name')?> Team.</p>
							</div>
							
						</div>
					</div>
					<!--end::Wrapper-->
				</div>
				<!--end::Content-->
			</div>
			<!--end::Authentication - Signup Welcome Message-->
		</div>
		<!--end::Root-->


<!--begin::Javascript-->
<!--begin::Global Javascript Bundle(used by all pages)-->
<script src="<?=base_url('assets/admin/plugins/global/plugins.bundle.js')?>"></script>
<script src="<?=base_url('assets/admin/js/scripts.bundle.js')?>"></script>
<!--end::Global Javascript Bundle-->
<!--end::Javascript-->


</body>
</html>

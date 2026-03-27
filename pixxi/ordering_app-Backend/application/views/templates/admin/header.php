<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<!--<title><?=!empty($header)?get_settings_value('system_name').' || '.$header['site_title']:get_settings_value('system_name')?></title>-->
	
<title><?= get_settings_value('system_name');?></title>
	
	<?php
	$image = get_settings_value('logo');
	if (!empty($image)) {
		$sys_img = base_url('assets/uploads/system_images/' . $image);
	} else {
		$sys_img = base_url('assets/admin/dist/media/logos/logo-default.png');
	} 
	
	$favicon = get_settings_value('favicon');
	$fav = base_url('assets/admin/images/default_favicon.png');
	if (!empty($favicon)) {
		$fav = base_url('assets/uploads/system_images/' . $favicon);
	}
	?>  
									
	<link rel="shortcut icon" href="<?=$fav?>">
	<link rel="apple-touch-icon" href="<?=$fav?>">
	<link rel="image_src" href="<?=$fav?>"> 
	<link rel="search" type="application/opensearchdescription+xml" title="" href="">
	<link rel="canonical" href="<?=current_url()?>" />
		
	<meta name="description" content="<?=get_settings_value('meta_descriptions')?>">
	<meta name="keywords" content="<?=get_settings_value('meta_keywords')?>">
	<meta name="author" content="<?=get_settings_value('meta_author')?>">

  
	<meta content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" name="viewport">
	<meta http-equiv="x-pjax-version" content="v123">
    <base href="<?= base_url(); ?>">
	
	
	<!--begin::Fonts-->
	<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Poppins:300,400,500,600,700" />
	<!--end::Fonts-->
	<!--begin::Page Vendor Stylesheets(used by this page)-->
	<link href="<?=base_url('assets/admin/plugins/custom/datatables/datatables.bundle.css')?>" rel="stylesheet" type="text/css" />
	<!--end::Page Vendor Stylesheets-->
	<!--begin::Global Stylesheets Bundle(used by all pages)-->
	<link href="<?=base_url('assets/admin/plugins/global/plugins.bundle.css')?>" rel="stylesheet" type="text/css" />
	<link href="<?=base_url('assets/admin/css/style.bundle.css')?>" rel="stylesheet" type="text/css" />
	<link href="<?=base_url('assets/admin/css/custom.css')?>" rel="stylesheet" type="text/css" />
	<!--<link href="<?=base_url('assets/admin/css/select2.min.css')?>" rel="stylesheet" type="text/css" />-->
	<!--end::Global Stylesheets Bundle-->
	
    <!-- Js url -->
    <script type="text/javascript" language="javascript">
        var base_url='<?=base_url()?>';
		var csfr_token_name = '<?php echo $this->security->get_csrf_token_name(); ?>';
        var csfr_cookie_name = "<?php echo $this->config->item('csrf_cookie_name'); ?>";
    </script>	
</head>


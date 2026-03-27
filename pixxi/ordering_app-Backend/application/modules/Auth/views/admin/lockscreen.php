<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title><?=get_settings_value('system_name')?> | <?=$site_title?></title>
  <!-- Tell the browser to be responsive to screen width -->
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- Font Awesome -->
  <link rel="stylesheet" href="<?=base_url('assets/admin/plugins/fontawesome-free/css/all.min.css')?>">
  <!-- Ionicons -->
  <link rel="stylesheet" href="https://code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css">
  <!-- icheck bootstrap -->
  <link rel="stylesheet" href="<?=base_url('assets/admin/plugins/icheck-bootstrap/icheck-bootstrap.min.css')?>">
  <!-- Theme style -->
  <link rel="stylesheet" href="<?=base_url('assets/admin/dist/css/adminlte.min.css')?>">
  <!-- Google Font: Source Sans Pro -->
  <link href="https://fonts.googleapis.com/css?family=Source+Sans+Pro:300,400,400i,700" rel="stylesheet">
  <style>
	.invalid{ border-top:1px solid #dc3545 !important;border-bottom:1px solid #dc3545!important;border-right:1px solid #dc3545!important; }  
  </style>
</head>
<body class="hold-transition lockscreen">


<!-- Automatic element centering -->
<div class="lockscreen-wrapper" style="">
  <div class="lockscreen-logo">
    <a href="<?=base_url()?>"><b><?=$details->role;?></b></a>
  </div>
  <!-- User name -->
  <div class="lockscreen-name"><?=$details->fname.' '.$details->lname?></div>

  <!-- START LOCK SCREEN ITEM -->
  <div class="lockscreen-item">
    <!-- lockscreen image -->
    <div class="lockscreen-image">
	<?php 
		$image = $details->profile_image;
		if (!empty($image)) {
			$img = base_url('assets/uploads/user_images/' . $image);
		} else {
			$img = base_url('assets/admin/dist/img/avatar5.png');
		} 
	?>
	<img src="<?=$img?>" alt="User Image">
    </div>
    <!-- /.lockscreen-image -->
    <!-- lockscreen credentials (contains the form) -->
    <form class="lockscreen-credentials" action="" method="post" autocomplete="off">
      <div class="input-group <?=($this->session->flashdata('error_msg')!='')?'invalid':'';?>">
        <input type="password" name="password" class="form-control " placeholder="<?=($this->session->flashdata('error_msg')!='')?$this->session->flashdata('error_msg'):'Password';?>" required autocomplete="off">
        <div class="input-group-append ">
          <button type="submit" class="btn"><i class="fas fa-arrow-right text-muted"></i></button>
        </div>
      </div>
    </form>
    <!-- /.lockscreen credentials -->
  </div>
  <!-- /.lockscreen-item -->  
  <div class="text-center">
    <a href="<?=base_url('Auth/logout')?>">Or sign in as a different user</a>
  </div>  
</div>
<!-- /.center -->


<!-- jQuery -->
<script src="<?=base_url('assets/admin/plugins/jquery/jquery.min.js')?>"></script>
<!-- Bootstrap 4 -->
<script src="<?=base_url('assets/admin/plugins/bootstrap/js/bootstrap.bundle.min.js')?>"></script>

</body>
</html>

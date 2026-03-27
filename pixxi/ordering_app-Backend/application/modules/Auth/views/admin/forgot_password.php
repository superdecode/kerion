<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title><?= get_settings_value('system_name') ?> | Forgot Password</title>
        <!-- Tell the browser to be responsive to screen width -->
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <!-- Font Awesome -->
        <link rel="stylesheet" href="<?= base_url('assets/admin/plugins/fontawesome-free/css/all.min.css') ?>">
        <!-- Ionicons -->
        <link rel="stylesheet" href="https://code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css">
        <!-- icheck bootstrap -->
        <link rel="stylesheet" href="<?= base_url('assets/admin/plugins/icheck-bootstrap/icheck-bootstrap.min.css') ?>">
        <!-- Theme style -->
        <link rel="stylesheet" href="<?= base_url('assets/admin/dist/css/adminlte.css') ?>">
        <!-- Google Font: Source Sans Pro -->
        <link href="https://fonts.googleapis.com/css?family=Source+Sans+Pro:300,400,400i,700" rel="stylesheet">
        <!-- Custom style -->
        <link rel="stylesheet" href="<?= base_url('assets/admin/css/my_theme.css') ?>">
    </head>
    <body class="">

        <div class="login">
            <div class="container">
                <div class="row">
                    <div class="col-md-4">
                        <div class="login-inner-form">
                            <div class="details">
                                <a href="<?= base_url() ?>">
                                    <?php
                                    $image = get_settings_value('logo');
                                    if (!empty($image)) {
                                        $sys_img = base_url('assets/uploads/system_images/' . $image);
                                    } else {
                                        $sys_img = base_url('assets/admin/dist/img/logo-default.png');
                                    }
                                    ?>
                                    <img src="<?= $sys_img ?>" alt="logo" class="img-fluid">
                                </a>

                                <?php
                                if ($this->session->flashdata('error_msg') != '') {
                                    ?>
                                    <div class="alert alert-danger alert-dismissible">
                                        <button type="button" class="close" data-dismiss="alert" aria-hidden="true">×</button>
                                        <h5><i class="icon fas fa-ban"></i><?php echo $this->session->flashdata('error_msg'); ?>!!</h5>                  
                                    </div>
                                    <?php
                                }if ($this->session->flashdata('success_msg') != '') {
                                    ?>
                                    <div class="alert alert-success alert-dismissible">
                                        <button type="button" class="close" data-dismiss="alert" aria-hidden="true">×</button>
                                        <h5><?php echo $this->session->flashdata('success_msg'); ?>!!</h5>                  
                                    </div>
                                    <?php
                                }if ($this->session->userdata('forgot_otp') == '') {
                                    ?>
                                    <h3>Forgot Password</h3>
                                    <form action="" method="post" autocomplete="off">
                                        <div class="form-group">
                                            <input type="text" name="login_id" placeholder="Login Id" class="form-control " required autocomplete="off">
                                        </div>
                                        <div class="form-group mb-0">
                                            <button type="submit" class="btn-md btn-theme btn-block">Submit</button>
                                        </div>
                                    </form>
                                    <?php
                                } else {
                                    ?>
                                    <h3>Change Password</h3>
                                    <form action="<?= base_url('Auth/changePassword') ?>" method="post" autocomplete="off">
                                        <div class="form-group">
                                            <input type="text" name="otp" placeholder="OTP" value="<?php //=$this->session->userdata('forgot_otp') ?>" class="form-control " required autocomplete="off" maxlength="6">
                                        </div>
                                        <div class="form-group">
                                            <input type="password" name="new_password" placeholder="New Password" value="" class="form-control " required autocomplete="off" >
                                        </div>
                                        <div class="form-group">
                                            <input class="form-control" type="password" name="verify_password" id="verify_password" placeholder="Verify Password" required autocomplete="off">
                                        </div>
                                        <div class="form-group mb-0">
                                            <button type="submit" class="btn-md btn-theme btn-block">Change Password</button>
                                            <a href="<?= base_url('Auth/changeForgotEmail') ?>" class="btn-md btn-block">Change Email ID</a>
                                        </div>

                                    </form>

                                    <?php
                                }
                                ?>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>




        <!-- jQuery -->
        <script src="<?= base_url('assets/admin/plugins/jquery/jquery.min.js') ?>"></script>
        <!-- Bootstrap 4 -->
        <script src="<?= base_url('assets/admin/plugins/bootstrap/js/bootstrap.bundle.min.js') ?>"></script>

    </body>
</html>

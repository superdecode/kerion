<!DOCTYPE html>
<html lang="en">

<head>
    <base href="<?= base_url() ?>">
    <meta charset="utf-8" />
    <title><?= get_settings_value('system_name') ?> | ¿Olvidaste tú Contraseña?</title>
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
    ?>
    <meta name="description" content="" />
    <meta name="keywords" content="" />
    <link rel="canonical" href="" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="shortcut icon" href="<?= $fav_img ?>" />
    <!--begin::Fonts-->
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Poppins:300,400,500,600,700" />
    <!--end::Fonts-->
    <!--begin::Global Stylesheets Bundle(used by all pages)-->
    <link href="<?= base_url('assets/admin/plugins/global/plugins.bundle.css') ?>" rel="stylesheet" type="text/css" />
    <link href="<?= base_url('assets/admin/css/style.bundle.css') ?>" rel="stylesheet" type="text/css" />
    <!--end::Global Stylesheets Bundle-->

</head>

<body class="">

    <body id="kt_body" class="bg-white header-fixed header-tablet-and-mobile-fixed toolbar-enabled toolbar-fixed toolbar-tablet-and-mobile-fixed aside-enabled aside-fixed" style="--kt-toolbar-height:55px;--kt-toolbar-height-tablet-and-mobile:55px">
        <!--begin::Main-->
        <div class="d-flex flex-column flex-root">
            <!--begin::Authentication - Sign-in -->
            <div class="d-flex flex-column flex-lg-row flex-column-fluid">
                <!--begin::Aside-->
                <div class="d-flex flex-column flex-lg-row-auto w-xl-600px positon-xl-relative">
                    <!--begin::Wrapper-->
                    <div class="d-flex flex-column position-xl-fixed bottom-0 w-xl-600px scroll-y" style="top:20%">
                        <!--begin::Content-->
                        <div class="d-flex flex-row-fluid flex-column text-center p-10 ">
                            <h1 class="fw-bolder fs-2qx " style="color: #000;"></h1>
                            <!--begin::Logo-->
                            <a href="<?= base_url() ?>" class="py-9">
                                <img alt="Logo" src="<?= $sys_img ?>" class="h-400px" />
                            </a>
                            <!--end::Logo-->

                            <!--begin::Title-->
                            <h1 class="fw-bolder fs-2qx pb-5 pb-md-10 text-success fst-italic" style=""></h1>
                            <!--end::Title-->

                        </div>
                        <!--end::Content-->
                        <!--begin::Illustration-->
                        <div class="d-none flex-row-auto bgi-no-repeat bgi-position-x-center bgi-size-contain bgi-position-y-bottom min-h-100px min-h-lg-350px" style="background-image: url(<?= base_url('assets/admin/media/illustrations/counting.png') ?>)"></div>
                        <!--end::Illustration-->
                    </div>
                    <!--end::Wrapper-->
                </div>
                <!--end::Aside-->
                <!--begin::Body-->
                <div class="d-flex flex-column flex-lg-row-fluid py-10" style="background-color: #8a41f0;">
                    <!--begin::Content-->
                    <div class="d-flex flex-center flex-column flex-column-fluid">
                        <!--begin::Wrapper-->
                        <div class="w-lg-600px p-10 p-lg-15 mx-auto rounded" style="background-color: #fff;">

                            <!--begin::Form-->
                            <form class="form w-100 fv-plugins-bootstrap5 fv-plugins-framework" action="" autocomplete="off" method="POST">
                                <!--begin::Heading-->
                                <div class="text-center mb-11">
                                    <!--begin::Title-->
                                    <h1 class="text-dark fw-bolder mb-3">
                                        ¿Olvidaste tu Contraseña?
                                    </h1>
                                    <!--end::Title-->
                                    <?php
                                    if ($this->session->flashdata('error_msg') != '') {
                                    ?>
                                        <div class="alert alert-danger alert-dismissible fade show" role="alert">
                                            <strong>¡Error!</strong> <?= $this->session->flashdata('error_msg') ?>
                                            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                                        </div>
                                    <?php
                                    }
                                    if ($this->session->flashdata('success_msg') != '') {
                                    ?>
                                        <div class="alert alert-success alert-dismissible fade show" role="alert">
                                            <strong>¡ÉXITO!</strong> <?= $this->session->flashdata('success_msg') ?>
                                            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                                        </div>
                                    <?php
                                    }
                                    ?>
                                </div>
                                <!--begin::Heading-->
                                
                                <div class="fv-row mb-8 fv-plugins-icon-container">
                                    <input type="email" placeholder="Correo Electrónico" name="login_id" required autocomplete="off" class="form-control bg-transparent">
                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                </div>


                                <!--begin::Submit button-->
                                <div class="d-grid mb-10">
                                    <button type="submit" id="" class="btn btn-primary">

                                        <!--begin::Indicator label-->
                                        <span class="indicator-label">
                                            Enviar</span>
                                        <!--end::Indicator label-->

                                        <!--begin::Indicator progress-->
                                        <span class="indicator-progress">
                                            Espere por favor... <span class="spinner-border spinner-border-sm align-middle ms-2"></span>
                                        </span>
                                        <!--end::Indicator progress--> </button>
                                </div>
                                <!--end::Submit button-->

                                <!--end::Sign up-->
                            </form>
                            <!--end::Form-->
                        </div>
                        <!--end::Wrapper-->
                    </div>
                    <!--end::Content-->

                </div>
                <!--end::Body-->
            </div>
            <!--end::Authentication - Sign-in-->
        </div>
        <!--end::Main-->


        <!--begin::Javascript-->
        <!--begin::Global Javascript Bundle(used by all pages)-->
        <script src="<?= base_url('assets/admin/plugins/global/plugins.bundle.js') ?>"></script>
        <script src="<?= base_url('assets/admin/js/scripts.bundle.js') ?>"></script>
        <!--end::Global Javascript Bundle-->
        <!--end::Javascript-->


    </body>

</html>
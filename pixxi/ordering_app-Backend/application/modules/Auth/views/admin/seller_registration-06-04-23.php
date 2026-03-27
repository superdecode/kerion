<!DOCTYPE html>
<html lang="en">

<head>
    <base href="<?= base_url() ?>">
    <meta charset="utf-8" />
    <title><?= get_settings_value('system_name') ?> | Seller Sign Up</title>
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
                        <div class="w-lg-600px p-10 p-lg-15 mx-auto" style="background-color: #fff;">

                            <!--begin::Form-->
                            <form class="form w-100 fv-plugins-bootstrap5 fv-plugins-framework" action="" autocomplete="off" method="POST">
                                <!--begin::Heading-->
                                <div class="text-center mb-11">
                                    <!--begin::Title-->
                                    <h1 class="text-dark fw-bolder mb-3">
                                        Seller Sign Up
                                    </h1>
                                    <!--end::Title-->
                                    <?php
                                    if ($this->session->flashdata('error_msg') != '') {
                                    ?>
                                        <div class="alert alert-danger alert-dismissible fade show" role="alert">
                                            <strong>ERROR!</strong> <?= $this->session->flashdata('error_msg') ?>
                                            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                                        </div>
                                    <?php
                                    }
                                    if ($this->session->flashdata('success_msg') != '') {
                                    ?>
                                        <div class="alert alert-success alert-dismissible fade show" role="alert">
                                            <strong>ERROR!</strong> <?= $this->session->flashdata('success_msg') ?>
                                            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                                        </div>
                                    <?php
                                    }
                                    ?>
                                </div>
                                <!--begin::Heading-->
                                <div class="row fv-row mb-7 fv-plugins-icon-container">
                                    <!--begin::Col-->
                                    <div class="col-xl-6">
                                        <input class="form-control form-control-lg " type="text" placeholder="First Name" name="fname" required autocomplete="off" data-kt-translate="sign-up-input-first-name">
                                        <div class="fv-plugins-message-container invalid-feedback"></div>
                                    </div>
                                    <!--end::Col-->

                                    <!--begin::Col-->
                                    <div class="col-xl-6">
                                        <input class="form-control form-control-lg " type="text" placeholder="Last Name" name="lname" required autocomplete="off" data-kt-translate="sign-up-input-last-name">
                                        <div class="fv-plugins-message-container invalid-feedback"></div>
                                    </div>
                                    <!--end::Col-->
                                </div>
                                <div class="fv-row mb-8 fv-plugins-icon-container">
                                    <input type="text" placeholder="Store Name" name="seller_name" autocomplete="off" class="form-control bg-transparent">
                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                </div>
                                <div class="fv-row mb-8 fv-plugins-icon-container">
                                    <input type="email" placeholder="Email" name="login_id" required autocomplete="off" class="form-control bg-transparent">
                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                </div>

                                <!--begin::Input group-->
                                <div class="fv-row mb-8 fv-plugins-icon-container" data-kt-password-meter="true">
                                    <!--begin::Wrapper-->
                                    <div class="mb-1">
                                        <!--begin::Input wrapper-->
                                        <div class="position-relative mb-3">
                                            <input class="form-control bg-transparent" type="password" placeholder="Password" name="password" required autocomplete="off">

                                            <span class="btn btn-sm btn-icon position-absolute translate-middle top-50 end-0 me-n2" data-kt-password-meter-control="visibility">
                                                <i class="ki-duotone ki-eye-slash fs-2"></i> <i class="ki-duotone ki-eye fs-2 d-none"></i> </span>
                                        </div>
                                        <!--end::Input wrapper-->

                                        <!--begin::Meter-->
                                        <div class="d-flex align-items-center mb-3" data-kt-password-meter-control="highlight">
                                            <div class="flex-grow-1 bg-secondary bg-active-success rounded h-5px me-2"></div>
                                            <div class="flex-grow-1 bg-secondary bg-active-success rounded h-5px me-2"></div>
                                            <div class="flex-grow-1 bg-secondary bg-active-success rounded h-5px me-2"></div>
                                            <div class="flex-grow-1 bg-secondary bg-active-success rounded h-5px"></div>
                                        </div>
                                        <!--end::Meter-->
                                    </div>
                                    <!--end::Wrapper-->

                                    <!--begin::Hint-->
                                    <div class="text-muted">
                                        Use 8 or more characters with a mix of letters, numbers &amp; symbols.
                                    </div>
                                    <!--end::Hint-->
                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                </div>
                                <!--end::Input group--->

                                <!--end::Input group--->
                                <div class="fv-row mb-8 fv-plugins-icon-container">
                                    <!--begin::Repeat Password-->
                                    <input type="password" placeholder="Repeat Password" name="confirm_password" required autocomplete="off" class="form-control bg-transparent">
                                    <!--end::Repeat Password-->
                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                </div>
                                <!--end::Input group--->

                                <!--begin::Accept-->
                                <div class="fv-row mb-8 fv-plugins-icon-container">
                                    <label class="form-check form-check-inline">
                                        <input class="form-check-input" type="checkbox" name="toc" value="1" required>
                                        <span class="form-check-label fw-semibold text-gray-700 fs-base ms-1">
                                            I Accept the <a href="#" class="ms-1 link-primary">Terms</a>
                                        </span>
                                    </label>
                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                </div>
                                <!--end::Accept-->

                                <!--begin::Submit button-->
                                <div class="d-grid mb-10">
                                    <button type="submit" id="" class="btn btn-primary">

                                        <!--begin::Indicator label-->
                                        <span class="indicator-label">
                                            Sign up</span>
                                        <!--end::Indicator label-->

                                        <!--begin::Indicator progress-->
                                        <span class="indicator-progress">
                                            Please wait... <span class="spinner-border spinner-border-sm align-middle ms-2"></span>
                                        </span>
                                        <!--end::Indicator progress--> </button>
                                </div>
                                <!--end::Submit button-->

                                <!--begin::Sign up-->
                                <div class="text-gray-500 text-center fw-semibold fs-6">
                                    Already have an Account?

                                    <a href="<?= base_url('') ?>" class="link-primary fw-semibold">
                                        Sign in
                                    </a>
                                </div>
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
<!DOCTYPE html>
<html lang="en">

<head>
    <base href="<?= base_url() ?>">
    <meta charset="utf-8" />
    <title><?= get_settings_value('system_name') ?> | Seller Information</title>
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
                                        Store Information
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
                                            <strong>Success!</strong> <?= $this->session->flashdata('success_msg') ?>
                                            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                                        </div>
                                    <?php
                                    }
                                    ?>
                                </div>
                                <!--begin::Heading-->
                                <div class="row fv-row mb-7 fv-plugins-icon-container">
                                    <!--begin::Col-->
                                    <div class="col-xl-12">
                                        <input class="form-control form-control-lg " type="text" placeholder="Store Name" name="store_name" required autocomplete="off" data-kt-translate="sign-up-input-first-name">
                                        <div class="fv-plugins-message-container invalid-feedback"></div>
                                    </div>
                                    <!--end::Col-->

                                </div>
                                
                                <div class="row fv-row mb-7 fv-plugins-icon-container">
                                    
                                    <div class="col-xl-6">
                                        
                                            <select class="form-select " tabindex="-1" aria-hidden="true" id="" name="seller_type" required onchange="return get_seller_child_category(this.value)">
                                                <option value="">Store Type</option>
                                                <?php
                                                if (!empty($parent_categories)) {
                                                    foreach ($parent_categories as $k => $parent_category) {
                                                       //$child_categories = $this->Auth_model->getCategoryList($parent_category->id);
                                                ?>
                                                        <option value="<?= $parent_category->id ?>"><?= $parent_category->seller_type ?></option>
                                                    <?php

                                                    }
                                                    ?>

                                                <?php
                                                }
                                                ?>
                                            </select>
                                        <div class="fv-plugins-message-container invalid-feedback"></div>
                                    </div>
                                    
                                    <div class="col-xl-6">
                                        
                                             <select name="chld_category_id" id="chld_category_id" class="form-select ">
                                                <?= $childcategories ?>
                                            </select>
                                        <div class="fv-plugins-message-container invalid-feedback"></div>
                                    </div>
                                    <!--end::Col-->
                                </div>
                                
                                <div class="fv-row mb-8 fv-plugins-icon-container">
                                    <input type="text" placeholder="Phone Number" name="store_phone_number" autocomplete="off" class="form-control bg-transparent">
                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                </div>
                                <div class="fv-row mb-8 fv-plugins-icon-container">
                                    <select name="city_id" id="city_id" aria-label="Select a city" data-control="select2" data-placeholder="Select a city.." class="form-select form-select-solid form-select-lg" required="">
                                        <option value="">Select City</option>
                                        <?php
                                        if (!empty($city_list)) {
                                            foreach ($city_list as $k => $city_list) {
                                        ?>
                                                <option value="<?= $city_list->id ?>" <?= $city_list->id == $query->city ? 'selected' : '' ?>><?= $city_list->name ?></option>
                                        <?php }
                                        } ?>
                                    </select>
                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                </div>
                                
                                <div class="fv-row mb-8 fv-plugins-icon-container">
                                    <input type="text" placeholder="Address" name="address" autocomplete="off" class="form-control bg-transparent">
                                    <div class="fv-plugins-message-container invalid-feedback"></div>
                                </div>

                                <!--begin::Submit button-->
                                <div class="d-grid mb-10">
                                    <button type="submit" id="" class="btn btn-primary">

                                        <!--begin::Indicator label-->
                                        <span class="indicator-label">
                                            Update</span>
                                        <!--end::Indicator label-->

                                        <!--begin::Indicator progress-->
                                        <span class="indicator-progress">
                                            Please wait... <span class="spinner-border spinner-border-sm align-middle ms-2"></span>
                                        </span>
                                        <!--end::Indicator progress--> </button>
                                </div>
                                <!--end::Submit button-->
                                <div class="text-gray-500 text-center fw-semibold fs-6 d-none">
                                    <a href="<?= base_url('') ?>" class="link-primary fw-semibold">
                                        Sign in
                                    </a>
                                </div>
                              
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

<script>
    function get_seller_child_category(id) {

        if (id != '') {
            $.ajax({
                type: 'POST',
                url: "<?= base_url('Auth/getAllchildcategory') ?>" + "/" + id,
                data: '',
                success: function(result) {
                    //alert(result);
                    //result = JSON.parse(result);
                    //console.log(result);
                    $('#chld_category_id').html(result);
                }
            });

        }
    }
</script>

        <!--begin::Javascript-->
        <!--begin::Global Javascript Bundle(used by all pages)-->
        <script src="<?= base_url('assets/admin/plugins/global/plugins.bundle.js') ?>"></script>
        <script src="<?= base_url('assets/admin/js/scripts.bundle.js') ?>"></script>
        <!--end::Global Javascript Bundle-->
        <!--end::Javascript-->


    </body>

</html>
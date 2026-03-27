<!--begin::Form-->
<form class="form" method="POST" enctype="multipart/form-data" id="calc_form_<?= $query->id ?>">
    <!--begin::Toolbar-->
<div class="toolbar" id="kt_toolbar">
    <!--begin::Container-->
    <div id="kt_toolbar_container" class="container-fluid d-flex flex-stack">
        <!--begin::Page title-->
        <div data-kt-place="true" data-kt-place-mode="prepend" data-kt-place-parent="{default: '#kt_content_container', 'lg': '#kt_toolbar_container'}" class="page-title d-flex align-items-left me-3 flex-wrap mb-5 mb-lg-0 lh-1">
            <!--begin::Title-->
            <h1 class="d-flex align-items-center text-dark fw-bolder my-1 fs-3"><?= $header['site_title'] ?></h1>
            <!--end::Title-->
            <!--begin::Separator-->
            <span class="h-20px border-gray-200 border-start mx-4"></span>
            <!--end::Separator-->
            <!--begin::Breadcrumb-->
            <ul class="breadcrumb breadcrumb-separatorless fw-bold fs-7 my-1">
                <li class="breadcrumb-item text-muted">
                    <a href="<?= base_url() ?>" class="text-muted text-hover-primary">Home</a>
                </li>
                <li class="breadcrumb-item">
                    <span class="bullet bg-gray-200 w-5px h-2px"></span>
                </li>
                <li class="breadcrumb-item text-muted">
                    <a href="<?= base_url('Sellers/listingSeller') ?>" class="text-muted text-hover-primary">Seller List</a>
                </li>
                <li class="breadcrumb-item">
                    <span class="bullet bg-gray-200 w-5px h-2px"></span>
                </li>
                <li class="breadcrumb-item text-dark"><?= $header['site_title'] ?></li>
            </ul>
            <!--end::Breadcrumb-->
        </div>
        <!--end::Page title-->
        <!--begin::Actions-->
        <div class="d-flex align-items-center py-1">
            <div class="">
                <a href="<?= base_url('Users/listingSeller') ?>" class="btn btn-white btn-active-light-danger me-2">Back</a>
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
        <!--begin::Basic info-->
        <div class="card mb-5 mb-xl-10">
            <!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert'); ?><!--END::ALERT MESSAGE -->
            <!--begin::Card header-->
            <div class="card-header border-0 cursor-pointer  bg-info" role="button" data-bs-toggle="collapse" data-bs-target="#customer_div" aria-expanded="true" aria-controls="customer_div">
                <!--begin::Card title-->
                <div class="card-title m-0 text-white">
                    <h3 class="fw-bolder m-0">Seller Details</h3>
                </div>
                <!--end::Card title-->

            </div>
            <!--begin::Card header-->
            <!--begin::Content-->
            <div id="customer_div" class="collapse show">
                <!--begin::Card body-->
                <div class="card-body border-top p-9">
                    <div class="d-flex flex-column flex-lg-row">
                            <!--begin::Sidebar-->
<div class="col-md-2">
    <!--begin::Catigories-->
    <div class="mb-15">
        <h4 class="text-black mb-7">Seller Image</h4>
        <!--begin::Menu-->
        <div class="row mb-6">							
            <!--begin::Col-->
            <div class="col-lg-8">
                <?php
                $image = $query->profile_image;
                if (!empty($image)) {
                    $img = base_url('assets/uploads/user_images/' . $image);
                } else {
                    $img = base_url('assets/admin/media/avatars/blank.png');
                }
                ?>
                <!--begin::Image input-->
                <div class="image-input image-input-outline" data-kt-image-input="true" style="background-image: url(<?= base_url('assets/admin/media/avatars/blank.png') ?>)">
                    <!--begin::Preview existing avatar-->
                    <div class="image-input-wrapper w-125px h-125px" style="background-image: url(<?= $img ?>)"></div>
                    <!--end::Preview existing avatar-->
                    <!--begin::Edit-->
                    <label class="btn btn-icon btn-circle btn-active-color-primary w-25px h-25px bg-white shadow" data-kt-image-input-action="change" data-bs-toggle="tooltip" title="" data-bs-original-title="Change avatar">
                        <i class="bi bi-pencil-fill fs-7"></i>
                        <!--begin::Inputs-->
                        <input type="file" name="profile_avatar" accept=".png, .jpg, .jpeg">
                        <input type="hidden" name="avatar_remove">
                        <input type="hidden" value="<?= $query->profile_image ?>" name="profile_image">
                        <!--end::Inputs-->
                    </label>
                    <!--end::Edit-->
                    <!--begin::Cancel-->
                    <span class="btn btn-icon btn-circle btn-active-color-primary w-25px h-25px bg-white shadow" data-kt-image-input-action="cancel" data-bs-toggle="tooltip" title="" data-bs-original-title="Cancel avatar">
                        <i class="bi bi-x fs-2"></i>
                    </span>
                    <!--end::Cancel-->
                    <!--begin::Remove-->
                    <span class="btn btn-icon btn-circle btn-active-color-primary w-25px h-25px bg-white shadow d-none" data-kt-image-input-action="remove" data-bs-toggle="tooltip" title="" data-bs-original-title="Remove avatar">
                        <i class="bi bi-x fs-2"></i>
                    </span>
                    <!--end::Remove-->
                </div>
                <!--end::Image input-->
                <!--begin::Hint-->
                <div class="form-text">Allowed file types: png, jpg, jpeg.</div>
                <!--end::Hint-->
            </div>
            <!--end::Col-->
        </div>
    </div>
    <!--end::Catigories-->

</div>
<!--end::Sidebar-->
<!--begin::Content-->
<div class="col-md-10">							
   <div class="row mb-1">
       <div class="row mb-1">
             <div class="fv-row mb-7">
                 
               <label class="required fs-6 fw-bold mb-2">Seller City</label>
               <select name="city_id" id="city_id" aria-label="Select a city" data-control="select2" data-placeholder="Select a city.." class="form-select form-select-solid form-select-lg" required="">
                <option value="">Select City</option>
                <?php
                if(!empty($city_list)){
                        foreach($city_list as $k=>$city_list){
                ?>
                <option value="<?=$city_list->id?>" <?= $city_list->id == $query->city ? 'selected' : '' ?>><?=$city_list->name?></option>
                <?php } }?>
             </select>       
            </div>
           <div class="fv-row mb-7">
               <label class="required fs-6 fw-bold mb-2">Seller Type</label>
               
               <select class="form-select" id="seller_type" data-control="select2" data-placeholder="Select Type" data-allow-clear="true" multiple="multiple" name="seller_type[]" required="">
                    <?php
                    if(!empty($seller_type)){
                            $catsArr = explode(',',$query->seller_type);
                            foreach($seller_type as $k1=>$sellertype){
                    ?>
                    <option value="<?=$sellertype->id?>"<? if(in_array($sellertype->id,$catsArr)){ echo 'selected'; } ?> ><?=$sellertype->seller_type?></option>
                    <?php
                            }
                    }
                    ?>
                </select>
            </div>
           
            <div class="col-lg-6">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="sellername" class="form-label fs-6 fw-bolder mb-3 required">Seller Name</label>
            <input type="text" class="form-control form-control-lg form-control-solid" id="seller_name" name="seller_name" value="<?= $query->seller_name ?>" required="true">
            </div>
            </div>
           
            <div class="col-lg-6">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="phone_number" class="form-label fs-6 fw-bolder mb-3 required">Phone Number</label>
            <input type="text" class="form-control form-control-lg form-control-solid" id="phone_number" name="phone_number" value="<?= $query->phone_number ?>"  required="true">

            </div>
            </div>						
            <div class="col-lg-6">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="contact_no" class="form-label fs-6 fw-bolder mb-3 required">Address</label>
            <textarea class="form-control form-control-lg form-control-solid" name="address" required="true"><?= $query->address ?></textarea>

            </div>
            </div>
           <div class="col-lg-6">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="contact_no" class="form-label fs-6 fw-bolder mb-3 ">Rating</label>
            <input type="number" step="0.01" class="form-control form-control-lg form-control-solid" id="rating" name="rating" value="<?= $query->rating ?>" >

            </div>
            </div>
            <!--<div class="col-lg-6">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="open_time" class="form-label fs-6 fw-bolder mb-3 required">Open Time</label>
            <input class="form-control form-control-solid flatpickr-input" type="text" value="<?= $query->open_time ?>" name="open_time" autocomplete="off" required="true">
            </div>
            </div>
           <div class="col-lg-6">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="close_time" class="form-label fs-6 fw-bolder mb-3 required">Close Time</label>
            <input type="text" class="form-control form-control-solid flatpickr-input" id="close_time" name="close_time" value="<?= $query->close_time ?>" autocomplete="off" required="true">

            </div>
            </div>-->
            
            <div class="row mb-6">
<label class="col-md-2 col-form-label fw-bold fs-6">Open Day <br><br> Open Time</label>
<div class="col-md-10">
<div class="row">
<?php
$days = array('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');
foreach($days as $day=> $day_name) {
$getSchedules = $this->Seller_model->getUserScheduleData($day,$query->id);
$time_from = !empty($getSchedules)?$getSchedules->time_from:'';
$time_to = !empty($getSchedules)?$getSchedules->time_to:'';
$type = (!empty($getSchedules) && ($getSchedules->type=='Open')) ?'flex':'none';
?>

<div class="col-md-6 col-form-label fw-bold fs-6 text-center">
<label class="col-form-label fw-bold fs-6 text-center">
<?=$day_name?>
<input name="schedule_day[]" type="hidden" value="<?=$day?>" >
<input name="schedule_day_name[]" type="hidden" value="<?=$day_name?>" >
</label>
<label class="form-check form-switch form-switch-sm form-check-custom form-check-solid text-center d-block">
<input class="form-check-input" name="schedule_type[]" type="checkbox" value="Open" onchange="$('#open_time_<?=$day?>').toggle();" <?=$type=='flex'?'checked':''?> >
</label>											
<div class="row" id="open_time_<?=$day?>" style="display:<?=$type?>;">
<div class="col-6">
<input class="form-control  " name="schedule_time_from[]" type="time" value="<?=$time_from?>" >
</div>
<div class="col-6">
<input class="form-control  " name="schedule_time_to[]" type="time" value="<?=$time_to?>" >
</div>
</div>
</div>	
<?php
}
?>


</div>
</div>
</div>
           <div class="col-lg-6">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="seller_details" class="form-label fs-6 fw-bolder mb-3 required">Seller Details</label>
            <textarea name="seller_details" class="form-control form-control-solid editor" rows="5" placeholder="Seller Details" required><?= $query->seller_details ?></textarea>
            </div>
            </div>
           <div class="col-lg-6">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="message" class="form-label fs-6 fw-bolder mb-3">Offer Message</label>
            <textarea name="offer_massage" class="form-control form-control-solid editor" rows="2" placeholder="Offer Message"><?= $query->offer_massage ?></textarea>
            </div>
            </div>
            </div>	

   </div>


</div>
                            <!--end::Content-->
                        </div>

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
$this->load->view('admin/_js', $this->data);
?>

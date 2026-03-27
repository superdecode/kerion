<link rel="stylesheet" href="<?php echo base_url('assets/admin/plugins/custom-uploader/vendors.css'); ?>">
<link rel="stylesheet" href="<?php echo base_url('assets/admin/plugins/custom-uploader/aiz-core.css'); ?>">

<!--begin::Toolbar-->
<div class="toolbar" id="kt_toolbar">
<!--begin::Container-->
<div id="kt_toolbar_container" class="container-fluid d-flex flex-stack">
<!--begin::Page title-->
<div data-kt-place="true" data-kt-place-mode="prepend" data-kt-place-parent="{default: '#kt_content_container', 'lg': '#kt_toolbar_container'}" class="page-title d-flex align-items-left me-3 flex-wrap mb-5 mb-lg-0 lh-1">
<!--begin::Title-->
<h1 class="d-flex align-items-center text-dark fw-bolder my-1 fs-3">Subir Archivos</h1>
<!--end::Title-->
<!--begin::Separator-->
<span class="h-20px border-gray-200 border-start mx-4"></span>
<!--end::Separator-->
<!--begin::Breadcrumb-->
<ul class="breadcrumb breadcrumb-separatorless fw-bold fs-7 my-1">
<!--begin::Item-->
<li class="breadcrumb-item text-muted">
<a href="<?=base_url()?>" class="text-muted text-hover-primary">Inicio</a>
</li>
<!--end::Item-->

<!--begin::Item-->
<li class="breadcrumb-item">
<span class="bullet bg-gray-200 w-5px h-2px"></span>
</li>
<!--end::Item-->
<!--begin::Item-->
<li class="breadcrumb-item text-dark">Subir Archivos</li>
<!--end::Item-->
</ul>
<!--end::Breadcrumb-->
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<div class="d-flex justify-content-end align-items-center d-none- text-end" data-kt-listing-table-toolbar="selected" id="delete_but">
<div class="fw-bolder me-5">
    <span class="me-2" data-kt-listing-table-select="selected_count"></span></div>
<button type="button" class="btn btn-danger" data-kt-listing-table-select="delete_selected" id="delete_all" data-url="Files/delete_multiple">Delete Selected</button>
</div>
</div>
<!--end::Page title-->
<!--begin::Actions-->
<div class="d-flex align-items-center py-1">
<div class="d-none">
<button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#kt_modal_add">
<!--begin::Svg Icon | path: icons/duotone/Navigation/Plus.svg-->
<span class="svg-icon svg-icon-2">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
<rect fill="#000000" x="4" y="11" width="16" height="2" rx="1"></rect>
<rect fill="#000000" opacity="0.5" transform="translate(12.000000, 12.000000) rotate(-270.000000) translate(-12.000000, -12.000000)" x="4" y="11" width="16" height="2" rx="1"></rect>
</svg>
</span>
<!--end::Svg Icon-->Agregar </button>

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
<!--begin::Card-->
<div class="card">			
<div class="card-body">
<!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert');?><!--END::ALERT MESSAGE -->
<div class="row gutters-5">
<?php
if(!empty($datas)){
foreach($datas as $k=> $rows)
{
$id = base64_encode($rows->id);
$delete_link = base_url('Files/remove/'.$id);
?>
<div class="col-auto w-140px w-lg-200px" id="rows_<?= $rows->id?>">
<div class="aiz-file-box">
<div class="dropdown-file">
<a class="dropdown-link" data-bs-toggle="dropdown" aria-expanded="false"> <i class="la la-ellipsis-v"></i> </a>
<div class="dropdown-menu dropdown-menu-right" style="">
<a href="<?=base_url('assets/uploads/files_manager/'.$rows->file_name)?>" target="_blank" download="<?=$rows->file_name?>" class="dropdown-item"> 	<i class="la la-download mr-2"></i> <span>Download</span> 
</a>
<a href="javascript:void(0)" class="dropdown-item" onclick="copyUrl(this)" data-url="<?=base_url('assets/uploads/files_manager/'.$rows->file_name)?>"> 
<i class="las la-clipboard mr-2"></i> <span>Copy Link</span> 
</a>
<a href="<?=$delete_link?>" class="dropdown-item confirm-alert" onclick="return confirm('Do You Want To Delete This File??')" > 
<i class="las la-trash mr-2"></i> <span>Borrar</span> 
</a>
</div>
</div>
<div class="card card-file aiz-uploader-select c-default" title="<?=$rows->file_name?>">
<div class="card-file-thumb"> 
<img src="<?=base_url('assets/uploads/files_manager/'.$rows->file_name)?>" class="img-fit"> 

</div>
      
<div class="card-body">
<h6 class="d-flex">
<span class="text-truncate title"><?=$rows->file_original_name?></span>
<span class="ext">.<?=$rows->extension?></span>
</h6>
<p><?=$rows->file_size?> KB</p>
</div>
</div>
 
</div>
<div class="form-check form-check-sm form-check-custom form-check-solid mb-5">
    <input class="removeData sub_chk" type="checkbox" value="<?=$rows->id?>" id="delete_image">
</div>
</div>

<?php
}
}

?>			    			
</div>

</div>
</div>
<!--end::Card-->

</div>
<!--end::Container-->
</div>

<!--end::Post-->



<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('_js', $this->data);
?>
<script src="<?php echo base_url('assets/admin/plugins/custom-uploader/aiz-core.js'); ?>"></script>
<script src="<?php echo base_url('assets/admin/plugins/custom-uploader/uppy.js'); ?>"></script>
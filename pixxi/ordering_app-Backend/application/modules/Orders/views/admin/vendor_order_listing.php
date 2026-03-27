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
<li class="breadcrumb-item text-dark"><?=$header['site_title']?></li>
<!--end::Item-->
</ul>
<!--end::Breadcrumb-->
</div>
<!--end::Page title-->
<!--begin::Actions-->
<div class="d-flex align-items-center py-1">
<div class="">


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
<!-- Searching Part --------------------------------->  

<!----------------------- End -------------------------->
 <div class="card-header border-0 pt-6">	   
<!--begin::Card header-->
<div class="card-toolbar flex-row-fluid justify-content-end gap-5 pe-10 d-block mb-10">
<form class="row d-none" action="" method="GET">
<!--begin::Flatpickr-->
<div class=" col-3">
<input class="form-control rounded rounded-end-0 datepicker" placeholder="Search Date" id="" name="date" type="date" value="<?php echo !empty($search['date'])?$search['date']:date('Y-m-d')?>" />						
</div>
<!--end::Flatpickr-->
<div class=" col-2">
<button class="btn btn-primary "><i class="fas fa-search"></i></button>
</div>
<div class=" col-7 text-end">
<div class="d-flex justify-content-end" data-kt-user-table-toolbar="base">
		

<div class="d-flex align-items-center position-relative my-1">
<!--begin::Svg Icon | path: icons/duotone/General/Search.svg-->
<span class="svg-icon svg-icon-1 position-absolute ms-2">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
<g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
<rect x="0" y="0" width="24" height="24" />
<path d="M14.2928932,16.7071068 C13.9023689,16.3165825 13.9023689,15.6834175 14.2928932,15.2928932 C14.6834175,14.9023689 15.3165825,14.9023689 15.7071068,15.2928932 L19.7071068,19.2928932 C20.0976311,19.6834175 20.0976311,20.3165825 19.7071068,20.7071068 C19.3165825,21.0976311 18.6834175,21.0976311 18.2928932,20.7071068 L14.2928932,16.7071068 Z" fill="#000000" fill-rule="nonzero" opacity="0.3" />
<path d="M11,16 C13.7614237,16 16,13.7614237 16,11 C16,8.23857625 13.7614237,6 11,6 C8.23857625,6 6,8.23857625 6,11 C6,13.7614237 8.23857625,16 11,16 Z M11,18 C7.13400675,18 4,14.8659932 4,11 C4,7.13400675 7.13400675,4 11,4 C14.8659932,4 18,7.13400675 18,11 C18,14.8659932 14.8659932,18 11,18 Z" fill="#000000" fill-rule="nonzero" />
</g>
</svg>
</span>
<!--end::Svg Icon-->
<input type="text" data-kt-listing-table-filter="search" class="form-control ps-10" placeholder="Search..." />
</div>
</div>
</div>

<!--end::Add product-->
</form>
</div>
 </div>
<!--end::Card header-->
<!--begin::Card body-->
<div class="card-body pt-0">
<!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert');?><!--END::ALERT MESSAGE -->
<!--begin::Table-->
<table class="table align-middle table-row-dashed fs-6 gy-5" id="kt_listing_table">
<!--begin::Table head-->
<thead>
<!--begin::Table row-->
<tr class="text-start text-gray-400 fw-bolder fs-7  gs-0">
<th class="w-10px pe-2">
<div class="form-check form-check-sm form-check-custom form-check-solid me-3">
#
</div>
</th>
<th class="">Order No.</th>
<th class="">Order Date & Time</th>
<th class="">Order Type</th>
<th class="">Customer</th>
<th class="text-end">Total Amount (COP)</th>
<th class="text-end">Pixxi Earnings (COP)</th>
<th class="text-end">Vendor Earnings (COP)</th>
</tr>
<!--end::Table row-->
</thead>
<!--end::Table head-->
<!--begin::Table body-->
<tbody class="fw-bold text-gray-600">
<?php
$i=1;
if(!empty($datas)){
$datacount=0;    
foreach($datas as $k=> $rows)
{
//pr($rows);
$id = base64_encode($rows->id);
$seller_id = base64_encode($rows->seller_id);
$order_no = $rows->order_number;
$edit_link = base_url('Orders/save/'.$id);
$lebel_link = base_url('Orders/lebel/'.$id.'/'.$order_no);
$review_link = base_url('Orders/saveReview/'.$id);
$accept_link = base_url('Orders/acceptOrder/'.$id);
$delete_link = '';
//$query = $this->Order_model->reviewList($rows->id);
$edit['query']=$query;
$date = !empty($search['date'])?$search['date']:date('Y-m-d');

$total+=$rows->price_total;

$pixxi_earning = ($rows->price_total * $rows->seller_commission / 100);
$vendor_earning = $rows->price_total - $pixxi_earning;

$total_vruumz_earning+=$pixxi_earning;
$total_vendor_earning+=$vendor_earning;
$view_link = base_url('Orders/vendor_order_listing/'.$seller_id.'/'.$date);
?>
<tr id="tr_<?=$rows->id?>">							
<td>
<div class="form-check form-check-sm form-check-custom form-check-solid d-none">
<input class="form-check-input removeData" type="checkbox" value="<?=$rows->id?>" />
</div>								
<?=$k+1?>
</td>
<td>
<a href="<?=$edit_link?>" class="text-primary" ><?=$rows->order_number?></a>
</td>
<td>
<?=date('d M Y ',strtotime($rows->created_at)).'<br>'.date('h:i A ',strtotime($rows->created_at))?>
</td>
<td><?=ucfirst($rows->order_type)?></td>
<td><?=$rows->fname?> <?=$rows->lname?></td>
<td class="text-end"><?=number_format($rows->price_total,2)?> </td>
<td class="text-end"><?=number_format($pixxi_earning,2)?></td>
<td class="text-end" ><?=number_format($vendor_earning,2)?></td>

</tr>
<!--begin::Modal - Edit-->

<!--end::Modal -->
<?php
$i++;
$datacount++;
}
}
?>	
</tbody>
<!--end::Table body-->

<tfoot>
<tr>
<th colspan="5" class="text-end" rowspan="1"></th>
<th class="total_sale text-end text-danger fs-4" rowspan="1" colspan="1">Total Sales : <?=number_format($total,2)?></th>
<th class="total_sale text-end text-success fs-4" rowspan="1" colspan="1">Pixxi Earnings : <?=number_format($total_vruumz_earning,2)?></th>
<th class="total_sale text-end text-primary fs-4" rowspan="1" colspan="1">Vendor Earnings :<?=number_format($total_vendor_earning,2)?></th>
</tr>
</tfoot>
</table>
<!--end::Table-->
</div>
<!--end::Card body-->
</div>
<!--end::Card-->

</div>
<!--end::Container-->
</div>

<!--end::Post-->



<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('admin/_js', $this->data);
?>

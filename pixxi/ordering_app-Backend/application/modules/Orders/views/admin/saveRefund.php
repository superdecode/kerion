<!--begin::Form-->
<form class="form" method="POST" enctype="multipart/form-data" id="calc_form_<?=$query->id?>">
<!--begin::Toolbar-->
<div class="toolbar" id="kt_toolbar">
<!--begin::Container-->
<div id="kt_toolbar_container" class="container-fluid d-flex flex-stack d-print-none">
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
<li class="breadcrumb-item text-muted">
<a href="<?=base_url()?>" class="text-muted text-hover-primary">Inicio</a>
</li>
<li class="breadcrumb-item">
<span class="bullet bg-gray-200 w-5px h-2px"></span>
</li>
<li class="breadcrumb-item text-muted">
<a href="<?=base_url('Orders/refundlisting')?>" class="text-muted text-hover-primary">Lista de Reembolsos</a>
</li>
<li class="breadcrumb-item">
<span class="bullet bg-gray-200 w-5px h-2px"></span>
</li>
<li class="breadcrumb-item text-dark"><?=$header['site_title']?></li>
</ul>
<!--end::Breadcrumb-->
</div>
<!--end::Page title-->
<!--begin::Actions-->
<div class="d-flex align-items-center py-1">
<div class="">
<a href="<?=base_url('Orders/refundlisting')?>" class="btn btn-white btn-active-light-danger me-2">Atrás</a>
<button type="submit" class="btn btn-primary" id="kt_account_profile_details_submit">Guardar Cambios</button>
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
<div id="kt_content_container" class="container-fluid row">
<div class="card">
<!--begin::Body-->
<div class="card-body p-lg-20">
<!--begin::Layout-->
<div class="d-flex flex-column flex-xl-row">
<!--begin::Content-->
<div class="flex-lg-row-fluid me-xl-18 mb-10 mb-xl-0">
<!--begin::Invoice 2 content-->
<div class="mt-n1">
<!--begin::Top-->
<div class="d-flex flex-stack pb-10">
<!--begin::Logo-->
<?php
$uid= $this->session->userdata('user_id');

$get_profile_image = $this->Order_model->getProfileImage($uid);
$image = get_settings_value('favicon');
if (!empty($image)) {
    $sys_img = base_url('assets/uploads/user_images/' . $get_profile_image->profile_image);
} else {
    $sys_img = base_url('assets/admin/dist/media/logos/logo-default.png');
}
?>
<a href="<?= base_url() ?>">
    <img alt="Logo" src="<?= $sys_img ?>" class="h-70px">
</a>
<!--end::Logo-->

</div>
<!--end::Top-->
<!--begin::Wrapper-->
<div class="m-0">
<!--begin::Label-->
<div class="row g-5 mb-11">
 <div class="col-sm-6">    
<div class="fw-bolder fs-3 text-gray-800 mb-8">Factura #<?=$query->order_number?></div>
<input type="hidden" name="order_number" value="<?=$query->order_number?>"/>
</div>
 <div class="col-sm-6">
<div class="fw-bolder fs-3 text-gray-800">Número De Mesa:<?= $query->table_id ?></div>
</div>
    </div>
<!--end::Label-->
<!--begin::Row-->
<div class="row g-5 mb-11">
<!--end::Col-->
<div class="col-sm-6">
<!--end::Label-->
<div class="fw-bold fs-7 text-gray-600 mb-1">Fecha de orden:</div>
<!--end::Label-->
<!--end::Col-->
<div class="fw-bolder fs-6 text-gray-800"><?=date('d M Y h:i A',strtotime($query->created_at))?></div>
<!--end::Col-->
</div>
<!--end::Col-->
<!--end::Col-->
 <?php if($query->remarks!='') {?>
<div class="col-sm-6">
    <!--end::Label-->
    <div class="fw-bold fs-7 text-gray-600 mb-1">Mensaje:</div>
    <!--end::Label-->
    <!--end::Info-->
    <div class="fw-bolder fs-6 text-gray-800 d-flex align-items-center flex-wrap">
        <span class="pe-2"><?= $query->remarks?></span>
        <!--<span class="fs-7 text-danger d-flex align-items-center">
            <span class="bullet bullet-dot bg-danger me-2"></span>Due in 7 days</span>-->
    </div>
    <!--end::Info-->
</div>
<?php } ?>
<!--end::Col-->
</div>
<!--end::Row-->
<!--begin::Row-->
<div class="row g-5 mb-12">
<!--end::Col-->
<div class="col-sm-6">
<div class="fw-bold fs-7 text-gray-600 mb-1">De:</div>
<div class="fw-bolder fs-6 text-gray-800"><?=$query->seller_name?></div>
<div class="fw-bold fs-7 text-gray-600">										
<?='<b>Phone : </b>'.$query->store_phone_code.' '.$query->phone_number?> <br>
<?=$query->store_address?> <br>
<?=$query->address?>
</div>
</div>
<div class="col-sm-6">
<div class="fw-bold fs-7 text-gray-600 mb-1">Para:</div>
<div class="fw-bolder fs-6 text-gray-800"><?=$query->fname?> <?=$query->lname?></div>
<div class="fw-bolder fs-6 text-gray-800"><?=$query->email?></div>
<?php if($query->phone_no!='') {?>
<div class="fw-bold fs-7 text-gray-600">
<?='<b>Phone : </b>'.$query->phone_no?> <br>
</div>
<?php } ?>
</div>
<!--end::Col-->
</div>
<!--end::Row-->
<!--begin::Content-->
<div class="flex-grow-1">
<!--begin::Table-->
<div class="table-responsive border-bottom mb-9">
<table class="table mb-3">
<thead>
<tr class="border-bottom fs-6 fw-bolder text-muted">
<th class="min-w-175px pb-2">Descripción</th>
<th class="min-w-70px text-end pb-2">Cantidad</th>
<th class="min-w-80px text-end pb-2">&nbsp;</th>
<th class="min-w-100px text-end pb-2">Monto (COP)</th>
</tr>
</thead>
<tbody>
<?php
if(!empty($query->orderItemList)){
foreach($query->orderItemList as $k=>$orderItem){
?>
<tr class="fw-bolder text-gray-700 fs-5 text-end">
<td class="d-flex align-items-center pt-6">
<i class="fa fa-genderless text-danger fs-2 me-2"></i><?=$orderItem->product_title?> | <?= $query->order_type ?></td>
<td class="pt-6"><?=$orderItem->product_quantity?></td>
<!--<td class="pt-6"><?=($orderItem->product_discount_price>0)?'<s class="fs-7">'.$orderItem->product_price.'</s> '.$orderItem->product_discount_price:$orderItem->product_price?> $</td>-->
<td class="pt-6"><?= $orderItem->product_option_name;?></td>
<td class="pt-6 text-dark fw-boldest"> <?=$orderItem->product_total_price?></td>
</tr>
<?php
}
}
?>	
</tbody>
</table>
</div>
<!--end::Table-->
<!--begin::Container-->
<div class="d-flex justify-content-end">
<div class="mw-300px">
<div class="d-flex flex-stack mb-3">
<div class="fw-bold pe-10 text-gray-600 fs-7">Subtotal:</div>
<div class="text-end fw-bolder fs-6 text-gray-800"><?=$query->price_subtotal?> </div>
</div>
<!--<div class="d-flex flex-stack mb-3">
<div class="fw-bold pe-10 text-gray-600 fs-7">Discount </div>
<div class="text-end fw-bolder fs-6 text-gray-800">- <?=$query->discount_amount?> $</div>
</div>-->
<div class="d-flex flex-stack mb-3">
<div class="fw-bold pe-10 text-gray-600 fs-7">Cupón Descuento  </div>
<div class="text-end fw-bolder fs-6 text-gray-800">- <?=!empty($query->coupon_discount)?$query->coupon_discount:'0.00'?> </div>
</div>
<!--<div class="d-flex flex-stack mb-3">
<div class="fw-bold pe-10 text-gray-600 fs-7"> Delivery Charge </div>
<div class="text-end fw-bolder fs-6 text-gray-800"> <?=$query->delivery_charges?> $</div>
</div>-->
<!--<div class="d-flex flex-stack mb-3">
<div class="fw-bold pe-10 text-gray-600 fs-7">TAX (<?=$query->tax_rate?>%)</div>
<div class="text-end fw-bolder fs-6 text-gray-800"><?=$query->tax_charges?> $</div>
</div>-->
<div class="d-flex flex-stack">
<div class="fw-bold pe-10 text-dark fs-4">Total General</div>
<div class="text-end fw-bolder fs-3 text-dark"> 
<?php
$fmt = new \NumberFormatter( 'en', \NumberFormatter::CURRENCY);
$fmt->setTextAttribute( $fmt::CURRENCY_CODE, 'COP' );
$fmt->setAttribute( $fmt::FRACTION_DIGITS, 2 );
echo $numberString = $fmt->format($query->price_total );
?>

</div>
</div>
<!--end::Item-->
</div>
<!--end::Section-->
</div>
<!--end::Container-->
</div>
<!--end::Content-->
</div>
<!--end::Wrapper-->
</div>
<!--end::Invoice 2 content-->
</div>
<!--end::Content-->
<!--begin::Sidebar-->
<div class="m-0">
<!--begin::Invoice 2 sidebar-->
<div class="d-print-none border border-dashed border-gray-300 card-rounded h-lg-100 min-w-md-350px p-9 bg-lighten">
<!--begin::Labels-->
<div class="mb-8">
<h6 class="mb-2 fw-boldest text-gray-600 text-hover-primary">Estado del Reembolso</h6>
<select name="refund_status" class="form-control mb-4">
<option <?php if($refund_details->refund_status == 'completed') {?>disabled="true"<?php } ?> value="ongoing" <?=$refund_details->refund_status=='ongoing'?'selected':''?> >En Curso</option>
<option value="completed" <?=$refund_details->refund_status=='completed'?'selected':''?> >Completado</option>
<option <?php if($refund_details->refund_status == 'completed') {?>disabled="true"<?php } ?> value="cancelled" <?=$refund_details->refund_status=='cancelled'?'selected':''?> >Cancelado</option>


</select>
<?php /*?>	
<h6 class="mb-2 fw-boldest text-gray-600 text-hover-primary">Delivery Status</h6>
<select name="delivery_status" class="form-control">
<option value="pending" <?=$query->delivery_status=='pending'?'selected':''?> >Pending</option>
<option value="shipped" <?=$query->delivery_status=='shipped'?'selected':''?> >Shipped</option>
<option value="out_for_delivery" <?=$query->delivery_status=='out_for_delivery'?'selected':''?> >Out For Delivery</option>
<?php if($this->session->userdata('user_role_ids')=='1'){?><option value="delivered" <?=$query->delivery_status=='delivered'?'selected':''?> >Delivered</option> <?php } ?>
</select>
<?php */ ?>	
</div>
<!--end::Labels-->
<!--begin::Title-->
<h6 class="mb-4 fw-boldest text-gray-600 text-hover-primary">Detalles de Pago</h6>
<!--end::Title-->
<!--begin::Item-->
<div class="mb-6">
<div class="fw-bold text-gray-600 fs-7">Estado del Pago:</div>
<div class="fw-bolder text-gray-800 fs-6"><span class="badge badge-light-<?=($query->payment_status!='Unpaid')?'success':'warning'?>">
        <?php if($query->payment_status=='Unpaid') {
            $payment_status='Pendiente Pago';
        }if($query->payment_status=='Paid') {
            $payment_status='Pagado';
        } ?>
        <?=$payment_status?>
    </span></div>
</div>
<div class="mb-6">
<div class="fw-bold text-gray-600 fs-7">Forma de Pago:</div>
<div class="fw-bolder text-gray-800 fs-6">
     <?php if($query->payment_method=='cash') {
            $payment_status='Efectivo';
        }if($query->payment_method=='Tarjeta de Crédito') {
            $payment_status='Pagado';
        } ?>
     <?=$payment_status;?>
</div>
</div>


</div>
<!--end::Invoice 2 sidebar-->
</div>
<!--end::Sidebar-->
</div>
<!--end::Layout-->
</div>
<!--end::Body-->
</div>
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
<script>

</script>
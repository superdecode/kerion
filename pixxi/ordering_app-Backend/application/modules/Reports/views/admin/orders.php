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
<a href="<?=base_url()?>" class="text-muted text-hover-primary">Inicio</a>
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
<!--begin::Card header-->
<div class="card-header border-0 pt-6 row">
                <!--begin::Card title-->
                <div class="col-md-12">					
                    <div class="row">	
                        <div class="col-md-12 mb-3 text-end">
                            <div class="d-flex justify-content-end" data-kt-user-table-toolbar="base">
                                <div class="dropdown d-flex align-items-center position-relative my-1 me-2">
                                    <button type="button" class="btn btn-light-primary font-weight-bolder dropdown-toggle" data-kt-menu-trigger="click" data-kt-menu-placement="bottom-end">
                                        <span class="svg-icon svg-icon-md">
                                            <!--begin::Svg Icon | path:assets/media/svg/icons/Design/PenAndRuller.svg-->
                                            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
                                            <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                                            <rect x="0" y="0" width="24" height="24" />
                                            <path d="M3,16 L5,16 C5.55228475,16 6,15.5522847 6,15 C6,14.4477153 5.55228475,14 5,14 L3,14 L3,12 L5,12 C5.55228475,12 6,11.5522847 6,11 C6,10.4477153 5.55228475,10 5,10 L3,10 L3,8 L5,8 C5.55228475,8 6,7.55228475 6,7 C6,6.44771525 5.55228475,6 5,6 L3,6 L3,4 C3,3.44771525 3.44771525,3 4,3 L10,3 C10.5522847,3 11,3.44771525 11,4 L11,19 C11,19.5522847 10.5522847,20 10,20 L4,20 C3.44771525,20 3,19.5522847 3,19 L3,16 Z" fill="#000000" opacity="0.3" />
                                            <path d="M16,3 L19,3 C20.1045695,3 21,3.8954305 21,5 L21,15.2485298 C21,15.7329761 20.8241635,16.200956 20.5051534,16.565539 L17.8762883,19.5699562 C17.6944473,19.7777745 17.378566,19.7988332 17.1707477,19.6169922 C17.1540423,19.602375 17.1383289,19.5866616 17.1237117,19.5699562 L14.4948466,16.565539 C14.1758365,16.200956 14,15.7329761 14,15.2485298 L14,5 C14,3.8954305 14.8954305,3 16,3 Z" fill="#000000" />
                                            </g>
                                            </svg>
                                            <!--end::Svg Icon-->
                                        </span>Exportar</button>
                                    <div class="menu menu-sub menu-sub-dropdown menu-column menu-rounded menu-gray-800 menu-state-bg-light-primary fw-bold w-200px" data-kt-menu="true" style="">
                                        <!--begin::Menu item-->
                                        <div class="menu-item px-3">
                                            <div class="menu-content fs-6 text-dark fw-bolder px-3 py-4">Herramientas de Exportación</div>
                                        </div>
                                        <div class="menu-item">
                                            <a class="menu-link py-3" href="#" id="export_print">
                                                <span class="menu-icon">
                                                    <i class="la la-print fs-2"></i>
                                                </span>
                                                <span class="menu-title">Impresión</span>
                                            </a>
                                        </div>
                                        
                                      
                                        <div class="menu-item">
                                            <a class="menu-link py-3" href="#"  id="export_csv">
                                                <span class="menu-icon">
                                                    <i class="la la-file-text-o fs-2"></i>
                                                </span>
                                                <span class="menu-title">CSV</span>
                                            </a>
                                        </div>
                                        

                                    </div>


                                </div>		

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
                                    <input type="text" data-kt-listing-table-filter="search" class="form-control ps-10" placeholder="Búsqueda" />
                                </div>
                            </div>
                        </div>
                        		
                    </div>
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
<th class="">Nº De Orden</th>
<th class="">Fecha Y Hora del Pedido</th>
<!--<th class="">Order Type</th>-->
<th class="">Cliente</th>
<th class="">Monto (COP)</th>
<th class="">Estado de Pago</th>
<th class="">Estado del Pedido</th>

</tr>
<!--end::Table row-->
</thead>
<!--end::Table head-->
<!--begin::Table body-->
<tbody class="fw-bold text-gray-600">
<?php
$count=1;
if(!empty($datas)){
foreach($datas as $k=> $rows)
{
//pr($rows);
//echo 'order_id'.$rows->order_id;   
$id = base64_encode($rows->id);
$order_no = $rows->order_number;
$delete_link = '';
//$query = $this->Order_model->reviewList($rows->id);
$edit['query']=$query;
?>
<tr id="tr_<?=$rows->id?>">							
<td>
<div class="form-check form-check-sm form-check-custom form-check-solid ">
<?= $count;?>
</div>								
</td>
<td>
<?=$rows->order_number?>
</td>
<td>
<?=date('d M Y ',strtotime($rows->created_at)).'<br>'.date('h:i A ',strtotime($rows->created_at))?>
</td>
<!--<td><?=ucfirst($rows->order_type)?></td>-->
<td><?=$rows->fname?> <?=$rows->lname?></td>

<td>
<?php
$fmt = new \NumberFormatter( 'en', \NumberFormatter::CURRENCY);
$fmt->setTextAttribute( $fmt::CURRENCY_CODE, 'COP' );
$fmt->setAttribute( $fmt::FRACTION_DIGITS, 2 );
echo $numberString = $fmt->format($rows->price_total );
?>
</td>
<td data-filter="">
<a href="javascript:void(0)" class="badge badge-light-<?=($rows->payment_status!='Unpaid')?'success':'danger'?>">
        <?php if($rows->payment_status=='Paid') 
        { 
            $payment_status='Pagado';
        } if($rows->payment_status=='Unpaid'){
            $payment_status='Pendiente Pago';
        }?>
        <?= $payment_status; ?>
        </a>
</td>
<td data-filter="">
<a href="javascript:void(0)" class="badge badge-light-<?=($rows->order_status!='awating_confirmation' && $rows->order_status!='cancelled' )?'success':'danger'?>">
                <?php if($rows->order_status=='processing') 
                { 
                    $order_status='Procesando';
                } if($rows->order_status=='completed'){
                    $order_status='Completado';
                }if($rows->order_status=='cancelled'){
                    $order_status='Cancelado';
                }
                ?>
                <?= $order_status;?>
                </a>
</td>


</tr>

<?php
$count++;
}
}
?>	
</tbody>
<!--end::Table body-->
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
$this->load->view('admin/_js_order', $this->data);
?>

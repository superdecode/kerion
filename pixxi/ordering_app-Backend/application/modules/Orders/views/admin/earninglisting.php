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
                <!--begin::Item-->
                <li class="breadcrumb-item text-muted">
                    <a href="<?= base_url() ?>" class="text-muted text-hover-primary">Inicio</a>
                </li>
                <!--end::Item-->

                <!--begin::Item-->
                <li class="breadcrumb-item">
                    <span class="bullet bg-gray-200 w-5px h-2px"></span>
                </li>
                <!--end::Item-->
                <!--begin::Item-->
                <li class="breadcrumb-item text-dark"><?= $header['site_title'] ?></li>
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
                    <?php /*?><form class="row" action="" method="GET">
                        <!--begin::Flatpickr-->
                        <div class=" col-3">
                            <input class="form-control rounded rounded-end-0 datepicker" placeholder="Search Date" id="" name="date" type="date" value="<?php echo !empty($search['date']) ? $search['date'] : date('Y-m-d') ?>" />
                        </div>
                        <!--end::Flatpickr-->
                        <div class=" col-2">
                            <button class="btn btn-light "><i class="fas fa-search"></i></button>
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
                    </form> <?php */?>
                    <form action="" method="GET" id="search_form" >
                               <div class="row gy-5 g-xl-10 pt-4">

                                   <div class="col-md-4 mb-xl-10">

                                       <div id="reportrange" class="form-control w-100 mw-300px text-start cursor-pointer">
                                           <i class="fa fa-calendar"></i>&nbsp;
                                           <span></span> <i class="fa fa-caret-down"></i>
                                       </div>
                                       <input type="hidden" name="from" id="from" value="">
                                       <input type="hidden" name="to" id="to" value="">
                                   </div>

                                   <div class="col-md-4 mb-5 mb-xl-10">
                                       <input type="submit" class="btn btn-primary btn-sm me-2 pt-3" value="Buscar" name="" />
                                   </div>
                               </div>
                           </form>
                </div>
            </div>
            <!--end::Card header-->
            <!--begin::Card body-->
            <div class="card-body pt-0">
                <!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert'); ?><!--END::ALERT MESSAGE -->
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
                            <th class="">Nombre del Vendedor</th>
                            <th class="">Información de Contacto</th>
                            <th>Fecha</th>
                            <th>Total de Pedidos</th>
                            <th class="text-end">Ventas Totales (COP)</th>
                            <th class="text-end">Ganancias de Pixxi (COP)</th>
                            <th class="text-end">Ganancias del Vendedor (COP)</th>

                        </tr>
                        <!--end::Table row-->
                    </thead>
                    <!--end::Table head-->
                    <!--begin::Table body-->
                    <tbody class="fw-bold text-gray-600">
                        <?php
                        $i = 1;
                        $fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
                        $fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
                        $fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
                        if (!empty($datas)) {
                            $datacount = 0;
                            foreach ($datas as $k => $rows) {
                                //pr($rows);
                                $id = base64_encode($rows->id);
                                $seller_id = base64_encode($rows->seller_id);
                                $order_no = $rows->order_number;
                                $edit_link = base_url('Orders/save/' . $id);
                                $lebel_link = base_url('Orders/lebel/' . $id . '/' . $order_no);
                                $review_link = base_url('Orders/saveReview/' . $id);
                                $accept_link = base_url('Orders/acceptOrder/' . $id);
                                $delete_link = '';
                                //$query = $this->Order_model->reviewList($rows->id);
                                $edit['query'] = $query;
                                $date = !empty($search['date']) ? $search['date'] : date('Y-m-d');
                                $from = $search['from'];
                                $to = $search['to'];
                                $total += $rows->price_total;

                                $pixxi_earning = ($rows->price_total * $rows->seller_commission / 100);
                                $vendor_earning = $rows->price_total - $pixxi_earning;

                                $total_vruumz_earning += $pixxi_earning;
                                $total_vendor_earning += $vendor_earning;
                                $view_link = base_url('Orders/vendor_order_listing/'.$seller_id.'/'.$from.'/'.$to);
                        ?>
                                <tr id="tr_<?= $rows->id ?>">
                                    <td>
                                        <div class="form-check form-check-sm form-check-custom form-check-solid ">
                                            <!--<input class="form-check-input removeData" type="checkbox" value="<?= $rows->id ?>" />-->
                                            <?= $i; ?>
                                        </div>
                                    </td>
                                    <td>
                                        <a href="<?= $view_link ?>" target="_blank" class="text-primary"><?= ucfirst($rows->seller_name) ?></a>
                                    </td>
                                    <td><?= $rows->phone_number ?></td>
                                    <td><?= $date ?></td>
                                    <td><?= $rows->order_count ?></td>
                                    <td class="text-end">
                                        <?php
                                         echo $numberString = $fmt->format($rows->price_total);
                                        ?>

                                    </td>
                                    <td class="text-end">
                                        <?php
                                       
                                        echo $numberString = $fmt->format($pixxi_earning);
                                        ?>
                                    </td>
                                    <td class="text-end">
                                        <?php
                                        
                                        echo $numberString = $fmt->format($vendor_earning);
                                        ?>
                                    </td>

                                    <td class="text-center">

                                    </td>
                                </tr>
                                <!--begin::Modal - Edit-->
                                <div class="modal fade " id="kt_modal_edit<?= $rows->id ?>" tabindex="-1" aria-hidden="true">
                                    <!--begin::Modal dialog-->
                                    <div class="modal-dialog modal-dialog-centered mw-800px">
                                        <!--begin::Modal content-->
                                        <div class="modal-content">
                                            <!--begin::Form-->
                                            <?php $this->load->view('admin/saveReview', $edit); ?>
                                            <!--end::Form-->
                                        </div>
                                    </div>
                                </div>
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
                            <th class="total_sale text-end text-danger fs-4" rowspan="1" colspan="1">Ventas totales :
                                <?php
                                $fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
                                $fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
                                $fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
                                echo $numberString = $fmt->format($total);
                                ?>
                            </th>
                            <th class="total_sale text-end text-success fs-4" rowspan="1" colspan="1">Ganancias de Pixxi:
                                <?php
                                $fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
                                $fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
                                $fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
                                echo $numberString = $fmt->format($total_vruumz_earning);
                                ?>
                            </th>
                            <th class="total_sale text-end text-primary fs-4" rowspan="1" colspan="1">Ganancias del proveedor:
                                <?php
                                $fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
                                $fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
                                $fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
                                echo $numberString = $fmt->format($total_vendor_earning);
                                ?>
                            </th>
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
<script type="text/javascript">
    $(function() {

        //var start = moment().subtract(29, 'days');
        //var end = moment();
        var start = moment("<?= $search['from'] ?>");
        var end = moment("<?= $search['to'] ?>");

        function cb(start, end) {
            $('#reportrange span').html(start.format('MMMM D, YYYY') + ' - ' + end.format('MMMM D, YYYY'));
            $('#from').val(start.format('YYYY-M-D'));
            $('#to').val(end.format('YYYY-M-D'));


        }

        $('#reportrange').daterangepicker({

            startDate: start,
            endDate: end,

            ranges: {
                'Hoy': [moment(), moment()],
                'Ayer': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                'Los últimos 7 días': [moment().subtract(6, 'days'), moment()],
                'Últimos 30 días': [moment().subtract(29, 'days'), moment()],
                'Este mes': [moment().startOf('month'), moment().endOf('month')],
                'El mes pasado': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
            }
        }, cb);

        cb(start, end);

    });

    //$('a.toggle-vis').on('click', function (e) {
    $('.toggle-vis').click(function(e) {

        //e.preventDefault();

        // Get the column API object
        var column = table.column($(this).attr('data-column'));

        // Toggle the visibility
        column.visible(!column.visible());
    });
</script>
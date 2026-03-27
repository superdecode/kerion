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
            <div class="card-header border-0 pt-6 row">
                <!--begin::Card title-->
                <div class="col-md-12">					
                    <div class="row">	
                        <div class="col-md-6 mb-3">
                            <form action="" method="GET" id="search_form" >
                                <div class="row gy-5 g-xl-10">

                                    <div class="col-md-7 mb-xl-10">

                                        <div id="reportrange" class="form-control w-100 mw-300px text-start cursor-pointer">
                                            <i class="fa fa-calendar"></i>&nbsp;
                                            <span></span> <i class="fa fa-caret-down"></i>
                                        </div>
                                        <input type="hidden" name="from" id="from" value="">
                                        <input type="hidden" name="to" id="to" value="">


                                    </div>

                                    <div class="col-md-4 mb-5 mb-xl-10">
                                        <input type="submit" class="btn btn-primary btn-sm me-2 pt-3" value="Búsqueda" name="" />
                                    </div>
                                </div>
                            </form>
                        </div>  
                        <div class="col-md-6 mb-3 text-end">
                            <div class="d-flex justify-content-end" data-kt-user-table-toolbar="base">
                                <div class=" col-7 text-end me-5">
                                    <div class="d-flex justify-content-end" data-kt-user-table-toolbar="base">


                                        <div class="d-flex align-items-center position-relative my-1 d-none">
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

                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card-body pt-0">




                <!-- Map-->
                <!-- HTML -->

                <!--<div class="mt-10 ps-10"><strong><?php echo $start_date; ?> - <?php echo $end_date; ?>

                    </strong></div>-->
                <div id="chartdiv"></div>


                <!-- End Map -->



                <!--begin::Card header-->

                <!--end::Card header-->
                <!--begin::Card body-->
                <div class="card-body pt-0 mt-5">
                    <!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert'); ?><!--END::ALERT MESSAGE -->
                    <!--begin::Table-->

                    <!--end::Table-->
                    <!----------------->

                    <table id="kt_listing_table" class="table align-middle table-row-dashed fs-6 gy-5" style="width:100%">
                        <thead>
                            <tr>
                                <th><strong>Elementos</strong></th>
                                <th class="min-w-70px"><strong>SKU</strong></th>
                                <th class="min-w-100px"><strong>Categoría</strong></th>
                                <!--<th class="min-w-100px"><strong>Discount</strong></th>-->
                                <th><strong>Productos Vendidos</strong></th>
                                <th><strong>Venta Bruta</strong></th>
                                <th><strong>Ventas Netas</strong></th>
                                <th class="text-end min-w-70px d-none">
                                    <div class="dropdown d-none">
                                        <a class="btn btn-primary dropdown-toggle text-center" data-bs-toggle="dropdown"></a>
                                        <ul class="dropdown-menu">
                                            <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="0" checked> Elementos</li>
                                            <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="1" checked> SKU</li>
                                            <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="2" checked> Categoría</li>
                                            <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="3" checked> Descuento</li>
                                            <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="4" checked> Productos Vendidos</li>
                                            <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="5" checked> Venta Bruta</li>
                                            <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="6" checked> Ventas Netas</li>

                                        </ul>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php
                            $fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
                            $fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
                            $fmt->setAttribute($fmt::FRACTION_DIGITS, 2);

                            $quantity = 0;
                            $netamount = 0;
                            $grossamount = 0;
                            //print_r($top_sale);
                            if (!empty($allproducts)) {
                                foreach ($allproducts as $k => $rows) {
                                    $id = base64_encode($rows->id);
                                    $product_details = $this->Report_model->getProducts($rows->product_id);
                                    //$product_discount = $this->Report_model->getProductsDiscount($rows->order_id);


                                    /*                                     * ************* New Code**************** */
                                    $totcountorder = $this->Report_model->getOrderDataItemSale($rows->id, $search['from'], $search['to']);
                                    //echo 'order_ids'.$totcountorder->order_id;
                                    $product_variant = $this->Report_model->getProductsVariant($totcountorder->product_id, $search['from'], $search['to']);
                                    //$get_order_ids = $this->Report_model->getOrderIDFromOrderProducts($rows->id, $search['from'], $search['to']);
                                    $totdis = 0;
                                    /* if (!empty($get_order_ids)) {

                                      foreach ($get_order_ids as $k => $oids) {
                                      $discount_amt = $this->Report_model->getProductsDiscount($oids->order_id);
                                      //$discount_amt->coupon_discount;
                                      $totdis = $discount_amt->price_total;
                                      }
                                      } */


                                    //$product_discount = $this->Report_model->getProductsDiscount($totcountorder->order_id);
                                    $getnetsale = $this->Report_model->getOrderNetSale($rows->id, $search['from'], $search['to']);
                                    $netsum = 0;
                                    if (!empty($getnetsale)) {
                                        foreach ($getnetsale as $k => $net) {
                                            $unit = $net->product_unit_price;
                                            $quant = $net->product_quantity;
                                            $netqua = $unit * $quant;
                                            $netsum = $netsum + $netqua;
                                        }
                                    }


                                    //$gross_sell=$totcountorder->product_unit_price * $totcountorder->product_quantity; 
                                    //$net_sell=$totcountorder->product_total_price * $totcountorder->product_quantity; 
                                    ?>
                                    <tr>
                                        <td><?= $rows->title ?></td>

                                        <td><?= $rows->sku; ?></td>
                                        <td><?= $rows->cname; ?></td>
                                        <!--<td><?= $product_discount->coupon_discount; ?></td>-->
                                        <td><?= $totcountorder->product_quantity ?></td>
                                        <td><?= $fmt->format($netsum) ?></td>
                                        <td>
                                                <?php
                                                if ($product_discount->coupon_discount != '') {
                                                    $total_amount_notfitlogic = $totcountorder->product_total_price - $product_discount->coupon_discount;
                                                } else {
                                                    $total_amount = $totcountorder->product_total_price;
                                                }
                                                ?>
                                                <?= $fmt->format($total_amount); ?></td>
                                        <td>&nbsp;</td>
                                    </tr>
        <?php
        if ($totcountorder->variant_product_id != '' && $totcountorder->variant_product_id != 0) {
            if (!empty($product_variant)) {
                foreach ($product_variant as $k => $prows) {
                    $get_variant = $this->Report_model->getVariantDetails($prows->variant_product_id);
                    $variant_sum = $prows->product_unit_price * $prows->product_quantity;
                    ?>
                                                <tr>
                                                    <td class="ps-5"><?= $get_variant->variation_name; ?>(<?= $prows->product_option_name ?>)</td>
                                                    <td><?= $get_variant->vsku; ?></td>
                                                    <td><?= $product_details->cname; ?></td>
                                                    <!--<td><?= $product_discount->coupon_discount; ?></td>-->
                                                    <td><?= $prows->product_quantity ?></td>
                                                    <td><?= $fmt->format($variant_sum) ?></td>
                                                    <td><?= $fmt->format($prows->product_total_price) ?></td>
                                                    <td>&nbsp;</td>
                                                </tr>
                <?php
                }
            }
        }
        ?>
                                    <?php
                                    $quantity = $quantity + $totcountorder->product_quantity;
                                    $netamount = $netamount + $total_amount;
                                    $grossamount = $grossamount + $netsum;
                                }
                            }
                            ?>
                        </tbody>
                        <tfoot>
                            <tr>
                                <th colspan="3"><strong>Totales</strong></th>
                                <th><?= $quantity ?></th>
                                <th ><strong> <?= $fmt->format($grossamount); ?></strong></th>
                                <th colspan="2"> <strong><?= $fmt->format($netamount); ?></strong></th>

                            </tr>
                        </tfoot>
                    </table>



                </div>
                <!--end::Card body-->
            </div>
            <!--end::Card-->

        </div>
        <!--end::Container-->
    </div>
</div>
    <!--end::Post-->

    <!-- Chart code -->
    <style>
        #chartdiv {
            width: 100%;
            height: 500px;
            max-width: 100%;
        }
    </style>


    <?php
    $this->load->view('templates/admin/footer_scripts', $this->data);
    $this->load->view('admin/_js_item_sale', $this->data);
    ?>
    <script>
        anychart.onDocumentReady(function () {

            // add data
<?php //echo trim($items_chart_datas, '[]');
?>
<?php //print_r($date_name);
?>
            var data = [
<?php
if (!empty($date_name)) {
    foreach ($date_name as $data) {
        $allproducts = $this->Report_model->getAllProducts($this->session->userdata('seller_id'));
        ?>["<?= $data['date']; ?>",
        <?php
        if (!empty($allproducts)) {
            foreach ($allproducts as $value) {
                $totcountorder = $this->Report_model->getOrderData($value->id, $data['date']);
                $getfororderid = $this->Report_model->getOrderDiscount($value->id, $data['date']);
                $product_discount = $this->Report_model->getProductsDiscount($getfororderid->order_id);
                if ($product_discount->coupon_discount != '') {
                    $totcountorder_notfitlogic = $totcountorder - $product_discount->coupon_discount;
                } else {
                    $totcountorder = $totcountorder;
                }

                echo $totcountorder;
                ?>, <?php }
        }
        ?>],
    <?php }
}
?>
            ];

            // create a data set
            var dataSet = anychart.data.set(data);

            // map the data for all series
<?php //print_r($allproducts);
?>
<?php
if (!empty($allproducts)) {
    $count = 1;
    foreach ($allproducts as $k => $value) {
        //foreach($value as $pvalue){
        ?>
                    var firstSeriesData_<?= $count; ?> = dataSet.mapAs({
                        x: 0,
                        value: <?= $count ?>
                    });
        <?php
        $count++;
    }
}
?>
            // create a line chart
            var chart = anychart.line();

            // create the series and name them
<?php
if (!empty($allproducts)) {
    $count = 1;
    foreach ($allproducts as $k => $value) {
        //foreach($value as $pvalue){
        ?>
                    var firstSeries_<?= $count; ?> = chart.line(firstSeriesData_<?= $count ?>);
                    firstSeries_<?= $count ?>.name("<?= $value->title; ?>");
        <?php
        $count++;
    }
}
?>

            // set function to format the y-axis labels
            //var yLabels = chart.yAxis(0).labels();
            //yLabels.format("RMB {%value}{groupsSeparator: }");
            // set y axis title
            var yAxis = chart.yAxis(0);
            yAxis.title("Total sale amount in RMB");
            // add a legend
            chart.legend().enabled(true);

            // add a title
            chart.title("Ventas Producto");

            // specify where to display the chart
            chart.container("chartdiv");

            // draw the resulting chart
            chart.draw();

        });
    </script>

    <script type="text/javascript">
        $(function () {

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
        $('.toggle-vis').click(function (e) {

            //e.preventDefault();

            // Get the column API object
            var column = table.column($(this).attr('data-column'));

            // Toggle the visibility
            column.visible(!column.visible());
        });
    </script>
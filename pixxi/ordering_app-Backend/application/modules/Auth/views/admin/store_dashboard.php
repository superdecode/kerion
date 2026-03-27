<?php
$fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
$fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
$fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
?>
<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/daterangepicker/daterangepicker.css" />
<div class="post d-flex flex-column-fluid" id="kt_post">
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
                    <a href="<?= base_url('Products/save') ?>" class="btn btn-primary">
                        <!--begin::Svg Icon | path: icons/duotone/Navigation/Plus.svg-->
                        <span class="svg-icon svg-icon-2">
                            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
                                <rect fill="#000000" x="4" y="11" width="16" height="2" rx="1"></rect>
                                <rect fill="#000000" opacity="0.5" transform="translate(12.000000, 12.000000) rotate(-270.000000) translate(-12.000000, -12.000000)" x="4" y="11" width="16" height="2" rx="1"></rect>
                            </svg>
                        </span>
                        <!--end::Svg Icon-->Agregar un Producto</a>

                </div>
            </div>
            <!--end::Actions-->
        </div>
        <!--end::Container-->
    </div>
    <!--end::Toolbar-->
    <!--begin::Container-->
    <div id="kt_content_container" class="container-fluid">
        <!--begin::Card-->
        <div class="card">
            <!--begin::Card body-->
            <div class="card-body p-0">
                <!--begin::Wrapper-->
                <div class="card-header-bak py-5 d-flex justify-content-between">
                    <h3 class="card-title fw-bold text-gray-800 fs-2 ps-4">Bienvenido de Nuevo </h3>
                    <div class="card-title fw-bold text-gray-800 d-none">
                        <a href="<?= base_url('Products/save') ?>" class="btn btn-light-primary">Agregar un Producto</a>
                    </div>

                </div>
                <div class="card-px text-center row">
                    <div class="col-md-12 col-xl-12 mb-md-5 mb-xxl-12 ">
                        <div class="row gutters-10 mt-2">
                            <div class="col-md-7  border border-1">
                                <form method="GET" action="" class="row">


                                    <div class="input-group mb-3 mt-3">
                                        <div id="reportrange" class="form-control w-100 mw-275px text-start cursor-pointer" >
                                            <i class="fa fa-calendar"></i>&nbsp;
                                            <span><?= $label ?></span> <i class="fa fa-caret-down"></i>
                                            <!--<input type="hidden" name="start" id="start" value="">
                                            <input type="hidden" name="end" id="end" value="">-->
                                        </div>

                                        <span class="input-group-text">Vs</span>
                                        <input type="text" class="form-control w-100 mw-225px" placeholder="<?= date('d/m/Y', strtotime($start_date2)) . ' - ' . date('d/m/Y', strtotime($end_date2)) ?>" readonly>
                                    </div>
                                </form>

                                <div class="row">
                                    <div class="col-12 mb-2 " style="border-bottom: solid 1px;">
                                        <div class="card card-flush ">
                                            <div class="card-header pt-1 mb-5 row">
                                                <div class="col-md-5">
                                                    <div class="card-title d-flex flex-column" >
                                                        <span class="text-gray-400 pt-1 mb-2 fw-semibold fs-6">Ventas Netas </span>
                                                        <div class="d-flex align-items-center">
                                                            <span class="fs-3 fw-bold text-dark me-2 lh-1 ls-n2">COP <?= number_format($totalOrderSales) ?></span>
                                                            <?php
                                                            $totalOrderSales_pc = percentage_calc($totalOrderSales, $totalOrderSales2);
                                                            ?>
                                                            <span class="badge badge-light-<?= $totalOrderSales_pc['badge'] ?> fs-base ">
                                                                <i class="fas <?= $totalOrderSales_pc['sign'] ?> text-<?= $totalOrderSales_pc['badge'] ?> fs-5 ms-n1"><span class="path1"></span><span class="path2"></span></i>
                                                                <?= $totalOrderSales_pc['number'] ?>%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="col-md-7">
                                                    <div class="card-body d-flex align-items-end px-0 pb-5">
                                                        <div id="kt_card_widget_8_chart" class="min-h-auto" style="height: 90px"></div>
                                                    </div>
                                                </div>
                                            </div>
                                            <!--end::Header-->

                                            <!--begin::Card body-->
                                            <div class="card-header row mb-1">

                                                <div class="col-md-6">
                                                    <div class="card-title d-flex flex-column">
                                                        <span class="text-gray-400 pt-1 mb-2 fw-semibold fs-6">Ventas Brutas</span>
                                                        <div class="d-flex align-items-center">
                                                            <span class="fs-3 fw-bold text-dark me-2 lh-1 ls-n2">COP <?= number_format($totalOrderSales) ?></span>

                                                            <span class="badge badge-light-<?= $totalOrderSales_pc['badge'] ?> fs-base ">
                                                                <i class="fas <?= $totalOrderSales_pc['sign'] ?> text-<?= $totalOrderSales_pc['badge'] ?> fs-5 ms-n1"><span class="path1"></span><span class="path2"></span></i>
                                                                <?= $totalOrderSales_pc['number'] ?>%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="card-title d-flex flex-column">
                                                        <span class="text-gray-400 pt-1 mb-2 fw-semibold fs-6">Transacciones</span>
                                                        <div class="d-flex align-items-center">
                                                            <span class="fs-3 fw-bold text-dark me-2 lh-1 ls-n2"><?= number_format($totalOrders) ?></span>
                                                            <?php
                                                            $totalOrders_pc = percentage_calc($totalOrders, $totalOrders2);
                                                            ?>
                                                            <span class="badge badge-light-<?= $totalOrders_pc['badge'] ?> fs-base ">
                                                                <i class="fas <?= $totalOrders_pc['sign'] ?> text-<?= $totalOrders_pc['badge'] ?> fs-5 ms-n1"><span class="path1"></span><span class="path2"></span></i>
                                                                <?= $totalOrders_pc['number'] ?>%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div class="col-md-6">
                                                    <div class="card-title d-flex flex-column">
                                                        <span class="text-gray-400 pt-1 mb-2 fw-semibold fs-6">Venta Promedio</span>
                                                        <div class="d-flex align-items-center">
                                                            <span class="fs-3 fw-bold text-dark me-2 lh-1 ls-n2">COP <?= $avg_sales = ($totalOrderSales > 0 || $totalOrders > 0) ? round($totalOrderSales / $totalOrders) : '0' ?></span>
                                                            <?php
                                                            $avg_sales2 = ($totalOrderSales2 > 0 || $totalOrders2 > 0) ? round($totalOrderSales2 / $totalOrders2) : '0';
                                                            $avg_sales_pc = percentage_calc($avg_sales, $avg_sales2);
                                                            ?>
                                                            <span class="badge badge-light-<?= $avg_sales_pc['badge'] ?> fs-base ">
                                                                <i class="fas <?= $avg_sales_pc['sign'] ?> text-<?= $avg_sales_pc['badge'] ?> fs-5 ms-n1"><span class="path1"></span><span class="path2"></span></i>
                                                                <?= $avg_sales_pc['number'] ?>%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="card-title d-flex flex-column">
                                                        <span class="text-gray-400 pt-1 mb-2 fw-semibold fs-6">Devoluciones</span>
                                                        <div class="d-flex align-items-center">
                                                            <?php if($totalAmountOrderCancel!=0){ ?>
                                                            <span class="fs-3 fw-bold text-dark me-2 lh-1 ls-n2">COP <?= number_format($totalAmountOrderCancel) ?></span>
                                                            <?php } else {?>
                                                            <span class="fs-3 fw-bold text-dark me-2 lh-1 ls-n2">N/A</span>
                                                            <?php } ?>
                                                            
                                                            <?php
                                                            $totalOrderCancel_pc = percentage_calc($totalAmountOrderCancel, $totalAmountOrderCancel2);
                                                            ?>
                                                            <!--<span class="badge badge-light-danger fs-base ">
                                                                <i class="fas fa-chevron-down fs-5 text-danger ms-n1"><span class="path1"></span><span class="path2"></span></i>
                                                                0%
                                                            </span>-->
                                                            <?php if($totalAmountOrderCancel!=0){ ?>
                                                            <span class="badge badge-light-<?= $totalOrderCancel_pc['badge'] ?> fs-base ">
                                                                <i class="fas <?= $totalOrderCancel_pc['sign'] ?> text-<?= $totalOrderCancel_pc['badge'] ?> fs-5 ms-n1"><span class="path1"></span><span class="path2"></span></i>
                                                                <?= $totalOrderCancel_pc['number'] ?>%
                                                            </span>
                                                            <?php } ?>
                                                        </div>
                                                    </div>
                                                </div>


                                            </div>
                                            <!--end::Card body-->
                                        </div>
                                    </div>
                                    <div class="col-12 " style="border-bottom: solid 1px;">
                                        <div class="card card-flush h-md-50 mb-5 mb-xl-10">
                                            <div class="card-header pt-1">
                                                <div class="card-title d-flex flex-column">
                                                    <div class="d-flex align-items-center">
                                                        <span class="fs-3 fw-bold text-dark me-2 lh-1 ls-n2">Formas de pago</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="row">
                                                <div class="col-8">
                                                    <div id="chartdiv"></div>
                                                </div>
                                                <div class="col-4">
                                                    <div class="d-flex flex-column content-justify-center flex-row-fluid fs-3">
                                                        <?php
                                                        $payment_types_datas = json_decode($payment_types_datas, true);
                                                        ?>
                                                        <div class="d-flex fw-semibold align-items-center my-3">
                                                            <div class="bullet w-8px h-3px rounded-2 bg-primary me-3"></div>
                                                            <div class="text-gray-500 flex-grow-1 me-4 text-start">Efectivo</div>
                                                            <div class="fw-bolder text-gray-700 text-xxl-end"><?= $fmt->format($payment_types_datas[0]) ?></div>
                                                        </div>
                                                        <div class="d-flex fw-semibold align-items-center">
                                                            <div class="bullet w-8px h-3px rounded-2 bg-success me-3"></div>
                                                            <div class="text-gray-500 flex-grow-1 me-4 text-start">Tarjeta de Crédito</div>
                                                            <div class="fw-bolder text-gray-700 text-xxl-end"><?= $fmt->format($payment_types_datas[1]) ?></div>
                                                        </div>

                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-12 " style="border-bottom: solid 1px;">
                                        <div class="card card-flush h-md-50 mb-5 mb-xl-10">
                                            <div class="card-header pt-5">
                                                <div class="card-title d-flex flex-column">
                                                    <div class="d-flex align-items-center">
                                                        <span class="fs-3 fw-bold text-dark me-2 lh-1 ls-n2">Top Productos en Ventas</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="d-flex flex-column content-justify-center flex-row-fluid fs-3 px-8">
                                                <?php
                                                if (!empty($topItemsBySales)) {
                                                    foreach ($topItemsBySales as $k1 => $topItemsBySale) {
                                                ?>
                                                        <div class="d-flex fw-semibold align-items-center my-3">
                                                            <div class="bullet w-8px h-3px rounded-2 bg-primary me-3"></div>
                                                            <div class="text-gray-500 flex-grow-1 me-4 text-start"><?= $topItemsBySale->product_title ?></div>
                                                            <div class="text-dark flex-grow-1 me-4 text-end">[<?= $topItemsBySale->product_quantity ?>]</div>
                                                            <div class="fw-bolder text-gray-700 text-xxl-end"><?= $fmt->format($topItemsBySale->price_total) ?></div>
                                                        </div>
                                                    <?php
                                                    }
                                                } else {
                                                    ?>
                                                    <div class="d-flex fw-semibold align-items-center my-3">
                                                        <!-- <div class="bullet w-8px h-3px rounded-2 bg-primary me-3"></div> -->
                                                        <div class="text-danger flex-grow-1 me-4 ms-2 text-start">Datos no encontrados</div>
                                                    </div>
                                                <?php
                                                }
                                                ?>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-12 " style="border-bottom: solid 1px;">
                                        <div class="card card-flush h-md-50 mb-5 mb-xl-10">
                                            <div class="card-header pt-1">
                                                <div class="card-title d-flex flex-column">
                                                    <div class="d-flex align-items-center">
                                                        <span class="fs-3 fw-bold text-dark me-2 lh-1 ls-n2">Top Categorías en Ventas</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="d-flex flex-column content-justify-center flex-row-fluid fs-3 px-8">
                                                <?php
                                                if (!empty($topCategoriesBySales)) {
                                                    foreach ($topCategoriesBySales as $k2 => $topCategoriesBySale) {
                                                ?>
                                                        <div class="d-flex fw-semibold align-items-center my-3">
                                                            <div class="bullet w-8px h-3px rounded-2 bg-primary me-3"></div>
                                                            <div class="text-gray-500 flex-grow-1 me-4 text-start"><?= $topCategoriesBySale->category ?></div>
                                                            <div class="fw-bolder text-gray-700 text-xxl-end"><?= $fmt->format($topCategoriesBySale->price_total) ?></div>
                                                        </div>
                                                    <?php
                                                    }
                                                } else {
                                                    ?>
                                                    <div class="d-flex fw-semibold align-items-center my-3">
                                                        <!-- <div class="bullet w-8px h-3px rounded-2 bg-primary me-3"></div> -->
                                                        <div class="text-danger flex-grow-1 me-4 ms-2 text-start">Datos no encontrados</div>
                                                    </div>
                                                <?php
                                                }
                                                ?>

                                            </div>
                                        </div>
                                    </div>



                                </div>

                            </div>
                            <div class="col-md-5  border border-1 ">
                                <div class="card card-flush h-xl-100">
                                    <!--begin::Header-->
                                    <div class="card-header pt-1">
                                        <!--begin::Title-->
                                        <h3 class="card-title align-items-start flex-column">
                                            <span class="card-label fw-bold text-gray-800 fs-2">Últimos 30 días</span>
                                        </h3>
                                        <!--end::Title-->
                                    </div>
                                    <!--end::Header-->

                                    <!--begin::Body-->
                                    <div class="card-body align-items-end pt-2">
                                        <!--begin::Wrapper-->
                                        <div class="w-100">

                                            <div class="d-flex align-items-center">
                                                <div class="d-flex align-items-center flex-stack flex-wrap d-grid gap-1 flex-row-fluid">
                                                    <div class="me-5">
                                                        <a href="#" class="text-gray-800 fw-bold text-hover-primary fs-6">Clientes Totales</a>
                                                        <span class="text-gray-400 fw-semibold fs-7 d-block text-start ps-0"></span>
                                                    </div>
                                                    <div class="d-flex align-items-center">
                                                        <?php $totCust = $newCustomers + $returnCustomers; ?>
                                                        <span class="text-gray-800 fw-bold fs-4 me-3"><?= number_format($totCust) ?> <i class="fas fa-chevron-right ps-2"></i> </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="separator separator-dashed my-3"></div>
                                            <div class="d-flex align-items-center">
                                                <div class="d-flex align-items-center flex-stack flex-wrap d-grid gap-1 flex-row-fluid">
                                                    <div class="me-5">
                                                        <a href="#" class="text-gray-800 fw-bold text-hover-primary fs-6">Nuevos Clientes</a>
                                                        <span class="text-gray-400 fw-semibold fs-7 d-block text-start ps-0"></span>
                                                    </div>
                                                    <div class="d-flex align-items-center">
                                                        <span class="text-gray-800 fw-bold fs-4 me-3"><?= number_format($newCustomers) ?> <i class="fas fa-chevron-right ps-2"></i> </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="separator separator-dashed my-3"></div>
                                            <div class="d-flex align-items-center">
                                                <div class="d-flex align-items-center flex-stack flex-wrap d-grid gap-1 flex-row-fluid">
                                                    <div class="me-5">
                                                        <a href="#" class="text-gray-800 fw-bold text-hover-primary fs-6">Clientes que Regresan</a>
                                                        <span class="text-gray-400 fw-semibold fs-7 d-block text-start ps-0"></span>
                                                    </div>
                                                    <div class="d-flex align-items-center">
                                                        <span class="text-gray-800 fw-bold fs-4 me-3"><?= number_format($returnCustomers) ?> <i class="fas fa-chevron-right ps-2"></i> </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="separator separator-dashed my-3"></div>
                                            <div class="d-flex align-items-center">
                                                <div class="d-flex align-items-center flex-stack flex-wrap d-grid gap-1 flex-row-fluid">
                                                    <div class="me-5">
                                                        <a href="#" class="text-gray-800 fw-bold text-hover-primary fs-6">Visita Promedio Por Cliente</a>
                                                        <span class="text-gray-400 fw-semibold fs-7 d-block text-start ps-0"></span>
                                                    </div>
                                                    <div class="d-flex align-items-center">
                                                        <span class="text-gray-800 fw-bold fs-4 me-3"><?= $avg_visit = ($monthloyTotalOrders > 0 && ($totCust > 0)) ? round($monthloyTotalOrders / $totCust) : '0' ?> <i class="fas fa-chevron-right ps-2"></i> </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="separator separator-dashed my-3"></div>
                                            <div class="d-flex align-items-center">
                                                <div class="d-flex align-items-center flex-stack flex-wrap d-grid gap-1 flex-row-fluid">
                                                    <div class="me-5">
                                                        <a href="#" class="text-gray-800 fw-bold text-hover-primary fs-6">Gasto Promedio Por Visita</a>
                                                        <span class="text-gray-400 fw-semibold fs-7 d-block text-start ps-0"></span>
                                                    </div>
                                                    <div class="d-flex align-items-center">
                                                        <span class="text-gray-800 fw-bold fs-4 me-3"><?= ($totalOrderSales > 0 && ($avg_visit > 0)) ? round($totalOrderSales / $avg_visit) : '0' ?> <i class="fas fa-chevron-right ps-2"></i> </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="separator separator-dashed my-3"></div>
                                            <div class="d-flex align-items-center">
                                                <div class="d-flex align-items-center flex-stack flex-wrap d-grid gap-1 flex-row-fluid">
                                                    <div class="me-5">
                                                        <a href="#" class="text-gray-800 fw-bold text-hover-primary fs-6">Retroalimentación Positiva</a>
                                                        <span class="text-gray-400 fw-semibold fs-7 d-block text-start ps-0"></span>
                                                    </div>
                                                    <div class="d-flex align-items-center">
                                                        <span class="text-gray-800 fw-bold fs-4 me-3"><?= number_format($positiveFeedback) ?> <i class="fas fa-chevron-right ps-2"></i> </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="separator separator-dashed my-3"></div>
                                            <div class="d-flex align-items-center">
                                                <div class="d-flex align-items-center flex-stack flex-wrap d-grid gap-1 flex-row-fluid">
                                                    <div class="me-5">
                                                        <a href="#" class="text-gray-800 fw-bold text-hover-primary fs-6">Retroalimentación Negativa</a>
                                                        <span class="text-gray-400 fw-semibold fs-7 d-block text-start ps-0"></span>
                                                    </div>
                                                    <div class="d-flex align-items-center">
                                                        <a class="text-gray-800 fw-bold fs-4 me-3" href=""><?= number_format($negativeFeedback) ?> <i class="fas fa-chevron-right ps-2"></i> </a>
                                                    </div>
                                                </div>
                                            </div>



                                        </div>
                                        <!--end::Wrapper-->
                                    </div>
                                    <!--end::Body-->
                                </div>
                            </div>

                        </div>
                    </div>




                </div>
                <!--end::Wrapper-->

            </div>
            <!--end::Card body-->
        </div>
        <!--end::Card-->

    </div>
    <!--end::Container-->
</div>

<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('templates/admin/_file_manager', $this->data);

?>
<script type="text/javascript" src="https://cdn.jsdelivr.net/momentjs/latest/moment.min.js"></script>
<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/daterangepicker/daterangepicker.min.js"></script>

<!-- Resources -->
<script src="https://cdn.amcharts.com/lib/5/index.js"></script>
<script src="https://cdn.amcharts.com/lib/5/percent.js"></script>
<script src="https://cdn.amcharts.com/lib/5/themes/Animated.js"></script>


<?php $this->load->view('admin/_store_js', $this->data); ?>
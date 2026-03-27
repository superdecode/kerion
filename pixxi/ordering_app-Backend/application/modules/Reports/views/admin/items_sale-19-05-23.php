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
                    <a href="<?= base_url() ?>" class="text-muted text-hover-primary">Home</a>
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
        <form action="" method="GET" id="search_form" style="margin-top: -55px;">
            <div class="row gy-5 g-xl-10 pt-4">

                <div class="col-md-4 mb-xl-10">

                    <div id="reportrange" style="background: #fff; cursor: pointer; padding: 5px 10px; border: 1px solid #ccc; width: 100%">
                        <i class="fa fa-calendar"></i>&nbsp;
                        <span></span> <i class="fa fa-caret-down"></i>
                    </div>
                    <input type="hidden" name="from" id="from" value="">
                    <input type="hidden" name="to" id="to" value="">


                </div>

                <div class="col-md-2 mb-5 mb-xl-10">
                    <input type="submit" class="btn btn-primary btn-sm me-2 pt-3" value="Search" name="" />
                </div>
            </div>
        </form>
        <div class="card">




            <!-- Map-->
            <!-- HTML -->

            <div class="mt-10 ps-10"><strong><?php echo $start_date; ?> - <?php echo $end_date; ?>

                </strong></div>
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
                            <th><strong>Items</strong></th>
                            <th class="min-w-70px"><strong>SKU</strong></th>
                            <th class="min-w-100px"><strong>Category</strong></th>
                            <!--<th class="min-w-100px"><strong>Discount</strong></th>-->
                            <th><strong>Items Sold</strong></th>
                            <th><strong>Gross Sell</strong></th>
                            <th><strong>Net Sell</strong></th>
                            <th class="text-end min-w-70px d-none">
                                <div class="dropdown d-none">
                                    <a class="btn btn-primary dropdown-toggle text-center" data-bs-toggle="dropdown"></a>
                                    <ul class="dropdown-menu">
                                        <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="0" checked> Items</li>
                                        <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="1" checked> SKU</li>
                                        <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="2" checked> Category</li>
                                        <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="3" checked> Discount</li>
                                        <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="4" checked> Items Sold</li>
                                        <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="5" checked> Gross Sell</li>
                                        <li class="mb-3"><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="6" checked> Net Sell</li>

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


                                /*************** New Code*****************/
                                $totcountorder = $this->Report_model->getOrderDataItemSale($rows->id, $search['from'], $search['to']);
                                //echo 'order_ids'.$totcountorder->order_id;
                                $product_variant = $this->Report_model->getProductsVariant($totcountorder->product_id, $search['from'], $search['to']);
                                //$get_order_ids = $this->Report_model->getOrderIDFromOrderProducts($rows->id, $search['from'], $search['to']);
                                 $totdis=0;
                                /*if (!empty($get_order_ids)) {
                                   
                                     foreach ($get_order_ids as $k => $oids) {
                                        $discount_amt = $this->Report_model->getProductsDiscount($oids->order_id);
                                        //$discount_amt->coupon_discount;
                                        $totdis = $discount_amt->price_total;
                                     }
                                 }*/
                                
                               
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
                                    <td><strong><?= $rows->title ?></strong></td>

                                    <td><?= $rows->sku; ?></td>
                                    <td><?= $rows->cname; ?></td>
                                    <!--<td><?= $product_discount->coupon_discount; ?></td>-->
                                    <td><strong><?= $totcountorder->product_quantity ?></strong></td>
                                    <td><strong><?= $fmt->format($netsum) ?></strong></td>
                                    <td><strong>
                                            <?php if($product_discount->coupon_discount!='') 
                                            {
                                                $total_amount_notfitlogic=$totcountorder->product_total_price-$product_discount->coupon_discount;
                                            }
                                            else{
                                                $total_amount=$totcountorder->product_total_price;
                                            }
                                            ?>
                                            <?= $fmt->format($total_amount); ?></strong></td>
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
                                                <td class="ps-5"><?= $get_variant->variation_name; ?>(<?=$prows->product_option_name?>)</td>
                                                <td><?= $get_variant->vsku; ?></td>
                                                <td><?= $product_details->cname; ?></td>
                                                <!--<td><?= $product_discount->coupon_discount; ?></td>-->
                                                <td><?= $prows->product_quantity ?></td>
                                                <td><?= $fmt->format($variant_sum) ?></td>
                                                <td><?= $fmt->format($prows->product_total_price) ?></td>
                                                <td>&nbsp;</td>
                                            </tr>
                                <?php }
                                    }
                                } ?>
                        <?php
                                $quantity = $quantity + $totcountorder->product_quantity;
                                $netamount = $netamount + $total_amount;
                                $grossamount = $grossamount +$netsum;
                            }
                        }
                        ?>
                    </tbody>
                    <tfoot>
                        <tr>
                            <th colspan="3"><strong>Total</strong></th>
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
    anychart.onDocumentReady(function() {

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
                        <?php if (!empty($allproducts)) {
                            foreach ($allproducts as $value) {
                                $totcountorder = $this->Report_model->getOrderData($value->id, $data['date']);
                                $getfororderid = $this->Report_model->getOrderDiscount($value->id, $data['date']);
                                $product_discount = $this->Report_model->getProductsDiscount($getfororderid->order_id);
                                if($product_discount->coupon_discount!='') 
                                {
                                    $totcountorder_notfitlogic=$totcountorder-$product_discount->coupon_discount;
                                }
                                else{
                                    $totcountorder=$totcountorder;
                                }
                                
                                echo $totcountorder; ?>, <?php }
                                                    } ?>],
            <?php }
            } ?>
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
        <?php $count++;
            }
        } ?>
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
        <?php $count++;
            }
        } ?>


        // add a legend
        chart.legend().enabled(true);

        // add a title
        chart.title("Items Sales");

        // specify where to display the chart
        chart.container("chartdiv");

        // draw the resulting chart
        chart.draw();

    });
</script>

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
                'Today': [moment(), moment()],
                'Yesterday': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                'Last 7 Days': [moment().subtract(6, 'days'), moment()],
                'Last 30 Days': [moment().subtract(29, 'days'), moment()],
                'This Month': [moment().startOf('month'), moment().endOf('month')],
                'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
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
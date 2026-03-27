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
             
                <div id="reportrange" style="background: #fff; cursor: pointer; padding: 5px 10px; border: 1px solid #ccc; width: 100%" >
            <i class="fa fa-calendar"></i>&nbsp;
            <span></span> <i class="fa fa-caret-down"></i>
                </div>
                <input type="hidden" name="from" id="from" value="">
                <input type="hidden" name="to" id="to" value="">
                
            
        </div>
           
            <div class="col-md-2 mb-5 mb-xl-10">  
                <input type="submit" class="btn btn-primary btn-sm me-2 pt-3" value="Search" name=""/>
            </div>
        </div>  
         </form>
        <div class="card">
  
  

            
            <!-- Map-->
            <!-- HTML -->
            
   <div class="mt-10 ps-10"><strong><?php echo $start_date;?> - <?php echo $end_date;?>
       
       </strong></div>
     <div id="chartdiv" ></div>                  
  
            
            <!-- End Map -->



            <!--begin::Card header-->

            <!--end::Card header-->
            <!--begin::Card body-->
            <div class="card-body pt-0">
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
                <th class="min-w-100px"><strong>Discount</strong></th>
                <th><strong>items Sold</strong></th>
                <th><strong>Net Sell</strong></th>
                <th class="text-end min-w-70px"><div class="dropdown">
  <a class="btn btn-primary dropdown-toggle text-center" data-bs-toggle="dropdown"></a>
  <ul class="dropdown-menu">
      <li><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="0"> Items</li>
    <li><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="1"> SKU</li>
    <li><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="2"> Category</li>
     <li><input type="checkbox" class="toggle-vis ms-5" name="check" data-column="3"> Discount</li>
  </ul>
</div></th>
            </tr>
        </thead>
        <tbody>
            <?php
            $fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
            $fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
            $fmt->setAttribute($fmt::FRACTION_DIGITS, 2);

            $quantity=0;
            $netamount=0;
            //print_r($top_sale);
            if (!empty($item_sale)) {
                foreach ($item_sale as $k => $rows) {
                    $id = base64_encode($rows->id);
                    $product_details = $this->Report_model->getProducts($rows->product_id );
                    $product_discount = $this->Report_model->getProductsDiscount($rows->order_id );
                    $product_variant = $this->Report_model->getProductsVariant($rows->product_id,$search['from'],$search['to']);
            ?>
            <tr>
                <td><?= $rows->product_title ?></td>
                
                <td><?= $product_details->sku;?></td>
                <td><?= $product_details->cname;?></td>
                <td><?= $product_discount->coupon_discount;?></td>
                <td><?= $rows->product_quantity ?></td>
                <td><?= $fmt->format($rows->price_total); ?></td>
                <td>&nbsp;</td>
            </tr>
            <?php
            if($rows->variant_product_id!='' && $rows->variant_product_id!=0) {
              if (!empty($product_variant)) {
                foreach ($product_variant as $k => $prows) { 
                $get_variant = $this->Report_model->getVariantDetails($prows->variant_product_id); 
                $variant_sum= $prows->product_unit_price * $prows->product_quantity;
            ?>
            <tr>
            <td class="ps-5" ><?= $get_variant->variation_name;?></td>
            <td><?= $get_variant->vsku;?></td>
            <td><?= $product_details->cname;?></td>
            <td><?= $product_discount->coupon_discount;?></td>
            <td><?= $prows->product_quantity ?></td>
             <td><?=$fmt->format($variant_sum)?></td>
             <td>&nbsp;</td>
            </tr>
              <?php } }} ?>
           <?php
            $quantity=$quantity+$rows->product_quantity;
            $netamount=$netamount+$rows->price_total;
        }
    }
    ?>	
        </tbody>
        <tfoot>
            <tr>
                <th colspan="4"><strong>Total</strong</th>
                <th colspan="1"><?= $quantity?></th>
                <th > <?= $fmt->format($netamount); ?></th>
                
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

anychart.onDocumentReady(function () {
  
  // add data
  <?php
  //echo json_encode($top_sale_product); 
  //print_r($date_name);
  ?>
  
   var data = [
   <?php 
   if(!empty($date_name)){
   foreach($date_name as $data) {
    $gettotalsale= $this->Report_model->getTopSelesItemsGraph($this->session->userdata('seller_id'), $data['date']);
    $countdata= $this->Report_model->getdataAvailable($this->session->userdata('seller_id'), $data['date']);
    $datacount = count($gettotalsale);
    
    if($countdata>0) {
    ?>     
    ["<?= $data['date'];?>", 
      <?php if(!empty($gettotalsale)){
          
        foreach($gettotalsale as $k =>$sale_data) { echo $sale_data->price_total;?>, 
          <?php } } ?>
          <?php //if($datacount==1) { echo $val1=0;  echo $val1=0; echo $val1=0; echo $val1=0;} ?>
           <?php //if($datacount==2) { echo $val1=0; echo $val1=0; echo $val1=0;} ?>
           <?php //if($datacount==3) { echo $val1=0; echo $val1=0; } ?>
            <?php //if($datacount==4) { echo $val1=0; }?>  
          ],
   <?php } }?> 
  ];
   <?php } ?>
  // create a data set
  var dataSet = anychart.data.set(data);

  // map the data for all series
<?php
 $count=1;
 //print_r($top_sale_product);
if(!empty($item_sale)){
foreach($item_sale as $k =>$sale_data) {
 //foreach($sale_data as $value){   
  //echo 'mydata'. $sale_data[$k]-> product_title;

?>
  var firstSeriesData_<?=$count?> = dataSet.mapAs({x: 0, value: <?=$count;?>});
 <?php $count++;  } }?>  
 
  // create a line chart
  var chart = anychart.line();

  // create the series and name them
  <?php
 $count=1;
if(!empty($item_sale)){
foreach($item_sale as $k => $value) {
//foreach($sale_data as $value){

?>
  var firstSeries_<?=$count;?> = chart.line(firstSeriesData_<?=$count?>);
  firstSeries_<?=$count;?>.name("<?=$value->product_title;?>");
<?php $count++; } }?>   
  
  // add a legend and customize it
  chart.legend().enabled(true).fontSize(14).padding([10, 0, 10, 0]);
  
  // add a title and customize it
  chart
    .title()
    .enabled(true)
    .useHtml(true)
    /*.text(
      '<span style="color: #006331; font-size: 20px;">Big Three&#39;s Grand Slam Title Race</span>' +
        '<br/><span style="font-size: 16px;">(Triumphs at Australian Open, French Open, Wimbledon, U.S. Open)</span>'
    );*/
  
  // name the axes
  chart.yAxis().title("Product Price");
  chart.xAxis().title("Date");
  
  // customize the series markers
   <?php
 $count=1;
if(!empty($top_sale_product)){
foreach($top_sale_product as $sale_data) {
    //foreach($sale_data as $value){
?>
  firstSeries_<?=$count;?>.hovered().markers().type("circle").size(4);
  
    <?php $count++; } }?>   
  //secondSeries.hovered().markers().type("circle").size(4);
  //thirdSeries.hovered().markers().type("circle").size(4);
  //fourSeries.hovered().markers().type("circle").size(4);
  
  // turn on crosshairs and remove the y hair
  chart.crosshair().enabled(true).yStroke(null).yLabel(false);
  
  // change the tooltip position
  chart.tooltip().positionMode("point");
  chart.tooltip().position("right").anchor("left-center").offsetX(5).offsetY(5);
  
  // customize the series stroke in the normal state
 
  //secondSeries.normal().stroke("#db7346", 2.5);
  //thirdSeries.normal().stroke("#43a7dc", 2.5);
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
    var start = moment("<?=$search['from']?>");
    var end = moment("<?=$search['to']?>");

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
$('.toggle-vis').click(function (e) {
  
        //e.preventDefault();
 
        // Get the column API object
        var column = table.column($(this).attr('data-column'));
 
        // Toggle the visibility
        column.visible(!column.visible());
    });
</script>

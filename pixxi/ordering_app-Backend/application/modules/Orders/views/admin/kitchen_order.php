<!DOCTYPE html>
<html lang="en">
    <head>	
<base href="<?=base_url()?>">
<meta charset="utf-8" />
<title><?=get_settings_value('system_name')?> | Barcode Level</title>
<?php 
$image = get_settings_value('logo');
if (!empty($image)) {
$sys_img = base_url('assets/uploads/system_images/' . $image);
} else {
$sys_img = base_url('assets/admin/dist/media/logos/logo-default.png');
} 
$favicon = get_settings_value('favicon');
if (!empty($favicon)) {
$fav_img = base_url('assets/uploads/system_images/' . $favicon);
} else {
$fav_img = base_url('assets/admin/dist/media/logos/logo-default.png');
} 
?>		
<meta name="description" content="" />
<meta name="keywords" content="" />
<link rel="canonical" href="" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="shortcut icon" href="<?=$fav_img?>" />
<!--begin::Fonts-->
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Poppins:300,400,500,600,700" />
<!--end::Fonts-->
<!--begin::Global Stylesheets Bundle(used by all pages)-->
<link href="<?=base_url('assets/admin/plugins/global/plugins.bundle.css')?>" rel="stylesheet" type="text/css" />
<link href="<?=base_url('assets/admin/css/style.bundle.css')?>" rel="stylesheet" type="text/css" />
<style>@media print {body{padding: 20px;}}</style>

<?php
$i=1;
//if(!empty($query->orderItemList)){
//foreach($query->orderItemList as $k=>$orderItem){
    
?>
    <strong style="font-size:20px;"><center>ÁNGULO</center></strong>
    <div style="display:block; width:100%; max-width: 500px; margin:0 auto;">
       
<table class="table" style="border-bottom: 1px solid #333; margin: 0">
 <tbody>
    <tr>
      <td>Factura #<?= $query->order_number ?></td>
      <td style="text-align:center;">Número De Recogida #<?= $query->pickup_number ?></td>
      <td style="text-align:right"><?= date('d M Y h:i A', strtotime($query->created_at)) ?></td>
    </tr>
  </tbody>
</table>
<table class="table" style="border-bottom: 1px solid #333; margin: 0">
  <tbody>
    <tr>
        <td style="width:100px;">Cliente</td>
      <td><?= $query->fname ?> <?= $query->lname ?></td>
    </tr>
    <tr>
      <td>Nº Mesa</td>
      <td><?= $query->table_id ?></td>
    </tr>
  </tbody>
</table>    

<table class="table" style="border-bottom: 1px dashed #333; margin: 0">
  <thead>
    <tr>
        <th style="width:60px; border-bottom: 1px solid #333;"><strong>SI No.</strong></th>
      <th style="border-bottom: 1px solid #333;"><strong>Nombre del árticulo</strong></th>
      <th style="width:60px; border-bottom: 1px solid #333; text-align: right; "><strong>Cant.</strong></th>
    </tr>
  </thead>
  <tbody>
     <?php
     $total = 0;
     $srnum=1;
    if (!empty($query->orderItemList)) {
        foreach ($query->orderItemList as $k => $orderItem) {
    ?>
    <tr>
      <td><?=$srnum;?></td>
      <td><?= $orderItem->product_title ?> | <?= $query->order_type ?> | <?= $orderItem->product_option_name; ?></td>
      <td style="text-align: right; "><?= $orderItem->product_quantity ?></td>
    </tr>
    <?php $sumquan= $total += $orderItem->product_quantity;
    $srnum++;
        } }?>
   
  </tbody>
  <tfoot>
            <tr>
                <td colspan="2" style="border-top: 1px solid #333;"><b>Articulos totales</b></td>
                <td style="text-align: right; border-top: 1px solid #333;"><b><?=$sumquan?></b></td>
            </tr>
        </tfoot>
</table>
        
        <div class="container d-print-none">
  <div class="row text-center pt-3">
    <div class="col">
      <button type="button" class="btn btn-warning" id="" onclick="window.print();">Impresión</button>
    </div>
    
   
  </div>
</div>
    </div>
<?php //$i++;} } ?>





<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('admin/_js', $this->data);
?>
<script>

</script>
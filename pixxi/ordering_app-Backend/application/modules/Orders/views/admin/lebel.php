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
if(!empty($query->orderItemList)){
foreach($query->orderItemList as $k=>$orderItem){
    
?>

<div style='margin: 10px; padding: 10px; margin-left:10px; border-radius: 10px; width: 30%; border: 1px solid #000; text-align: left; padding-top:8px; text-align:left; font-size:15px; font-family: Source Sans Pro, Arial, sans-serif;'>
  <!-- insert your custom barcode setting your data in the GET parameter "data" -->
  <div>Hi, <?=$query->fname?></div>
  <div><?=$query->order_number?></div>
  <div><?=$query->order_type?>, <strong><?=$orderItem->product_quantity?> <?=$orderItem->product_title?></strong></div>
  <div><?= $i?>/<?= count($query->orderItemList);?></div>
  <div><?=$orderItem->product_title?></div>
  <div><?=$orderItem->product_option_name?></div>
  <img src="<?php echo $barcode; ?>">


  <!-- back-linking to www.tec-it.com is required -->
  <div><?=$query->address?>, <?=date('d M Y h:i A',strtotime($query->created_at))?></div>
  <div><?= $query->store_phone_code?> <?= $query->phone_number?></div>
</div>



<?php $i++;} } ?>

<div class="container d-print-none">
  <div class="row">
    <div class="col">
      <button type="button" class="btn btn-warning" id="" onclick="window.print();">Impresión</button>
    </div>
    
   
  </div>
</div>



<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('admin/_js', $this->data);
?>
<script>

</script>
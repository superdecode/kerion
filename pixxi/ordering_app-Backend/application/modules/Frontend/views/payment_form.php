<!DOCTYPE html>
<html lang="en">
<head>	
<base href="<?=base_url()?>">
<meta charset="utf-8" />
<title><?=get_settings_value('system_name')?> | Payment</title>
<?php

//echo base64_encode('Order Description');
//echo base64_encode('test@gmail.com');
$digits = 6;
$nonce= rand(pow(10, $digits-1), pow(10, $digits)-1);
$referenceCode= 'Pixxi_'.$nonce;
//$referenceCode= 'TestingPayU3rd5';
$apikey= '4Vj8eK4rloUd272L48hsrarnUA';
$amount= $amount;
$marchantID= 508029;
$currency= 'COP';

//$sortedStr      = "codeNo=$icode&email=$email&nonce=$nonce&timestamp=$cur_time";
$sortedStr      = "$apikey~$marchantID~$referenceCode~$amount~$currency";
$signature = md5($sortedStr);
?>
<form method="post" action="https://sandbox.checkout.payulatam.com/ppp-web-gateway-payu/" name="payment_form">
  <input name="merchantId"      type="hidden"  value="508029"   >
  <input name="accountId"       type="hidden"  value="512321" >
  <input name="description"     type="hidden"  value="<?= base64_decode($description)?>"  >
  <input name="referenceCode"   type="hidden"  value="<?=$referenceCode?>" >
  <input name="amount"          type="hidden"  value="<?=$amount?>">
  <!--<input name="tax"             type="hidden"  value="3193"  >
  <input name="taxReturnBase"   type="hidden"  value="16806" >-->
  <input name="currency"        type="hidden"  value="COP" >
  <input name="signature"       type="hidden"  value="<?=$signature?>"  >
  <input name="test"            type="hidden"  value="0" >
  <input name="buyerEmail"      type="hidden"  value="<?= base64_decode($email)?>" >
  <input name="responseUrl"     type="hidden"  value="https://developer.com/ordering_app/Frontend/responseUrl" >
  <input name="confirmationUrl" type="hidden"  value="https://developer.com/ordering_app/Frontend/confirmationUrl" >
  <!--<input name="Submit"          type="submit"  value="Make Payment" style="color: white; background-color: green;">-->
</form>
</body>
</html>
<script>

window.onload = function(){
  document.forms['payment_form'].submit();
}
</script>
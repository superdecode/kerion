<?php
if($this->session->flashdata('error_msg')!=''){
?>
<div class="alert alert-danger alert-dismissible fade show" role="alert">
	<strong>¡Error!</strong> <?=$this->session->flashdata('error_msg')?>
	<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
</div>  
<?php
}

if($this->session->flashdata('success_msg')!=''){
?>
<div class="alert alert-success alert-dismissible fade show" role="alert">
	<strong>¡Felicidades!</strong> <?=$this->session->flashdata('success_msg')?>
	<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
</div>   
<?php
}
?>

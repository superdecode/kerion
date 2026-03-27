<form class="form-horizontal" action="" method="POST" enctype="multipart/form-data" data-pjax id="pjax_form" onsubmit="" autocomplete="off">
<!-- Content Header (Page header) -->
<section class="content-header">
    <div class="inner-breadcrumb">
        <div class="container-fluid">
            <div class="row align-items-center">
                <div class="col-sm-6">
                    <ol class="breadcrumb float-sm-left">
                        <li class="breadcrumb-item"><a href="<?=base_url('dashboard')?>">Home</a></li>
                        <li class="breadcrumb-item"><a href="<?=base_url('Roles/moduleListing')?>"> Module List</a></li>
                        <li class="breadcrumb-item active">
                            <?=$header['site_title']?>
                        </li>
                    </ol>
                </div>
                <div class="col-sm-6">

                    <div class="float-right">
                        <a href="<?=base_url('Roles/moduleListing')?>" class="btn btn-pill btn-secondary sk-margin-r-10 btn-sm"><i class="fas fa-long-arrow-alt-left"></i> Back </a>
                        <button type="reset" class="btn btn-label-danger btn-pill btn-sm"><i class="fas fa-times"></i> Reset </button>
                        <button type="submit" class="btn btn-label-success btn-elevate btn-pill"><i class="far fa-save"></i> Save</button>
                    </div>

                </div>

            </div>
        </div>
    </div>
    <!-- /.container-fluid -->
</section>
<!-- /.content-header -->

<!-- Main content -->

<section class="content">
    <div class="container-fluid">
        <div class="row">
            <!-- /.col -->
            <div class="col-md-12">

                <div class="card">
                    <div class="card__head card__head--lg">
                        <div class="card__head-label">
                            <h3 class="card__head-title"> Primary Content</h3>
                        </div>
						<div class="card__head-label">
							<!--<button type="button" class="btn btn-outline-brand btn-icon btn-circle btn-sm" Title="Translate To Chinese" data-toggle="modal" data-target="#translated_box"><i class="fas fa-globe-asia"></i></button>-->
                        </div>
                    </div>
                    <div class="card__body">
                        <!--START::ALERT MESSAGE -->
                        <?php $this->load->view('templates/admin/alert');?>
                            <!--END::ALERT MESSAGE -->
                            <div class="row">
                                <div class="col-md-12">
                                    <div class="card card--first">
                                        <div class="card__body">                                            
											<div class="form-group row">
                                                <label class="col-sm-2 col-form-label">Section</label>
                                                <div class="col-sm-10">
                                                    <select class="form-control" name="section" >
														<option value="">Select</option>
														<option value="Main" <?=($query->section=='Main')?'selected':''?> >Main</option>
														<option value="Account" <?=($query->section=='Account')?'selected':''?> >Account</option>
														<option value="Setup" <?=($query->section=='Setup')?'selected':''?> >Setup</option>
														<option value="Business Management" <?=($query->section=='Business Management')?'selected':''?> >Business Management</option>
													</select>
                                                </div>
                                            </div>
											<div class="form-group row">
                                                <label class="col-sm-2 col-form-label">Parent Category</label>
                                                <div class="col-sm-10">
                                                    <select class="form-control" name="parent_id" required onchange="return viewPermission(this.value)">
													<option value="0">Self Parent</option>
														<?php
														if(!empty($p_categories)){
															foreach($p_categories as $k2=>$p_group){
																if($p_group->id!=$query->id){
														?>
														<option value="<?=$p_group->id?>" <?=($p_group->id==$query->parent_id)?'selected':''?>><?=$p_group->name?></option>
														<?php
																}
															}
														}
														?>
													</select>
                                                </div>
                                            </div>
                                            <div class="form-group row">
                                                <label class="col-sm-2 col-form-label">Name</label>
                                                <div class="col-sm-10">
                                                    <input class="form-control" type="text" value="<?=$query->name?>" name="name" required placeholder="Module name" autocomplete="off">
                                                </div>
                                            </div>
                                            <div class="form-group row">
                                                <label class="col-sm-2 col-form-label">Description</label>
                                                <div class="col-sm-10">
                                                    <textarea name="description" id="description" placeholder="Description">
                                                        <?=$query->description?>
                                                    </textarea>
                                                </div>
                                            </div>
											<div class="form-group row">
												<label class="col-sm-2 col-form-label">Is External URL?</label>
												<div class="col-sm-8">
													<input type="checkbox" name="is_url" id="is_url" <?=($query->is_url=='1')?'checked':'';?> data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
													<p class="text-warning"></p>
												</div>
											</div>
											<div class="form-group row">
												<label class="col-sm-2 col-form-label">Is Public?</label>
												<div class="col-sm-8">
													<input type="checkbox" name="is_public" id="is_public" <?=($query->is_public=='1')?'checked':'';?> data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
													<p class="text-warning"></p>
												</div>
											</div>
											<div class="form-group row">
                                                <label class="col-sm-2 col-form-label">URl</label>
                                                <div class="col-sm-10">
                                                    <input class="form-control" type="text" value="<?=$query->url?>" name="url" required placeholder="URl" autocomplete="off">
                                                </div>
                                            </div>
											<div class="form-group row">
                                                <label class="col-sm-2 col-form-label">Icon</label>
                                                <div class="col-sm-10">
                                                    <input class="form-control" type="text" value="<?=$query->icon?>" name="icon" required placeholder="Icon" autocomplete="off">
													<p class="text-warning">Use <a href="https://fontawesome.com/icons?d=gallery&m=free" target="_blank"> Font Awesome</a></p>
                                                </div>
                                            </div>
											<div class="form-group row">
                                                <label class="col-sm-2 col-form-label">Order No</label>
                                                <div class="col-sm-10">
                                                    <input class="form-control" type="number" value="<?=$query->order_no?>" name="order_no" required placeholder="Order No" autocomplete="off">
													<p class="text-warning"></p>
                                                </div>
                                            </div>
											<div class="form-group row " id="module_permissions" style="display:<?=($query->parent_id=='0')?'none':''; ?>;">
												<label for="" class="col-sm-2 col-form-label">Permissions</label>
												<div class="col-sm-8 row">
												<?php 
												  $permissions = array();
												  $permissions = explode(',', $query->permissions); 
												?>
					
													<div class="form-group mr-3">
														<label for="" class="control-label">ADD</label>
														<input type="checkbox" name="permissions[]"  id="permission_add" value="A" <?=(in_array("A", $permissions)==TRUE)?'checked':''?> data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
													</div>
													<div class="form-group mr-3">
														<label for="" class="control-label">EDIT</label>
														<input type="checkbox" name="permissions[]"  id="permission_edit" value="E" <?=(in_array("E", $permissions)==TRUE)?'checked':''?> data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
													</div>
													<div class="form-group mr-3">
														<label for="" class="control-label">DELETE</label>
														<input type="checkbox" name="permissions[]"  id="permission_delete" value="D" <?=(in_array("D", $permissions)==TRUE)?'checked':''?> data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
													</div>
													<div class="form-group mr-3">
														<label for="" class="control-label">VIEW</label>
														<input type="checkbox" name="permissions[]"  id="permission_view" value="V" <?=(in_array("V", $permissions)==TRUE)?'checked':''?> data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
													</div>
													<div class="form-group mr-3">
														<label for="" class="control-label">STATUS CHANGE</label>
														<input type="checkbox" name="permissions[]"  id="permission_status" value="S" <?=(in_array("S", $permissions)==TRUE)?'checked':''?> data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
													</div>	
													
												</div>
											</div>		
											
                                        </div>
                                    </div>
                                </div>
                            </div>
                    </div>
                </div>
                
            </div>
            <!-- /.col -->
        </div>
        <!-- /.row -->
    </div>
    <!-- /.container-fluid -->
</section>	
	<!-- /.content -->
	
<div class="modal fade" id="translated_box">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title">Chinese Content</h4>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
                <div class="card__body">
                    <!--START::ALERT MESSAGE -->
                    <?php $this->load->view('templates/admin/alert');?>
                        <!--END::ALERT MESSAGE -->
                        <div class="row">
                            <div class="col-md-12">
                                <div class="card card--first">
                                    <div class="card__body">
                                        <div class="form-group row">
                                            <label class="col-sm-2 col-form-label">Name</label>
                                            <div class="col-sm-10">
                                                <input class="form-control" type="text" value="<?=$query->name_cn?>" name="name_cn" placeholder="Name" autocomplete="off">
                                            </div>
                                        </div>
                                        <div class="form-group row">
                                            <label class="col-sm-2 col-form-label">Description</label>
                                            <div class="col-sm-10">
                                                <textarea name="description_cn" id="description_cn" placeholder="Description">
                                                    <?=$query->description_cn?>
                                                </textarea>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                </div>
            </div>
            <div class="modal-footer justify-content-between">
                <button type="button" class="btn btn-label-danger btn-pill btn-sm" data-dismiss="modal">Close</button>
                <button type="button" class="btn btn-label-success btn-pill btn-sm" data-dismiss="modal">Go</button>
            </div>
        </div>
        <!-- /.modal-content -->
    </div>
    <!-- /.modal-dialog -->
</div>
<!-- /.modal -->
	
	
	
</form>	
<?php
$this->load->view('templates/admin/footer_scripts');
?>

<script>
$("input[data-bootstrap-switch]").each(function(){
    $(this).bootstrapSwitch('state', $(this).prop('checked'));
});
function viewPermission(val){
	if(val > '0'){
		$('#module_permissions').show();
	}else{
		$('#module_permissions').hide();
	}
}
</script>


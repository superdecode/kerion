<form class="form-horizontal" action="" method="POST" enctype="multipart/form-data" data-pjax id="pjax_form" onsubmit="" autocomplete="off">
<!-- Content Header (Page header) -->
<section class="content-header">
    <div class="inner-breadcrumb">
        <div class="container-fluid">
            <div class="row align-items-center">
                <div class="col-sm-6">
                    <ol class="breadcrumb float-sm-left">
                        <li class="breadcrumb-item"><a href="<?=base_url('dashboard')?>">Home</a></li>
                        <li class="breadcrumb-item"><a href="<?=base_url('Roles/listing')?>"> Roles List</a></li>
                        <li class="breadcrumb-item active">
                            <?=$header['site_title']?>
                        </li>
                    </ol>
                </div>
                <div class="col-sm-6">

                    <div class="float-right">
                        <a href="<?=base_url('Roles/listing')?>" class="btn btn-pill btn-secondary sk-margin-r-10 btn-sm"><i class="fas fa-long-arrow-alt-left"></i> Back </a>
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
                                                <label class="col-sm-2 col-form-label">Name</label>
                                                <div class="col-sm-10">
                                                    <input class="form-control" type="text" value="<?=$query->name?>" name="name" required placeholder="Role name" autocomplete="off">
                                                </div>
                                            </div>
                                            <div class="form-group row">
                                                <label class="col-sm-2 col-form-label">Description</label>
                                                <div class="col-sm-10">
                                                    <textarea name="description" id="description" placeholder="Description" class="form-control"><?=$query->description?></textarea>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                    </div>
                </div>
				
				<div class="card">                
                    <div class="card-header">
                        <h3 class="card-title">Role Permissions</h3>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-12">
                                    <div class="card card--first">
                                        <div class="card__body">
                                           
                                            <table id="" class="table table-bordered table-striped" style="width:100%">
												<thead>
													<tr>
														<th class="w-10 text-center">#</th>
														<th>Module Name</th>
														<th class="w-10 text-center">Add</th>
														<th class="w-10 text-center">Edit</th>
														<th class="w-10 text-center">Delete</th>
														<th class="w-10 text-center">View</th>
														<th class="w-10 text-center">Status Change</th>
													</tr>
												</thead>
												<tbody>
												<?php
												if($modules){
													$sections = ['Main','Account','Setup','Business Management'];
													foreach($modules as $k=>$module){
														
														$add = get_role_permission($query->id,$module->id,'add');
														$edit = get_role_permission($query->id,$module->id,'edit');
														$delete = get_role_permission($query->id,$module->id,'delete');
														$view = get_role_permission($query->id,$module->id,'view');
														$status = get_role_permission($query->id,$module->id,'status');
														
														$permissions = array();
														$permissions = explode(',', $module->permissions); 
														
														$child_modules = $this->Role_model->getModuleList($module->id);
														if(empty($child_modules)){
												  
												?>
													<tr>
														<td class="w-10 text-center">
															<?=$k+1?>
															<input type="hidden" name="module_ids[]" value="<?=$module->id?>">
															<input type="hidden" name="parent_module_ids[]" value="<?=$module->parent_id?>">
															<input type="hidden" name="sections[]" value="<?=array_search($module->section, $sections);?>">
														</td>
														<td><?='<b>'.$module->name.'</b>'?></td>
														<td class="w-10 text-center">
															<input type="checkbox" name="permission_add[<?=$module->id?>]" id="" <?=($add=='1')?'checked':''?> data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">														
														</td>
														<td class="w-10 text-center">														
															<input type="checkbox" name="permission_edit[<?=$module->id?>]" id="" <?=($edit=='1')?'checked':''?>  data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
														</td>
														<td class="w-10 text-center">
															<input type="checkbox" name="permission_delete[<?=$module->id?>]" id="" <?=($delete=='1')?'checked':''?>  data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
														</td>
														<td class="w-10 text-center">
															<input type="checkbox" name="permission_view[<?=$module->id?>]" id="" <?=($view=='1')?'checked':''?>  data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
														</td>
														<td class="w-10 text-center">
															<input type="checkbox" name="permission_status[<?=$module->id?>]" id="" <?=($status=='1')?'checked':''?>  data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
														</td>
													</tr>
												<?php
														}else{
															foreach($child_modules as $c_k=>$child_module){
																$add1 = get_role_permission($query->id,$child_module->id,'add');
																$edit1 = get_role_permission($query->id,$child_module->id,'edit');
																$delete1 = get_role_permission($query->id,$child_module->id,'delete');
																$view1 = get_role_permission($query->id,$child_module->id,'view');
																$status1 = get_role_permission($query->id,$child_module->id,'status');
												?>	
													<tr>
														<td class="w-10 text-center">
															<?=$k+1?>
															<input type="hidden" name="module_ids[]" value="<?=$child_module->id?>">
															<input type="hidden" name="parent_module_ids[]" value="<?=$child_module->parent_id?>">
															<input type="hidden" name="sections[]" value="<?=array_search($child_module->section, $sections);?>">
														</td>
														<td><?='<b>'.$child_module->parent_name.'</b> / '.$child_module->name?></td>
														<td class="w-10 text-center">
															<input type="checkbox" name="permission_add[<?=$child_module->id?>]" id="" <?=($add1=='1')?'checked':''?> data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">														
														</td>
														<td class="w-10 text-center">														
															<input type="checkbox" name="permission_edit[<?=$child_module->id?>]" id="" <?=($edit1=='1')?'checked':''?>  data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
														</td>
														<td class="w-10 text-center">
															<input type="checkbox" name="permission_delete[<?=$child_module->id?>]" id="" <?=($delete1=='1')?'checked':''?>  data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
														</td>
														<td class="w-10 text-center">
															<input type="checkbox" name="permission_view[<?=$child_module->id?>]" id="" <?=($view1=='1')?'checked':''?>  data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
														</td>
														<td class="w-10 text-center">
															<input type="checkbox" name="permission_status[<?=$child_module->id?>]" id="" <?=($status1=='1')?'checked':''?>  data-bootstrap-switch data-off-color="danger" data-on-color="success" onchange="">
														</td>
													</tr>
												
												<?php
															}
														}
													}
												}
												?>	
												</tbody>                                    
											</table>
                                            
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
</script>


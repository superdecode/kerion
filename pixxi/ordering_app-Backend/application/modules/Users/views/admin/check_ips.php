<form class="form-horizontal" action="" method="POST" enctype="multipart/form-data" data-pjax id="pjax_form" onsubmit="">
<!-- Content Header (Page header) -->
    <section class="content-header ">
      <div class="container-fluid">
        <div class="row mb-2">
          <div class="col-sm-6">
            <ol class="breadcrumb float-sm-left">
              <li class="breadcrumb-item"><a href="<?=base_url('dashboard')?>">Home</a></li>
			  <li class="breadcrumb-item "><a href="<?=base_url('Users/profile')?>">User Profile</a></li>
              <li class="breadcrumb-item active">IP Address List</li>
            </ol>
          </div>
          <div class="col-sm-6">
			
				<div class="float-right">
					<!--<button type="button" class="btn btn-default"><i class="fas fa-long-arrow-alt-left"></i> Back </button>-->
					<button type="reset" class="btn btn-danger"><i class="fas fa-times"></i> Reset </button>
					<button type="submit" class="btn btn-primary"><i class="far fa-save"></i> Save </button>
				</div>
			
          </div>
        </div>
      </div><!-- /.container-fluid -->
    </section>
	<!-- /.content-header -->

    <!-- Main content -->
    
	<section class="content">
      <div class="container-fluid">
        <div class="row">
          <div class="col-md-3">

            <!-- Profile Image -->
            <div class="card card-primary card-outline">
              <div class="card-body box-profile">
                <div class="text-center">
				<?php 
					$image = $profile->profile_image;
					if (!empty($image)) {
						$img = base_url('assets/uploads/user_images/' . $image);
					} else {
						$img = base_url('assets/admin/dist/img/avatar5.png');
					}
				?>
                  <img class="profile-user-img img-fluid img-circle" src="<?=$img?>" alt="<?=$profile->fname?>">
                </div>

                <h3 class="profile-username text-center"><?=$profile->fname.' '.$profile->lname?></h3>

                <p class="text-muted text-center"><?=$profile->role?></p>

                
				<div class="p-0">
				  <ul class="nav nav-pills flex-column">
					<li class="nav-item ">
					  <a href="<?=base_url('Users/profile')?>" class="nav-link">
						<i class="fas fa-user"></i> Personal Information
					  </a>
					</li>
					<li class="nav-item">
					  <a href="<?=base_url('Users/account_settings')?>" class="nav-link">
						<i class="fas fa-envelope"></i> Account Settings
					  </a>
					</li>
					<li class="nav-item">
					  <a href="<?=base_url('Users/change_password')?>" class="nav-link">
						<i class="fas fa-cog"></i> Change Password
					  </a>
					</li>
					<li class="nav-item">
					  <a href="<?=base_url('Users/check_ips')?>" class="nav-link active">
						<i class="fas fa-laptop"></i> Check IP Address
					  </a>
					</li>
				  </ul>
				</div>
				
				
              </div>
              <!-- /.card-body -->
            </div>
            <!-- /.card -->
            
          </div>
          <!-- /.col -->
          <div class="col-md-9">
            <!-- /.nav-tabs-custom -->
			<div class="card">
              <div class="card-header p-2">
                <h3 class="profile-username ">Allow IP Address List</h3>
              </div><!-- /.card-header -->
				<div class="card-body">
				<!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert');?><!--END::ALERT MESSAGE -->
					
					<div id="ip_repeter">
					<?php
					if(!empty($profile->ip_addresses)){
						foreach($profile->ip_addresses as $k_ip => $ip){
							if($k_ip=='0'){
					?>
						<div class="form-group row ip-repeat" id="ip_repeat_<?=$k_ip+1?>">						
							<div class="col-sm-5">
								<div class="input-group">
									<div class="input-group-prepend">
									  <span class="input-group-text"><i class="fas fa-laptop"></i></span>
									</div>
									<input type="text" class="form-control" data-inputmask="'alias': 'ip'" data-mask="" im-insert="true" placeholder="IP Address From" value="<?=$ip->ip_address_from?>" name="ip_address_from[]" >
								</div>
							</div>
							<div class="col-sm-5">
								<div class="input-group">
									<div class="input-group-prepend">
									  <span class="input-group-text"><i class="fas fa-laptop"></i></span>
									</div>
									<input type="text" class="form-control" data-inputmask="'alias': 'ip'" data-mask="" im-insert="true" placeholder="IP Address To" value="<?=$ip->ip_address_to?>" name="ip_address_to[]">
								</div>
							</div>							
						</div>						
						
					<?php
							}else{
					?>
						<div class="form-group row ip-repeat" id="ip_repeat_<?=$k_ip+1?>">						
							<div class="col-sm-5">
								<div class="input-group">
									<div class="input-group-prepend">
									  <span class="input-group-text"><i class="fas fa-laptop"></i></span>
									</div>
									<input type="text" class="form-control" data-inputmask="'alias': 'ip'" data-mask="" im-insert="true" placeholder="IP Address From" value="<?=$ip->ip_address_from?>" name="ip_address_from[]" >
								</div>
							</div>
							<div class="col-sm-5">
								<div class="input-group">
									<div class="input-group-prepend">
									  <span class="input-group-text"><i class="fas fa-laptop"></i></span>
									</div>
									<input type="text" class="form-control" data-inputmask="'alias': 'ip'" data-mask="" im-insert="true" placeholder="IP Address To" value="<?=$ip->ip_address_to?>" name="ip_address_to[]">
								</div>
							</div>
							<label class="col-sm-2 ">
								<button type="button" class="btn btn-danger btn-flat remove" onclick="removeIP('<?=$k_ip+1?>')">
										<i class="fas fa-times"></i>
								</button>
							</label>
						</div>
					<?php
								}
							}
					}else{
					?>
					<div class="form-group row ip-repeat">						
						<div class="col-sm-5">
							<div class="input-group">
								<div class="input-group-prepend">
								  <span class="input-group-text"><i class="fas fa-laptop"></i></span>
								</div>
								<input type="text" class="form-control" data-inputmask="'alias': 'ip'" data-mask="" im-insert="true" placeholder="IP Address From" name="ip_address_from[]" required>
							</div>
						</div>
						<div class="col-sm-5">
							<div class="input-group">
								<div class="input-group-prepend">
								  <span class="input-group-text"><i class="fas fa-laptop"></i></span>
								</div>
								<input type="text" class="form-control" data-inputmask="'alias': 'ip'" data-mask="" im-insert="true" placeholder="IP Address To" name="ip_address_to[]">
							</div>
						</div>							
					</div>
					<?php
					}
					?>
						
					</div>	
					<div class="form-group row ip-repeat" id="ip_repeat" style="display:none;">						
						<div class="col-sm-5">
							<div class="input-group">
								<div class="input-group-prepend">
								  <span class="input-group-text"><i class="fas fa-laptop"></i></span>
								</div>
								<input type="text" class="form-control" data-inputmask="'alias': 'ip'" data-mask="" im-insert="true" placeholder="IP Address From" name="ip_address_from[]" >
							</div>
						</div>
						<div class="col-sm-5">
							<div class="input-group">
								<div class="input-group-prepend">
								  <span class="input-group-text"><i class="fas fa-laptop"></i></span>
								</div>
								<input type="text" class="form-control" data-inputmask="'alias': 'ip'" data-mask="" im-insert="true" placeholder="IP Address To" name="ip_address_to[]" >
							</div>
						</div>
						<label class="col-sm-2 ">
							<button type="button" class="btn btn-danger btn-flat remove" onclick="">
									<i class="fas fa-times"></i>
							</button>
						</label>
					</div>
					<div class="col-sm-12 text-right">
						<a href="javascript:void('0')" class="btn btn-info btn-sm text-right" onclick="return ip_clone(event)">
							<i class="fas fa-plus"></i> Add
						</a>
					</div>
				</div><!-- /.card-body -->
            </div>
            <!-- /.nav-tabs-custom -->
          </div>
          <!-- /.col -->
        </div>
        <!-- /.row -->
      </div><!-- /.container-fluid -->
	  
    </section>
	
	<!-- /.content -->
</form>	
<?php
$this->load->view('templates/admin/footer_scripts');
?>
<!-- InputMask -->
<script src="<?=base_url('assets/admin/plugins/moment/moment.min.js')?>"></script>
<script src="<?=base_url('assets/admin/plugins/inputmask/min/jquery.inputmask.bundle.min.js')?>"></script>

<script>
$('[data-mask]').inputmask();

function ip_clone(e){
	var updatedIndex = parseInt($(".ip-repeat").length);
    $("#ip_repeat").clone()
		.appendTo("#ip_repeter")
		.attr("id", "ip_repeat_" +  updatedIndex)
		.show('slow')
		//.data("index", updatedIndex)
		.find("*");
		$('#ip_repeat_' +  updatedIndex).find('.remove').attr('onclick',"removeIP('"+updatedIndex+"')");
		$('[data-mask]').inputmask();
}
function removeIP(i){
	var $target = $("#ip_repeat_"+i);
	$target.hide('slow', function(){ $target.remove(); });
}

</script>


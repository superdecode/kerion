<form class="form-horizontal" action="" method="POST" enctype="multipart/form-data" data-pjax id="pjax_form" onsubmit="">
    <!-- Content Header (Page header) -->
    <section class="content-header">
        <div class="inner-breadcrumb">
            <div class="container-fluid">
                <div class="row align-items-center">
                    <div class="col-sm-6">
                        <ol class="breadcrumb float-sm-left">
                            <li class="breadcrumb-item"><a href="<?=base_url('dashboard')?>">Home</a></li>
							<?php
							if(!empty($id)){
							?>
							<li class="breadcrumb-item"><a href="<?=base_url('Roles/listing')?>">Role List</a></li>
                            <li class="breadcrumb-item active"><?=$header['site_title']?></li>
							<?php
							}else{
							?>
							<li class="breadcrumb-item active">Role List</li>
							<?php
							}
							?>
                        </ol>
                    </div>
                    <div class="col-sm-6">

                        <div class="float-right">
                            <a href="<?=base_url('Roles/save')?>" class="btn btn-pill btn-info sk-margin-r-10 btn-sm"><i class="far fa-save"></i> Add New </a>
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
                    <!-- /.nav-tabs-custom -->
                    <div class="card">
                        <div class="card-header p-2">
                            <h3 class="profile-username ">Role List</h3>
                        </div>
                        <!-- /.card-header -->
                        <div class="card-body">
                            <!--START::ALERT MESSAGE -->
                            <?php $this->load->view('templates/admin/alert');?>
                                <!--END::ALERT MESSAGE -->
                                <table id="data-table" class="table table-bordered table-striped" style="width:100%">
                                    <thead>
                                        <tr>											
											<th style="width:10%">#</th>
                                            <th style="width:70%">Name</th>
                                            <th style="width:10%">Status</th>
                                            <th style="width:10%">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                    </tbody>                                    
                                </table>
                        </div>
                        <!-- /.card-body -->
                    </div>
                    <!-- /.nav-tabs-custom -->

                </div>
                <!-- /.col -->
            </div>
            <!-- /.row -->
        </div>
        <!-- /.container-fluid -->
    </section>
    <!-- /.content -->
</form>
<?php
$this->load->view('templates/admin/footer_scripts');
?>
<script>

$(document).ready(function (){
	var table = $('#data-table').DataTable({
		drawCallback: function(){
			$('.page-link').attr('onclick',"return false");
		},
		"pageLength" : 10,
		"responsive": true,
		"serverSide": false,
		"processing": true,
		"bAutoWidth": false,
        "lengthChange": true,
		"order": [[0, "asc" ]],
		"ajax":{
			  url :  base_url+'Roles/getRoles/',
			  type : 'POST'
			},
	});
});



</script>


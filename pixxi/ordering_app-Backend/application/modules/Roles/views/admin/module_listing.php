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
							<li class="breadcrumb-item"><a href="<?=base_url('Roles/moduleListing')?>">Module List</a></li>
                            <li class="breadcrumb-item active"><?=$header['site_title']?></li>
							<?php
							}else{
							?>
							<li class="breadcrumb-item active">Module List</li>
							<?php
							}
							?>
                        </ol>
                    </div>
                    <div class="col-sm-6">

                        <div class="float-right">
                            <a href="<?=base_url('Roles/moduleSave')?>" class="btn btn-pill btn-info sk-margin-r-10 btn-sm"><i class="far fa-save"></i> Add New </a>
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
                            <h3 class="profile-username ">Module List</h3>
                        </div>
                        <!-- /.card-header -->
                        <div class="card-body">
                            <!--START::ALERT MESSAGE -->
                            <?php $this->load->view('templates/admin/alert');?>
                                <!--END::ALERT MESSAGE -->
                                <table id="data-table" class="table table-bordered table-striped" style="width:100%">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Name</th>
                                            <th>Parent Module</th>
                                            <th>URl</th>
                                            <th class="w-10 text-center">Order</th>
                                            <th class="w-10 text-center">Status</th>
                                            <th class="w-10 text-center">Action</th>
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
	var parent_id = '<?=$id?>';
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
			  url :  base_url+'Roles/getModules/'+parent_id,
			  type : 'POST'
		},
		'rowCallback': function(row, data, index){				
			$(row).find('td:eq(4)').addClass('text-center');
			$(row).find('td:eq(5)').addClass('text-center');
			$(row).find('td:eq(6)').addClass('text-center');
		}
	});
});



</script>


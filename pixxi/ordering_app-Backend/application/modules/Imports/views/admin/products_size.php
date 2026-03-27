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
                    <a href="<?= base_url() ?>" class="text-muted text-hover-primary">Inicio</a>
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
        <div class="card">
            <!--begin::Card header-->
            <div class="card-header border-0 pt-6">
                <!--begin::Card toolbar-->
                <div class="card-toolbar flex-row-fluid justify-content-end gap-5 pe-10 d-block mb-10">
                    <!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert'); ?><!--END::ALERT MESSAGE -->

                    <form class="row" action="" method="POST" enctype="multipart/form-data">
                        <?php if($this->session->userdata('user_id')=='1') {?>
                        <label class="col-md-4 required fs-6 fw-bold mb-4">Lista de Vendedores</label>
                        <?php }?>
                        <label class="col-md-4 required fs-6 fw-bold mb-4">Importar Archivos CSV</label>
                        <a class="col-md-4 fs-3 fw-bold mb-4 text-end text-danger" href="<?= base_url('assets/uploads/imports/products_size.csv') ?>">Descargar Archivo Csv De Muestra
</a>
                        <div class=" col-md-4 <?=$this->session->userdata('user_id')!='1'?'d-none':''?>">
                            <select name="seller_id" id="seller_id" required="true" class="form-select" onchange="return get_category(this.value)" data-control="select2" data-allow-clear="true">
                                <option value="">Seleccionar Vendedor</option>
                                <?php
                                 if($this->session->userdata('user_id')!='1'){$query->seller_id = $this->session->userdata('seller_id');}
                                if (!empty($seller_name)) {
                                    foreach ($seller_name as $k => $seller_name_list) {
                                ?>
                                        <option value="<?= $seller_name_list->id ?>" <?= $seller_name_list->id == $query->seller_id ? 'selected' : '' ?>><?= $seller_name_list->seller_name ?></option>
                                <?php }
                                } ?>
                            </select>
                        </div>
                        <?php if($this->session->userdata('user_id')!='1') { ?>
                        <input type="hidden" name="seller_id" value="<?=$this->session->userdata('seller_id');?>"/>
                      <?php } ?>
                        <div class=" col-md-6">
                            <div class="input-group">
                                <input type="file" name="file" class="form-control" id="file" aria-describedby="file" aria-label="Upload">
                                <button class="btn btn-primary" type="submit"><i class="fas fa-file-import fs-4"></i></button>
                            </div>
                            <input type="hidden" name="addedBy" value="<?= $this->session->userdata('user_id') ?>">
                        </div>
                    </form>
                </div>
                <!--end::Card toolbar-->
            </div>
            <!--end::Card header-->

        </div>
        <!--end::Card-->

    </div>
    <!--end::Container-->
</div>

<!--end::Post-->



<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('admin/_js', $this->data);
?>
<script>
    function get_category(id) {

        if (id != '') {
            $.ajax({
                type: 'POST',
                url: "<?= base_url('Imports/getAllproductsData') ?>" + "/" + id,
                data: '',
                success: function(result) {
                    //alert(result);
                    //result = JSON.parse(result);
                    //console.log(result);
                    $('#product_id').html(result);
                }
            });

        }
    }
</script>
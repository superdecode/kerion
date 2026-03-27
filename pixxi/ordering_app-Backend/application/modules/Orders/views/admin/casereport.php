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
                    <a href="<?= base_url() ?>" class="text-muted text-hover-primary">Home</a>
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
            <div class="">


            </div>
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
            <!-- Searching Part --------------------------------->  

            <div class="card-header border-0 pt-6 row">
                <!--begin::Card title-->
                <div class="col-md-12">
                    <form action="" method="GET" id="search_form">
                        <div class="row">
                            <div class="col-md-4 mb-3 <?= ($this->session->userdata('user_role_ids') != '1') ? 'd-none' : '' ?>">

                                <select name="seller_id" id="seller_id" class="form-select" onchange="return get_category(this.value)">
                                    <option value="">Seleccionar Vendedor</option>
                                    <?php
                                    if (!empty($seller_name)) {
                                        foreach ($seller_name as $k => $seller_name_list) {
                                            ?>
                                            <option value="<?= $seller_name_list->id ?>" <?= $seller_name_list->id == $search['seller_id'] ? 'selected' : '' ?>><?= $seller_name_list->seller_name ?></option>
                                        <?php }
                                    }
                                    ?>
                                </select>

                            </div>
                            <div class="col-md-6 mb-3">

                                <div class="row gy-5 g-xl-10">

                                    <div class="col-md-8 mb-xl-10">

                                        <div id="reportrange" class="form-control w-100 mw-300px text-start cursor-pointer">
                                            <i class="fa fa-calendar"></i>&nbsp;
                                            <span></span> <i class="fa fa-caret-down"></i>
                                        </div>
                                        <input type="hidden" name="from" id="from" value="">
                                        <input type="hidden" name="to" id="to" value="">
                                    </div>

                                    <div class="col-md-4 mb-5 mb-xl-10">
                                        <input type="submit" class="btn btn-primary btn-sm me-2 pt-3" value="Buscar" name="" />
                                    </div>
                                </div>

                            </div>

                        </div>
                    </form>
                </div>
            </div>

            <!----------------------- End -------------------------->

            <!--begin::Card body-->
            <div class="card-body pt-0">
                <!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert'); ?><!--END::ALERT MESSAGE -->
                <!--begin::Table-->
                <table class="table align-middle table-row-dashed fs-6 gy-5" id="kt_listing_table">
                    <!--begin::Table head-->
                    <thead>
                        <!--begin::Table row-->
                        <tr class="text-start text-gray-400 fw-bolder fs-7  gs-0">
                            <th class="w-10px pe-2">
                                <div class="form-check form-check-sm form-check-custom form-check-solid me-3">
                                    #
                                </div>
                            </th>
                            <th class="">Nº De Orden</th>
                            <th class="">Fecha Y Hora del Pedido</th>
                            <th class="">Nombre del Vendedor</th>
                            <th class="">Información de Contacto</th>
                            <th class="">Monto (COP)</th>
                            <th class="">Estado</th>
                        </tr>
                        <!--end::Table row-->
                    </thead>
                    <!--end::Table head-->
                    <!--begin::Table body-->
                    <tbody class="fw-bold text-gray-600">
                        <?php
                        $i = 1;
                        //print_r($datas);
                        if (!empty($datas)) {
                            $datacount = 0;
                            foreach ($datas as $k => $rows) {
                                //pr($rows);

                                $id = base64_encode($rows->id);
                                $order_no = $rows->order_number;
                                $edit_link = base_url('Orders/save/' . $id);
                                $lebel_link = base_url('Orders/lebel/' . $id . '/' . $order_no);
                                $review_link = base_url('Orders/saveReview/' . $id);
                                $accept_link = base_url('Orders/acceptOrder/' . $id);
                                $delete_link = '';
                                //$query = $this->Order_model->reviewList($rows->id);
                                $edit['query'] = $query;
                                ?>
                                <tr id="tr_<?= $rows->id ?>">
                                    <td>
                                        <div class="form-check form-check-sm form-check-custom form-check-solid ">
                                            <!--<input class="form-check-input removeData" type="checkbox" value="<?= $rows->id ?>" />-->
        <?= $i; ?>
                                        </div>
                                    </td>
                                    <td>
                                        <a href="javascript:void(0)" class="text-primary"><?= $rows->order_number ?></a>
                                    </td>
                                    <td>
        <?= date('d M Y ', strtotime($rows->created_at)) . '<br>' . date('h:i A ', strtotime($rows->created_at)) ?>
                                    </td>
                                    <td><?= ucfirst($rows->seller_name) ?></td>

                                    <td><?= $rows->phone_number ?></td>
                                    <td><?= $rows->price_subtotal ?></td>
                                    <td data-filter="">
                                        <a href="javascript:void(0)" class="badge badge-light-<?= ($rows->order_status != 'awating_confirmation' && $rows->order_status != 'cancelled') ? 'success' : 'danger' ?>">
                                        <?php if($rows->order_status=='processing') { 
                                                    $order_status='Procesando';
                                                } if($rows->order_status=='completed'){
                                                    $order_status='Completado';
                                                }if($rows->order_status=='cancelled'){
                                                    $order_status='Cancelado';
                                                }
?>
                                                <?= $order_status;?>
                                        </a>
                                    </td>
                                </tr>
                                <!--begin::Modal - Edit-->
                            <div class="modal fade " id="kt_modal_edit<?= $rows->id ?>" tabindex="-1" aria-hidden="true">
                                <!--begin::Modal dialog-->
                                <div class="modal-dialog modal-dialog-centered mw-800px">
                                    <!--begin::Modal content-->
                                    <div class="modal-content">
                                        <!--begin::Form-->
        <?php $this->load->view('admin/saveReview', $edit); ?>
                                        <!--end::Form-->
                                    </div>
                                </div>
                            </div>
                            <!--end::Modal -->
                            <?php
                            $i++;
                            $datacount++;
                        }
                    }
                    ?>
                    </tbody>
                    <!--end::Table body-->
                    <tfoot class="text-white" style="background:#8940f0;">
                        <tr>
                            <th></th>
                            <th colspan="2" class="text-first fw-bolder text-blue fs-5">Pedidos totales: <?= $datacount; ?></th>
                            <th colspan="2" class="text-first fw-bolder text-blue fs-5"></th>
                            <th colspan="2" class="text-first fw-bolder text-blue fs-5">Cantidad total: <?= $total_balance ?></th>

                        </tr>
                    </tfoot>
                </table>
                <!--end::Table-->
            </div>
            <!--end::Card body-->
        </div>
        <!--end::Card-->

    </div>
    <!--end::Container-->
</div>

<!--end::Post-->

<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('admin/_jscasereport', $this->data);
?>
<script type="text/javascript">
    $(function () {

        //var start = moment().subtract(29, 'days');
        //var end = moment();
        var start = moment("<?= $search['from'] ?>");
        var end = moment("<?= $search['to'] ?>");

        function cb(start, end) {
            $('#reportrange span').html(start.format('MMMM D, YYYY') + ' - ' + end.format('MMMM D, YYYY'));
            $('#from').val(start.format('YYYY-M-D'));
            $('#to').val(end.format('YYYY-M-D'));


        }

        $('#reportrange').daterangepicker({

            startDate: start,
            endDate: end,

            ranges: {
                'Hoy': [moment(), moment()],
                'Ayer': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                'Los últimos 7 días': [moment().subtract(6, 'days'), moment()],
                'Últimos 30 días': [moment().subtract(29, 'days'), moment()],
                'Este mes': [moment().startOf('month'), moment().endOf('month')],
                'El mes pasado': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
            }
        }, cb);

        cb(start, end);

    });

    //$('a.toggle-vis').on('click', function (e) {
    $('.toggle-vis').click(function (e) {

        //e.preventDefault();

        // Get the column API object
        var column = table.column($(this).attr('data-column'));

        // Toggle the visibility
        column.visible(!column.visible());
    });
</script>
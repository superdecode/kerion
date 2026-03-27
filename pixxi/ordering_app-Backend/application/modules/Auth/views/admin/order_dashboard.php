<?php
$fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
$fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
$fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
?>
<div class="post d-flex flex-column-fluid" id="kt_post">
    <!--begin::Container-->
    <div id="kt_content_container" class="container-fluid">
        <!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert'); ?><!--END::ALERT MESSAGE -->
        <div class="row gy-5 g-xl-10">
            <div class="align-items-center position-relative my-1 pt-5 text-end">
                    <input type="button" class="btn btn-primary btn-sm me-2 pt-3" value="Nuevos Pedidos" name="" id="page_refersh" style="font-size: 12px; font-weight: bold">
                </div>
            <div class="col-md-4">
                <div class="card card-flush h-xl-100">
                    <div class="card-header pt-7">
                        <h3 class="card-title align-items-start flex-column">
                            <span class="card-label fw-bold text-dark">Por Confirmar</span>
                        </h3>
                        <div class="card-toolbar">
                            <div class="d-flex flex-column align-items-end ms-2">
                                <h4 class="badge badge-lg badge-circle badge-light"><?= count($awating_confirmation_orders) ?></h4>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="hover-scroll-overlay-y pe-6 me-n6" style="height: 575px">
                            <?php
                            if (!empty($awating_confirmation_orders)) {
                                foreach ($awating_confirmation_orders as $k => $rows) {
                            ?>
                                    <div class="border border-dashed border-gray-300 rounded px-7 py-3 mb-6 bg-light-primary" onclick="return orderDetails('<?= $rows->id ?>');" data-bs-toggle="modal" data-bs-target="#kt_modal_up">
                                        <div class="d-flex flex-stack">
                                            <span class="text-dark fw-bold">Solicitar ID:
                                                <a href="javascript:void(0)" class="text-gray-600 fw-bold">#<?= $rows->order_number ?> </a>
                                            </span>
                                            <span class="badge badge-light-success"><?= $fmt->format($rows->price_total); ?></span>
                                        </div>
                                        <div class="d-flex flex-stack">
                                            <span class="text-dark fw-bold">ID de recogida:
                                                <a href="javascript:void(0)" class="text-gray-600 fw-bold"> #<?= $rows->pickup_number ?> </a>
                                            </span>
                                        </div>
                                        <div class="d-flex flex-stack ">
                                            <div class="me-3">
                                                <span class="text-dark fw-bold fs-7">Tiempo:
                                                    <a href="javascript:void(0)" class="text-gray-400 "><?= date('d M Y h:i A', strtotime($rows->created_at)) ?></a>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                <?php
                                }
                            } else {
                                ?>
                                <div class="border border-dashed border-gray-300 rounded px-7 py-3 mb-6 bg-light-danger">
                                    <div class=" text-center">
                                        <span class="text-dark fw-bold">No se ha encontrado ningún pedido
                                        </span>
                                    </div>
                                </div>

                            <?php
                            }
                            ?>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card card-flush h-xl-100">
                    <div class="card-header pt-7">
                        <h3 class="card-title align-items-start flex-column">
                            <span class="card-label fw-bold text-dark">En proceso</span>
                        </h3>
                        <div class="card-toolbar">
                            <div class="d-flex flex-column align-items-end ms-2">
                                <h4 class="badge badge-lg badge-circle badge-light"><?= count($processing_orders) ?></h4>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="hover-scroll-overlay-y pe-6 me-n6" style="height: 575px">
                            <?php
                            if (!empty($processing_orders)) {
                                foreach ($processing_orders as $k2 => $rows2) {
                            ?>
                                    <div class="border border-dashed border-gray-300 rounded px-7 py-3 mb-6 bg-light-warning" onclick="return orderDetails('<?= $rows2->id ?>');" data-bs-toggle="modal" data-bs-target="#kt_modal_up">
                                        <div class="d-flex flex-stack">
                                            <span class="text-dark fw-bold">Solicitar ID:
                                                <a href="javascript:void(0)" class="text-gray-600 fw-bold">#<?= $rows2->order_number ?> </a>
                                            </span>
                                            <span class="badge badge-light-success"><?= $fmt->format($rows2->price_total); ?></span>
                                        </div>
                                        <div class="d-flex flex-stack">
                                            <span class="text-dark fw-bold">ID de recogida:
                                                <a href="javascript:void(0)" class="text-gray-600 fw-bold"> #<?= $rows2->pickup_number ?> </a>
                                            </span>
                                        </div>
                                        <div class="d-flex flex-stack ">
                                            <div class="me-3">
                                                <span class="text-dark fw-bold fs-7">Tiempo:
                                                    <a href="javascript:void(0)" class="text-gray-400 "><?= date('d M Y h:i A', strtotime($rows2->created_at)) ?></a>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                <?php
                                }
                            } else {
                                ?>
                                <div class="border border-dashed border-gray-300 rounded px-7 py-3 mb-6 bg-light-danger">
                                    <div class=" text-center">
                                        <span class="text-dark fw-bold">No se ha encontrado ningún pedido
                                        </span>
                                    </div>
                                </div>

                            <?php
                            }
                            ?>

                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card card-flush h-xl-100">
                    <div class="card-header pt-7">
                        <h3 class="card-title align-items-start flex-column">
                            <span class="card-label fw-bold text-dark">Pedidos Completos</span>
                        </h3>
                        <div class="card-toolbar">
                            <div class="d-flex flex-column align-items-end ms-2">
                                <h4 class="badge badge-lg badge-circle badge-light"><?= count($completed_orders) ?></h4>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="hover-scroll-overlay-y pe-6 me-n6" style="height: 575px">
                            <?php
                            if (!empty($completed_orders)) {
                                foreach ($completed_orders as $k3 => $rows3) {
                            ?>
                                    <div class="border border-dashed border-gray-300 rounded px-7 py-3 mb-6 bg-light-success" onclick="return orderDetails('<?= $rows3->id ?>');" data-bs-toggle="modal" data-bs-target="#kt_modal_up">
                                        <div class="d-flex flex-stack">
                                            <span class="text-dark fw-bold">Solicitar ID:
                                                <a href="javascript:void(0)" class="text-gray-600 fw-bold">#<?= $rows3->order_number ?> </a>
                                            </span>
                                            <span class="badge badge-light-success"><?= $fmt->format($rows3->price_total); ?></span>
                                        </div>
                                        <div class="d-flex flex-stack">
                                            <span class="text-dark fw-bold">ID de recogida:
                                                <a href="javascript:void(0)" class="text-gray-600 fw-bold"> #<?= $rows3->pickup_number ?> </a>
                                            </span>
                                        </div>
                                        <div class="d-flex flex-stack ">
                                            <div class="me-3">
                                                <span class="text-dark fw-bold fs-7">Tiempo:
                                                    <a href="javascript:void(0)" class="text-gray-400"><?= date('d M Y h:i A', strtotime($rows3->created_at)) ?></a>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                <?php
                                }
                            } else {
                                ?>
                                <div class="border border-dashed border-gray-300 rounded px-7 py-3 mb-6 bg-light-danger">
                                    <div class=" text-center">
                                        <span class="text-dark fw-bold">No se ha encontrado ningún pedido
                                        </span>
                                    </div>
                                </div>

                            <?php
                            }
                            ?>

                        </div>
                    </div>
                </div>
            </div>
        </div>


    </div>
    <!--end::Container-->
</div>
<!--begin::Modal - -->
<div class="modal fade " id="kt_modal_up" tabindex="-1" aria-hidden="true">
    <!--begin::Modal dialog-->
    <div class="modal-dialog modal-dialog-centered modal-xl">
        <!--begin::Modal content-->
        <div class="modal-content" id="orderDetails">

        </div>
    </div>
</div>
<!--end::Modal -->
<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('templates/admin/_file_manager', $this->data);
$this->load->view('admin/_js', $this->data);
?>

<script>
    function orderDetails(order_id) {
        if (order_id != '') {
            $.ajax({
                type: 'POST',
                url: "<?= base_url('Auth/orderDetails') ?>" + "/" + order_id,
                data: '',
                success: function(result) {
                    //console.log(result);
                    $('#orderDetails').html(result);
                }
            });
        }
    }
    $('#page_refersh').click(function() {
    location.reload();
    });
</script>
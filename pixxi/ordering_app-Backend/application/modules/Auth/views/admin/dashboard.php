<div class="post d-flex flex-column-fluid" id="kt_post">
    <!--begin::Container-->
    <div id="kt_content_container" class="container-fluid">
        <!--begin::Card-->
        <div class="card">
            <!--begin::Card body-->
            <div class="card-body p-0">
                <!--begin::Wrapper-->
                <div class="card-px text-center row">
                    <div class="col-md-12 col-xl-12 mb-md-5 mb-xxl-12 mt-5">
                        <div class="row gutters-10">
                            <div class="col-3">
                                <div class="bg-grad-1 text-white rounded-lg mb-4 overflow-hidden">
                                    <div class="px-3 pt-3">
                                        <div class="opacity-50">
                                            <span class="text-white-400 pt-1 fw-bold fs-6">Ganancias Totales </span>
                                        </div>
                                        <span class="fs-3 fw-bolder  me-2 lh-1"><a style="color:#fff" href="<?= base_url('Orders/earninglisting') ?>">
                                                <?php
                                                //pr($this->session->userdata());
                                                $fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
                                                $fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
                                                $fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
                                                if($this->session->userdata('user_role_ids')=='1'){
                                                    echo  $fmt->format(totalRevenue($this->session->userdata('user_id')));
                                                }else{
                                                    echo  $fmt->format(totalRevenue($this->session->userdata('seller_id')));
                                                }                                                
                                                ?>
                                            </a></span>

                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
                                        <path fill="rgba(255,255,255,0.3)" fill-opacity="1" d="M0,128L34.3,112C68.6,96,137,64,206,96C274.3,128,343,224,411,250.7C480,277,549,235,617,213.3C685.7,192,754,192,823,181.3C891.4,171,960,149,1029,117.3C1097.1,85,1166,43,1234,58.7C1302.9,75,1371,149,1406,186.7L1440,224L1440,320L1405.7,320C1371.4,320,1303,320,1234,320C1165.7,320,1097,320,1029,320C960,320,891,320,823,320C754.3,320,686,320,617,320C548.6,320,480,320,411,320C342.9,320,274,320,206,320C137.1,320,69,320,34,320L0,320Z"></path>
                                    </svg>
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="bg-grad-2 text-white rounded-lg mb-4 overflow-hidden">
                                    <div class="px-3 pt-3">
                                        <div class="opacity-50">
                                            <span class="text-white-400 pt-1 fw-bold fs-6">Ganancias de Hoy</span>
                                        </div>
                                        <span class="fs-3 fw-bolder  me-2 lh-1">
                                            <?php
                                            $fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
                                            $fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
                                            $fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
                                            //echo $numberString = $fmt->format(totalRevenue($this->session->userdata('user_id'), date('Y-m-d')));
                                            if($this->session->userdata('user_role_ids')=='1'){
                                                echo $fmt->format(totalRevenue($this->session->userdata('user_id'), date('Y-m-d')));
                                            }else{
                                                echo $fmt->format(totalRevenue($this->session->userdata('seller_id'), date('Y-m-d')));
                                            }
                                            ?>
                                        </span>

                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
                                        <path fill="rgba(255,255,255,0.3)" fill-opacity="1" d="M0,128L34.3,112C68.6,96,137,64,206,96C274.3,128,343,224,411,250.7C480,277,549,235,617,213.3C685.7,192,754,192,823,181.3C891.4,171,960,149,1029,117.3C1097.1,85,1166,43,1234,58.7C1302.9,75,1371,149,1406,186.7L1440,224L1440,320L1405.7,320C1371.4,320,1303,320,1234,320C1165.7,320,1097,320,1029,320C960,320,891,320,823,320C754.3,320,686,320,617,320C548.6,320,480,320,411,320C342.9,320,274,320,206,320C137.1,320,69,320,34,320L0,320Z"></path>
                                    </svg>
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="bg-grad-3 text-white rounded-lg mb-4 overflow-hidden">
                                    <div class="px-3 pt-3">
                                        <div class="opacity-50">
                                            <span class="text-white-400 pt-1 fw-bold fs-6">Total de Pedidos</span>
                                        </div>
                                        <span class="fs-3 fw-bolder  me-2 lh-1">
                                            <?php
                                                if($this->session->userdata('user_role_ids')=='1'){
                                                    echo  order_count($this->session->userdata('user_id'), 'completed');
                                                }else{
                                                    echo  order_count($this->session->userdata('seller_id'), 'completed');
                                                } 
                                            ?>
                                        </span>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
                                        <path fill="rgba(255,255,255,0.3)" fill-opacity="1" d="M0,128L34.3,112C68.6,96,137,64,206,96C274.3,128,343,224,411,250.7C480,277,549,235,617,213.3C685.7,192,754,192,823,181.3C891.4,171,960,149,1029,117.3C1097.1,85,1166,43,1234,58.7C1302.9,75,1371,149,1406,186.7L1440,224L1440,320L1405.7,320C1371.4,320,1303,320,1234,320C1165.7,320,1097,320,1029,320C960,320,891,320,823,320C754.3,320,686,320,617,320C548.6,320,480,320,411,320C342.9,320,274,320,206,320C137.1,320,69,320,34,320L0,320Z"></path>
                                    </svg>
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="bg-grad-4 text-white rounded-lg mb-4 overflow-hidden">
                                    <div class="px-3 pt-3">
                                        <div class="opacity-50">
                                            <span class="text-white-400 pt-1 fw-bold fs-6">Orden de Hoy</span>
                                        </div>
                                        <span class="fs-3 fw-bolder  me-2 lh-1">
                                            <?php
                                                if($this->session->userdata('user_role_ids')=='1'){
                                                    echo  order_count($this->session->userdata('user_id'), 'completed', date('Y-m-d'));
                                                }else{
                                                    echo  order_count($this->session->userdata('seller_id'), 'completed', date('Y-m-d'));
                                                } 
                                            ?>
                                        </span>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
                                        <path fill="rgba(255,255,255,0.3)" fill-opacity="1" d="M0,128L34.3,112C68.6,96,137,64,206,96C274.3,128,343,224,411,250.7C480,277,549,235,617,213.3C685.7,192,754,192,823,181.3C891.4,171,960,149,1029,117.3C1097.1,85,1166,43,1234,58.7C1302.9,75,1371,149,1406,186.7L1440,224L1440,320L1405.7,320C1371.4,320,1303,320,1234,320C1165.7,320,1097,320,1029,320C960,320,891,320,823,320C754.3,320,686,320,617,320C548.6,320,480,320,411,320C342.9,320,274,320,206,320C137.1,320,69,320,34,320L0,320Z"></path>
                                    </svg>
                                </div>
                            </div>
                            
                            <div class="col-3 d-none">
                                <div class="bg-grad-4 text-white rounded-lg mb-4 overflow-hidden">
                                    <div class="px-3 pt-3">
                                        <div class="opacity-50">
                                            <span class="text-white-400 pt-1 fw-bold fs-6">Visita Promedio Por Cliente</span>
                                        </div>
                                       <span class="fs-3 fw-bolder  me-2 lh-1">
                                                <?php
                                                //pr($this->session->userdata());
                                                
                                                if($this->session->userdata('user_role_ids')=='1'){
                                                    $order_count= thirty_days_order_count($this->session->userdata('user_id'), 'completed');
                                                }else{
                                                    $order_count= thirty_days_order_count($this->session->userdata('seller_id'), 'completed');
                                                } 
                                                $tot_customer= total_customer($role_ids=2);
                                                 echo $cust_avg= round($order_count/$tot_customer);                                        
                                                ?>
                                            </span>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
                                        <path fill="rgba(255,255,255,0.3)" fill-opacity="1" d="M0,128L34.3,112C68.6,96,137,64,206,96C274.3,128,343,224,411,250.7C480,277,549,235,617,213.3C685.7,192,754,192,823,181.3C891.4,171,960,149,1029,117.3C1097.1,85,1166,43,1234,58.7C1302.9,75,1371,149,1406,186.7L1440,224L1440,320L1405.7,320C1371.4,320,1303,320,1234,320C1165.7,320,1097,320,1029,320C960,320,891,320,823,320C754.3,320,686,320,617,320C548.6,320,480,320,411,320C342.9,320,274,320,206,320C137.1,320,69,320,34,320L0,320Z"></path>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-12 col-sm-12 col-xs-6">

                        <div class="card card-xl-stretch mb-5 mb-xl-8">
                            <!--begin::Header-->
                            <div class="card-header border-0 pt-5">
                                <h3 class="card-title align-items-start flex-column">
                                    <span class="card-label fw-bolder fs-3 mb-1">Orden</span>
                                </h3>

                            </div>

                            <form class="form" method="POST" action="<?= base_url('Auth/dashboard/') ?>">
                                <?php
                                $year = $this->input->post('year');
                                $sdate = $this->input->post('start_date');
                                $edate = $this->input->post('end_date');
                                ?>
                                <div class="row">
                                    <div class="col-lg-3 mb-2 row mt-7">
                                        <?php
                                        //get the current year
                                        $Startyear = '2022';
                                        $endYear = date('Y');
                                        $yearArray = range($Startyear, $endYear);
                                        ?>
                                        <!-- here you displaying the dropdown list -->

                                        <select class="form-select me-2 w-150px" name="year">
                                            <option value="">Seleccionar año</option>
                                            <?php

                                            foreach ($yearArray as $year) { ?>
                                                <option value="<?= $year ?>" <?php if ($endYear == $year) { ?>selected="true" <?php } ?>> <?= $year ?></option>';
                                            <?php
                                            }
                                            ?>
                                        </select>
                                    </div>
                                    <div class="col-lg-3 mb-2 row mt-7">
                                        <div class="fv-row mb-0 fv-plugins-icon-container">
                                            <input class="form-control form-control-solid flatpickr-input" type="text" name="start_date" value="<?= $sdate ?>" placeholder="Fecha de inicio" autocomplete="off">
                                        </div>

                                    </div>
                                    <div class="col-lg-3 mb-2 row mt-7">
                                        <div class="fv-row mb-0 fv-plugins-icon-container">

                                            <input class="form-control form-control-solid flatpickr-input-end" type="text" name="end_date" value="<?= $edate ?>" placeholder="Fecha final" autocomplete="off">
                                        </div>

                                    </div>
                                    <div class="col-2">
                                        <button class="btn btn-light  mt-22" style="margin-top:22px;"><i class="fas fa-search"></i></button>
                                    </div>
                                </div>
                            </form>
                            <!--end::Header-->
                            <!--begin::Body-->
                            <div class="card-body py-3">
                                <!--begin::Table container-->
                                <div class="table-responsive h-400px overflow-y-auto">
                                    <!--begin::Table-->
                                    <table class="table table-row-dashed table-row-gray-300 align-middle gs-0 gy-4">
                                        <thead>
                                            <tr>
                                                <th>Orden</th>
                                                <th>Total</th>
                                                <th>Estado</th>
                                                <th>Fecha</th>
                                                <th>Detalles</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php
                                            if (!empty($orders)) {
                                                foreach ($orders as $k => $rows) {
                                                    $id = base64_encode($rows->id);
                                                    $edit_link = base_url('Orders/save/' . $id);
                                                    $delete_link = '';
                                            ?>
                                                    <tr>
                                                        <td>#<?= $rows->order_number ?></td>
                                                        <td>

                                                            <?php
                                                            $fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
                                                            $fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
                                                            $fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
                                                            echo $numberString = $fmt->format($rows->price_total);
                                                            ?>
                                                        </td>
                                                        <td><a href="javascript:void(0)" class="badge badge-light-<?= ($rows->order_status != 'pending') ? 'success' : 'danger' ?>"><?= ucwords(str_replace("-", " ", $rows->order_status)) ?></a> </td>
                                                        <td><?= date('d.m.Y / h:i A', strtotime($rows->created_at)) ?></td>
                                                        <td style="width: 10%">
                                                            <a href="<?= $edit_link ?>" class="btn btn-xs btn-info">Detalle</a>
                                                        </td>
                                                    </tr>
                                                <?php
                                                }
                                            } else {
                                                ?>
                                                <tr>
                                                    <td colspan="5">No hay pedidos hoy</td>
                                                </tr>
                                            <?php
                                            }
                                            ?>

                                        </tbody>



                                    </table>
                                    <!--end::Table-->
                                </div>
                                <!--end::Table container-->
                            </div>
                            <!--begin::Body-->
                        </div>

                    </div>
                    <div class="col-lg-6 col-sm-6 col-xs-6" style="display:none;">

                        <div class="card card-xl-stretch mb-5 mb-xl-8">
                            <!--begin::Header-->
                            <div class="card-header border-0 pt-5">
                                <h3 class="card-title align-items-start flex-column">
                                    <span class="card-label fw-bolder fs-3 mb-1">Unshipped order</span>
                                </h3>
                            </div>
                            <!--end::Header-->
                            <!--begin::Body-->
                            <div class="card-body py-3">
                                <!--begin::Table container-->
                                <div class="table-responsive h-400px overflow-y-auto">
                                    <!--begin::Table-->
                                    <table class="table table-row-dashed table-row-gray-300 align-middle gs-0 gy-4">
                                        <thead>
                                            <tr>
                                                <th>Order</th>
                                                <th>Total</th>
                                                <th>Status</th>
                                                <th>Date</th>
                                                <th>Detail</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php
                                            /*if (!empty($pending_orders)) {
                                                foreach ($pending_orders as $k2 => $rows2) {
                                                    $id = base64_encode($rows2->id);
                                                    $edit_link = base_url('Orders/save/' . $id);
                                                    $delete_link = '';
                                                    ?>
                                                    <tr>
                                                        <td>#<?= $rows2->order_no ?></td>
                                                        <td><span>$</span><?= $rows2->product_total_price ?></td>
                                                        <td><a href="javascript:void(0)" class="badge badge-light-<?= ($rows2->delivery_status != 'pending') ? 'success' : 'danger' ?>"><?= ucwords(str_replace("-", " ", $rows2->delivery_status)) ?></a> </td>
                                                        <td><?= date('d M Y / h:i A', strtotime($rows2->created_at)) ?></td>
                                                        <td style="width: 10%">
                                                            <a href="<?= $edit_link ?>" class="btn btn-xs btn-info">Detail</a>
                                                        </td>
                                                    </tr>
                                                    <?php
                                                }
                                            } else {
                                                ?>		
                                                <tr>
                                                    <td colspan="5">No orders for today</td>
                                                </tr>
                                                <?php
                                            }*/
                                            ?>
                                            <tr>
                                                <td colspan="5">No orders for today</td>
                                            </tr>
                                        </tbody>



                                    </table>
                                    <!--end::Table-->
                                </div>
                                <!--end::Table container-->
                            </div>
                            <!--begin::Body-->
                        </div>

                    </div>

                    <div class="col-lg-6 col-sm-6 col-xs-6 d-none">

                        <div class="card card-xl-stretch mb-5 mb-xl-8">
                            <!--begin::Header-->
                            <div class="card-header border-0 pt-5">
                                <h3 class="card-title align-items-start flex-column">
                                    <span class="card-label fw-bolder fs-3 mb-1">Latest Order Products</span>
                                </h3>
                            </div>
                            <!--end::Header-->
                            <!--begin::Body-->
                            <div class="card-body py-3">
                                <!--begin::Table container-->
                                <div class="table-responsive h-400px overflow-y-auto ">
                                    <table class="table table-row-dashed align-middle gs-0 gy-4 my-0">

                                        <thead>
                                            <tr class="fs-7 fw-bolder text-gray-500 border-bottom-0">
                                                <th class="ps-0 w-50px">ITEM</th>
                                                <th class="min-w-140px"></th>
                                                <th class="text-end min-w-140px">QTY</th>
                                                <th class="pe-0 text-end min-w-120px">PRICE</th>
                                                <th class="pe-0 text-end min-w-120px">TOTAL PRICE</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php
                                            if (!empty($order_products)) {
                                                foreach ($order_products as $k2 => $rows2) {

                                                    $id2 = base64_encode($rows2->id);
                                                    $edit_link2 = base_url('Orders/save/' . $id2);
                                                    if (!empty($rows2->image_default)) {
                                                        $img2 = base_url('assets/uploads/files_manager/' . $rows2->image_default);
                                                    } else {
                                                        $img2 = base_url('assets/admin/media/illustrations/404-hd.png');
                                                    }
                                            ?>
                                                    <tr>
                                                        <td>
                                                            <img src="<?= $img2 ?>" class="w-50px ms-n1" alt="">
                                                        </td>
                                                        <td class="ps-0">
                                                            <span class="text-white-400 fw-bold fs-7 d-block text-start ps-0">Item: <?= $rows2->product_title ?></span>
                                                        </td>
                                                        <td>
                                                            <span class="text-gray-800 fw-bolder d-block fs-6 ps-0 text-end">x<?= $rows2->product_quantity ?></span>
                                                        </td>
                                                        <td class="text-end pe-0">
                                                            <span class="text-gray-800 fw-bolder d-block fs-6">$<?= $rows2->product_unit_price ?></span>
                                                        </td>
                                                        <td class="text-end pe-0">
                                                            <span class="text-gray-800 fw-bolder d-block fs-6">$<?= $rows2->product_total_price ?></span>
                                                        </td>
                                                    </tr>
                                                <?php
                                                }
                                            } else {
                                                ?>
                                                <tr>
                                                    <td colspan="5">No Orders Found Today</td>
                                                </tr>
                                            <?php
                                            }
                                            ?>
                                        </tbody>


                                    </table>
                                </div>
                            </div>
                            <!--begin::Body-->
                        </div>

                    </div>



                </div>
                <!--end::Wrapper-->

            </div>
            <!--end::Card body-->
        </div>
        <!--end::Card-->

    </div>
    <!--end::Container-->
</div>

<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('templates/admin/_file_manager', $this->data);
$this->load->view('admin/_js', $this->data);
?>


<script>

</script>
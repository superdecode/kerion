<?php
$fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
$fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
$fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
?>
<!--begin::Form-->
<form class="form" id="update_form_<?= $query->id ?>" method="POST" action="<?= base_url('Auth/saveOrder/' . $query->id) ?>" enctype="multipart/form-data">
    <!--begin::Modal header-->
    <div class="modal-header" id="kt_modal_edit_header">
        <!--begin::Modal title-->
        <h2 class="">ORDER : #<?= $query->order_number ?></h2>
        <!--end::Modal title--->
        <!--begin::Close-->
        <div id="" class="btn btn-icon btn-sm btn-active-icon-primary" data-bs-dismiss="modal" aria-label="Close">
            <!--begin::Svg Icon | path: icons/duotone/Navigation/Close.svg-->
            <span class="svg-icon svg-icon-1">
                <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
                    <g transform="translate(12.000000, 12.000000) rotate(-45.000000) translate(-12.000000, -12.000000) translate(4.000000, 4.000000)" fill="#000000">
                        <rect fill="#000000" x="0" y="7" width="16" height="2" rx="1" />
                        <rect fill="#000000" opacity="0.5" transform="translate(8.000000, 8.000000) rotate(-270.000000) translate(-8.000000, -8.000000)" x="0" y="7" width="16" height="2" rx="1" />
                    </g>
                </svg>
            </span>
            <!--end::Svg Icon-->
        </div>
        <!--end::Close-->
    </div>
    <!--end::Modal header-->
    <!--begin::Modal body-->
    <div class="modal-body py-10 px-lg-17 bg-light">
        <!--begin::Scroll-->
        <div class="scroll-y me-n7 pe-7" id="kt_modal_edit_scroll" data-kt-scroll="true" data-kt-scroll-activate="{default: false, lg: true}" data-kt-scroll-max-height="auto" data-kt-scroll-dependencies="#kt_modal_edit_header" data-kt-scroll-wrappers="#kt_modal_edit_scroll" data-kt-scroll-offset="300px">
            <div class=" row">
                <div class="col-md-8 bg-white">
                    <div class="card-body pt-0">
                        <div class="table-responsive hover-scroll-overlay-y" style="height: 350px">
                            <!--begin::Table-->
                            <table class="table align-middle table-row-dashed fs-6 gy-5 mb-0">
                                <thead>
                                    <tr class="text-start text-gray-400 fw-bold fs-7 text-uppercase gs-0">
                                        <th class="min-w-70px text-center">Qty</th>
                                        <th class="min-w-175px">Product</th>
                                        <th class="min-w-100px">Configuration</th>
                                        <th class="min-w-100px text-end">Total</th>
                                    </tr>
                                </thead>
                                <tbody class="fw-semibold text-gray-600">
                                    <?php
                                    if (!empty($query->orderItemList)) {
                                        foreach ($query->orderItemList as $k => $orderItem) {
                                    ?>
                                            <tr>
                                                <td class="text-center">
                                                    <div class="position-relative ps-6 pe-3 py-2">
                                                        <div class="position-absolute start-0 top-0 w-4px h-100 rounded-2 bg-info"></div>
                                                        <a href="javascript:void(0)" class="mb-1 text-dark text-hover-primary fw-bold fs-1"><?= $orderItem->product_quantity ?> x</a>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <div class="ms-5">
                                                            <a href="javascript:void(0)" class="fw-bold text-gray-600 text-hover-primary"><?= $orderItem->product_title ?></a>
                                                            <div class="fs-7 text-muted"><?= $query->order_type ?></div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class=""><?= $orderItem->product_option_name; ?></td>
                                                <td class="text-end"><?= $orderItem->product_total_price ?> </td>
                                            </tr>
                                    <?php
                                        }
                                    }
                                    ?>

                                </tbody>
                            </table>
                            <!--end::Table-->
                        </div>
                    </div>
                </div>
                <div class="col-md-4 ">
                    <div class="card-body pt-0">
                        <span class="card-label text-start text-gray-400 fw-bold fs-7 text-uppercase ">Customer</span>
                        <div class="border border-dashed border-gray-300 rounded px-7 py-3 mb-6 mt-3 bg-white ">
                            <div class="d-flex flex-stack ">
                                <div class="me-3">
                                    <span class="text-dark fs-4"><?= $query->fname . ' ' . $query->lname ?> </a>
                                    </span>
                                </div>
                            </div>
                            <div class="d-flex flex-stack ">
                                <div class="me-3">
                                    <span class="text-dark fs-7">Email:
                                        <a href="javascript:void(0)" class="text-gray-400 fw-bold"> <?= $query->email ?> </a>
                                    </span>
                                </div>
                            </div>
                            <?php if ($query->phone_no != '') { ?>
                                <div class="d-flex flex-stack ">
                                    <div class="me-3">
                                        <span class="text-dark fs-7">Contact No:
                                            <a href="javascript:void(0)" class="text-gray-400 fw-bold"> <?= $query->phone_no ?> </a>
                                        </span>
                                    </div>
                                </div>
                            <?php } ?>
                        </div>
                    </div>
                </div>

            </div>
        </div>
        <!--end::Scroll-->
    </div>
    <!--end::Modal body-->
    <!--begin::Modal footer-->
    <div class="modal-footer ">
        <div class="row w-100 text-end">
            <div class="col-md-8">
                <div class="d-flex flex-stack bg-secondary rounded-3 p-6 ">

                    <div class="fs-6 fw-bold text-white">
                        <span class="d-block lh-1 mb-2">Subtotal</span>
                        <span class="d-block mb-9">Discounts</span>
                        <span class="d-block fs-2qx lh-1">Total</span>
                    </div>
                    <div class="fs-6 fw-bold text-white text-end">
                        <span class="d-block lh-1 mb-2" data-kt-pos-element="total">COP <?= $query->price_subtotal ?></span>
                        <span class="d-block mb-9" data-kt-pos-element="discount">COP -<?= !empty($query->coupon_discount) ? $query->coupon_discount : '0.00' ?></span>
                        <span class="d-block fs-2qx lh-1" data-kt-pos-element="grant-total">
                            <?= $numberString = $fmt->format($query->price_total); ?>
                        </span>
                    </div>

                </div>
            </div>
            <div class="col-md-4 align-bottom">
                <div class="d-flex h-150px pb-4">
                    <?php
                    if ($query->order_status == 'awating_confirmation') {
                    ?>
                        <input type="hidden" name="order_status" value="processing">
                        <button type="submit" class="btn btn-success w-100 align-self-end" data-kt-indicator="off">
                            <span class="indicator-label">Accept Order</span>
                        </button>
                    <?php
                    }else if($query->order_status == 'processing'){
                    ?>
                        <input type="hidden" name="order_status" value="completed">
                        <button type="submit" class="btn btn-success w-100 align-self-end" data-kt-indicator="off">
                            <span class="indicator-label">Deliver Order</span>
                        </button>
                    <?php
                    }else{
                    ?>
                        <button type="button" class="btn btn-success w-100 align-self-end" data-kt-indicator="off">
                            <span class="indicator-label">Delivered</span>
                        </button>
                    <?php
                    }
                    ?>
                </div>

            </div>
        </div>

    </div>
    <!--end::Modal footer-->
</form>
<!--end::Form-->
<script>

</script>
<!--begin::Form-->
<form class="form" id="update_form_<?=$query->id?>" method="POST" action="<?=base_url('Contacts/save/'.$query->id)?>" id="" data-kt-redirect="<?=base_url('Contacts/save/'.$query->id)?>" enctype="multipart/form-data">
<!--begin::Modal header-->
<div class="modal-header" id="kt_modal_edit_header">
<!--begin::Modal title-->
<h2 class="fw-bolder">Guardar estado de comentarios</h2>
<!--end::Modal title-->
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
<div class="modal-body py-10 px-lg-17">
        <!--begin::Scroll-->
<div class="scroll-y me-n7 pe-7" id="kt_modal_edit_scroll" data-kt-scroll="true" data-kt-scroll-activate="{default: false, lg: true}" data-kt-scroll-max-height="auto" data-kt-scroll-dependencies="#kt_modal_edit_header" data-kt-scroll-wrappers="#kt_modal_edit_scroll" data-kt-scroll-offset="300px">
    
            <div class="fv-row mb-7">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="phone_number" class="form-label fs-6 fw-bolder mb-3">Correo Electrónico</label>
            <input type="text" class="form-control form-control-lg form-control-solid" id="phone_number" name="phone_number" value="<?= $query->email ?>"  readonly="true">

            </div>
            </div>
    <div class="fv-row mb-7">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="phone_number" class="form-label fs-6 fw-bolder mb-3">Móvil</label>
            <input type="text" class="form-control form-control-lg form-control-solid" id="phone_number" name="phone_number" value="<?= $query->phone ?>"  readonly="true">

            </div>
            </div>
    <div class="fv-row mb-7">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="phone_number" class="form-label fs-6 fw-bolder mb-3">Mensaje</label>
            <textarea readonly="true" class="form-control form-control-lg form-control-solid" name="address" required="true"><?= $query->message ?></textarea>

            </div>
            </div>
    <div class="fv-row mb-7">
            <div class="fv-row mb-5 fv-plugins-icon-container">
            <label for="phone_number" class="form-label fs-6 fw-bolder mb-3">Tipo de Comentarios</label>
            <input type="text" class="form-control form-control-lg form-control-solid" id="phone_number" name="phone_number" value="<?= $query->feedback_type ?>"  readonly="true">

            </div>
            </div>
    
    
    
        <div class="fv-row mb-7">
                <label class="required fs-6 fw-bold mb-2">Estado</label>
                 <select name="feedback_status" id="status" required="true" class="form-select">
                <option value="">Seleccionar estado</option>  
               
                <option value="solved" <?= ($query->feedback_status == 'solved') ? 'selected' : '' ?>>Resuelto</option>
                <option value="ongoing" <?= ($query->feedback_status == 'ongoing') ? 'selected' : '' ?>>Actual</option>
                <option value="closed" <?= ($query->feedback_status == 'closed') ? 'selected' : '' ?>>Cerrado</option>
                <option value="open" <?= ($query->feedback_status == 'open') ? 'selected' : '' ?>>Apertura</option>
               
            </select>
        </div>
    <?php
    $image = $this->db->select("feedbacks_images.*");
    $this->db->from('feedbacks_images');
    $this->db->where("feedbacks_images.feedback_id",$query->id);
    $query = $this->db->get()->result();
    //echo $this->db->last_query(); 
    //var_dump($datas);
    if(!empty($query)){
    ?>
    <div class="fv-row mb-7">
        <label class="fs-6 fw-bold mb-2">Imágenes de comentarios</label>
    
    <div class="images">
        <?php 
            
            foreach($query as $k=>$data){ 
             $img = base_url('assets/uploads/feedback_images/' . $data->image);    
            ?>
        <div class="photo">
            <img class="img-fluid" src="<?=$img?>" alt="photo" />
        </div>
            <?php } ?>
      
    </div>
    </div>
    <?php }?>
</div>
        <!--end::Scroll-->
</div>
<!--end::Modal body-->
<!--begin::Modal footer-->
<div class="modal-footer flex-center">
<!--begin::Button-->
<button type="reset" class="btn btn-white me-3">Descartar</button>
<!--end::Button-->
<!--begin::Button-->
<button type="submit" class="btn btn-primary" data-kt-indicator="off" >
        <span class="indicator-label">Enviar</span>
        <span class="indicator-progress">Espere por favor...
        <span class="spinner-border spinner-border-sm align-middle ms-2"></span></span>
</button>
<!--end::Button-->
</div>
<!--end::Modal footer-->
</form>
<!--end::Form-->
<style>
        .images {
            display: flex;
            flex-wrap: wrap;
            margin: 0 50px;
            padding: 30px;
        }
  
        .photo {
            max-width: 31.333%;
            padding: 0 10px;
            height: 240px;
        }
  
        .photo img {
            width: 100%;
            height: 100%;
        }
    </style>
<script>

</script>
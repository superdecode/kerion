<!--begin::Form-->
<form class="form" id="update_form_<?=$query->id?>" method="POST" action="<?=base_url('Supports/save/'.$query->id)?>" id="" data-kt-redirect="<?=base_url('Supports/save/'.$query->id)?>" enctype="multipart/form-data">
	<div class="flex-lg-row-fluid  ">
		<!--begin::Messenger-->
		<div class="card " id="kt_chat_messenger">
			
			<!--begin::Card body-->
			<div class="card-body" id="kt_chat_messenger_body">
				<!--begin::Messages-->
				<div class="scroll-y me-n5 pe-5 h-600px mh-300px h-lg-auto" data-kt-element="messages" data-kt-scroll="true" data-kt-scroll-activate="{default: false, lg: true}" data-kt-scroll-max-height="auto" data-kt-scroll-dependencies="#kt_header, #kt_toolbar, #kt_footer, #kt_chat_messenger_header, #kt_chat_messenger_footer" data-kt-scroll-wrappers="#kt_content, #kt_chat_messenger_body" data-kt-scroll-offset="300px" id="message_box">
					<?php
						//pr($query);
						if(!empty($query)){
							$Logged_sender_id = $this->session->userdata('user_id');
							foreach($query as $k=>$chat){
								if (!empty($chat->sender_profile_image)) {
									$sender_profile_img = base_url('assets/uploads/user_images/' . $chat->sender_profile_image);
								} else {
									$sender_profile_img = base_url('assets/admin/media/avatars/blank.png');
								}
								$message = $chat->message;
								$messagedatetime = date('d M h:i A',strtotime($chat->addedOn));
								if($Logged_sender_id!=$chat->sender_id){
						?>
						<div class="d-flex justify-content-start mb-10">
							<div class="d-flex flex-column align-items-start">
								<div class="d-flex align-items-center mb-2">
									<div class="symbol symbol-35px symbol-circle"> <img alt="Pic" src="<?=$sender_profile_img?>"> </div>
									<div class="ms-3"> <a href="javascript:void(0)" class="fs-5 fw-bolder text-gray-900 text-hover-primary me-1"><?=$sender?></a> <span class="text-muted fs-7 mb-1"><?=$messagedatetime?></span> </div>
								</div>
								<div class="p-5 rounded bg-light-info text-dark fw-bold mw-lg-600px text-start" data-kt-element="message-text"><?=$message?></div>
							</div>
						</div>
						<?php
								}else{
						?>
						<div class="d-flex justify-content-end mb-10">
							<div class="d-flex flex-column align-items-end">
								<div class="d-flex align-items-center mb-2">
									<div class="me-3"> <span class="text-muted fs-7 mb-1"><?=$messagedatetime?></span> <a href="javascript:void(0)" class="fs-5 fw-bolder text-gray-900 text-hover-primary ms-1">You</a> </div>
									<div class="symbol symbol-35px symbol-circle"> <img alt="Pic" src="<?=$sender_profile_img?>"> </div>
								</div>
								<div class="p-5 rounded bg-light-primary text-dark fw-bold mw-lg-600px text-start" data-kt-element="message-text"><?=$message?></div>
							</div>
						</div>
						<?php
								}
							}
						}
						?>	 
					
					
				</div>
				
			</div>
			<div class="card-footer pt-4" id="kt_chat_messenger_footer">
				<input type="hidden" id="receiver_id" name="receiver_id" value="<?=$sender_id?>">
				<input type="hidden" id="sender_id" name="sender_id" value="<?=$receiver_id?>">
				<textarea class="form-control mb-3" rows="5" placeholder="Type a message" name="message" id="message" required></textarea>						
				<div class="d-flex flex-stack">
					
					<div class="d-flex align-items-center me-2">
						<button class="btn btn-sm btn-icon btn-active-light-primary me-1 d-none" type="button" data-bs-toggle="tooltip" title="" data-bs-original-title="Coming soon">
							<i class="bi bi-paperclip fs-3"></i>
						</button>
						<button class="btn btn-sm btn-icon btn-active-light-primary me-1 d-none" type="button" data-bs-toggle="tooltip" title="" data-bs-original-title="Coming soon">
							<i class="bi bi-upload fs-3"></i>
						</button>
					</div>
					
					<button class="btn btn-primary" type="submit" >Send</button>
					
				</div>
				
			</div>
			
		</div>
				
				
					
	</div>
</form>
<!--end::Form-->
<script>

</script>
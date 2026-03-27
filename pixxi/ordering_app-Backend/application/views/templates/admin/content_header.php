<?php
$image = get_settings_value('logo');
if (!empty($image)) {
	$sys_img = base_url('assets/uploads/system_images/' . $image);
} else {
	$sys_img = base_url('assets/admin/dist/media/logos/logo-default.png');
} 

?> 
<!--begin::Wrapper-->
<div class="wrapper d-flex flex-column flex-row-fluid " id="kt_wrapper">
	<!--begin::Header-->
	<div id="kt_header" style="" class="header align-items-stretch d-print-none">
		<!--begin::Container-->
		<div class="container-fluid d-flex align-items-stretch justify-content-between">
			<!--begin::Aside mobile toggle-->
			<div class="d-flex align-items-center d-lg-none ms-n3 me-1" title="Show aside menu">
				<div class="btn btn-icon btn-active-light-primary" id="kt_aside_mobile_toggle">
					<!--begin::Svg Icon | path: icons/duotone/Text/Menu.svg-->
					<span class="svg-icon svg-icon-2x mt-1">
						<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
							<g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
								<rect x="0" y="0" width="24" height="24" />
								<rect fill="#000000" x="4" y="5" width="16" height="3" rx="1.5" />
								<path d="M5.5,15 L18.5,15 C19.3284271,15 20,15.6715729 20,16.5 C20,17.3284271 19.3284271,18 18.5,18 L5.5,18 C4.67157288,18 4,17.3284271 4,16.5 C4,15.6715729 4.67157288,15 5.5,15 Z M5.5,10 L18.5,10 C19.3284271,10 20,10.6715729 20,11.5 C20,12.3284271 19.3284271,13 18.5,13 L5.5,13 C4.67157288,13 4,12.3284271 4,11.5 C4,10.6715729 4.67157288,10 5.5,10 Z" fill="#000000" opacity="0.3" />
							</g>
						</svg>
					</span>
					<!--end::Svg Icon-->
				</div>
			</div>
			<!--end::Aside mobile toggle-->
			<!--begin::Mobile logo-->
			<div class="d-flex align-items-center flex-grow-1 flex-lg-grow-0">
				<a href="<?=base_url()?>" class="d-lg-none">
					<img alt="Logo" src="<?=$sys_img?>" class="h-30px" />
				</a>
			</div>
			<!--end::Mobile logo-->
			<!--begin::Wrapper-->
			<div class="d-flex align-items-stretch justify-content-between flex-lg-grow-1">
				<!--begin::Breadcrumb-->
				<div class="page-title d-flex align-items-center me-3 flex-wrap mb-5 mb-lg-0 lh-1">
					<!--begin::Title-->
					<h1 class="d-flex align-items-center text-dark fw-bolder my-1 fs-3"></h1>
					<!--end::Title-->
					
				</div>
				<!--end::Breadcrumb-->
				<!--begin::Topbar-->
				<div class="d-flex align-items-stretch flex-shrink-0">
					<!--begin::Toolbar wrapper-->
					<div class="d-flex align-items-stretch flex-shrink-0">
						<?php 
							$image = $this->session->userdata('user_image');
							if (!empty($image)) {
								$img = base_url('assets/uploads/user_images/' . $image);
							} else {
								$img = base_url('assets/admin/media/avatars/blank.png');
							} 
						?>
						<!--begin::User-->
						<div class="d-flex align-items-center ms-1 ms-lg-3" id="kt_header_user_menu_toggle">
							<!--begin::Menu-->
							<div class="cursor-pointer symbol symbol-30px symbol-md-50px" data-kt-menu-trigger="click" data-kt-menu-attach="parent" data-kt-menu-placement="bottom-end" data-kt-menu-flip="bottom">
								<img src="<?=$img?>" alt="<?=$this->session->userdata('user_fname'); ?>" />
							</div>
							<!--begin::Menu-->
							<div class="menu menu-sub menu-sub-dropdown menu-column menu-rounded menu-gray-600 menu-state-bg-light-primary fw-bold py-4 fs-6 w-275px" data-kt-menu="true">
								<!--begin::Menu item-->
								<div class="menu-item px-3">
									<div class="menu-content d-flex align-items-center px-3">
										<!--begin::Avatar-->
										<div class="symbol symbol-50px me-5">
											<img alt="Logo" src="<?=$img?>" />
										</div>
										<!--end::Avatar-->
										<!--begin::Username-->
										<div class="d-flex flex-column">
											<div class="fw-bolder d-flex align-items-center fs-5"><?php echo $this->session->userdata('user_fname').' '.$this->session->userdata('user_lname'); ?>
											<span class="badge badge-light-success fw-bolder fs-8 px-2 py-1 ms-2"></span></div>
											<a href="#" class="fw-bold text-muted text-hover-primary fs-7"><?php echo $this->session->userdata('user_login_id'); ?></a>
										</div>
										<!--end::Username-->
									</div>
								</div>
								<!--end::Menu item-->
								<!--begin::Menu separator-->
								<div class="separator my-2"></div>
								<!--end::Menu separator-->
								<!--begin::Menu item-->
								<div class="menu-item px-5">
									<a href="<?=base_url('Users/profile')?>" class="menu-link px-5">Detalles del Perfil</a>
								</div>
								<!--end::Menu item-->
								
								<!--begin::Menu item-->
								<div class="menu-item px-5 my-1 d-none">
									<a href="<?=base_url('Users/account_settings')?>" class="menu-link px-5">Configuraciones de la cuenta</a>
								</div>
								<!--end::Menu item-->
								<!--begin::Menu item-->
								<div class="menu-item px-5">
									<a href="<?=base_url('Auth/logout')?>" class="menu-link px-5">Cerrar Sesión</a>
								</div>
								<!--end::Menu item-->
							</div>
							<!--end::Menu-->
							<!--end::Menu-->
						</div>
						<!--end::User -->
						
					</div>
					<!--end::Toolbar wrapper-->
				</div>
				<!--end::Topbar-->
			</div>
			<!--end::Wrapper-->
		</div>
		<!--end::Container-->
	</div>
	<!--end::Header-->
	<!--begin::Content-->
	<div class="content d-flex flex-column flex-column-fluid" id="kt_content">
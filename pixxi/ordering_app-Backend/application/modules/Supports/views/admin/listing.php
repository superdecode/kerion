<!--begin::Toolbar-->
<div class="toolbar" id="kt_toolbar">
	<!--begin::Container-->
	<div id="kt_toolbar_container" class="container-fluid d-flex flex-stack">
		<!--begin::Page title-->
		<div data-kt-place="true" data-kt-place-mode="prepend" data-kt-place-parent="{default: '#kt_content_container', 'lg': '#kt_toolbar_container'}" class="page-title d-flex align-items-left me-3 flex-wrap mb-5 mb-lg-0 lh-1">
			<!--begin::Title-->
			<h1 class="d-flex align-items-center text-dark fw-bolder my-1 fs-3">Mesajlar<?php//=$header['site_title']?></h1>
			<!--end::Title-->
			<!--begin::Separator-->
			<span class="h-20px border-gray-200 border-start mx-4"></span>
			<!--end::Separator-->
			<!--begin::Breadcrumb-->
			<ul class="breadcrumb breadcrumb-separatorless fw-bold fs-7 my-1">
				<!--begin::Item-->
				<li class="breadcrumb-item text-muted">
					<a href="<?=base_url()?>" class="text-muted text-hover-primary">Ana sayfa</a>
				</li>
				<!--end::Item-->
								
				<!--begin::Item-->
				<li class="breadcrumb-item">
					<span class="bullet bg-gray-200 w-5px h-2px"></span>
				</li>
				<!--end::Item-->
				<!--begin::Item-->
				<li class="breadcrumb-item text-dark">Mesajlar<?php//=$header['site_title']?></li>
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
			<!--begin::Card header-->
			<div class="card-header border-0 pt-6">
				<!--begin::Card title-->
				<div class="card-title">
					<!--begin::Search-->
					<div class="d-flex align-items-center position-relative my-1">
						<!--begin::Svg Icon | path: icons/duotone/General/Search.svg-->
						<span class="svg-icon svg-icon-1 position-absolute ms-6">
							<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
								<g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
									<rect x="0" y="0" width="24" height="24" />
									<path d="M14.2928932,16.7071068 C13.9023689,16.3165825 13.9023689,15.6834175 14.2928932,15.2928932 C14.6834175,14.9023689 15.3165825,14.9023689 15.7071068,15.2928932 L19.7071068,19.2928932 C20.0976311,19.6834175 20.0976311,20.3165825 19.7071068,20.7071068 C19.3165825,21.0976311 18.6834175,21.0976311 18.2928932,20.7071068 L14.2928932,16.7071068 Z" fill="#000000" fill-rule="nonzero" opacity="0.3" />
									<path d="M11,16 C13.7614237,16 16,13.7614237 16,11 C16,8.23857625 13.7614237,6 11,6 C8.23857625,6 6,8.23857625 6,11 C6,13.7614237 8.23857625,16 11,16 Z M11,18 C7.13400675,18 4,14.8659932 4,11 C4,7.13400675 7.13400675,4 11,4 C14.8659932,4 18,7.13400675 18,11 C18,14.8659932 14.8659932,18 11,18 Z" fill="#000000" fill-rule="nonzero" />
								</g>
							</svg>
						</span>
						<!--end::Svg Icon-->
						<input type="text" data-kt-listing-table-filter="search" class="form-control form-control-solid w-250px ps-15" placeholder="ara" />
					</div>
					<!--end::Search-->
				</div>
				<!--begin::Card title-->
				<!--begin::Card toolbar-->
				<div class="card-toolbar">
					<!--begin::Toolbar-->
					<div class="d-flex justify-content-end" data-kt-listing-table-toolbar="base">
						
						
					</div>
					<!--end::Toolbar-->
					<!--begin::Group actions-->
					<div class="d-flex justify-content-end align-items-center d-none" data-kt-listing-table-toolbar="selected">
						<div class="fw-bolder me-5">
						<span class="me-2" data-kt-listing-table-select="selected_count"></span>Selected</div>
						<button type="button" class="btn btn-danger" data-kt-listing-table-select="delete_selected">Delete Selected</button>
					</div>
					<!--end::Group actions-->
				</div>
				<!--end::Card toolbar-->
			</div>
			<!--end::Card header-->
			<!--begin::Card body-->
			<div class="card-body pt-0">
				<!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert');?><!--END::ALERT MESSAGE -->
				<!--begin::Table-->
				<table class="table align-middle table-row-dashed fs-6 gy-5" id="kt_listing_table">
					<!--begin::Table head-->
					<thead>
						<!--begin::Table row-->
						<tr class="text-start text-gray-400 fw-bolder fs-7 gs-0">
							<th class="w-10px pe-2">
								<div class="form-check form-check-sm form-check-custom form-check-solid me-3 d-none">
									<input class="form-check-input" type="checkbox" data-kt-check="true" data-kt-check-target="#kt_listing_table .form-check-input" value="" />
								</div>
								#
							</th>
							<th class="">gönderen</th>
							<th class="">tarih // saat</th>
							<th class="">mesaj</th>
							<th class="text-end min-w-70px">seç</th>
						</tr>
						<!--end::Table row-->
					</thead>
					<!--end::Table head-->
					<!--begin::Table body-->
					<tbody class="fw-bold text-gray-600">
					<?php
					if(!empty($datas)){
						foreach($datas as $k=> $rows)
						{
							$id = base64_encode($rows->id);
							$edit_link = base_url('Supports/save/'.$id);
							$delete_link = base_url('Supports/remove/'.$id);
							$status_link = base_url('Supports/statusChange/'.$id);
							$query = $this->Support_model->getChatList($rows->receiver_id,$rows->sender_id);
							$edit['query']=$query;
							$edit['receiver_id']=$rows->receiver_id;
							$edit['sender_id']=$rows->sender_id;
							
					?>
						<tr id="tr_<?=$rows->id?>">							
							<td>
								<div class="form-check form-check-sm form-check-custom form-check-solid d-none">
									<input class="form-check-input removeData" type="checkbox" value="<?=$rows->id?>" />
								</div>
								<?=$k+1?>
							</td>
							<td><?=$rows->sender_full_name?></td>
							<td><?=date('d.m.Y, h:i A',strtotime($rows->modifiedOn))?></td>
							<td><?=$rows->message?></td>  
							
							<td class="text-end">								
								<button type="button" class="btn btn-sm btn-icon btn-light btn-active-light-primary me-1" data-bs-toggle="modal" data-bs-target="#kt_modal_edit<?=$rows->id?>">
									<i class="fas fa-comment-alt fs-4"></i>
									
								</button>
							</td>
						</tr>
						<!--begin::Modal - Edit-->
						<div class="modal fade " id="kt_modal_edit<?=$rows->id?>" tabindex="-1" aria-hidden="true">
							<!--begin::Modal dialog-->
							<div class="modal-dialog modal-dialog-centered mw-800px">
								<!--begin::Modal content-->
								<div class="modal-content">
									<!--begin::Form-->
									<?php $this->load->view('admin/save', $edit); ?>
									<!--end::Form-->											
								</div>
							</div>
						</div>
						<!--end::Modal -->
					<?php
						}
					}
					?>	
					</tbody>
					<!--end::Table body-->
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
$this->load->view('admin/_js', $this->data);
?>

<?php defined('BASEPATH') or exit('No direct script access allowed'); ?>
<link rel="stylesheet" href="<?php echo base_url('assets/admin/plugins/custom-uploader/vendors.css'); ?>">
<link rel="stylesheet" href="<?php echo base_url('assets/admin/plugins/custom-uploader/aiz-core.css'); ?>">
<script src="<?php echo base_url('assets/admin/plugins/custom-uploader/aiz-core.js'); ?>"></script>
<script src="<?php echo base_url('assets/admin/plugins/custom-uploader/uppy.js'); ?>"></script>

<div class="modal fade" id="aizUploaderModal" data-bs-backdrop="static" role="dialog" aria-hidden="true" >
	<div class="modal-dialog modal-adaptive" role="document">
		<div class="modal-content h-100">
			<div class="modal-header pb-0 bg-light">
				<div class="uppy-modal-nav">
					<ul class="nav nav-tabs border-0">
						<li class="nav-item">
							<a class="nav-link active font-weight-medium text-dark" data-bs-toggle="tab" href="#aiz-select-file">Select File</a>
						</li>
						<li class="nav-item">
							<a class="nav-link font-weight-medium text-dark" data-bs-toggle="tab" href="#aiz-upload-new">Upload New</a>
						</li>
					</ul>
				</div>
				<button class="btn btn-icon btn-sm btn-active-icon-primary" data-bs-dismiss="modal" aria-label="Close">
					<!--begin::Svg Icon | path: icons/duotone/Navigation/Close.svg-->
					<span class="svg-icon svg-icon-1">
						<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
							<g transform="translate(12.000000, 12.000000) rotate(-45.000000) translate(-12.000000, -12.000000) translate(4.000000, 4.000000)" fill="#000000">
								<rect fill="#000000" x="0" y="7" width="16" height="2" rx="1"></rect>
								<rect fill="#000000" opacity="0.5" transform="translate(8.000000, 8.000000) rotate(-270.000000) translate(-8.000000, -8.000000)" x="0" y="7" width="16" height="2" rx="1"></rect>
							</g>
						</svg>
					</span>
					<!--end::Svg Icon-->
				</button>
			</div>
			<div class="modal-body">
				<div class="tab-content h-100">
					<div class="tab-pane active h-100" id="aiz-select-file">
						<div class="aiz-uploader-filter pt-1 pb-3 border-bottom mb-4">
							<div class="row align-items-center gutters-5 gutters-md-10 position-relative">
								<div class="col-xl-2 col-md-3 col-5">
									<div class="">
										<!-- Input -->
										<select class="form-control form-control-xs aiz-selectpicker" name="aiz-uploader-sort">
											<option value="newest" selected>Sort by newest</option>
											<option value="oldest">Sort by oldest</option>
											<option value="smallest">Sort by smallest</option>
											<option value="largest">Sort by largest</option>
										</select>
										<!-- End Input -->
									</div>
								</div>
								<div class="col-md-3 col-5 ">
									<div class="custom-control custom-radio">
										<input type="checkbox" class="custom-control-input" name="aiz-show-selected" id="aiz-show-selected" name="stylishRadio">
										<label class="custom-control-label" for="aiz-show-selected">
										Selected Only
										</label>
									</div>
								</div>
								<div class="col-md-4 col-xl-3 ml-auto mr-0 col-2 position-static">
									<div class="aiz-uploader-search text-right">
										<input type="text" class="form-control form-control-xs" name="aiz-uploader-search" placeholder="Search your files">
										<i class="search-icon d-md-none"><span></span></i>
									</div>
								</div>
							</div>
						</div>
						<div class="aiz-uploader-all clearfix c-scrollbar-light">
							<div class="align-items-center d-flex h-100 justify-content-center w-100">
								<div class="text-center">
									<h3>No files found</h3>
								</div>
							</div>
						</div>
					</div>

					<div class="tab-pane h-100" id="aiz-upload-new">
						<div id="aiz-upload-files" class="h-100">
						</div>
					</div>
				</div>
			</div>
			<div class="modal-footer justify-content-between bg-light">
				<div class="flex-grow-1 overflow-hidden d-flex">
					<div class="">
						<div class="aiz-uploader-selected">0 File selected</div>
						<button type="button" class="btn-link btn btn-sm p-0 aiz-uploader-selected-clear">Clear</button>
					</div>
					<div class="mb-0 ml-3 d-none">
						<button type="button" class="btn btn-sm btn-primary" id="uploader_prev_btn">Prev</button>
						<button type="button" class="btn btn-sm btn-primary" id="uploader_next_btn">Next</button>
					</div>
				</div>
				<button type="button" class="btn btn-sm btn-primary" data-toggle="aizUploaderAddSelected" data-bs-dismiss="modal">Add Files</button>
			</div>
		</div>
	</div>
</div>

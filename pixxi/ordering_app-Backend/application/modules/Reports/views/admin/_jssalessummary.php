<script>
var table = $('#kt_listing_table').DataTable({
    
			info: false,
			drawCallback: function(){
				$('.page-link').attr('onclick',"return false");
			},
			order: [],
			columnDefs: [
				{
					//orderable: !1,
					//targets: [12]
				},
				{
					orderable: !1,
					targets: [0,1,2]
				}
			
			],
			buttons: [
				{
					extend: 'print',
					exportOptions: {
						columns: ':visible',
						rows: ':visible'
					}
				},{
					extend: 'copyHtml5',
					exportOptions: {
						columns: ':visible',
						rows: ':visible'
					}
				},{
					extend: 'excelHtml5',
					exportOptions: {
						columns: ':visible',
						rows: ':visible'
					}
				},{
					extend: 'csvHtml5',
					exportOptions: {
						columns: ':visible',
						rows: ':visible'
					}
				},{
					extend: 'pdfHtml5',
					exportOptions: {
						columns: ':visible',
						rows: ':visible'
					}
				}
			]
			
		});
"use strict";
var KTDatatablesExtensionButtons = function() {
	var initTable2 = function() {

		// begin first table
		
		
		// Custom Search //
		document.querySelector('[data-kt-listing-table-filter="search"]').addEventListener("keyup", (function (e) {table.search(e.target.value).draw() }));
		
		$('#export_print').on('click', function(e) {
			e.preventDefault();
			table.button(0).trigger();
		});

		$('#export_copy').on('click', function(e) {
			e.preventDefault();
			table.button(1).trigger();
		});

		$('#export_excel').on('click', function(e) {
			e.preventDefault();
			table.button(2).trigger();
		});

		$('#export_csv').on('click', function(e) {
			e.preventDefault();
			table.button(3).trigger();
		});

		$('#export_pdf').on('click', function(e) {
			e.preventDefault();
			table.button(4).trigger();
		});

	};

	return {

		//main function to initiate the module
		init: function() {
			initTable2();
		},

	};

}();

jQuery(document).ready(function() {
	KTDatatablesExtensionButtons.init();
});

</script>
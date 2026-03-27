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
			
		})
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


function removeData(id){			
	Swal.fire({
		text: "Are you sure you want to delete selected items?",
		icon: "warning",
		showCancelButton: !0,
		buttonsStyling: !1,
		confirmButtonText: "Yes, delete!",
		cancelButtonText: "No, cancel",
		customClass: {
			confirmButton: "btn fw-bold btn-danger",
			cancelButton: "btn fw-bold btn-active-light-primary"
		}
	}).then((function (o) {
		o.value ? Swal.fire({
			text: "You have deleted the item!.",
			icon: "success",
			buttonsStyling: !1,
			confirmButtonText: "Ok, got it!",
			customClass: {
				confirmButton: "btn fw-bold btn-primary"
			}
		}).then((function () {
			$.ajax({
				type: 'POST',
				url: "<?= base_url('Shipments/remove') ?>" + "/" + id,
				data: '',
				success: function (result) {
					//console.log(result);
				}
			});
			table.row($('#tr_'+id)).remove().draw();
			
			
		})) : "cancel" === o.dismiss && Swal.fire({
			text: "Selected items was not deleted.",
			icon: "error",
			buttonsStyling: !1,
			confirmButtonText: "Ok, got it!",
			customClass: {
				confirmButton: "btn fw-bold btn-primary"
			}
		})
	}))
}

function getStateList(id,type,i) {
	if (id != '') {
		$.ajax({
			type: 'POST',
			url: "<?= base_url('Shipments/getStateList') ?>" + "/" + id,
			data: '',
			success: function (result) {
				console.log(result);
				if(type=='from'){
					$('#from_state'+i).html(result);
				}else{
					$('#to_state'+i).html(result);
				}
			}
		});
	}
}
function getCityList(id,type,i) {
	if (id != '') {
		$.ajax({
			type: 'POST',
			url: "<?= base_url('Shipments/getCityList') ?>" + "/" + id,
			data: '',
			success: function (result) {
				//console.log(result);
				if(type=='from'){
					$('#from_city'+i).html(result);
				}else{
					$('#to_city'+i).html(result);
				}
			}
		});
	}
}

function checkDivisor(id,val){
	//var html = '';
	if(val=='1'){
		html= '<option value="5000">5000</option><option value="6000">6000</option>';
	}else{
		html= '<option value="139">139</option><option value="166">166</option>';
	}
	console.log(html);
	$('#divisors_'+id).html(html);
}
function calculateShippingCost(id){
	//event.preventDefault(); 
	var formValues= $('#calc_form_'+id).serialize();
	//console.log(formValues);
	$.ajax({
		type: 'POST',
		url: "<?= base_url('Shipments/calculateShippingCost') ?>" + "/" + id,
		data: formValues,
		success: function (result) {
			result = $.parseJSON(result);
			//console.log(result);
			$('#final_shipment_cost_span_'+id).html(result.shipping_cost);
			$('#final_shipment_cost_'+id).val(result.shipping_cost);
			
			$('#final_box_cost_span_'+id).html(result.box_cost);
			$('#final_box_cost_'+id).val(result.box_cost);
			
			$('#final_insurance_cost_span_'+id).html(result.insurance_cost);
			$('#final_insurance_cost_'+id).val(result.insurance_cost);
		}
	});
	
	
}
//*******Clone**************************
function clone(id,e){
	var updatedIndex = parseInt($(".clone-repeat").length)+1;
    $("#dimention_div_"+id+"_1").clone()
		.removeClass("d-none")
		.appendTo("#clone_repeter_"+id)
		.attr("id", "dimention_div_"+id+"_" +  updatedIndex)
		.show(1000)
		//.data("index", updatedIndex)
		.find("*");
		$("#dimention_div_"+id+"_" +  updatedIndex).find('.form-control').val('');
		$("#dimention_div_"+id+"_" +  updatedIndex).find('.remove').attr('onclick',"removeClone('"+id+"','"+updatedIndex+"')");
		$("#dimention_div_"+id+"_" +  updatedIndex).find('.box_dimentions_value').attr('onchange',"getVolumeValue('"+id+"','"+updatedIndex+"')");
		$("#dimention_div_"+id+"_" +  updatedIndex).find('.box_dimentions_value').attr('onblur',"getVolumeValue('"+id+"','"+updatedIndex+"')");
		$("#dimention_div_"+id+"_" +  updatedIndex).find('.remove').removeClass('d-none');
}
function removeClone(id,i){
	var $target = $("#dimention_div_"+id+"_"+i);
	if(i>1){
		$target.hide('slow', function(){ $target.remove(); });
	}else{
		alert("You can't remove this ");
		return false;
	}
}
function getVolumeValue(id,i){
	var vol = 1;
	$("#dimention_div_"+id+"_" +  i).find('.box_dimentions_value').each(function(i) {
		vol = vol * $( this ).val();
	});
	$("#dimention_div_"+id+"_" +  i).find('.box_volume_value').val(vol);
}

$('#precal').click(function(){
    var curdate= $("#curent_date").val();
    
    var newdate = new Date(curdate);
    newdate.setDate(newdate.getDate() - 1);
    var nd = new Date(newdate);
    var MyDateString = nd.getFullYear() + '-' + ('0' + (nd.getMonth()+1)).slice(-2) + '-' + ('0' + nd.getDate()).slice(-2);
    $('#curent_date').val(MyDateString);
    $('#search_form').submit();
    
});

$('#nextcal').click(function(){
    var curdate= $("#curent_date").val();
    
    var newdate = new Date(curdate);
    newdate.setDate(newdate.getDate() + 1);
    var nd = new Date(newdate);
    var MyDateString = nd.getFullYear() + '-' + ('0' + (nd.getMonth()+1)).slice(-2) + '-' + ('0' + nd.getDate()).slice(-2);
    $('#curent_date').val(MyDateString);
    $('#search_form').submit();
    
});


</script>
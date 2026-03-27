<script>
var table = $('#kt_listing_table').DataTable({
	info: 1,
	drawCallback: function(){
		$('.page-link').attr('onclick',"return false");
	},
	order: [],
	columnDefs: [{
		orderable: !1,
		targets: [0,1,6]
	}],
	"oLanguage": {
        "sEmptyTable": "No Product"
    }
});
"use strict";
var KTDataList = function () {
	var t, e, o, n, c = () => {
			
		},
		r = () => {
			const e = n.querySelectorAll('[type="checkbox"]'),
				o = document.querySelector('[data-kt-listing-table-select="delete_selected"]');
			e.forEach((t => {
				t.addEventListener("click", (function () {
					setTimeout((function () {
						l()
					}), 50)
				}))
			})), o.addEventListener("click", (function () {
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
						text: "You have deleted all selected items!.",
						icon: "success",
						buttonsStyling: !1,
						confirmButtonText: "Ok, got it!",
						customClass: {
							confirmButton: "btn fw-bold btn-primary"
						}
					}).then((function () {
						$('.removeData').each(function () {
							var id = (this.checked ? $(this).val() : "");
							if(id!=''){
								$.ajax({
									type: 'POST',
									url: "<?= base_url('Products/remove') ?>" + "/" + id,
									data: '',
									success: function (result) {
										//console.log(result);
									}
								});
							}
						});
						e.forEach((e => {
							e.checked && table.row($(e.closest("tbody tr"))).remove().draw()
						}));
						n.querySelectorAll('[type="checkbox"]')[0].checked = !1
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
			}))
		};
	const l = () => {
		const table = document.querySelector('[data-kt-listing-table-toolbar="base"]'),
			e = document.querySelector('[data-kt-listing-table-toolbar="selected"]'),
			o = document.querySelector('[data-kt-listing-table-select="selected_count"]'),
			c = n.querySelectorAll('tbody [type="checkbox"]');
		let r = !1,
			l = 0;
		c.forEach((table => {
			table.checked && (r = !0, l++)
		})), r ? (o.innerHTML = l, table.classList.add("d-none"), e.classList.remove("d-none")) : (table.classList.remove("d-none"), e.classList.add("d-none"))
	};
	return {
		init: function () {
			(n = document.querySelector("#kt_listing_table")) && (n.querySelectorAll("tbody tr").forEach((table => {
				
			})), (table).on("draw", (function () {
				r(), c(), l()
			})), r(), document.querySelector('[data-kt-listing-table-filter="search"]').addEventListener("keyup", (function (e) {
				table.search(e.target.value).draw()
			})))
		}
	}
}();
KTUtil.onDOMContentLoaded((function () {
	KTDataList.init()
}));

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
				url: "<?= base_url('Products/remove') ?>" + "/" + id,
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

$(".editor").each(function(){
    CKEDITOR.replace(this,{});
});

// date & time
$(".flatpickr-input").flatpickr({
	enableTime:false,
	dateFormat:"d/m/Y",
	minDate: "<?=date('d/m/Y', strtotime(' +1 day'))?>",
	//disable:true
	//mode: "range",
	onChange: function(selectedDates, dateStr, instance) {
		dateStr = new Date(selectedDates).toISOString()
		//console.log(dateStr);
		//console.log( moment(dateStr).format('YYYY-MM-DD') );
	   $('#enable_date').val(moment(dateStr).format('YYYY-MM-DD'));
    }
});

function clone_each_task(e){ 
  
	var updatedIndex = parseInt($(".clone_each_repeat").length)+1;
	//alert(updatedIndex);
    $("#clone_each_repeat_1").clone()
		.appendTo("#clone_each_repeter")
		.attr("id", "clone_each_repeat_" +  updatedIndex)
		.removeClass("d-none")
		.show(1000)
		//.data("index", updatedIndex)
		.find("*");
		$("#clone_each_repeat_" +  updatedIndex).find('.form-control').val('');
               $("#clone_each_repeat_" +  updatedIndex).find('#size_1').attr('id','size_'+updatedIndex);
		$("#clone_each_repeat_" +  updatedIndex).find('#price_1').attr('id','price_'+updatedIndex);
                $("#clone_each_repeat_" +  updatedIndex).find('#stock_1').attr('id','stock_'+updatedIndex);
                $("#clone_each_repeat_" +  updatedIndex).find('#sku_1').attr('id','sku_'+updatedIndex);
		$("#clone_each_repeat_" +  updatedIndex).find('.remove').attr('onclick',"removeRow('"+updatedIndex+"')");	
		
		
		
}

function removeRow(i){ 
	if (i == 1) alert("There only one row you can't delete.");
	else {
		var $target = $("#clone_each_repeat_"+i);
		$target.hide('slow', function(){ $target.remove(); });
	}
}
function removeVariation(id, i){			
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
				url: "<?= base_url('Products/removeEachVariation') ?>" + "/" + id,
				data: '',
				success: function (result) {
					//console.log(result);
				}
			});
                        //$("#clone_repeat_" +  updatedIndex).find('.remove').attr('onclick',"removeRow('"+updatedIndex+"')");
			//table.row($('#clone_repeat_'+i)).remove().draw();
                        var $target = $("#clone_each_repeat_"+i);
		        $target.hide('slow', function(){ $target.remove(); });
                       
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
</script>
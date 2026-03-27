<script>
function copyUrl(e) {
	var url = $(e).data('url');
	var $temp = $("<input>");
	$("body").append($temp);
	$temp.val(url).select();
	try {
		document.execCommand("copy");
		alert('success', 'Enlace copiado al portapapeles');
	} catch (err) {
		alert('danger', 'Vaya, no se puede copiar');
	}
	$temp.remove();
}

</script>

<script type="text/javascript">  
    $(document).ready(function () {  
    
   
        $('#delete_all').on('click', function(e) {  
           
            var allVals = [];    
            $(".sub_chk:checked").each(function() {
                $("#delete_but").show();
                var checked = ($(this).val());
                allVals.push(checked); 
            });    
   
            if(allVals.length <=0)    
            {    
                alert("Please select image.");    
            }  else {    
   
                var check = confirm("¿Estás segura de que quieres eliminar?");    
                if(check == true){    
   
                    var join_selected_values = allVals.join(",");   
                    //alert(join_selected_values);
                    $.ajax({  
                        //url: "<?= base_url('Files/delete_multiple') ?>" + "/" + join_selected_values, 
                         url: $(this).data('url'),
                        type: 'POST',  
                        data: 'ids='+join_selected_values,  
                        success: function (data) {  
                          console.log(data);  
                          $(".sub_chk:checked").each(function() {    
                              $(this).parents("tr").remove();  
                          });  
                          alert("Images Deleted successfully.");  
                        },  
                        error: function (data) {  
                            alert(data.responseText);  
                        }  
                    });  
   
                  $.each(allVals, function( index, value ) {  
                      //$('table tr').filter("[data-row-id='" + value + "']").remove(); 
                      $( "#rows_"+value).remove();
                  });   
                }    
            }    
        });  
    });  
</script>  
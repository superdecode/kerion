<script>

$(".flatpickr-input").flatpickr({
dateFormat:"Y-m-d",

});

$(".flatpickr-input-end").flatpickr({
dateFormat:"Y-m-d",

});
$('.flatpickr-input').on('change', function(){
    var dateget= $(this).val() ;
    //alert(dateget);

    $(".flatpickr-input-end").flatpickr({
         dateFormat:"Y-m-d",
         minDate: dateget

    });
});
</script>
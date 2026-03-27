<!--begin::Javascript-->

<!--begin::Global Javascript Bundle(used by all pages)-->
<script src="<?=base_url('assets/admin/plugins/global/plugins.bundle.js')?>"></script>
<script src="<?=base_url('assets/admin/js/scripts.bundle.js')?>"></script>
<!--end::Global Javascript Bundle-->

<!--begin::Page Vendors Javascript(used by this page)-->
<script src="<?=base_url('assets/admin/plugins/custom/datatables/datatables.bundle.js')?>"></script>
<!--end::Page Vendors Javascript-->
<!--<script src="https://cdn.jsdelivr.net/npm/pjax-api@latest"></script>-->

<!-- Editors -->
<script src="<?=base_url('assets/admin/plugins/ckeditor/ckeditor.js')?>"></script>

<!-- Charts -->
<script src="https://cdn.amcharts.com/lib/5/index.js"></script>
<script src="https://cdn.amcharts.com/lib/5/xy.js"></script>
<script src="https://cdn.amcharts.com/lib/5/themes/Animated.js"></script>
<script src='<?=base_url('assets/admin/js/select2.min.js')?>'></script>
<script src="https://cdn.anychart.com/releases/8.11.0/js/anychart-base.min.js"></script>
<!--end::Javascript-->

<script>
/*
var Pjax = require('pjax-api').Pjax;
new Pjax({
  areas: [
    '#kt_content',
    '.container',
    'body'
  ]
});
window.addEventListener('pjax:fetch', function () {  console.time('pjax: fetch -> ready'); });
document.addEventListener('pjax:ready', function () { console.timeEnd('pjax: fetch -> ready'); });
*/



//* text editor*//
CKEDITOR.config.height = 250;
CKEDITOR.config.width = 'auto';
CKEDITOR.config.enableTabKeyTools = true;
CKEDITOR.config.protectedSource.push(/<i[^>]*><\/i>/g);
CKEDITOR.config.extraPlugins = "ajax";
CKEDITOR.config.filebrowserImageUploadUrl= "<?=base_url('Settings/editorFileUpload?type=image')?>";
CKEDITOR.config.filebrowserUploadMethod = 'form';
CKEDITOR.config.extraPlugins = 'wordcount,notification'; 
CKEDITOR.config.extraPlugins = 'emoji';
CKEDITOR.config.wordcount = {
    // Whether or not you want to show the Paragraphs Count
    showParagraphs: false,
    // Whether or not you want to show the Word Count
    showWordCount: true,
    // Whether or not you want to show the Char Count
    showCharCount: true,
    // Whether or not you want to count Spaces as Chars
    countSpacesAsChars: false,
    // Whether or not to include Html chars in the Char Count
    countHTML: false,    
    // Maximum allowed Word Count, -1 is default for unlimited
    maxWordCount: -1,
    // Maximum allowed Char Count, -1 is default for unlimited
    maxCharCount: -1,
    // Add filter to add or remove element before counting (see CKEDITOR.htmlParser.filter), Default value : null (no filter)
    filter: new CKEDITOR.htmlParser.filter({
        elements: {
            div: function( element ) {
                if(element.attributes.class == 'mediaembed') {
                    return false;
                }
            }
        }
    })
};
</script>
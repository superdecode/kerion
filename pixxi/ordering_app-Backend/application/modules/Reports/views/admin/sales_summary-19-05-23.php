<!--begin::Toolbar-->
<div class="toolbar" id="kt_toolbar">
    <!--begin::Container-->
    <div id="kt_toolbar_container" class="container-fluid d-flex flex-stack">
        <!--begin::Page title-->
        <div data-kt-place="true" data-kt-place-mode="prepend" data-kt-place-parent="{default: '#kt_content_container', 'lg': '#kt_toolbar_container'}" class="page-title d-flex align-items-left me-3 flex-wrap mb-5 mb-lg-0 lh-1">
            <!--begin::Title-->
            <h1 class="d-flex align-items-center text-dark fw-bolder my-1 fs-3"><?= $header['site_title'] ?></h1>
            <!--end::Title-->
            <!--begin::Separator-->
            <span class="h-20px border-gray-200 border-start mx-4"></span>
            <!--end::Separator-->
            <!--begin::Breadcrumb-->
            <ul class="breadcrumb breadcrumb-separatorless fw-bold fs-7 my-1">
                <!--begin::Item-->
                <li class="breadcrumb-item text-muted">
                    <a href="<?= base_url() ?>" class="text-muted text-hover-primary">Home</a>
                </li>
                <!--end::Item-->

                <!--begin::Item-->
                <li class="breadcrumb-item">
                    <span class="bullet bg-gray-200 w-5px h-2px"></span>
                </li>
                <!--end::Item-->
                <!--begin::Item-->
                <li class="breadcrumb-item text-dark"><?= $header['site_title'] ?></li>
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
        <form action="" method="GET" id="search_form" style="margin-top: -55px;">
        <div class="row gy-5 g-xl-10 pt-4">
              
        <div class="col-md-4 mb-xl-10">
             
                <div id="reportrange" style="background: #fff; cursor: pointer; padding: 5px 10px; border: 1px solid #ccc; width: 100%" >
            <i class="fa fa-calendar"></i>&nbsp;
            <span></span> <i class="fa fa-caret-down"></i>
                </div>
                <input type="hidden" name="from" id="from" value="">
                <input type="hidden" name="to" id="to" value="">
                
            
        </div>
           
            <div class="col-md-2 mb-5 mb-xl-10">  
                <input type="submit" class="btn btn-primary btn-sm me-2 pt-3" value="Search" name=""/>
            </div>
        </div>  
         </form>
        <div class="card">
  
  

            
            <!-- Map-->
            <!-- HTML -->
            
   <div class="mt-10 ps-10"><strong><?php echo $start_date;?> - <?php echo $end_date;?>
       
       </strong></div>
     <div id="chartdiv_1" ></div>                  
  <div class="row d-none">
    <div class="col">
     <div class="mt-10 ps-10"><strong>DAY OF WEEK</strong></div>
     <div id="chartdiv" ></div>
    </div>
    <div class="col">
     <div class="col">
     <div class="mt-10 ps-10"><strong>TIME OF DAY</strong></div>
     <div id="chartdiv_2" ></div>
    </div>
    </div>
  </div>
            
            <!-- End Map -->



            <!--begin::Card header-->

            <!--end::Card header-->
            <!--begin::Card body-->
            <div class="card-body pt-0">
                <!--START::ALERT MESSAGE --><?php $this->load->view('templates/admin/alert'); ?><!--END::ALERT MESSAGE -->
                <!--begin::Table-->

                <!--end::Table-->

                <table class="table table-bordered m-0 table-row-dashed mt-10" >
                    <!--begin::Table head-->
                    <thead >
                        <!--begin::Table row-->

                    <th class="sorting_disabled fs-4 border-bottom border-top"  colspan="2"><strong>Sales</strong></th></tr>
                    <!--end::Table row-->
                    </thead>
                    <!--end::Table head-->
                    <!--begin::Table body-->
                    <tbody class="fw-bold text-gray-600 border-bottom">

                        <tr class="text-dark">							
                            <td>
                                <div class="fw-bolder fs-7">
                                    Gross Sell</div>								
                            </td>

                            <td class="text-end fw-bold">
                                <?php
                                   $fmt = new \NumberFormatter('en', \NumberFormatter::CURRENCY);
                                   $fmt->setTextAttribute($fmt::CURRENCY_CODE, 'COP');
                                   $fmt->setAttribute($fmt::FRACTION_DIGITS, 2);
                                   
                                   echo $fmt->format($gross_sell);
                                ?>
                                						
                            </td>
                        </tr>

                        <tr>							
                            <td class="ps-5 ">Items							
                            </td>
                            <td class="text-end ">
                               <?php 
                               echo $fmt->format($gross_sell);
                               ?>
                                
                            </td>
                        </tr>
                        <!--<tr >							
                            <td class="ps-5">Service Charge							
                            </td>
                            <td class="text-end">
                                <?php $ser_charge= 0.0;
                                echo $fmt->format($ser_charge);
                                ?>
                                </td>
                        </tr>-->
                        <tr >							
                            <td class="text-dark">Returns								
                            </td>

                            <td class="text-end fw-bold text-dark">
                                <?php 
                              echo $fmt->format($return_order_summary);
                               ?>							
                            </td>
                        </tr>
                        <tr class="text-dark" >							
                            <td>Discount & Coupons								
                            </td>

                            <td class="text-end fw-bold">
                                <?php 
                               echo $fmt->format($dis_cou_summary);
                               ?>							
                            </td>
                        </tr>
                        <tr class="text-dark">							
                            <td>Net Sales								
                            </td>

                            <td class="text-end fw-bold">
                                <?php //$discoup= $return_order+$dis_cou;
                                echo $fmt->format($net_sale_summary);
                                ?>							
                            </td>
                        </tr>
                        <!--<tr class="">							
                            <td>Taxes								
                            </td>

                            <td class="text-end fw-bold">
                                 <?php $ser_charge= 0.0;
                                echo $fmt->format($ser_charge);
                                ?>						
                            </td>
                        </tr>-->
                        <tr class="text-dark">							
                            <td class="fs-5"><strong>Total Sales</strong>								
                            </td>

                            <td class="text-end fw-bold border-bottom">
                                <?php echo $fmt->format($net_sale_summary);
                                ?>						
                            </td>
                        </tr>
                    </tbody>
                    <!--end::Table body-->
                </table>




            </div>
            <!--end::Card body-->
        </div>
        <!--end::Card-->

    </div>
    <!--end::Container-->
</div>

<!--end::Post-->

<!-- Chart code -->
<style>
    #chartdiv {
        width: 100%;
        height: 500px;
        max-width: 100%;
    }
</style>

<style>
    #chartdiv_1 {
        width: 100%;
        height: 500px;
        max-width: 100%;
    }
</style>
<style>
    #chartdiv_2 {
        width: 100%;
        height: 500px;
        max-width: 100%;
    }
</style>
<?php
$this->load->view('templates/admin/footer_scripts', $this->data);
$this->load->view('admin/_js_order', $this->data);
?>


<script>
am5.ready(function() {

// Create root element
// https://www.amcharts.com/docs/v5/getting-started/#Root_element
var root = am5.Root.new("chartdiv");


// Set themes
// https://www.amcharts.com/docs/v5/concepts/themes/
root.setThemes([
  am5themes_Animated.new(root)
]);


// Create chart
// https://www.amcharts.com/docs/v5/charts/xy-chart/
var chart = root.container.children.push(am5xy.XYChart.new(root, {
  panX: true,
  panY: true,
  wheelX: "panX",
  wheelY: "zoomX",
  pinchZoomX: true
}));

// Add cursor
// https://www.amcharts.com/docs/v5/charts/xy-chart/cursor/
var cursor = chart.set("cursor", am5xy.XYCursor.new(root, {}));
cursor.lineY.set("visible", false);


// Create axes
// https://www.amcharts.com/docs/v5/charts/xy-chart/axes/
var xRenderer = am5xy.AxisRendererX.new(root, { minGridDistance: 30 });
xRenderer.labels.template.setAll({
  rotation: -90,
  centerY: am5.p50,
  centerX: am5.p100,
  paddingRight: 15
});

xRenderer.grid.template.setAll({
  location: 1
})

var xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, {
  maxDeviation: 0.3,
  categoryField: "day",
  renderer: xRenderer,
  tooltip: am5.Tooltip.new(root, {})
}));

var yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
  maxDeviation: 0.3,
  renderer: am5xy.AxisRendererY.new(root, {
    strokeOpacity: 0.1
  })
}));


// Create series
// https://www.amcharts.com/docs/v5/charts/xy-chart/series/
var series = chart.series.push(am5xy.ColumnSeries.new(root, {
  name: "Series 1",
  xAxis: xAxis,
  yAxis: yAxis,
  valueYField: "value",
  sequencedInterpolation: true,
  categoryXField: "day",
  tooltip: am5.Tooltip.new(root, {
    labelText: "{valueY}"
  })
}));

series.columns.template.setAll({ cornerRadiusTL: 5, cornerRadiusTR: 5, strokeOpacity: 0 });
series.columns.template.adapters.add("fill", function(fill, target) {
  return chart.get("colors").getIndex(series.columns.indexOf(target));
});

series.columns.template.adapters.add("stroke", function(stroke, target) {
  return chart.get("colors").getIndex(series.columns.indexOf(target));
});


// Set data
var data = [{
  day: "Sun",
  value: 2025
}, {
  day: "Mon",
  value: 1882
}, {
  day: "Tue",
  value: 1809
}, {
  day: "Wed",
  value: 1322
}, {
  day: "Thu",
  value: 1122
}, {
  day: "Fri",
  value: 1114
}];

xAxis.data.setAll(data);
series.data.setAll(data);


// Make stuff animate on load
// https://www.amcharts.com/docs/v5/concepts/animations/
series.appear(1000);
chart.appear(1000, 100);

}); // end am5.ready()
</script>


<script>
am5.ready(function() {

// Create root element
// https://www.amcharts.com/docs/v5/getting-started/#Root_element
var root = am5.Root.new("chartdiv_1");

// Set themes
// https://www.amcharts.com/docs/v5/concepts/themes/
root.setThemes([
  am5themes_Animated.new(root)
]);

root.dateFormatter.setAll({
  dateFormat: "yyyy",
  dateFields: ["valueX"]
});

var data = [
<?php 
//print_r($date_name);
 if(!empty($date_name)){
 foreach($date_name as $data) {?>     
  {
    date: "<?= $data['date'];?>",
    value: <?= $data['key1'];?>
  },
    <?php } }?>       
]; 


// Create chart
// https://www.amcharts.com/docs/v5/charts/xy-chart/
var chart = root.container.children.push(
  am5xy.XYChart.new(root, {
    focusable: true,
    panX: true,
    panY: true,
    wheelX: "panX",
    wheelY: "zoomX",
  pinchZoomX:true
  })
);

var easing = am5.ease.linear;

// Create axes
// https://www.amcharts.com/docs/v5/charts/xy-chart/axes/
var xAxis = chart.xAxes.push(
  am5xy.DateAxis.new(root, {
    maxDeviation: 0.5,
    groupData: false,
    baseInterval: {
      timeUnit: "day",
      count: 1
    },
    renderer: am5xy.AxisRendererX.new(root, {
      pan:"zoom",
      minGridDistance: 50
    }),
    tooltip: am5.Tooltip.new(root, {})
  })
);

var yAxis = chart.yAxes.push(
  am5xy.ValueAxis.new(root, {
    maxDeviation: 1,
    renderer: am5xy.AxisRendererY.new(root, {pan:"zoom"})
  })
);

// Add series
// https://www.amcharts.com/docs/v5/charts/xy-chart/series/
var series = chart.series.push(
  am5xy.LineSeries.new(root, {
    minBulletDistance: 10,
    xAxis: xAxis,
    yAxis: yAxis,
    valueYField: "value",
    valueXField: "date",
    tooltip: am5.Tooltip.new(root, {
      pointerOrientation: "horizontal",
      labelText: "{valueY}"
    })
  })
);

// Set up data processor to parse string dates
// https://www.amcharts.com/docs/v5/concepts/data/#Pre_processing_data
series.data.processor = am5.DataProcessor.new(root, {
  dateFormat: "yyyy-MM-dd",
  dateFields: ["date"]
});

series.data.setAll(data);

series.bullets.push(function() {
  var circle = am5.Circle.new(root, {
    radius: 4,
    fill: series.get("fill"),
    stroke: root.interfaceColors.get("background"),
    strokeWidth: 2
  });

  return am5.Bullet.new(root, {
    sprite: circle
  });
});

// Add cursor
// https://www.amcharts.com/docs/v5/charts/xy-chart/cursor/
var cursor = chart.set("cursor", am5xy.XYCursor.new(root, {
  xAxis: xAxis
}));
cursor.lineY.set("visible", false);

// add scrollbar
chart.set("scrollbarX", am5.Scrollbar.new(root, {
  orientation: "horizontal"
}));

// Make stuff animate on load
// https://www.amcharts.com/docs/v5/concepts/animations/
series.appear(1000, 100);
chart.appear(1000, 100);

}); // end am5.ready()
</script>

<script>
am5.ready(function() {

// Create root element
// https://www.amcharts.com/docs/v5/getting-started/#Root_element
var root = am5.Root.new("chartdiv_2");

// Set themes
// https://www.amcharts.com/docs/v5/concepts/themes/
root.setThemes([
  am5themes_Animated.new(root)
]);

// Create chart
// https://www.amcharts.com/docs/v5/charts/xy-chart/
var chart = root.container.children.push(am5xy.XYChart.new(root, {
  panX: true,
  panY: true,
  wheelX: "panX",
  wheelY: "zoomX",
  layout: root.verticalLayout,
  pinchZoomX:true
}));

// Add cursor
// https://www.amcharts.com/docs/v5/charts/xy-chart/cursor/
var cursor = chart.set("cursor", am5xy.XYCursor.new(root, {
  behavior: "none"
}));
cursor.lineY.set("visible", false);

var colorSet = am5.ColorSet.new(root, {});

// The data
var data = [
  {
    year: "2014",
    value: 23.5,
    strokeSettings: {
      stroke: colorSet.getIndex(0)
    },
    fillSettings: {
      fill: colorSet.getIndex(0),
    },
    bulletSettings: {
      fill: colorSet.getIndex(0)
    }
  },
  {
    year: "2015",
    value: 26,
    bulletSettings: {
      fill: colorSet.getIndex(0)
    }
  },
  {
    year: "2016",
    value: 30,
    bulletSettings: {
      fill: colorSet.getIndex(0)
    }
  },
  {
    year: "2017",
    value: 20,
    bulletSettings: {
      fill: colorSet.getIndex(0)
    }
  },
  {
    year: "2018",
    value: 30,
    strokeSettings: {
      stroke: colorSet.getIndex(3)
    },
    fillSettings: {
      fill: colorSet.getIndex(3),
    },
    bulletSettings: {
      fill: colorSet.getIndex(3)
    }
  },
  {
    year: "2019",
    value: 30,
    bulletSettings: {
      fill: colorSet.getIndex(3)
    }
  },
  {
    year: "2020",
    value: 31,
    bulletSettings: {
      fill: colorSet.getIndex(3)
    }
  },
  {
    year: "2021",
    value: 34,
    strokeSettings: {
      stroke: colorSet.getIndex(6)
    },
    fillSettings: {
      fill: colorSet.getIndex(6),
    },
    bulletSettings: {
      fill: colorSet.getIndex(6)
    }
  },
  {
    year: "2022",
    value: 33,
    bulletSettings: {
      fill: colorSet.getIndex(6)
    }
  },
  {
    year: "2023",
    value: 34,
    bulletSettings: {
      fill: colorSet.getIndex(6)
    }
  },
  {
    year: "2024",
    value: 36,
    bulletSettings: {
      fill: colorSet.getIndex(6)
    }
  }
];

// Create axes
// https://www.amcharts.com/docs/v5/charts/xy-chart/axes/
var xRenderer = am5xy.AxisRendererX.new(root, {});
xRenderer.grid.template.set("location", 0.5);
xRenderer.labels.template.setAll({
  location: 0.5,
  multiLocation: 0.5
});

var xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, {
  categoryField: "year",
  renderer: xRenderer,
  tooltip: am5.Tooltip.new(root, {})
}));

xAxis.data.setAll(data);

var yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
  maxPrecision: 0,
  renderer: am5xy.AxisRendererY.new(root, {})
}));

var series = chart.series.push(am5xy.LineSeries.new(root, {
  xAxis: xAxis,
  yAxis: yAxis,
  valueYField: "value",
  categoryXField: "year",
  tooltip: am5.Tooltip.new(root, {
    labelText: "{valueY}",
    dy:-5
  })
}));

series.strokes.template.setAll({
  templateField: "strokeSettings",
  strokeWidth: 2
});

series.fills.template.setAll({
  visible: true,
  fillOpacity: 0.5,
  templateField: "fillSettings"
});


series.bullets.push(function() {
  return am5.Bullet.new(root, {
    sprite: am5.Circle.new(root, {
      templateField: "bulletSettings",
      radius: 5
    })
  });
});

series.data.setAll(data);
series.appear(1000);

// Add scrollbar
// https://www.amcharts.com/docs/v5/charts/xy-chart/scrollbars/
chart.set("scrollbarX", am5.Scrollbar.new(root, {
  orientation: "horizontal",
  marginBottom: 20
}));

// Make stuff animate on load
// https://www.amcharts.com/docs/v5/concepts/animations/
chart.appear(1000, 100);

}); // end am5.ready()
</script>

<script type="text/javascript">
$(function() {

    //var start = moment().subtract(29, 'days');
    //var end = moment();
    var start = moment("<?=$search['from']?>");
    var end = moment("<?=$search['to']?>");

    function cb(start, end) {
        $('#reportrange span').html(start.format('MMMM D, YYYY') + ' - ' + end.format('MMMM D, YYYY'));
         $('#from').val(start.format('YYYY-M-D'));
         $('#to').val(end.format('YYYY-M-D'));
         
       
    }

    $('#reportrange').daterangepicker({
       
        startDate: start,
        endDate: end,
        
        ranges: {
           'Today': [moment(), moment()],
           'Yesterday': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
           'Last 7 Days': [moment().subtract(6, 'days'), moment()],
           'Last 30 Days': [moment().subtract(29, 'days'), moment()],
           'This Month': [moment().startOf('month'), moment().endOf('month')],
           'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
        }
    }, cb);

    cb(start, end);

});


</script>

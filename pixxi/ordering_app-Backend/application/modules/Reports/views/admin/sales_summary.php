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
                    <a href="<?= base_url() ?>" class="text-muted text-hover-primary">Inicio</a>
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
        <div class="card">
            <div class="card-header border-0 pt-6 row">
                <!--begin::Card title-->
                <div class="col-md-12">					
                    <div class="row">	
                        <div class="col-md-6 mb-3">
                            <form action="" method="GET" id="search_form" >
                                <div class="row gy-5 g-xl-10">

                                    <div class="col-md-7 mb-xl-10">

                                        <div id="reportrange" class="form-control w-100 mw-300px text-start cursor-pointer">
                                            <i class="fa fa-calendar"></i>&nbsp;
                                            <span></span> <i class="fa fa-caret-down"></i>
                                        </div>
                                        <input type="hidden" name="from" id="from" value="">
                                        <input type="hidden" name="to" id="to" value="">


                                    </div>

                                    <div class="col-md-4 mb-5 mb-xl-10">
                                        <input type="submit" class="btn btn-primary btn-sm me-2 pt-3" value="Búsqueda" name=""/>
                                    </div>
                                </div>  
                            </form>
                        </div>
                        <div class="col-md-6 mb-3 text-end">
                            <div class="d-flex justify-content-end" data-kt-user-table-toolbar="base">
                                <div class=" col-7 text-end me-5">
                                    <div class="d-flex justify-content-end" data-kt-user-table-toolbar="base">


                                        <div class="d-flex align-items-center position-relative my-1 d-none">
                                            <!--begin::Svg Icon | path: icons/duotone/General/Search.svg-->
                                            <span class="svg-icon svg-icon-1 position-absolute ms-2">
                                                <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
                                                <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                                                <rect x="0" y="0" width="24" height="24" />
                                                <path d="M14.2928932,16.7071068 C13.9023689,16.3165825 13.9023689,15.6834175 14.2928932,15.2928932 C14.6834175,14.9023689 15.3165825,14.9023689 15.7071068,15.2928932 L19.7071068,19.2928932 C20.0976311,19.6834175 20.0976311,20.3165825 19.7071068,20.7071068 C19.3165825,21.0976311 18.6834175,21.0976311 18.2928932,20.7071068 L14.2928932,16.7071068 Z" fill="#000000" fill-rule="nonzero" opacity="0.3" />
                                                <path d="M11,16 C13.7614237,16 16,13.7614237 16,11 C16,8.23857625 13.7614237,6 11,6 C8.23857625,6 6,8.23857625 6,11 C6,13.7614237 8.23857625,16 11,16 Z M11,18 C7.13400675,18 4,14.8659932 4,11 C4,7.13400675 7.13400675,4 11,4 C14.8659932,4 18,7.13400675 18,11 C18,14.8659932 14.8659932,18 11,18 Z" fill="#000000" fill-rule="nonzero" />
                                                </g>
                                                </svg>
                                            </span>
                                            <!--end::Svg Icon-->
                                            <input type="text" data-kt-listing-table-filter="search" class="form-control ps-10" placeholder="Search..." />
                                        </div>
                                    </div>
                                </div>
                                <div class="dropdown d-flex align-items-center position-relative my-1 me-2 d-none">
                                    <button type="button" class="btn btn-light-primary font-weight-bolder dropdown-toggle" data-kt-menu-trigger="click" data-kt-menu-placement="bottom-end">
                                        <span class="svg-icon svg-icon-md">
                                            <!--begin::Svg Icon | path:assets/media/svg/icons/Design/PenAndRuller.svg-->
                                            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
                                            <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                                            <rect x="0" y="0" width="24" height="24" />
                                            <path d="M3,16 L5,16 C5.55228475,16 6,15.5522847 6,15 C6,14.4477153 5.55228475,14 5,14 L3,14 L3,12 L5,12 C5.55228475,12 6,11.5522847 6,11 C6,10.4477153 5.55228475,10 5,10 L3,10 L3,8 L5,8 C5.55228475,8 6,7.55228475 6,7 C6,6.44771525 5.55228475,6 5,6 L3,6 L3,4 C3,3.44771525 3.44771525,3 4,3 L10,3 C10.5522847,3 11,3.44771525 11,4 L11,19 C11,19.5522847 10.5522847,20 10,20 L4,20 C3.44771525,20 3,19.5522847 3,19 L3,16 Z" fill="#000000" opacity="0.3" />
                                            <path d="M16,3 L19,3 C20.1045695,3 21,3.8954305 21,5 L21,15.2485298 C21,15.7329761 20.8241635,16.200956 20.5051534,16.565539 L17.8762883,19.5699562 C17.6944473,19.7777745 17.378566,19.7988332 17.1707477,19.6169922 C17.1540423,19.602375 17.1383289,19.5866616 17.1237117,19.5699562 L14.4948466,16.565539 C14.1758365,16.200956 14,15.7329761 14,15.2485298 L14,5 C14,3.8954305 14.8954305,3 16,3 Z" fill="#000000" />
                                            </g>
                                            </svg>
                                            <!--end::Svg Icon-->
                                        </span>Exportar</button>
                                    <div class="menu menu-sub menu-sub-dropdown menu-column menu-rounded menu-gray-800 menu-state-bg-light-primary fw-bold w-200px" data-kt-menu="true" style="">
                                        <!--begin::Menu item-->
                                        <div class="menu-item px-3">
                                            <div class="menu-content fs-6 text-dark fw-bolder px-3 py-4">Herramientas de Exportación</div>
                                        </div>
                                        <div class="menu-item">
                                            <a class="menu-link py-3" href="#" id="export_print">
                                                <span class="menu-icon">
                                                    <i class="la la-print fs-2"></i>
                                                </span>
                                                <span class="menu-title">Impresión</span>
                                            </a>
                                        </div>


                                        <div class="menu-item">
                                            <a class="menu-link py-3" href="#"  id="export_csv">
                                                <span class="menu-icon">
                                                    <i class="la la-file-text-o fs-2"></i>
                                                </span>
                                                <span class="menu-title">CSV</span>
                                            </a>
                                        </div>


                                    </div>


                                </div>		

                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card-body pt-0">




                <!-- Map-->
                <!-- HTML -->

                <!--<div class="mt-10 ps-10"><strong><?php echo $start_date; ?> - <?php echo $end_date; ?>

                    </strong></div>-->
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

                    <table id="kt_listing_table" class="table table-bordered m-0 table-row-dashed mt-10" >
                        <!--begin::Table head-->
                        <thead>
                            <!--begin::Table row-->
                            <tr>
                        <th class="sorting_disabled fs-4 border-bottom border-top"  colspan="2"><strong>Ventas</strong></th></tr>
                        <!--end::Table row-->
                        </thead>
                        <!--end::Table head-->
                        <!--begin::Table body-->
                        <tbody class="fw-bold text-gray-600 border-bottom">

                            <tr class="text-dark">							
                                <td>
                                    <div class="fw-bolder fs-7">
                                        Venta Bruta</div>								
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
                                <td class="ps-5 ">Elementos							
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
                            <?php
                            $ser_charge = 0.0;
                            echo $fmt->format($ser_charge);
                            ?>
                                    </td>
                            </tr>-->
                            <tr >							
                                <td class="text-dark">Devoluciones								
                                </td>

                                <td class="text-end fw-bold text-dark">
                                    <?php
                                    echo $fmt->format($return_order_summary);
                                    ?>							
                                </td>
                            </tr>
                            <tr class="text-dark" >							
                                <td>Cupones de Descuento								
                                </td>

                                <td class="text-end fw-bold">
                                    <?php
                                    echo $fmt->format($dis_cou_summary);
                                    ?>							
                                </td>
                            </tr>
                            <tr class="text-dark">							
                                <td>Ventas Netas								
                                </td>

                                <td class="text-end fw-bold">
                                    <?php
                                    //$discoup= $return_order+$dis_cou;
                                    echo $fmt->format($net_sale_summary);
                                    ?>							
                                </td>
                            </tr>
                            <!--<tr class="">							
                                <td>Taxes								
                                </td>
    
                                <td class="text-end fw-bold">
                            <?php
                            $ser_charge = 0.0;
                            echo $fmt->format($ser_charge);
                            ?>						
                                </td>
                            </tr>-->
                            <tr class="text-dark">							
                                <td class="fs-5"><strong>Ventas totales</strong>								
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
            max-width: 90%;
            margin: 0 auto;


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
    $this->load->view('admin/_jssalessummary', $this->data);
    ?>


    <script>
        am5.ready(function () {

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



            // Create axes
            // https://www.amcharts.com/docs/v5/charts/xy-chart/axes/
            var xRenderer = am5xy.AxisRendererX.new(root, {minGridDistance: 30});
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

            series.columns.template.setAll({cornerRadiusTL: 5, cornerRadiusTR: 5, strokeOpacity: 0});
            series.columns.template.adapters.add("fill", function (fill, target) {
                return chart.get("colors").getIndex(series.columns.indexOf(target));
            });

            series.columns.template.adapters.add("stroke", function (stroke, target) {
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
        am5.ready(function () {

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
if (!empty($date_name)) {
    foreach ($date_name as $data) {
        ?>
                        {
                            date: "<?= $data['date']; ?>",
                            value: <?= $data['key1']; ?>

                        },
    <?php }
} ?>
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
                        pinchZoomX: true
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
                            pan: "zoom",
                            minGridDistance: 50
                        }),
                        tooltip: am5.Tooltip.new(root, {})
                    })
                    );
            /*xAxis.children.push(am5.Label.new(root, {
             text: 'xAxis title',
             textAlign: 'center',
             x: am5.p50,
             fontWeight: 'bold'
             }));*/

            var yAxis = chart.yAxes.push(
                    am5xy.ValueAxis.new(root, {
                        maxDeviation: 1,
                        renderer: am5xy.AxisRendererY.new(root, {pan: "zoom"})

                    })

                    );
            yAxis.children.unshift(am5.Label.new(root, {
                text: 'Importe resumido de la venta en RMB',
                textAlign: 'center',
                y: am5.p50,
                rotation: -90
                        /*fontWeight: 'bold'*/
            }));


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

            series.bullets.push(function () {
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
            //cursor.lineY.set("visible", false);

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

    <script type="text/javascript">
        $(function () {

            //var start = moment().subtract(29, 'days');
            //var end = moment();
            var start = moment("<?= $search['from'] ?>");
            var end = moment("<?= $search['to'] ?>");

            function cb(start, end) {
                $('#reportrange span').html(start.format('MMMM D, YYYY') + ' - ' + end.format('MMMM D, YYYY'));
                $('#from').val(start.format('YYYY-M-D'));
                $('#to').val(end.format('YYYY-M-D'));


            }

            $('#reportrange').daterangepicker({

                startDate: start,
                endDate: end,

                ranges: {
                    'Hoy': [moment(), moment()],
                    'Ayer': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                    'Los últimos 7 días': [moment().subtract(6, 'days'), moment()],
                    'Últimos 30 días': [moment().subtract(29, 'days'), moment()],
                    'Este mes': [moment().startOf('month'), moment().endOf('month')],
                    'El mes pasado': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
                }
            }, cb);

            cb(start, end);

        });


    </script>

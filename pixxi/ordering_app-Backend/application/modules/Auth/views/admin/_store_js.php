<script>
    $(function() {

        // var start = moment().subtract(29, 'days');
        // var end = moment();
        var start = moment('<?= $start_date ?>');
        var end = moment('<?= $end_date ?>');
        $('#reportrange span').html(start.format('MMMM D, YYYY') + ' - ' + end.format('MMMM D, YYYY'));
        function cb(start, end, label) {
            console.log("Start: "+start);
            console.log("End: "+end);
            console.log("Label: "+label);

            $('#reportrange span').html(label);

            var start_date = start.format('YYYY-MM-DD');
            var end_date = end.format('YYYY-MM-DD');
            var label = label;
            var url = base_url + 'Auth/store_dashboard?start=' + start_date + '&end=' + end_date+ '&label=' + label;
            //$('#redirect_url').val(url);
            window.location.href = url;
        }
        

        $('#reportrange').daterangepicker({
            startDate: start,
            endDate: end,
            locale: {
                format: 'DD/MM/YYYY'
            },
            ranges: {
                'Hoy': [moment(), moment()],
                'Ayer': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                'Los últimos 7 días': [moment().subtract(6, 'days'), moment()],
                'Últimos 30 días': [moment().subtract(29, 'days'), moment()],
                'Este mes': [moment().startOf('month'), moment().endOf('month')],
                'El mes pasado': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
            }
        },cb);

        //cb(start, end);

    });


    //********************************************** */
    // Class definition
    var KTCardWidget8 = function() {
        var chart = {
            self: null,
            rendered: false
        };


        // Private methods
        var initChart = function(chart) {
            var element = document.getElementById("kt_card_widget_8_chart");

            if (!element) {
                return;
            }

            var height = parseInt(KTUtil.css(element, 'height'));
            var borderColor = KTUtil.getCssVariableValue('--bs-border-dashed-color');
            var baseColor = KTUtil.getCssVariableValue('--bs-primary');
            var lightColor = KTUtil.getCssVariableValue('--bs-success');
            var options = {
                series: [{
                    name: 'Sales',
                    data: <?= $revenue_chart_datas ?>
                }],
                chart: {
                    fontFamily: 'inherit',
                    type: 'area',
                    height: height,
                    toolbar: {
                        show: false
                    }
                },
                legend: {
                    show: false
                },
                dataLabels: {
                    enabled: false
                },
                fill: {
                    type: 'solid',
                    opacity: 0
                },
                stroke: {
                    curve: 'smooth',
                    show: true,
                    width: 2,
                    colors: [baseColor]
                },
                xaxis: {
                    axisBorder: {
                        show: false,
                    },
                    axisTicks: {
                        show: false
                    },
                    labels: {
                        show: false
                    },
                    crosshairs: {
                        position: 'front',
                        stroke: {
                            color: baseColor,
                            width: 1,
                            dashArray: 3
                        }
                    },
                    tooltip: {
                        enabled: true,
                        formatter: undefined,
                        offsetY: 0,
                        style: {
                            fontSize: '12px'
                        }
                    }
                },
                yaxis: {
                    labels: {
                        show: false
                    }
                },
                states: {
                    normal: {
                        filter: {
                            type: 'none',
                            value: 0
                        }
                    },
                    hover: {
                        filter: {
                            type: 'none',
                            value: 0
                        }
                    },
                    active: {
                        allowMultipleDataPointsSelection: false,
                        filter: {
                            type: 'none',
                            value: 0
                        }
                    }
                },
                tooltip: {
                    style: {
                        fontSize: '12px'
                    },
                    x: {
                        formatter: function(val) {
                            //console.log(startdate);
                            if (val > 1) {
                                var date = moment('<?= $start_date ?>').add(val, 'days');
                            } else {
                                var date = moment('<?= $start_date ?>');
                            }
                            return date.format('DD-MM-YYYY');;
                        }
                    },
                    y: {
                        formatter: function(val) {
                            return "COP " + val 
                        }
                    }
                },
                colors: [lightColor],
                grid: {
                    borderColor: borderColor,
                    strokeDashArray: 4,
                    padding: {
                        top: 0,
                        right: -20,
                        bottom: -20,
                        left: -20
                    },
                    yaxis: {
                        lines: {
                            show: true
                        }
                    }
                },
                markers: {
                    strokeColor: baseColor,
                    strokeWidth: 2
                }
            };

            chart.self = new ApexCharts(element, options);

            // Set timeout to properly get the parent elements width
            setTimeout(function() {
                chart.self.render();
                chart.rendered = true;
            }, 200);
        }

        // Public methods
        return {
            init: function() {
                initChart(chart);
            }
        }
    }();

    KTCardWidget8.init();
    //******************************************************** */    

    var options = {
        series: <?= $payment_types_datas ?>,
        chart: {
            width: '100%',
            type: 'donut',
        },
        labels: ['Efectivo', 'Tarjeta de Crédito'],
        plotOptions: {
            pie: {
                startAngle: -90,
                endAngle: 270
            }
        },
        dataLabels: {
            enabled: true
        },
        fill: {
            type: 'gradient',
            colors :['#692ffa']
        },
        legend: {
            formatter: function(val, opts) {
                return val + " - <b style='font-size:20px;' > COP " + opts.w.globals.series[opts.seriesIndex] + "</b>"
            },
            fontSize: '15px',
            horizontalAlign: 'left',
            show: false,
        },
        tooltip: {
            formatter: function(val, opts) {
                return val + " - <b style='font-size:20px;' > COP " + opts.w.globals.series[opts.seriesIndex] + "</b>"
            },
            fontSize: '15px',
            horizontalAlign: 'left',
            show: false,
        },
        title: {
            text: ''
        },
        responsive: [{
            breakpoint: 480,
            options: {
                chart: {
                    width: 200
                },
                legend: {
                    position: 'bottom'
                }
            }
        }]
    };

    var chart = new ApexCharts(document.querySelector("#chartdiv"), options);
    chart.render();
</script>
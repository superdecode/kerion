<?php

defined('BASEPATH') or exit('No direct script access allowed');

class Reports extends BackendController {

    //
    public $CI;

    /**
     * An array of variables to be passed through to the
     * view, layout,....
     */
    protected $data = array();

    /**
     * [__construct description]
     *
     * @method __construct
     */
    public function __construct() {
        parent::__construct();
        $this->load->model('Report_model');
    }

    public function orders() {
        authenticate();
        $data['header']['site_title'] = 'Lista de Pedidos';
        $data['datas'] = $this->Report_model->getOrders();
        $this->render('admin/orders', $data);
    }

    public function customers() {
        authenticate();
        $data['header']['site_title'] = 'Lista de Clientes';
        $data['datas'] = $this->Report_model->getCustomers($role_id = "2");
        $this->render('admin/customers', $data);
    }

    public function coupons() {
        authenticate();
        $data['header']['site_title'] = 'Lista de Cupones';
        $data['datas'] = $this->Report_model->getCoupons();
        $this->render('admin/coupons', $data);
    }

    public function refund() {
        authenticate();
        $data['header']['site_title'] = 'Lista de Reembolsos';
        $data['datas'] = $this->Report_model->getRefund();
        $this->render('admin/refund', $data);
    }

    public function feedback() {
        authenticate();
        $data['header']['site_title'] = 'Listado de Comentarios';
        $data['datas'] = $this->Report_model->getFeedback();
        $this->render('admin/feedback', $data);
    }

    public function profit() {
        /*authenticate();
        $user_id = $this->session->userdata('user_id');
        $search = $this->input->get();
        //$data['datas'] = $this->Order_model->getOrderProducts();
        $data['datas'] = $this->Report_model->getprofit($search);
        $data['search'] = $search;
        $data['header']['site_title'] = 'Profit Reports';
        $result = array();
        $this->render('admin/profit', $data);*/
        /***************************/
        
        authenticate();
        $data['header']['site_title'] = 'Informes de Ganacias';
        //$data['datas'] = $this->Report_model->getOrders();
        if ($this->input->get()) {
            $data['search'] = $this->input->get();
        } else {
            $data['search'] = [];
            $data['search']['to'] = date('Y-m-d');
            $data['search']['from'] = date('Y-m-d', strtotime('-29 days'));
        }
        if ($this->session->userdata('user_role_ids') == '1') {
            $user_id = $this->session->userdata('user_id');
        } else {
            $user_id = $this->session->userdata('seller_id');
        }
        $start_date = $data['search']['from'];
        $end_date = $data['search']['to'];
        
        $data['start_date'] = $start_date;
        $data['end_date'] = $end_date;
        $data['datas'] = $this->Report_model->getprofit($user_id, $start_date, $end_date);
        $this->render('admin/profit', $data);
        
    }

    public function sales_summary() {
        authenticate();
        $data['header']['site_title'] = 'Resumen Ventas';
        //$data['datas'] = $this->Report_model->getOrders();
        if ($this->input->get()) {
            $data['search'] = $this->input->get();
        } else {
            $data['search'] = [];
            //$data['search']['date'] = date('Y-m-d');
            $data['search']['to'] = date('Y-m-d');
            $data['search']['from'] = date('Y-m-d', strtotime('-29 days'));
        }
        if ($this->session->userdata('user_role_ids') == '1') {
            $user_id = $this->session->userdata('user_id');
        } else {
            $user_id = $this->session->userdata('seller_id');
        }
        $start_date = $data['search']['from'];
        $end_date = $data['search']['to'];
        $gross_sell_summary = $this->Report_model->gross_sell_summary($user_id, $start_date, $end_date);
        $return_order_summary = $this->Report_model->return_order_summary($user_id, $start_date, $end_date);
        $dis_cou_summary = $this->Report_model->discount_coupons_summary($user_id, $start_date, $end_date);
        $discoup_summary = $return_order_summary + $dis_cou_summary;
        $net_sale_summary = $gross_sell_summary - $discoup_summary;

        $begin = new DateTime($start_date);
        $end = new DateTime($end_date);
        $end = $end->modify('+1 day');

        $interval = new DateInterval('P1D');
        $daterange = new DatePeriod($begin, $interval, $end);
        //print_r($daterange);
        foreach ($daterange as $date) {

            $date = $date->format("Y-m-d");
            $alldays[$date]['date'] = $date;

            $gross_sell = $this->Report_model->gross_sell($user_id, $date);
            $return_order = $this->Report_model->return_order($user_id, $date);
            $dis_cou = $this->Report_model->discount_coupons($user_id, $date);
            $discoup = $return_order + $dis_cou;
            $net_sale = $gross_sell - $discoup;
            $alldays[$date]['key1'] = $net_sale;
            //$alldays[$date]['key1'] = $this->Report_model->getPorterJobDeliveredUndevileredCount($date);
        }

        $data['date_name'] = $alldays;
        $data['gross_sell'] = $gross_sell_summary;
        $data['return_order_summary'] = $return_order_summary;
        $data['dis_cou_summary'] = $dis_cou_summary;
        $data['net_sale_summary'] = $net_sale_summary;

        $data['start_date'] = $start_date;
        $data['end_date'] = $end_date;

        //$data['date_name'] = $alldays;

        $this->render('admin/sales_summary', $data);
    }

    public function sales_cash() {
        authenticate();
        //$user_id = $this->session->userdata('user_id');
        $seller_id = $this->input->post('seller_id');
        if ($this->session->userdata('user_role_ids') != '1') {
            $seller_id = $this->session->userdata('seller_id');
        }
       if ($this->input->get()) {
            $data['search'] = $this->input->get();
        } else {
            $data['search'] = [];
            $data['search']['to'] = date('Y-m-d');
            $data['search']['from'] = date('Y-m-d', strtotime('-29 days'));
        }
        $start_date = $data['search']['from'];
        $end_date = $data['search']['to'];
        
        $data['start_date'] = $start_date;
        $data['end_date'] = $end_date;
        
        //$data['datas'] = $this->Order_model->getOrderProducts();
        $data['seller_name'] = $this->Report_model->getSellernameList();
        $data['datas'] = $this->Report_model->saleCaseReport($seller_id, $start_date, $end_date);
        $data['total_balance'] = $this->Report_model->getEarningTotalSum($seller_id, $start_date, $end_date);
        $data['header']['site_title'] = 'Informes de Ventas y Efectivo';
        $result = array();
        $this->render('admin/sales_cash', $data);
    }

    public function items_sales() {
        authenticate();
        $data['header']['site_title'] = 'Ventas Producto';
        //$data['datas'] = $this->Report_model->getOrders();
        if ($this->input->get()) {
            $data['search'] = $this->input->get();
        } else {
            $data['search'] = [];
            //$data['search']['date'] = date('Y-m-d');
            $data['search']['to'] = date('Y-m-d');
            $data['search']['from'] = date('Y-m-d', strtotime('-29 days'));
        }
        if ($this->session->userdata('user_role_ids') == '1') {
            $user_id = $this->session->userdata('user_id');
        } else {
            $user_id = $this->session->userdata('seller_id');
        }
        $start_date = $data['search']['from'];
        $end_date = $data['search']['to'];
        $begin = new DateTime($start_date);
        $end = new DateTime($end_date);
        $ends = $end->modify('+1 day');

        $interval = new DateInterval('P1D');
        $daterange = new DatePeriod($begin, $interval, $ends);
        //print_r($daterange);
        //$topsale = array();
        $i=0;
        $topsale= array();
        $availabe_in_order = array();
        foreach ($daterange as $date) {

            $date = $date->format("Y-m-d");
            $alldays[$date]['date'] = $date;

            //$data['top_sale'] = $toppro;
            //$topsale[] = $this->Report_model->getTopSelesItemsGraph($user_id, $date);
            //$allproducts = $this->Report_model->getAllProducts($user_id);
             //foreach($allproducts as $value) {
             //$availabe_in_order[] = $this->Report_model->getOrderData($value->id,$date);  
            //}
            
        }
        //$data['items_chart_datas'] = json_encode($availabe_in_order, true);
        $data['allproducts']= $this->Report_model->getAllProducts($user_id);
        $data['top_sale_product'] = $topsale;
        $data['date_name'] = $alldays;
        //$data['top_sale'] = $top_sale;
        //$data['top_sale'] = $alldays;
        $data['start_date'] = $start_date;
        $data['end_date'] = $end_date;
        $data['item_sale'] = $this->Report_model->getTopSelesitems($user_id, $start_date, $end_date);
        $this->render('admin/items_sale', $data);
    }
    
    /****************** For Map Chart Code ****************************/
    
    

}

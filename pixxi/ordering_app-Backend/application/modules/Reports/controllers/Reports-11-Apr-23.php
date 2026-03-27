<?php defined('BASEPATH') or exit('No direct script access allowed');

class Reports extends BackendController
{
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
    public function __construct()
    {
        parent::__construct();
		$this->load->model('Report_model');		
    }

	
    public function orders()
    {
		authenticate();		
		$data['header']['site_title'] = 'Order List';			
		$data['datas'] = $this->Report_model->getOrders();
		$this->render('admin/orders', $data);
		
    }
     public function customers()
    {
		authenticate();		
		$data['header']['site_title'] = 'Customer List';			
		$data['datas'] = $this->Report_model->getCustomers($role_id="2");
		$this->render('admin/customers', $data);
		
    }
  public function coupons()
    {
		authenticate();		
		$data['header']['site_title'] = 'Coupons List';			
		$data['datas'] = $this->Report_model->getCoupons();
		$this->render('admin/coupons', $data);
		
    }
    
    public function refund()
    {
		authenticate();		
		$data['header']['site_title'] = 'Refund List';			
		$data['datas'] = $this->Report_model->getRefund();
		$this->render('admin/refund', $data);
		
    }
      public function feedback()
    {
		authenticate();		
		$data['header']['site_title'] = 'Feedback List';			
		$data['datas'] = $this->Report_model->getFeedback();
		$this->render('admin/feedback', $data);
		
    }
    
    public function profit()
    {
		authenticate();
		$user_id = $this->session->userdata('user_id');
                $search = $this->input->get();
		//$data['datas'] = $this->Order_model->getOrderProducts();
		$data['datas'] = $this->Report_model->getprofit($search);
                $data['search']=$search;
                $data['header']['site_title'] = 'Profit Reports';
		$result=array();
		$this->render('admin/profit', $data);
		
    }
	
}

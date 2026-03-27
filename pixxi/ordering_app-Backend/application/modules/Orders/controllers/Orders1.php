<?php defined('BASEPATH') or exit('No direct script access allowed');

class Orders extends BackendController
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
		$this->load->model('Order_model');
		
		
    }

	public function save($id=''){		
		authenticate();			
		$result=array();
		$query = new stdClass();		
		if(!empty($id)){
			$data['header']['site_title'] = 'Order Invoice';
			$decode_id= base64_decode($id);
			$query = $this->Order_model->orderDetails($decode_id);
			//pr($query);die;
		}else{
			$this->session->set_flashdata('error_msg', 'No Order Selected');	
			redirect('Orders/listing');
		}
		
		if($this->input->post()){			
			$post['order_status'] =$this->input->post('order_status');
			$post['delivery_status'] =$this->input->post('delivery_status');			
			$post['modifiedBy'] =$this->session->userdata('user_id');
			
			$result = $this->Order_model->saveOrderProduct($post,$decode_id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Orders/listing');
		}
		$data['query'] = $query;
		$this->render('admin/save', $data);  
	}
    public function listing()
    {
		authenticate();
		$user_id = $this->session->userdata('user_id');
		$data['datas'] = $this->Order_model->getOrderProducts();
		$data['header']['site_title'] = 'sipariş listesi';
		$result=array();
		
		//pr($data['datas']);die;
		$this->render('admin/listing', $data);
    }
	
    public function statusChange($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Order_model->productStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Orders/listing');
    }
	
	public function remove($id){
		$result = $this->Order_model->productRemove($id);
		return $return;
	}
	
	//*********************************************************************************************//
	
	
	
}

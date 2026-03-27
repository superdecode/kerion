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

	public function save($id = '')
	{
		authenticate();
		$result = array();
		$query = new stdClass();
		if (!empty($id)) {
			$data['header']['site_title'] = 'Order Details';
			$decode_id = base64_decode($id);
			$query = $this->Order_model->orderDetails($decode_id);
			//pr($query);die;
		} else {
			$this->session->set_flashdata('error_msg', 'No Order Selected');
			redirect('Orders/listing');
		}

		if ($this->input->post()) {
			$post['order_status'] = $this->input->post('order_status');
			$post['payment_status'] = $this->input->post('payment_status');
			$refund['order_status'] = $this->input->post('order_status');
			$refund['order_number'] = $this->input->post('order_number');
			$refund['buyer_id'] = $this->input->post('buyer_id');
			$refund['seller_id'] = $this->input->post('seller_id');
			$refund['order_id'] = $this->input->post('order_id');
			//$post['delivery_status'] =$this->input->post('delivery_status');			
			//$post['modifiedBy'] =$this->session->userdata('user_id');

			$result = $this->Order_model->saveOrder($post, $refund, $decode_id);
			if (!empty($result)) {
				$this->session->set_flashdata('success_msg', 'Successfully Updated');
			} else {
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');
			}
			redirect('Orders/listing');
		}
		$data['query'] = $query;
		$this->render('admin/save', $data);
	}

	public function saveRefund($id = '', $oid)
	{
		authenticate();
		$result = array();
		$query = new stdClass();
		if (!empty($id)) {
			$data['header']['site_title'] = 'Refund Details';
			$order_id = base64_decode($oid);
			$decode_id = base64_decode($id);
			$query = $this->Order_model->orderDetails($order_id);
			$refund_details = $this->Order_model->refundDetails($decode_id);
			//pr($query);die;
		} else {
			$this->session->set_flashdata('error_msg', 'No Order Selected');
			redirect('Orders/refundlisting');
		}

		if ($this->input->post()) {
			$post['refund_status'] = $this->input->post('refund_status');
			if ($post['refund_status'] == 'completed') {
				$post['refund_number'] = uniqid();
			}
			$post['updated_at'] = date("Y-m-d H:i:s");
			//$post['delivery_status'] =$this->input->post('delivery_status');			
			//$post['modifiedBy'] =$this->session->userdata('user_id');

			$result = $this->Order_model->saveRefundOrder($post, $decode_id);
			if (!empty($result)) {
				$this->session->set_flashdata('success_msg', 'Successfully Updated');
			} else {
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');
			}
			redirect('Orders/refundlisting');
		}
		$data['query'] = $query;
		$data['refund_details'] = $refund_details;
		$this->render('admin/saveRefund', $data);
	}
	public function listing()
	{
		authenticate();
		$user_id = $this->session->userdata('user_id');
		//$seller_id  = $this->input->post('seller_id');
		//if ($this->session->userdata('user_role_ids') != '1') {
			//$seller_id  = $this->session->userdata('seller_id');
		//}
		//$year  = $this->input->post('year');
		//$start_date  = $this->input->post('start_date');
		//$end_date    = $this->input->post('end_date');
		//$data['datas'] = $this->Order_model->getOrderProducts();
                if ($this->input->get()) {
                    $data['search'] = $this->input->get();
                } else {
                    $data['search'] = [];
                    $data['search']['to'] = date('Y-m-d');
                    $data['search']['from'] = date('Y-m-d', strtotime('-29 days'));
                }
                $start_date = $data['search']['from'];
                $end_date = $data['search']['to'];
                $seller_id = $data['search']['seller_id'];
                $data['start_date'] = $start_date;
                $data['end_date'] = $end_date;
                $data['sellerid'] = $seller_id;
                
		$data['seller_name'] = $this->Order_model->getSellernameList();
                
		$data['datas'] = $this->Order_model->orderList($seller_id, $start_date, $end_date);
		$data['header']['site_title'] = 'Order List';
		$result = array();

		//pr($data['datas']);die;
		//$this->render('admin/listing', $data);
		$this->render('admin/listing', $data);
	}
	public function refundlisting()
	{
		authenticate();
		$user_id = $this->session->userdata('user_id');
		//$data['datas'] = $this->Order_model->getOrderProducts();
		$data['datas'] = $this->Order_model->refundList();
		$data['header']['site_title'] = 'Refund List';
		$result = array();

		//pr($data['datas']);die;
		$this->render('admin/refundlisting', $data);
	}

	public function statusChange($id)
	{
		//authenticate();	
		$id = base64_decode($id);
		$result = $this->Order_model->productStatusChange($id);
		if (!empty($result)) {
			$this->session->set_flashdata('success_msg', 'Successfully Updated');
		} else {
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');
		}
		redirect('Orders/listing');
	}

	public function remove($id)
	{
		$result = $this->Order_model->orderRemove($id);
		return $result;
	}
	public function refund_remove($id)
	{
		$result = $this->Order_model->refundRemove($id);
		return $result;
	}

	/*public function saveReview($id=''){	
		authenticate();
		
		if($this->input->post()){			
			$post['seller_id'] =$this->input->post('seller_id');
			$post['parent_id'] =$this->input->post('parent_id');			
			$post['order_id'] =$this->input->post('order_id');			
			$post['review'] =$this->input->post('review');			
			$post['modifiedBy'] =$this->session->userdata('user_id');
			$post['user_id'] =$this->session->userdata('user_id');
			$post['addedOn'] =date('Y-m-d H:i:s');
			
			$result = $this->Order_model->saveReview($post,$post['id']);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Orders/listing');
		}
		 
	}*/
	public function acceptOrder($id)
	{
		//authenticate();	
		$id = base64_decode($id);
		$post['is_approved'] = 1;
		$post['order_status'] = 'preparing_food';
		$result = $this->Order_model->saveOrder($post, $id);
		$orderDetails = $this->Order_model->orderDetails($id);
		$store_lat = $orderDetails->store_lat;
		$store_long = $orderDetails->store_long;


		$this->Order_model->setDeliveryBoys($id, $store_lat, $store_long);

		if (!empty($result)) {
			$this->session->set_flashdata('success_msg', 'Successfully Updated');
		} else {
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');
		}
		redirect('Orders/listing');
	}
	//*********************************************************************************************//

	public function generatepdf()
	{
		authenticate();
		$user_id = $this->session->userdata('user_id');
		//$data['datas'] = $this->Order_model->getOrderProducts();
		//$data['datas'] = $this->Order_model->convertpdf();
		$data['header']['site_title'] = 'Order List';
		$result = array();

		//pr($data['datas']);die;
		//$this->render('admin/listing', $data);
		$this->convertpdf();
		$this->render('admin/generatepdf', $data);
	}
	/*function convertpdf(){
 
 
	// Get output html
        $html = $this->output->get_output();
        
        // Load pdf library
        $this->load->library('pdf');
        
        // Load HTML content
        $this->pdf->loadHtml($html);
        
        // (Optional) Setup the paper size and orientation
        $this->pdf->setPaper('A4', 'landscape');
        
        // Render the HTML as PDF
        $this->pdf->render();
        
        // Output the generated PDF (1 = download and 0 = preview)
        $this->pdf->stream("welcome.pdf", array("Attachment"=>0));
        
        
   }*/
	function testpdf()
	{
		/*$this->load->library('pdf');
		//$html = 'testing pdf testing pdf';
                
                //$html = $this->load->view('generatepdf',[],true);
                $data['header']['site_title'] = 'Order List';
		$result=array();
                $html = $this->render('admin/generatepdf', $data);
                //$dompdf->loadHtml($html);
                $dompdf = new PDF();
		$dompdf->load_html($html);
                //$dompdf->$this->render->view('admin/generatepdf', $data);
		$dompdf->render();
		$output = $dompdf->output();
                $dompdf->stream("test.pdf", array("Attachment"=>0));
		//file_put_contents('test.pdf', $output);
                */

		$dompdf = new Dompdf\Dompdf();
		$html = $this->load->view('admin/generatepdf', [], true);
		//$html = 'testing pdf testing pdf';
		$dompdf->loadHtml($html);
		$dompdf->setPaper('A4', 'landscape');
		$dompdf->render();
		$pdf = $dompdf->output();
		$dompdf->stream("test.pdf", array("Attachment" => 0));
		$dompdf->stream();
	}

	public function lebel($id = '', $orderno)
	{
		authenticate();
		$query = new stdClass();
		$query = $this->Order_model->lebelGenerate($id);
		$oid = base64_decode($id);
		//print_r($data);
		$data['header']['site_title'] = 'Lebel Generate';
		$data['query'] = $query;
		$query = $this->barcode($oid, $orderno);
		$this->load->view('admin/lebel', $data);
	}

	public function barcode($oid, $orderno)
	{
		//I'm just using rand() function for data example
		$data = [];
		$cudate = date("h:i:sa");
		$code = $oid . '_' . $orderno;

		//load library
		$this->load->library('zend');
		//load in folder Zend
		$this->zend->load('Zend/Barcode');
		//generate barcode
		$imageResource = Zend_Barcode::factory('code128', 'image', array('text' => $code), array())->draw();
		imagepng($imageResource, 'barcodes/' . $code . '.png');

		$data['barcode'] = 'barcodes/' . $code . '.png';
		//$this->load->view('lebel',$data);
		$this->load->view('admin/lebel', $data);
	}

	public function earninglisting()
	{
		/*authenticate();
		$user_id = $this->session->userdata('user_id');
		$search = $this->input->get();
		//$data['datas'] = $this->Order_model->getOrderProducts();
		$data['datas'] = $this->Order_model->totalEarning($search);
		$data['search'] = $search;
		//$data['total_balance'] = $this->Order_model->getEarningTotalSum($start_date,$end_date);
		$data['header']['site_title'] = 'Profit Reports';
		$result = array();
		$this->render('admin/earninglisting', $data); 
                */
                authenticate();
                $data['header']['site_title'] = 'Profit Reports';
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
                $data['datas'] = $this->Order_model->totalEarning($user_id, $start_date, $end_date);
                $this->render('admin/earninglisting', $data);
                
                
	}

	public function casereport()
	{
		authenticate();
		
                if ($this->input->get()) {
                     $data['search'] = $this->input->get();
                 } else {
                     $data['search'] = [];
                     $data['search']['to'] = date('Y-m-d');
                     $data['search']['from'] = date('Y-m-d', strtotime('-29 days'));
                 }
            $start_date = $data['search']['from'];
            $end_date = $data['search']['to'];
            $seller_id = $data['search']['seller_id'];
            $data['start_date'] = $start_date;
            $data['end_date'] = $end_date;
            $data['sellerid'] = $seller_id;

            //$data['datas'] = $this->Order_model->getOrderProducts();
            $data['seller_name'] = $this->Order_model->getSellernameList();
            $data['datas'] = $this->Order_model->saleCaseReport($seller_id, $start_date, $end_date);
            $data['total_balance'] = $this->Order_model->getEarningTotalSum($seller_id, $start_date, $end_date);
            $data['header']['site_title'] = 'Sales & Cash Reports';
            $result = array();
            $this->render('admin/casereport', $data);    
           
	}

	public function vendor_order_listing($seller_id, $sdate, $edate)
	{
		authenticate();
		$search = $this->input->get();
		$seller_id = base64_decode($seller_id);
		//$search_date = !empty($search['date']) ? $search['date'] : $date;
		$data['datas'] = $this->Order_model->sellerOrderList($seller_id, $sdate, $edate);
		$data['search'] = $search;
		$data['date'] = $search_date;
		$data['header']['site_title'] = $data['datas'][0]->store . ' Order List';

		//pr($data);die;
		$this->render('admin/vendor_order_listing', $data);
	}

	public function update_order_status($id)
	{
		authenticate();
		$result = array();
		$query = new stdClass();

		if ($this->input->post()) {
			$order_status = $this->input->post('order_status');
			$result = $this->Order_model->updateOrderStatus($order_status, $id);
			if (!empty($result)) {
				$this->session->set_flashdata('success_msg', 'Successfully Updated');
			} else {
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');
			}
			redirect('Orders/listing');
		}
		//$data['query'] = $query;
		//$this->render('admin/save', $data);  
	}

	public function update_refund_status($id)
	{
		authenticate();
		$result = array();
		$query = new stdClass();

		if ($this->input->post()) {
			$refund_status = $this->input->post('refund_status');
			$result = $this->Order_model->updateRefundStatus($refund_status, $id);
			if (!empty($result)) {
				$this->session->set_flashdata('success_msg', 'Successfully Updated');
			} else {
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');
			}
			redirect('Orders/refundlisting');
		}
		//$data['query'] = $query;
		//$this->render('admin/save', $data);  
	}
        
        public function PaymentStatusChange($id)
	{
		//authenticate();	
		$did = base64_decode($id);
		$result = $this->Order_model->paymentStatusChange($did);
		if (!empty($result)) {
			$this->session->set_flashdata('success_msg', 'Successfully Updated');
		} else {
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');
		}
		redirect('Orders/listing');
	}
        
        public function kitchen_order($id = '', $orderno)
	{
		authenticate();
		$query = new stdClass();
		$query = $this->Order_model->lebelGenerate($id);
		$oid = base64_decode($id);
		//print_r($data);
		$data['header']['site_title'] = 'Kitchen Order';
		$data['query'] = $query;
		$query = $this->barcode($oid, $orderno);
		$this->load->view('admin/kitchen_order', $data);
	}
        
        

}

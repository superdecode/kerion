<?php defined('BASEPATH') or exit('No direct script access allowed');

class Users extends BackendController
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
		$this->load->model('User_model');
		$config = array(
                'protocol'  => 'smtp',
                'smtp_host' => 'mail.xxxxxx.com',
                'smtp_port' => 465,
                'smtp_user' => 'no-reply@xxxxxxx.com',
                'smtp_pass' => 'demo!@#456',
                'mailtype'  => 'html',
                'charset'   => 'utf-8'
		);
		$this->load->library('email', $config);	
		$this->load->library(array('form_validation','image_lib'));		
    }

	public function index(){
	   
	}
    
	public function loginRecordsList($email){
		$email = base64_decode($email);
		echo $loginRecords = $this->User_model->getLoginRecords($email);
	}
	
	

	public function getStateList($country_id){		                                  
		echo state_list_dropdown('',$country_id);                                   
	}
	public function getCityList($state_id){		                                  
		echo city_list_dropdown('',$state_id);                                   
	}
	

    
    public function listingqrcode()
    {
		authenticate();		
		$data['header']['site_title'] = 'QR code List';
		$data['datas'] = $this->User_model->getQrCode();
                $data['seller_name'] = $this->User_model->getSellernameList();
                
		$this->render('admin/listingqrcode', $data);
		
    }
      
    
    public function listingSeller()
    {
		authenticate();		
		$data['header']['site_title'] = 'Seller List';
		$data['datas'] = $this->User_model->getSeller();
               
		//pr($data['datas']); die;
		$result=array();
		$this->render('admin/listingSeller', $data);
    } 
	
	public function statusChange($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->User_model->userStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Users/listingCustomer');
    }
	public function statusChangeSeller($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->User_model->userStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Users/listingSeller');
    }
	
	public function verifiedStatusSeller($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->User_model->verifiedStatusCompany($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Users/listingSeller');
    }
	
	public function remove($id){
            
		$result = $this->User_model->userRemove($id);
		return $result;
	}
	
	public function save($id=''){
		authenticate();			
		$result=array();
		$query = new stdClass();
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');
		if(!empty($id)){
			$data['header']['site_title'] = 'Modify Seller';
			$decode_id= base64_decode($id);
			$query = $this->User_model->getSellerData($decode_id);
			//pr($query);die;
		}else{
			$data['header']['site_title'] = 'Add Seller';
			$query->fname='';
			$id='';
		}
		
		if($this->input->post()){
			//pr($this->input->post());die;			
			//pr($_FILES);die();
                       $post['city'] =$this->input->post('city_id');
			$post['seller_name'] =$this->input->post('seller_name');
                        $post['seller_type'] =!empty($this->input->post('seller_type'))?implode(',',$this->input->post('seller_type')):'';
			//$post['category_name'] =$this->input->post('category_name');
			$post['phone_number'] =$this->input->post('phone_number');
			$post['address'] =$this->input->post('address');
			$post['rating'] =$this->input->post('rating');
                        $post['open_time'] =$this->input->post('open_time');
                        $post['seller_details'] =$this->input->post('seller_details');
                        $post['close_time'] =$this->input->post('close_time');
                        $post['offer_massage'] =$this->input->post('offer_massage');
                        
			$post['addedOn'] = gmdate('Y-m-d H:i:s');
			// For Profile Image Upload Start
			$image=$this->input->post('profile_image');
			if($_FILES['profile_avatar']['name']!="")
			{					
				if(!empty($image)) unlink($this->user_images.'/'.$image);
				$value = $_FILES['profile_avatar']['name'];
				//echo $value;
				
				$config = array(
						'file_name' => 'avatar_'.$user_id.'_'.date('Ymdhis'),
						'allowed_types' => 'png|jpg|jpeg|gif|', //jpg|jpeg|gif|
						'upload_path' => $this->user_images,
						'max_size' => 20000
				);

				$this->upload->initialize($config);
				if ( ! $this->upload->do_upload('profile_avatar')) {
						 // return the error message and kill the script
						$this->session->set_flashdata('error_msg', $this->upload->display_errors());	
						redirect('Users/listingCustomer/');
				}
				$image_data = $this->upload->data();
				$image=$image_data['file_name'];
			}
			$post['profile_image'] = $image;
			//*****************************************	
			if(!empty($id)){
                         $result = $this->User_model->updateSallerDetails($post,$decode_id);
			}
                        else {
                        $result = $this->User_model->saveSeller($post);
                        }
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Users/listingSeller/');
		}
                 $data['city_list'] = $this->User_model->getCityAllList();
		//pr($data);die;
		$data['query']=$query;
                $data['seller_type'] = $this->User_model->getSellerTypeList();
		$this->render('admin/save', $data);  
	}
        
        public function generate_qrcode($data){
         
        /* Load QR Code Library */
        $this->load->library('ciqrcode');    
		 /* Data */
        $hex_data   = bin2hex($data);
        $save_name  = $hex_data.'.png';

        /* QR Code File Directory Initialize */
        $dir = 'assets/uploads/qrcode/';
        if (!file_exists($dir)) {
            mkdir($dir, 0775, true);
        }

        /* QR Configuration  */
        $config['cacheable']    = true;
        $config['imagedir']     = $dir;
        $config['quality']      = true;
        $config['size']         = '1024';
        $config['black']        = array(255,255,255);
        $config['white']        = array(255,255,255);
        $this->ciqrcode->initialize($config);
  
        /* QR Data  */
        $params['data']     = $data;
        $params['level']    = 'L';
        $params['size']     = 10;
        $params['savename'] = FCPATH.$config['imagedir']. $save_name;
        
        $this->ciqrcode->generate($params);

        /* Return Data */
        $return = array(
            'seller_id' => $data,
            'file'    => $dir. $save_name
        );
        return $return;
         
	}
        
        function add_qr_data()
	{
        /* Generate QR Code */
        $data = $this->input->post('seller_id');
        $qr   = $this->generate_qrcode($data);
        
        /* Add Data */
        $result = $this->User_model->insert_qr_data($qr,$data);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Seller name duplicate');				
		}
        /*if($this->home_model->insert_data($qr)) {
            $this->modal_feedback('success', 'Success', 'Add Data Success', 'OK');
        } else {
            $this->modal_feedback('error', 'Error', 'Add Data Failed', 'Try again');
        }*/
        redirect('Users/listingqrcode');

    }
      
    public function sellertype()
    {
		authenticate();		
		$data['header']['site_title'] = 'Seller Type';
		$data['datas'] = $this->User_model->getSellerType();
               
		//pr($data['datas']); die;
		$result=array();
		$this->render('admin/sellertype', $data);
    } 
    public function sellerTypeSave($id=''){		
		if($this->input->post()){
                $this->seller_type_images=realpath(APPPATH . '../assets/uploads/seller_type_images/');
                //pr($_FILES);pr($this->input->post()); die;
                $post['seller_type'] =$this->input->post('seller_type');
			// For Image Upload Start
                        $image=$this->input->post('image');
                        if($_FILES['seller_type_images']['name']!="")
                        {					
                                if(!empty($image)) unlink($this->seller_type_images.'/'.$image);
                                $value = $_FILES['seller_type_images']['name'];
                                //echo $value;

                                $config = array(
                                                'file_name' => 'seller_type_images_'.date('Ymdhis'),
                                                'allowed_types' => 'png|jpg|jpeg|gif|', //jpg|jpeg|gif|
                                                'upload_path' => $this->seller_type_images,
                                                'max_size' => 20000
                                );

                                $this->upload->initialize($config);
                                if ( ! $this->upload->do_upload('seller_type_images')) {
                                                 // return the error message and kill the script
                                                //$this->upload->display_errors();
                                                $this->session->set_flashdata('error_msg', $this->upload->display_errors());
                                                redirect('Users/sellertype');
                                }
                                $image_data = $this->upload->data();
                                $image=$image_data['file_name'];
                        }
                        $post['image'] = $image;
			//*****************************************	
			
			if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =gmdate('Y-m-d H:i:s');
			}
			$result = $this->User_model->saveSellerType($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Users/sellertype');
		} 
	}
         public function sellerTypeStatusChange($id)
        {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->User_model->typeStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Users/sellertype');
        }
	public function sellerTyperemove($id){
		$result = $this->User_model->SellerTypeRemove($id);
		return $result;
	}
        public function removeqrcode($id){
		$result = $this->User_model->QrCodeRemove($id);
		return $result;
	}
	
}

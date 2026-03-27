<?php defined('BASEPATH') or exit('No direct script access allowed');

class Sellers extends BackendController
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
		$this->load->model('Seller_model');
		$config = array(
                'protocol'  => 'smtp',
                'smtp_host' => 'mail.xxxxxx.com',
                'smtp_port' => 465,
                'smtp_user' => 'no-reply@xxxxx.com',
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
		echo $loginRecords = $this->Seller_model->getLoginRecords($email);
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
		$data['datas'] = $this->Seller_model->getQrCode();
                $data['seller_name'] = $this->Seller_model->getSellernameList();
                
		$this->render('admin/listingqrcode', $data);
		
    }
      
    
    public function listingSeller()
    {
		authenticate();		
		$data['header']['site_title'] = 'Seller List';
		$data['datas'] = $this->Seller_model->getSeller();
               
		//pr($data['datas']); die;
		$result=array();
		$this->render('admin/listingSeller', $data);
    } 
	
	public function statusChange($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Seller_model->userStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Sellers/listingCustomer');
    }
	public function statusChangeSeller($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Seller_model->userStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Sellers/listingSeller');
    }
	
	public function verifiedStatusSeller($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Seller_model->verifiedStatusCompany($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Sellers/listingSeller');
    }
	
	public function remove($id){
            
		$result = $this->Seller_model->userRemove($id);
		return $result;
	}
	
	public function save($id=''){
		authenticate();			
		$result=array();
		$query = new stdClass();
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');
                $data['datas'] = $this->Seller_model->getCategoryList();
                $data['parent_categories'] = $this->Seller_model->getActiveCategoryList('0');
		if(!empty($id)){
			$data['header']['site_title'] = 'Modify Seller';
			$decode_id= base64_decode($id);
			$query = $this->Seller_model->getSellerData($decode_id);
                        $data['childcategories'] = $this->getAllchildcategoryData($query->seller_type,$query->chld_category_id);
			//pr($data);die;
		}else{
                        $data['childcategories'] ='<option value="">Select Child Category</option>'; 
			$data['header']['site_title'] = 'Add Seller';
			$query->fname='';
			$id='';
		}
		
		if($this->input->post()){
			//pr($this->input->post());die;			
			//pr($_FILES);die();
                       $post['city'] =$this->input->post('city_id');
			$post['seller_name'] =$this->input->post('seller_name');
                        //$post['seller_type'] =!empty($this->input->post('seller_type'))?implode(',',$this->input->post('seller_type')):'';
                        $post['seller_type']=$this->input->post('seller_type');
                        $post['chld_category_id'] =$this->input->post('chld_category_id');
			//$post['category_name'] =$this->input->post('category_name');
			$post['phone_number'] =$this->input->post('phone_number');
			$post['address'] =$this->input->post('address');
			$post['rating'] =$this->input->post('rating');
                        //$post['open_time'] =$this->input->post('open_time');
                        $post['seller_details'] =$this->input->post('seller_details');
                        //$post['close_time'] =$this->input->post('close_time');
                        $post['offer_massage'] =$this->input->post('offer_massage');
                        $post['seller_commission'] =$this->input->post('seller_commission');
                        
                        
                        
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
						redirect('Sellers/listingCustomer/');
				}
				$image_data = $this->upload->data();
				$image=$image_data['file_name'];
			}
			$post['profile_image'] = $image;
			//*****************************************	
			if(!empty($id)){
                         $result = $this->Seller_model->updateSallerDetails($post,$decode_id);
                          $u_id = base64_decode($id);
			}
                        else {
                        $result = $this->Seller_model->saveSeller($post);
                        $u_id = $result;
                        $data = $u_id;
                        $qr   = $this->generate_qrcode($u_id);
                        $this->Seller_model->insert_qr_data($qr,$data);
                        }
                        //******************Scheduling*******************************************//
			//$u_id = $result;
			if(!empty($this->input->post('schedule_day'))){
				$res = $this->db->delete('user_schedules', array('user_id' => $u_id));
				foreach($this->input->post('schedule_day') as $k_d=>$day){
					$post_schedule['user_id'] =$u_id;
					$post_schedule['day'] =$day;
					$post_schedule['day_name'] =$this->input->post('schedule_day_name')[$k_d];
					$post_schedule['type'] =!empty($this->input->post('schedule_type')[$k_d])?'Open':'Closed';
					$post_schedule['time_from'] =$this->input->post('schedule_time_from')[$k_d];
					$post_schedule['time_to'] =$this->input->post('schedule_time_to')[$k_d];
					$this->Seller_model->addUserSchedule($post_schedule);
				}
			}
			//***********************************************************************//
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Sellers/listingSeller/');
		}
                 $data['city_list'] = $this->Seller_model->getCityAllList();
		//pr($data);die;
		$data['query']=$query;
                $data['seller_type'] = $this->Seller_model->getSellerTypeList();
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
        $result = $this->Seller_model->insert_qr_data($qr,$data);
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
        redirect('Sellers/listingqrcode');

    }
      
    public function sellertype()
    {
		authenticate();		
		$data['header']['site_title'] = 'Seller Type';
		$data['datas'] = $this->Seller_model->getSellerType();
               $data['parent_categories'] = $this->Seller_model->getActiveCategoryList('0');
		//pr($data['datas']); die;
		$result=array();
		$this->render('admin/sellertype', $data);
    } 
    public function sellerTypeSave($id=''){		
		if($this->input->post()){
                $this->seller_type_images=realpath(APPPATH . '../assets/uploads/seller_type_images/');
                //pr($_FILES);pr($this->input->post()); die;
                
                $post['parent_id'] =$this->input->post('parent_id');
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
                                                redirect('Sellers/sellertype');
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
			$result = $this->Seller_model->saveSellerType($post,$id);
                        
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Sellers/sellertype');
		} 
	}
         public function sellerTypeStatusChange($id)
        {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Seller_model->typeStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Sellers/sellertype');
        }
	public function sellerTyperemove($id){
		$result = $this->Seller_model->SellerTypeRemove($id);
		return $result;
	}
        public function removeqrcode($id){
		$result = $this->Seller_model->QrCodeRemove($id);
		return $result;
	}
	
        public function getAllchildcategory($pid,$selected_id=''){
           
		$query = $this->Seller_model->getAllChildCategory($pid);
                //pr($query);die;
                //echo 'myid'.$pid;
		$selected='';
		$html='<option value="">Select child category</option>';
		if(!empty($query)){
			foreach($query as $k=>$val){
				if($val->id==$selected_id){ $selected="selected";}else{$selected="";}
				$html.='<option value="'.$val->id.'" '.$selected.' >'.$val->seller_type.'</option>';
			}
		}		
		echo $html;
	}
        
        public function getAllchildcategoryData($pid,$selected_id=''){
            
           
		$query = $this->Seller_model->getAllChildCategory($pid);
                //pr($query);die;
                
		$selected='';
		$html='<option value="">Select child category</option>';
		if(!empty($query)){
			foreach($query as $k=>$val){
				if($val->id==$selected_id){ $selected="selected";}else{$selected="";}
				$html.='<option value="'.$val->id.'" '.$selected.' >'.$val->seller_type.'</option>';
			}
		}		
		return $html;
	}
        public function sellertable()
        {
		authenticate();		
		$data['header']['site_title'] = 'Seller Table';
		$data['datas'] = $this->Seller_model->getSellerTable();
                $data['seller_name'] = $this->Seller_model->getSellernameList();
		//pr($data['datas']); die;
		$result=array();
		$this->render('admin/seller_table', $data);
        }
        
        public function sellerTableSave($id=''){		
		if($this->input->post()){
                
                $table_number =$this->input->post('table_number');
                $seller_id =$this->input->post('seller_id');
                $cont_table = $this->Seller_model->getSellerTableCount($seller_id);
                
                 //foreach($table_name as $k=> $rows) {
                $table_word='Table-';
                
                 if(!empty($id)){
                     //$post['seller_id'] =$this->input->post('seller_id'); 
                     $post['table_number'] =$this->input->post('table_number');
                     $result = $this->Seller_model->saveTableNumber($post,$id);
                }else{
                        $post['addedBy'] =$this->session->userdata('user_id');
                        $post['addedOn'] =gmdate('Y-m-d H:i:s');
                        $k=$cont_table+1;
                        for($i=1;$i<=$table_number;$i++)
                        {
                             $post['seller_id'] =$this->input->post('seller_id'); 
                             $post['total_table'] =$table_number; 
                            $post['table_number'] = $table_word.$k; 
                           // die();
                            $result = $this->Seller_model->saveTableNumber($post,$id);
                            $s_id =$post['seller_id'];
                            $t_id = $result;
                            $gen_ids= $s_id.'-'.$result;
                            
                            //$data = $u_id;
                            $qr   = $this->generate_table_qrcode($gen_ids);
                            
                            $this->Seller_model->insert_qr_table_data($qr,$s_id,$t_id);    
                            
                           $k++;  
                           }
                          
                }
                
                if(!empty($result)){
                        $this->session->set_flashdata('success_msg', 'Successfully Updated');							
                }else{
                        $this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
                }
                redirect('Sellers/sellertable');
		} 
	}
        public function sellerTableremove($id){
		$result = $this->Seller_model->SellerTableRemove($id);
		return $result;
	}
        
         public function generate_table_qrcode($data){
         
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
        $dataget= explode("-",$data);
        /* Return Data */
        $return = array(
            'seller_id' => $dataget[0],
            'table_id' => $dataget[1],
            'file'    => $dir. $save_name
        );
        return $return;
         
	}
        
        public function print_qr($id)
    {
		authenticate();
                $query = new stdClass();
		$query = $this->Seller_model->qrGenerate($id);
                $oid = base64_decode($id);
                //print_r($data);
		$data['header']['site_title'] = 'QR Generate';
		$data['query'] = $query;
                $this->load->view('admin/print_qr', $data);
    }
    public function print_table_qr($id)
    {
		authenticate();
                $query = new stdClass();
		$query = $this->Seller_model->TableqrGenerate($id);
                $oid = base64_decode($id);
                //print_r($data);
		$data['header']['site_title'] = 'QR Generate';
		$data['query'] = $query;
                $this->load->view('admin/print_qr', $data);
    }
        
}

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
    public function profile()
    {
		authenticate();
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');		
		$data['header']['site_title'] = 'Profile Information';
		$result=array();
		$user_id = $this->session->userdata("user_id");
		$profile = $this->User_model->getUserData($user_id);
		
		
		if(!empty($profile)){		
			$data['profile']=$profile;
			$loginRecords = $this->User_model->getLoginRecords($profile->user_email);
			$data['loginRecords']=$loginRecords;
			
			if($this->input->post()){				
				
				$post['modifiedBy'] =$this->session->userdata('user_id');
				//$post['fname'] =$this->input->post('fname');
				//$post['lname'] =$this->input->post('lname');
				$post['full_name'] =$this->input->post('full_name');
				$post['dob'] =$this->input->post('dob');
				$post['gender'] =$this->input->post('gender');
				$post['about'] =$this->input->post('about');
				$post['shop_name'] =$this->input->post('shop_name');
				$post['phone_no'] =$this->input->post('phone_no');
				$post['phone_code'] =$this->input->post('phone_code');
				
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
							redirect('Users/profile');
					}
					$image_data = $this->upload->data();
					$image=$image_data['file_name'];
				}
				$post['profile_image'] = $image;
			//*****************************************	
				
				$result=$this->User_model->updateUser($user_id,$post);
				
				
				//die;
				if(!empty($result)){
					$this->session->set_flashdata('success_msg', 'Successfully Updated');							
				}else{
					$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
				}
				redirect('Users/profile');
			}			
		}else{
			$this->session->set_flashdata('error_msg', 'User not available');
			redirect('Users');
		}
		$this->render('admin/profile', $data);   
    }
	public function account_settings()
    {
		authenticate();		
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');		
		$data['header']['site_title'] = 'Account Settings';
		$result=array();
		$system_name = get_settings_value('system_name');
		$user_id = $this->session->userdata("user_id");
		$profile = $this->User_model->getUserData($user_id);
		$languageList = $this->User_model->languageList();
		
		if(!empty($profile)){		
			$data['profile']=$profile;
			$data['languageList']=$languageList;
			//pr($profile);die;
			$secret= !empty($profile->settings->google_auth_code)?$profile->settings->google_auth_code:$this->googleauthenticator->createSecret();
			$data['google_auth_code'] =$secret; ;
			$qrCodeUrl = $this->googleauthenticator->getQRCodeGoogleUrl($system_name, $profile->user_login_id, $secret);
			$data['qrCode'] = $qrCodeUrl;
			//print_r($profile).'---'.$qrCodeUrl;
			//die;
			if($this->input->post()){
				//pr($this->input->post()); die;
				
				$post['modifiedBy'] =$this->session->userdata('user_id');
				$post['time_zone'] =$this->input->post('time_zone');
				$post['language_id'] =$this->input->post('language_id');
				$post['multifactor_authenticate'] =!empty($this->input->post('multifactor_authenticate'))?'1':'0';
				$post['authenticate_using_otp'] =!empty($this->input->post('authenticate_using_otp'))?'1':'0';
				$post['authenticate_using_google'] =!empty($this->input->post('authenticate_using_google'))?'1':'0';
				$post['otp_phone'] =!empty($this->input->post('otp_phone'))?$this->input->post('otp_phone'):'';
				$post['google_auth_code'] =$this->input->post('google_auth_code');
				$code = $this->input->post('code');				
				if(!empty($code)){
					$checkResult = $this->googleauthenticator->verifyCode($secret, $code, 2); // 2 = 2*30sec clock tolerance 
					
					if ($checkResult) {
						$result=$this->User_model->updateUserSettings($user_id,$post);
						if(!empty($result)){
							$this->session->set_flashdata('success_msg', 'Successfully Updated');							
						}else{
							$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
						}				
					} else {
						$this->session->set_flashdata('error_msg', 'Wrong Code!!');
					}
				}else{
					$result=$this->User_model->updateUserSettings($user_id,$post);
					if(!empty($result)){
						$this->session->set_flashdata('success_msg', 'Successfully Updated');							
					}else{
						$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
					}	
				}
				$this->session->set_userdata('user_time_zone',$post['time_zone']);				
				//die;				
				redirect('Users/account_settings');				
			}			
		}else{
			$this->session->set_flashdata('error_msg', 'User not available');
			redirect('Users');
		}
		$this->render('admin/account_settings', $data);   
    }
	public function change_password()
    {
		authenticate();
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');		
		$data['header']['site_title'] = 'Change Password';
		$result=array();
		$user_id = $this->session->userdata("user_id");
		$profile = $this->User_model->getUserData($user_id);
		
		if(!empty($profile)){
			$data['profile']=$profile;
			if($this->input->post()){
				//echo '<pre>';print_r($this->input->post()); die;
				$current_password = $this->input->post('current_password');
				$verify_password = $this->input->post('verify_password');
				$new_password = $this->input->post('new_password');
				$password_strength = $this->input->post('password_strength');
				if($password_strength=='0'){
					$this->session->set_flashdata('error_msg', 'Error! Password should include alphabets, numbers and special characters!');	
				}else{
					if($new_password==$verify_password){				
						$current_password_chk = $this->User_model->checkCurrentPassword($current_password,$user_id);
						if(empty($current_password_chk)){
							$this->session->set_flashdata('error_msg', 'Error! Old Password is Not Correct!');	
						}else{
							$passwordChange = $this->User_model->changePassword($verify_password,$user_id);
							if($passwordChange==TRUE){
								$this->session->set_flashdata('success_msg', 'Password updated successfully');							
							}else{
								$this->session->set_flashdata('error_msg', 'Error! Password not changed!');
							}
						}
					}else{
						$this->session->set_flashdata('error_msg', 'Error! Verify Password is not same as New Password!');
					}
				}				
				//die;	
				redirect('Users/change_password');
			}			
		}else{
			$this->session->set_flashdata('error_msg', 'User not available');
			redirect('Users');
		}		
		$this->render('admin/change_password', $data);   
    }
	public function check_ips()
    {
		authenticate();
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');		
		$data['header']['site_title'] = 'Check IP Address List';
		$result=array();
		$user_id = $this->session->userdata("user_id");
		$profile = $this->User_model->getUserData($user_id);
		
		if(!empty($profile)){		
			$data['profile']=$profile;
			if($this->input->post()){
				//echo '<pre>';print_r($this->input->post());
				$this -> db -> where('user_id', $user_id);
				$this -> db -> delete('user_ip_addresses');
				
				$ip_address_froms = $this->input->post('ip_address_from');
				//print_r($ip_address_froms);
				foreach($ip_address_froms as $k1=>$ip_address_from){
					if(!empty($ip_address_from)){
						$post2['user_id'] = $user_id;
						$post2['ip_address_from'] = $ip_address_from;
						$post2['ip_address_to'] = $this->input->post('ip_address_to')[$k1];
						$post2['addedOn'] = gmdate('Y-m-d H:i:s');
						$post2['addedby'] =$this->session->userdata('user_id');
						$post2['modifiedBy'] =$this->session->userdata('user_id');
						$result2=$this->User_model->addUserIPAddresses($post2);
						//print_r($post2);
					}
				}
				//die;
				$this->session->set_flashdata('success_msg', 'Successfully Updated');
				redirect('Users/check_ips');
			}			
		}else{
			$this->session->set_flashdata('error_msg', 'User not available');
			redirect('Users');
		}		
		$this->render('admin/check_ips', $data);   
    }
	
	public function loginRecordsList($email){
		$email = base64_decode($email);
		echo $loginRecords = $this->User_model->getLoginRecords($email);
	}
	
	
	public function changePasswordTemp($id)
    {
		authenticate();
		$id= base64_decode($id);		
		$result=array();
		$user_id = $id;
		$profile = $this->User_model->getUserData($user_id);
		//pr($profile);
		if(!empty($profile)){
			$data['profile']=$profile;
			
			$password =substr( $this->googleauthenticator->createSecret(),0,8);	
			//$password ='Dingshi2014';	
			//
			$passwordChange = $this->User_model->changePasswordTemporary(md5($password),$user_id);
			//pr($password);pr(md5($password));die;
			if($passwordChange==TRUE){
				
				$this->email->set_mailtype("html");
				$this->email->set_newline("\r\n");
				
				$email_temp = get_email_template('user_recovery_password');
				$msg = str_replace("[var.login_id]",$profile->user_login_id,$email_temp->content);
				$msg = str_replace("[var.password]",$password,$msg);
				$msg = str_replace("[var.system_name]",get_settings_value('system_name'),$msg);
				
				$this->email->to($profile->user_login_id,$profile->fname);
				//$this->email->to('sayanoffline@gmail.com');
				$this->email->bcc('sayanoffline@gmail.com');
				$this->email->from($email_temp->email_from);
				$this->email->subject($email_temp->email_subject);
				$this->email->message($msg);
				$this->email->send();
				
				
				
				$this->session->set_flashdata('success_msg', 'Default Password has been sent. Please check your mailbox!');							
			}else{
				$this->session->set_flashdata('error_msg', 'Error! Password not changed!');
			}	
						
		}else{
			$this->session->set_flashdata('error_msg', 'User not available');			
		}
			
		redirect('Users/listingCustomer');
		
    }
	public function getStateList($country_id){		                                  
		echo state_list_dropdown('',$country_id);                                   
	}
	public function getCityList($state_id){		                                  
		echo city_list_dropdown('',$state_id);                                   
	}
	
	
    public function listingCustomer($role_id="2")
    {
		authenticate();		
		$data['header']['site_title'] = 'Seller List';
		
		$data['role_id'] = $role_id;
		$data['datas'] = $this->User_model->getUsers($role_id);
		//pr($data['datas']); die;
		$result=array();
		$this->render('admin/listingCustomer', $data);
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
	
}

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
			'smtp_host' => 'mail.xxxxx.com',
			'smtp_port' => 465,
			'smtp_user' => 'no-reply@xxxxxx.com',
			'smtp_pass' => 'demo!@#456',
			'mailtype'  => 'html',
			'charset'   => 'utf-8'
		);
		$this->load->library('email', $config);
		$this->load->library(array('form_validation', 'image_lib'));
	}

	public function index()
	{
	}
	public function profile()
	{
		if($this->session->userdata("user_role_ids")!='1'){
			redirect('Users/sellerProfile');
		}
		authenticate();
		$this->user_images = realpath(APPPATH . '../assets/uploads/user_images/');
		$data['header']['site_title'] = 'información del perfil';
		$result = array();
		$user_id = $this->session->userdata("user_id");
		$profile = $this->User_model->getUserData($user_id);


		if (!empty($profile)) {
			$data['profile'] = $profile;
			$loginRecords = $this->User_model->getLoginRecords($profile->user_email);
			$data['loginRecords'] = $loginRecords;

			if ($this->input->post()) {

				$post['modifiedBy'] = $this->session->userdata('user_id');
				//$post['fname'] =$this->input->post('fname');
				//$post['lname'] =$this->input->post('lname');
				$post['full_name'] = $this->input->post('full_name');
				$post['dob'] = $this->input->post('dob');
				$post['gender'] = $this->input->post('gender');
				$post['about'] = $this->input->post('about');
				$post['shop_name'] = $this->input->post('shop_name');
				$post['phone_no'] = $this->input->post('phone_no');
				$post['phone_code'] = $this->input->post('phone_code');

				// For Profile Image Upload Start
				$image = $this->input->post('profile_image');
				if ($_FILES['profile_avatar']['name'] != "") {
					if (!empty($image)) unlink($this->user_images . '/' . $image);
					$value = $_FILES['profile_avatar']['name'];
					//echo $value;

					$config = array(
						'file_name' => 'avatar_' . $user_id . '_' . date('Ymdhis'),
						'allowed_types' => 'png|jpg|jpeg|gif|', //jpg|jpeg|gif|
						'upload_path' => $this->user_images,
						'max_size' => 20000
					);

					$this->upload->initialize($config);
					if (!$this->upload->do_upload('profile_avatar')) {
						// return the error message and kill the script
						$this->session->set_flashdata('error_msg', $this->upload->display_errors());
						redirect('Users/profile');
					}
					$image_data = $this->upload->data();
					$image = $image_data['file_name'];
				}
				$post['profile_image'] = $image;
				//*****************************************	

				$result = $this->User_model->updateUser($user_id, $post);


				//die;
				if (!empty($result)) {
					$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
				} else {
					$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
				}
				redirect('Users/profile');
			}
		} else {
			$this->session->set_flashdata('error_msg', 'Usuario no disponible');
			redirect('Users');
		}
		$this->render('admin/profile', $data);
	}

	public function account_settings()
	{
		authenticate();
		$this->user_images = realpath(APPPATH . '../assets/uploads/user_images/');
		$data['header']['site_title'] = 'Configuraciones de la cuenta';
		$result = array();
		$system_name = get_settings_value('system_name');
		$user_id = $this->session->userdata("user_id");
		$profile = $this->User_model->getUserData($user_id);
		$languageList = $this->User_model->languageList();

		if (!empty($profile)) {
			$data['profile'] = $profile;
			$data['languageList'] = $languageList;
			//pr($profile);die;
			$secret = !empty($profile->settings->google_auth_code) ? $profile->settings->google_auth_code : $this->googleauthenticator->createSecret();
			$data['google_auth_code'] = $secret;;
			$qrCodeUrl = $this->googleauthenticator->getQRCodeGoogleUrl($system_name, $profile->user_login_id, $secret);
			$data['qrCode'] = $qrCodeUrl;
			//print_r($profile).'---'.$qrCodeUrl;
			//die;
			if ($this->input->post()) {
				//pr($this->input->post()); die;

				$post['modifiedBy'] = $this->session->userdata('user_id');
				$post['time_zone'] = $this->input->post('time_zone');
				$post['language_id'] = $this->input->post('language_id');
				$post['multifactor_authenticate'] = !empty($this->input->post('multifactor_authenticate')) ? '1' : '0';
				$post['authenticate_using_otp'] = !empty($this->input->post('authenticate_using_otp')) ? '1' : '0';
				$post['authenticate_using_google'] = !empty($this->input->post('authenticate_using_google')) ? '1' : '0';
				$post['otp_phone'] = !empty($this->input->post('otp_phone')) ? $this->input->post('otp_phone') : '';
				$post['google_auth_code'] = $this->input->post('google_auth_code');
				$code = $this->input->post('code');
				if (!empty($code)) {
					$checkResult = $this->googleauthenticator->verifyCode($secret, $code, 2); // 2 = 2*30sec clock tolerance 

					if ($checkResult) {
						$result = $this->User_model->updateUserSettings($user_id, $post);
						if (!empty($result)) {
							$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
						} else {
							$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
						}
					} else {
						$this->session->set_flashdata('error_msg', 'Wrong Code!!');
					}
				} else {
					$result = $this->User_model->updateUserSettings($user_id, $post);
					if (!empty($result)) {
						$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
					} else {
						$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
					}
				}
				$this->session->set_userdata('user_time_zone', $post['time_zone']);
				//die;				
				redirect('Users/account_settings');
			}
		} else {
			$this->session->set_flashdata('error_msg', 'User not available');
			redirect('Users');
		}
		$this->render('admin/account_settings', $data);
	}
	public function change_password()
	{
		authenticate();
		$this->user_images = realpath(APPPATH . '../assets/uploads/user_images/');
		$data['header']['site_title'] = 'Cambiar Contraseña';
		$result = array();
		$user_id = $this->session->userdata("user_id");
		$profile = $this->User_model->getUserData($user_id);

		if (!empty($profile)) {
			$data['profile'] = $profile;
			if ($this->input->post()) {
				//echo '<pre>';print_r($this->input->post()); die;
				$current_password = $this->input->post('current_password');
				$verify_password = $this->input->post('verify_password');
				$new_password = $this->input->post('new_password');
				$password_strength = $this->input->post('password_strength');
				if ($password_strength == '0') {
					$this->session->set_flashdata('error_msg', 'Error! Password should include alphabets, numbers and special characters!');
				} else {
					if ($new_password == $verify_password) {
						$current_password_chk = $this->User_model->checkCurrentPassword($current_password, $user_id);
						if (empty($current_password_chk)) {
							$this->session->set_flashdata('error_msg', 'Error! Old Password is Not Correct!');
						} else {
							$passwordChange = $this->User_model->changePassword($verify_password, $user_id);
							if ($passwordChange == TRUE) {
								$this->session->set_flashdata('success_msg', 'Password updated successfully');
							} else {
								$this->session->set_flashdata('error_msg', 'Error! Password not changed!');
							}
						}
					} else {
						$this->session->set_flashdata('error_msg', 'Error! Verify Password is not same as New Password!');
					}
				}
				//die;	
				redirect('Users/change_password');
			}
		} else {
			$this->session->set_flashdata('error_msg', 'User not available');
			redirect('Users');
		}
		$this->render('admin/change_password', $data);
	}

	public function loginRecordsList($email)
	{
		$email = base64_decode($email);
		echo $loginRecords = $this->User_model->getLoginRecords($email);
	}



	public function getStateList($country_id)
	{
		echo state_list_dropdown('', $country_id);
	}
	public function getCityList($state_id)
	{
		echo city_list_dropdown('', $state_id);
	}


	public function listingCustomer($role_id = "2")
	{
		authenticate();
		$data['header']['site_title'] = 'Lista de Clientes';

		$data['role_id'] = $role_id;
		$data['datas'] = $this->User_model->getUsers($role_id);
		//pr($data['datas']); die;
		$result = array();
		$this->render('admin/listingCustomer', $data);
	}

	public function customerUpdate($id = '')
	{
		if ($this->input->post()) {

			$this->profile_image = realpath(APPPATH . '../assets/uploads/user_images/');
			$post['fname'] = $this->input->post('fname');
			$post['lname'] = $this->input->post('lname');
			$post['phone_no'] = $this->input->post('phone');

			// For Image Upload Start
			// For Profile Image Upload Start
			$image = $this->input->post('image');
			if ($_FILES['profile_image']['name'] != "") {
				if (!empty($image)) unlink($this->profile_image . '/' . $image);
				$value = $_FILES['profile_image']['name'];
				//echo $value;

				$config = array(
					'file_name' => 'avatar_' . $user_id . '_' . date('Ymdhis'),
					'allowed_types' => 'png|jpg|jpeg|gif|', //jpg|jpeg|gif|
					'upload_path' => $this->profile_image,
					'max_size' => 20000
				);

				$this->upload->initialize($config);
				if (!$this->upload->do_upload('profile_image')) {
					// return the error message and kill the script
					$this->session->set_flashdata('error_msg', $this->upload->display_errors());
					redirect('Users/customerUpdate');
				}
				$image_data = $this->upload->data();
				$image = $image_data['file_name'];
			}
			$post['profile_image'] = $image;
			//*****************************************	

			if (!empty($id)) {
				$post['modifiedBy'] = $this->session->userdata('user_id');
			} else {
				$post['addedBy'] = $this->session->userdata('user_id');
				$post['addedOn'] = gmdate('Y-m-d H:i:s');
			}
			$result = $this->User_model->updateCustomer($post, $id);

			if (!empty($result)) {
				$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
			} else {
				$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
			}
			redirect('Users/listingCustomer');
		}
	}

	public function remove($id)
	{
		$result = $this->User_model->customerRemove($id);
		return $result;
	}
	public function sellerProfile() {
        authenticate();
        $result = array();
        $query = new stdClass();
		$id = $this->session->userdata('seller_id');
        $this->user_images = realpath(APPPATH . '../assets/uploads/user_images/');
        $data['datas'] = $this->User_model->getCategoryList();
        $data['parent_categories'] = $this->User_model->getActiveCategoryList('0');
        if (!empty($id)) {
            $data['header']['site_title'] = 'Actualización de perfil';
            $query = $this->User_model->getSellerData($id);
            $data['childcategories'] = $this->getAllchildcategoryData($query->seller_type, $query->chld_category_id);
            //pr($data);die;
        }

        if ($this->input->post()) {
            //pr($this->input->post());die;			
            //pr($_FILES);die();
            $post['email'] = $this->input->post('email');
            $post['city'] = $this->input->post('city_id');
            $post['seller_name'] = $this->input->post('seller_name');
            $post['seller_type'] = $this->input->post('seller_type');
            $post['chld_category_id'] = $this->input->post('chld_category_id');
            $post['phone_number'] = $this->input->post('phone_number');
            $post['address'] = $this->input->post('address');
            $post['rating'] = $this->input->post('rating');
            $post['seller_details'] = $this->input->post('seller_details');
            $post['offer_massage'] = $this->input->post('offer_massage');
            
			$post['addedOn'] = gmdate('Y-m-d H:i:s');
            
            /**** Insert for User Setting & Profile ****** */
            $post2['fname'] = $this->input->post('fname');
            $post2['lname'] = $this->input->post('lname');
            $post2['email'] = $this->input->post('email');
            $post2['shop_name'] = $this->input->post('seller_name');
            $post2['phone_no'] = $this->input->post('phone_number');
            $post2['address'] = $this->input->post('address');
            $post2['city_id'] = $this->input->post('city_id');
            $post3['time_zone'] = 'America/Bogota';
            //$post3['addedOn'] = gmdate('Y-m-d H:i:s');
            
            // For Profile Image Upload Start
            $image = $this->input->post('profile_image');
            if ($_FILES['profile_avatar']['name'] != "") {
                if (!empty($image)) unlink($this->user_images . '/' . $image);
                //echo $value;

                $config = array(
                    'file_name' => 'avatar_' . $id . '_' . date('Ymdhis'),
                    'allowed_types' => 'png|jpg|jpeg|gif|', //jpg|jpeg|gif|
                    'upload_path' => $this->user_images,
                    'max_size' => 20000
                );

                $this->upload->initialize($config);
                if (!$this->upload->do_upload('profile_avatar')) {
                    // return the error message and kill the script
                    $this->session->set_flashdata('error_msg', $this->upload->display_errors());
                    redirect('Users/profile/');
                }
                $image_data = $this->upload->data();
                $image = $image_data['file_name'];
            }
            $post['profile_image'] = $image;
            $post2['profile_image'] = $image;
            $post1['is_first_login'] = 1;
            //*****************************************	
            if (!empty($id)) {
                $post['modifiedBy'] =$this->session->userdata('user_id');
                $result = $this->User_model->updateSallerDetails($post, $post1, $post2, $post3, $id);
                $u_id = ($id);
            } 
            //******************Scheduling*******************************************//
            //$u_id = $result;
            if (!empty($this->input->post('schedule_day'))) {
                $res = $this->db->delete('user_schedules', array('user_id' => $u_id));
                foreach ($this->input->post('schedule_day') as $k_d => $day) {
                    $post_schedule['user_id'] = $u_id;
                    $post_schedule['day'] = $day;
                    $post_schedule['day_name'] = $this->input->post('schedule_day_name')[$k_d];
                    $post_schedule['type'] = !empty($this->input->post('schedule_type')[$k_d]) ? 'Open' : 'Closed';
                    $post_schedule['time_from'] = $this->input->post('schedule_time_from')[$k_d];
                    $post_schedule['time_to'] = $this->input->post('schedule_time_to')[$k_d];
                    $this->User_model->addUserSchedule($post_schedule);
                }
            }
            //***********************************************************************//
            if (!empty($result)) {
				$this->session->set_userdata('user_fname',$post2['fname']);
				$this->session->set_userdata('user_lname',$post2['lname']);
				$this->session->set_userdata('user_image',$post2['profile_image']);

                $this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
            } else {
                $this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
            }
            redirect('Users/profile/');
        }
        $data['city_list'] = $this->User_model->getCityAllList();
        //pr($data);die;
        $data['query'] = $query;
        $data['seller_type'] = $this->User_model->getSellerTypeList();
        $this->render('admin/seller_profile', $data);
    }
	public function getAllchildcategoryData($pid, $selected_id = '') {


        $query = $this->User_model->getAllChildCategory($pid);
        //pr($query);die;

        $selected = '';
        $html = '<option value="">Select child category</option>';
        if (!empty($query)) {
            foreach ($query as $k => $val) {
                if ($val->id == $selected_id) {
                    $selected = "selected";
                } else {
                    $selected = "";
                }
                $html .= '<option value="' . $val->id . '" ' . $selected . ' >' . $val->seller_type . '</option>';
            }
        }
        return $html;
    }

}

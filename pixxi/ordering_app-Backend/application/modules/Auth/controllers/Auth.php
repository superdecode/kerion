<?php defined('BASEPATH') or exit('No direct script access allowed');

class Auth extends BackendController
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
		$this->load->model('Auth_model');
		$config = array(
			'protocol'  => 'smtp',
			'smtp_host' => 'mail.xxxxxxx.com',
			'smtp_port' => 465,
			'smtp_user' => 'no-reply@xxxxxxx.com',
			'smtp_pass' => 'demo!@#456',
			'mailtype'  => 'html',
			'charset'   => 'utf-8'
		);

		$this->load->library('email', $config);
	}


	public function index()
	{

		if (!empty($this->session->userdata("user_id"))) {
			$id = base64_encode($this->session->userdata("user_id"));
			redirect('Auth/dashboard');
		}
		$data['site_title'] = get_settings_value('system_name');
		$result = array();
		if ($this->input->post()) {
			//echo '<pre>';print_r($this->input->post());
			$post['login_id'] = $this->input->post('login_id');
			$post['password'] = md5($this->input->post('password'));

			//pr($post);die;

			$checkUser = $this->Auth_model->checkUser($post);
			$first_login = $checkUser->is_first_login;
			$role_ids = $checkUser->role_ids;
			$login_ids = $checkUser->id;
			if ($this->Auth_model->is_max_login_attempts_exceeded($post['login_id'])) {
				$this->session->set_flashdata('error_msg', 'Bloqueado temporalmente. Vuelva a intentarlo más tarde.');
				redirect('Auth');
			}
			if ($checkUser->status == '0') {
				$this->session->set_flashdata('error_msg', 'Cuenta bloqueada. Póngase en contacto con el administrador, por favor.');
				redirect('Auth');
			}

			if (!empty($checkUser)) {

				$get_seller_details = $this->Auth_model->getUserLoginData($checkUser->id);
				$add = $get_seller_details->address;
				$city_id = $get_seller_details->city_id;
				$shop_name = $get_seller_details->shop_name;

				if ($first_login == 1 || $add != '' || $city_id != '' || $shop_name != '') {
					$res = $this->Auth_model->getUserLoginData($checkUser->id);
					//pr($res);die;

					// Lockout Function
					if ($this->Auth_model->is_max_login_attempts_exceeded($res->login_id)) {
						$this->session->set_flashdata('error_msg', 'Bloqueado temporalmente. Vuelva a intentarlo más tarde.');
						redirect('Auth');
					}
					$this->Auth_model->clear_login_attempts($res->login_id);
					$MAC = exec('getmac');
					// Storing 'getmac' value in $MAC 
					$MAC = strtok($MAC, ' ');

					$login['session_id'] = session_id();
					$login['user_email'] = $res->login_id;
					$login['ip_address'] = $this->input->ip_address();
					$login['login_time'] = time();
					$login['user_agent'] = $this->agent->agent_string();
					$login['browser'] = $this->agent->browser();
					$login['version'] = $this->agent->version();
					$login['platform'] = $this->agent->platform();
					$login['mac_id'] = $MAC;

					//pr($login);die;
					$this->Auth_model->save_login_records($login);

					$user_id = base64_encode($res->id);
					if ($res->multifactor_authenticate == '1') {
						if ($res->authenticate_using_google == '1') {
							redirect('Auth/authenticate/' . $user_id);
						}
					} else {
						$this->session->set_flashdata('success_msg', 'Inicio de sesión exitoso');
						if ($this->agent->is_referral()) {
							redirect($this->agent->referrer());
						} else {
							redirect('Auth/dashboard');
						}
					}
				}
				if ($role_ids == 1) {
					$res = $this->Auth_model->getUserLoginData($checkUser->id);
					//pr($res);die;

					// Lockout Function
					if ($this->Auth_model->is_max_login_attempts_exceeded($res->login_id)) {
						$this->session->set_flashdata('error_msg', 'Bloqueado temporalmente. Vuelva a intentarlo más tarde.');
						redirect('Auth');
					}
					$this->Auth_model->clear_login_attempts($res->login_id);
					$MAC = exec('getmac');
					// Storing 'getmac' value in $MAC 
					$MAC = strtok($MAC, ' ');

					$login['session_id'] = session_id();
					$login['user_email'] = $res->login_id;
					$login['ip_address'] = $this->input->ip_address();
					$login['login_time'] = time();
					$login['user_agent'] = $this->agent->agent_string();
					$login['browser'] = $this->agent->browser();
					$login['version'] = $this->agent->version();
					$login['platform'] = $this->agent->platform();
					$login['mac_id'] = $MAC;

					//pr($login);die;
					$this->Auth_model->save_login_records($login);

					$user_id = base64_encode($res->id);
					if ($res->multifactor_authenticate == '1') {
						if ($res->authenticate_using_google == '1') {
							redirect('Auth/authenticate/' . $user_id);
						}
					} else {
						$this->session->set_flashdata('success_msg', 'Inicio de sesión exitoso');
						if ($this->agent->is_referral()) {
							redirect($this->agent->referrer());
						} else {
							redirect('Auth/dashboard');
						}
					}
				} else {
					$seller_id = base64_encode($login_ids);
					redirect('Users/sellerProfile/' . $seller_id);
				}
			} else {
				$this->Auth_model->increase_login_attempts($post['login_id']);
				$this->session->set_flashdata('error_msg', '¡Autenticación Incorrecta!');
				redirect('Auth');
			}
		}

		$this->load->view('admin/login', $data);
	}

	public function authenticate($user_id)
	{
		$data['site_title'] = 'Google Authenticate';
		$id = base64_decode($user_id);
		$res = $this->Auth_model->getUserLoginData($id);
		$system_name = get_settings_value('system_name');
		$secret = $res->google_auth_code;
		$qrCodeUrl = $this->googleauthenticator->getQRCodeGoogleUrl($system_name, $res->login_id, $secret);
		$data['qrCode'] = $qrCodeUrl;
		//echo '<pre>';print_r($res);die;
		if (!empty($res)) {
			$data['details'] = $res;
			if ($this->input->post()) {
				$code = $this->input->post('code');
				$checkResult = $this->googleauthenticator->verifyCode($secret, $code, 2); // 2 = 2*30sec clock tolerance

				if ($checkResult) {
					$this->session->set_flashdata('success_msg', 'Inicio de sesión exitoso');
					if ($this->agent->is_referral()) {
						redirect($this->agent->referrer());
					} else {
						redirect('Auth/dashboard');
					}
				} else {
					$this->session->set_flashdata('error_msg', '¡¡Codigo erroneo!!');
					redirect('Auth/authenticate/' . $user_id);
				}
			}
		} else {
			$this->session->set_flashdata('error_msg', 'Usuario No Disponible');
			redirect('Auth');
		}

		$this->load->view('admin/authenticate', $data);
	}
	public function logout()
	{
		$login['logout_time'] = time();
		$this->Auth_model->save_login_records($login);

		$this->session->unset_userdata('user_id');
		$this->session->unset_userdata('user_role_ids');
		$this->session->unset_userdata('user_role');
		$this->session->unset_userdata('user_login_id');
		$this->session->unset_userdata('user_fname');
		$this->session->unset_userdata('user_lname');
		$this->session->unset_userdata('user_image');
		$this->session->unset_userdata('user_time_zone');
		$this->session->unset_userdata('login_id');

		$this->session->sess_destroy();
		redirect('Auth');
	}
	public function dashboard()
	{
		authenticate();
		$data['header']['site_title'] = 'Panel';
		if($this->session->userdata("user_role_ids")!='1'){
			redirect('Auth/store_dashboard');
		}
		$year  = $this->input->post('year');
		$start_date  = $this->input->post('start_date');
		$end_date    = $this->input->post('end_date');
		$data['orders'] = $this->Auth_model->getOrderProducts(date('Y-m-d'), $year, $start_date, $end_date);
		$data['pending_orders'] = $this->Auth_model->getOrderProducts('', 'pending');
		$data['order_products'] = $this->Auth_model->getOrderProducts2(10);

		//pr($data['order_products']);die;
		$this->render('admin/dashboard', $data);
	}
	public function store_dashboard()
	{
		authenticate();
		$data['header']['site_title'] = 'Panel';

		if($this->input->get()){
			$data['end_date']  = $this->input->get('end');
			$data['start_date']    = $this->input->get('start');
			$data['label']    = $this->input->get('label');

			$diff = (strtotime($data['end_date']) - strtotime($data['start_date']));
			$days = ($diff)/60/60/24+1;
		}else{
			$data['end_date']  = date('Y-m-d');
			$data['start_date']    = date('Y-m-d',strtotime('-30 days'));
			$data['label']    = 'Last 30 Days';
			$days='30';
		}
		
		$data['days']=$days;
		$data['end_date2']  = date('Y-m-d',strtotime($data['end_date'].' -'.$days.' days'));
		$data['start_date2']    = date('Y-m-d',strtotime($data['start_date'].' -'.$days.' days'));
		//pr($data); die;

		$data['returnCustomers'] = count($this->Auth_model->monthlyReturnCustomers());
		$data['newCustomers'] = count($this->Auth_model->monthloyNewCustomers());
		$data['monthloyTotalOrders'] = count($this->Auth_model->monthloyTotalOrders());
		$data['positiveFeedback'] = count($this->Auth_model->monthloyPositiveFeedback());
		$data['negativeFeedback'] = count($this->Auth_model->monthloyNegativeFeedback());

		$data['totalOrderSales'] = ($this->Auth_model->totalOrderSales($data['start_date'],$data['end_date']));
		$data['totalOrders'] = count($this->Auth_model->totalOrders($data['start_date'],$data['end_date']));

		$data['totalOrderSales2'] = ($this->Auth_model->totalOrderSales($data['start_date2'],$data['end_date2']));
		$data['totalOrders2'] = count($this->Auth_model->totalOrders($data['start_date2'],$data['end_date2']));


		$data['topItemsBySales'] = ($this->Auth_model->topItemsBySales($data['start_date'],$data['end_date']));
		$data['topCategoriesBySales'] = ($this->Auth_model->topCategoriesBySales($data['start_date'],$data['end_date']));
                
                $data['totalAmountOrderCancel'] = ($this->Auth_model->totalAmountOrderCancel($data['start_date'],$data['end_date']));
                $data['totalAmountOrderCancel2'] = ($this->Auth_model->totalAmountOrderCancel($data['start_date2'],$data['end_date2']));
                
                
                
                
		//pr($data['topItemsBySales']);die;

		$revenue_chart_datas = array();
		$payment_types_datas = array();
		$Variable1 = strtotime($data['start_date']);
		$Variable2 = strtotime($data['end_date']);
		$chart_k = 0;
		for ($currentDate = $Variable1; $currentDate <= $Variable2; $currentDate += (86400)) {
			$chart_date = date('Y-m-d', $currentDate);			
			$revenue_chart_datas[] = round($this->Auth_model->totalOrderSales($chart_date), 2);			
			$chart_k++;
		}
		$data['revenue_chart_datas'] = json_encode($revenue_chart_datas, true);
		$payment_types_datas[] = round($this->Auth_model->totalOrdersByPaymentType('cash',$data['start_date'],$data['end_date']));;
		$payment_types_datas[] = round($this->Auth_model->totalOrdersByPaymentType('credit_card',$data['start_date'],$data['end_date']));;
		$data['payment_types_datas'] = json_encode($payment_types_datas, true);



		//pr($data['topCategoriesBySales']);die;
		//pr($data['order_products']);die;
		$this->render('admin/store_dashboard', $data);
	}
	public function order_dashboard()
	{
		authenticate();
		$data['header']['site_title'] = 'Panel';
		$cur_date = date('Y-m-d');
		//$cur_date = '2023-05-11';
		$data['awating_confirmation_orders'] = $this->Auth_model->orderList('awating_confirmation',$cur_date,$cur_date);
		$data['processing_orders'] = $this->Auth_model->orderList('processing',$cur_date,$cur_date);
		$data['completed_orders'] = $this->Auth_model->orderList('completed',$cur_date,$cur_date);


		$this->render('admin/order_dashboard', $data);
	}
	public function orderDetails($order_id)
	{
		authenticate();
		$data['header']['site_title'] = 'Detalles del Pedido';
		$query = $this->Auth_model->orderDetails($order_id);
		$data['query'] = $query;
		$this->load->view('admin/orderDetails', $data);
	}
	public function saveOrder($order_id){
		if ($this->input->post()) {
			$post['order_status'] = $this->input->post('order_status');
			$result = $this->Auth_model->saveOrder($post, $order_id);
			if (!empty($result)) {
				$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
			} else {
				$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
			}
			redirect('Auth/order_dashboard');
		}
	}
	public function forgot_password()
	{
		//$this->session->unset_userdata('forgot_otp');
		//$this->session->unset_userdata('forgot_user_id');
		$data['header']['site_title'] = get_settings_value('system_name') . 'Has olvidado tu contraseña';
		$result = array();
		if ($this->input->post()) {
			$post['login_id'] = $this->input->post('login_id');
			$checkUser = $this->Auth_model->checkUsername($post);
			if (!empty($checkUser)) {
				$otp = substr($this->googleauthenticator->createSecret(), 0, 6);
				$this->session->set_userdata('forgot_otp', $otp);
				$this->session->set_userdata('forgot_user_id', $checkUser->id);
				//*******Email Sent to User*******//
				$this->email->set_mailtype("html");
				$this->email->set_newline("\r\n");

				$email_temp = get_email_template('user_forgot_password');
				$msg = $email_temp->content;
				$msg = str_replace("[var.pass_otp]", $otp, $msg);
				$msg = str_replace("[var.system_name]", get_settings_value('system_name'), $msg);


				$this->email->to($post['email']);
				//$this->email->bcc('sayanoffline@gmail.com');
				$this->email->from($email_temp->email_from);
				$this->email->subject($email_temp->email_subject);
				$this->email->message($msg);
				$this->email->send();
				//*******************************//
				$this->session->set_flashdata('success_msg', '¡Por favor revise el correo electrónico para OTP!');
			} else {
				$this->session->set_flashdata('error_msg', '¡Identificación de inicio de sesión incorrecta!');
			}
			redirect('Auth/forgot_password');
		}

		$this->load->view('admin/forgot_password', $data);
	}
	public function changeForgotEmail()
	{
		$this->session->unset_userdata('forgot_otp');
		$this->session->unset_userdata('forgot_user_id');
		redirect('Auth/forgot_password');
	}
	public function changePassword()
	{
		$user_id = $this->session->userdata("forgot_user_id");
		$profile = $this->Auth_model->getUserData($user_id);
		if (!empty($profile)) {
			$data['profile'] = $profile;
			if ($this->input->post()) {
				$verify_password = $this->input->post('verify_password');
				$new_password = $this->input->post('new_password');
				$otp = $this->input->post('otp');
				if ($otp == $this->session->userdata("forgot_otp")) {
					if ($new_password == $verify_password) {
						$passwordChange = $this->Auth_model->changePassword($verify_password, $user_id);
						if ($passwordChange == TRUE) {
							$this->session->set_flashdata('success_msg', 'Contraseña Actualizada Correctamente');
						} else {
							$this->session->set_flashdata('error_msg', '¡Error! ¡Contraseña No Cambiada!');
						}
						$this->session->unset_userdata('forgot_otp');
						$this->session->unset_userdata('forgot_user_id');
					} else {
						$this->session->set_flashdata('error_msg', '¡Error! ¡Verificar Contraseña - No coinciden los campos!');
					}
				} else {
					$this->session->set_flashdata('error_msg', '¡Error! ¡OTP no coincide!');
				}
				//die;	
				redirect('Auth/forgot_password');
			}
		} else {
			$this->session->set_flashdata('error_msg', 'Usuario No Disponible');
			redirect('Auth/forgot_password');
		}
	}

	public function seller_registration()
	{
		$data['site_title'] = 'Registro de vendedor';

		if ($this->input->post()) {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);


			$users['role_ids'] = '3';
			$users['login_id'] = $post['login_id'];
			$users['password'] = md5($post['password']);
			$users['addedOn'] = gmdate('Y-m-d H:i:s');
			$users['is_first_login'] = '0';
			$users['status'] = '0';
			$users['is_verified'] = '0';

			$user_profiles['shop_name'] = $post['seller_name'];
			$user_profiles['fname'] = $post['fname'];
			$user_profiles['lname'] = $post['lname'];
			$user_profiles['email'] = $post['login_id'];
			$user_profiles['addedOn'] = gmdate('Y-m-d H:i:s');


			$seller['phone_number'] = $post['phone_number'];
			$seller['email'] = $post['login_id'];
			$seller['addedOn'] = gmdate('Y-m-d H:i:s');
			$seller['status'] = '0';
                        $fullname=$post['fname'] .' '.$post['lname'];
			$checkUsername = $this->Auth_model->checkUsername($post);
			$data['city_list'] = $this->Auth_model->getCityAllList();
			if (!empty($checkUsername)) {
				$this->session->set_flashdata('error_msg', 'ID de correo electrónico duplicado encontrado');
			} else {
				if ($post['password'] == $post['confirm_password']) {

					$result = $this->Auth_model->saveSeller($users, $user_profiles, $seller);
                                        $u_id = $result;
                                        $data = $u_id;
					if (!empty($result)) {
						$this->session->set_flashdata('success_msg', 'Se ha registrado correctamente. Espere a que el administrador verifique su cuenta.');
                                        $qr = $this->generate_qrcode($u_id);
                                        $this->Auth_model->insert_qr_data($qr, $data);        
                                                
                                        $this->email->set_mailtype("html");
					$this->email->set_newline("\r\n");
					
					$email_temp2 = get_email_template('new_seller_registration_notification_message_to_admin');
					//$email_temp2->content = $this->load->view('activation_email_template', $data,TRUE);
					$msg2 = str_replace("[var.name]",$fullname,$email_temp2->content);
                                        $msg2 = str_replace("[var.phone]",$post['phone_number'],$msg2);
                                        $msg2 = str_replace("[var.email]",$post['login_id'],$msg2);
					
					$msg2 = str_replace("[var.system_name]",get_settings_value('system_name'),$msg2);
					
					$this->email->to(get_settings_value('email_to'));
					$this->email->from($email_temp2->email_from);
					$this->email->subject($email_temp2->email_subject);
					$this->email->message($msg2);
					$this->email->send();
                                        
                                        /**********Seller Notification**********/
                                        
                                        $email_temp3 = get_email_template('new_seller_registration_notification_message');
					//$email_temp2->content = $this->load->view('activation_email_template', $data,TRUE);
					$msg3 = str_replace("[var.name]",$fullname,$email_temp3->content);
                                        $msg3 = str_replace("[var.system_name]",get_settings_value('system_name'),$msg3);
					
					$this->email->to($post['login_id']);
					$this->email->from($email_temp3->email_from);
					$this->email->subject($email_temp3->email_subject);
					$this->email->message($msg3);
					$this->email->send();
					} else {
						$this->session->set_flashdata('error_msg', 'Registro fallido');
					}
				} else {
					$this->session->set_flashdata('error_msg', '¡Verificar, las contraseñas no coinciden!');
				}
			}
			redirect('seller-registration');
		}

		$this->load->view('admin/seller_registration', $data);
	}

	public function seller_information($user_ids)
	{

		//authenticate();
		$user_id = base64_decode($user_ids);
		$user_information = $this->Auth_model->GetUserInformation($user_id);
		$emailid = $user_information->login_id;
		$data['site_title'] = 'Información del vendedor';
		$data['city_list'] = $this->Auth_model->getCityAllList();
		$data['parent_categories'] = $this->Auth_model->getActiveCategoryList('0');

		$data['childcategories'] = '<option value="">Tipo de tienda secundaria</option>';
		if ($this->input->post()) {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);

			$seller['seller_name'] = $post['store_name'];
			$seller['seller_type'] = $post['seller_type'];
			$seller['chld_category_id'] = $post['chld_category_id'];
			$seller['store_phone'] = $post['store_phone_number'];
			$seller['city'] = $post['city_id'];
			$seller['address'] = $post['address'];
			$user['is_first_login'] = 1;
			//die();
			$updateInformation = $this->Auth_model->updateSellerInformation($seller, $user, $emailid);

			if (!empty($updateInformation)) {
				$this->session->set_flashdata('success_msg', 'Actualizado Correctamente! Now you can login');
			} else {
				$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
			}
			redirect('Auth/dashboard');
		}

		$this->load->view('admin/seller_information', $data);
	}

	public function getAllchildcategory($pid, $selected_id = '')
	{

		$query = $this->Auth_model->getAllChildCategory($pid);
		//pr($query);die;
		//echo 'myid'.$pid;
		$selected = '';
		$html = '<option value="">Seleccionar Subcategoría</option>';
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
		echo $html;
	}
        
        public function generate_qrcode($data) {

        /* Load QR Code Library */
        $this->load->library('ciqrcode');
        /* Data */
        $hex_data = bin2hex($data);
        $save_name = $hex_data . '.png';

        /* QR Code File Directory Initialize */
        $dir = 'assets/uploads/qrcode/';
        if (!file_exists($dir)) {
            mkdir($dir, 0775, true);
        }

        /* QR Configuration  */
        $config['cacheable'] = true;
        $config['imagedir'] = $dir;
        $config['quality'] = true;
        $config['size'] = '1024';
        $config['black'] = array(255, 255, 255);
        $config['white'] = array(255, 255, 255);
        $this->ciqrcode->initialize($config);

        /* QR Data  */
        $params['data'] = $data;
        $params['level'] = 'L';
        $params['size'] = 10;
        $params['savename'] = FCPATH . $config['imagedir'] . $save_name;

        $this->ciqrcode->generate($params);

        /* Return Data */
        $return = array(
            'seller_id' => $data,
            'file' => $dir . $save_name
        );
        return $return;
    }
    
    public function forgetpassword()
	{
		$data['site_title'] = '¿Olvidaste tú Contraseña?';

		if ($this->input->post()) {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);

                        $users['login_id'] = $post['login_id'];
                        
                        $digits = 4;
                        $otp=rand(pow(10, $digits-1), pow(10, $digits)-1);
			$post['otp'] = $otp;
                        $checkUsername = $this->Auth_model->checkUsername($post);
			if (empty($checkUsername)) {
				$this->session->set_flashdata('error_msg', 'ID de correo electrónico no encontrado');
			} else {
				      $result = $this->Auth_model->updateSellerForgetPassword($users, $otp);
                                       
					if (!empty($result)) {
					$this->session->set_flashdata('success_msg', 'El enlace para restablecer la contraseña se ha enviado a su ID de correo electrónico');
                                        $loginid= base64_encode($post['login_id']);  
                                        $url=base_url('Auth/reset_password/'.$loginid);
                                        $this->email->set_mailtype("html");
					$this->email->set_newline("\r\n");
					
					$email_temp = get_email_template('seller_forgot_password');
					//$email_temp2->content = $this->load->view('activation_email_template', $data,TRUE);
					//$msg = str_replace("[var.pass_otp]",$otp,$email_temp->content);
                                        $msg = str_replace("[var.url_link]",$url,$email_temp->content);
				        $msg = str_replace("[var.system_name]",get_settings_value('system_name'),$msg);
					
					
					$this->email->to($post['login_id']);
					$this->email->from($email_temp->email_from);
					$this->email->subject($email_temp->email_subject);
					$this->email->message($msg);
					$this->email->send();
                                       
					} else {
						$this->session->set_flashdata('error_msg', 'Error, inténtalo de nuevo');
					}
				
			}
			redirect('Auth/forgetpassword');
		}

		$this->load->view('admin/forgetpassword', $data);
	}
        
         public function reset_password($login_id)
	{
		$data['site_title'] = 'Restablecer la contraseña';
                 
		if ($this->input->post()) {
                     
                       $post = $this->input->post();
			$post = $this->security->xss_clean($post);
                        
                        $login_id = base64_decode($login_id);
                        
                         $users['password'] =md5($post['password']);
                      
                        if($post['password']==$post['confirm_password']){
					
                                $result = $this->Auth_model->changePasswordSeller($login_id,$users);
                                if(!empty($result)){
                                        $this->session->set_flashdata('success_msg', '¡La contraseña se cambió con éxito ahora puede iniciar sesión con una nueva contraseña!');		
                                }else{	
                                        $this->session->set_flashdata('error_msg', 'fallido');		
                                }					
					
				}else{
					$this->session->set_flashdata('error_msg', '¡Verificar, las contraseñas no coinciden!');
				}
			
                        //redirect(base_url());
		}

		$this->load->view('admin/reset_password', $data);
	}
}

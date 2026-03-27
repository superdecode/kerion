<?php

class Auth_model extends CI_Model
{

	public function __construct()
	{
		parent::__construct();
	}

	public function checkUser($post)
	{
		$this->db->select('* ');
		$this->db->from('users');
		$this->db->where("login_id", $post['login_id']);
		$this->db->where("users.password", $post['password']);
		$query = $this->db->get()->row();
		return $query;
	}
	public function checkUsername($post)
	{
		$this->db->select('* ');
		$this->db->from('users');
		$this->db->where("login_id", $post['login_id']);
		$query = $this->db->get()->row();
		return $query;
	}
	public function checkPassword($post)
	{
		$this->db->select('user_settings.* ');
		$this->db->from('users');
		$this->db->where("users.id", $post['id']);
		$this->db->where("users.password", $post['password']);
		$this->db->join('user_settings', 'users.id = user_settings.user_id', 'LEFT');
		$query = $this->db->get()->row();
		return $query;
	}
	public function getUserLoginData($user_id)
	{

		$this->db->select('users.*,user_profiles.fname ,user_profiles.lname,user_profiles.profile_image,user_profiles.address,user_profiles.city_id,user_profiles.shop_name,user_settings.*,users.id as user_id,seller.id as seller_id,seller.email as seller_email');
		$this->db->from('users');
		$this->db->where("users.id", $user_id);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id', 'LEFT');
		$this->db->join('user_settings', 'users.id = user_settings.user_id', 'LEFT');
		$this->db->join('seller', 'seller.email = users.login_id', 'LEFT');
		//$this->db->join('roles', 'users.role_id = roles.id' , 'LEFT');
		$query = $this->db->get()->row();

		//$seller_data = $this->Auth_model->getSellerLoginData($query->login_id);
		//echo $seller_data->id;
		//echo $seller_data->email;
		//die();
		//echo $this->db->last_query(); die();

		//*******SET SESSION***********************************//
		$this->session->set_userdata('user_id', $query->user_id);
		$this->session->set_userdata('user_role_ids', $query->role_ids);
		$this->session->set_userdata('user_roles', get_role_names($query->role_ids));
		$this->session->set_userdata('user_login_id', $query->login_id);
		$this->session->set_userdata('user_fname', $query->fname);
		$this->session->set_userdata('user_lname', $query->lname);
		$this->session->set_userdata('user_image', $query->profile_image);
		$this->session->set_userdata('user_time_zone', $query->time_zone);

		$this->session->set_userdata('seller_email', $query->selle_email);
		$this->session->set_userdata('seller_id', $query->seller_id);
		return $query;
	}
	/**
	 * clear_login_attempts
	 * Based on code from Tank Auth, by Ilya Konyukhov (https://github.com/ilkon/Tank-Auth)
	 *
	 * @param string      $identity                   User's identity
	 * @param int         $old_attempts_expire_period In seconds, any attempts older than this value will be removed.
	 *                                                It is used for regularly purging the attempts table.
	 *                                                (for security reason, minimum value is lockout_time config value)
	 * @param string|null $ip_address                 IP address
	 *                                                Only used if track_login_ip_address is set to TRUE.
	 *                                                If NULL (default value), the current IP address is used.
	 *                                                Use get_last_attempt_ip($identity) to retrieve a user's last IP
	 *
	 * @return bool
	 */
	public function clear_login_attempts($identity, $old_attempts_expire_period = 86400, $ip_address = NULL)
	{
		// Make sure $old_attempts_expire_period is at least equals to lockout_time
		$old_attempts_expire_period = max($old_attempts_expire_period, get_settings_value('lockout_time'));

		$this->db->where('login', $identity);
		if (!isset($ip_address)) {
			$ip_address = $this->input->ip_address();
		}
		$this->db->where('ip_address', $ip_address);

		// Purge obsolete login attempts
		$this->db->or_where('time <', time() - $old_attempts_expire_period, FALSE);
		return $this->db->delete('login_attempts');
	}
	/**
	 * Based on code from Tank Auth, by Ilya Konyukhov (https://github.com/ilkon/Tank-Auth)
	 *
	 * Note: the current IP address will be used if track_login_ip_address config value is TRUE
	 *
	 * @param string $identity User's identity
	 *
	 * @return bool
	 */
	public function increase_login_attempts($identity)
	{
		$data = ['ip_address' => '', 'login' => $identity, 'time' => time()];
		$data['ip_address'] = $this->input->ip_address();
		return $this->db->insert('login_attempts', $data);
	}
	/**
	 * is_max_login_attempts_exceeded
	 * Based on code from Tank Auth, by Ilya Konyukhov (https://github.com/ilkon/Tank-Auth)
	 *
	 * @param string      $identity   user's identity
	 * @param string|null $ip_address IP address
	 *                                Only used if track_login_ip_address is set to TRUE.
	 *                                If NULL (default value), the current IP address is used.
	 *                                Use get_last_attempt_ip($identity) to retrieve a user's last IP
	 *
	 * @return boolean
	 */
	public function is_max_login_attempts_exceeded($identity, $ip_address = NULL)
	{

		$max_attempts = get_settings_value('maximum_login_attempts');
		if ($max_attempts > 0) {
			$attempts = $this->get_attempts_num($identity, $ip_address);
			return $attempts >= $max_attempts;
		}
	}

	/**
	 * Get number of login attempts for the given IP-address or identity
	 * Based on code from Tank Auth, by Ilya Konyukhov (https://github.com/ilkon/Tank-Auth)
	 *
	 * @param string      $identity   User's identity
	 * @param string|null $ip_address IP address
	 *                                Only used if track_login_ip_address is set to TRUE.
	 *                                If NULL (default value), the current IP address is used.
	 *                                Use get_last_attempt_ip($identity) to retrieve a user's last IP
	 *
	 * @return int
	 */
	public function get_attempts_num($identity, $ip_address = NULL)
	{
		$lockout_time = time() - get_settings_value('lockout_time');

		$this->db->select('1', FALSE);
		$this->db->where('login', $identity);

		if (!isset($ip_address)) {
			$ip_address = $this->input->ip_address();
		}
		$this->db->where('ip_address', $ip_address);

		$this->db->where('time >', $lockout_time, FALSE);
		$qres = $this->db->get('login_attempts');
		return $qres->num_rows();
	}

	/**
	 * Get the last time a login attempt occurred from given identity
	 *
	 * @param string      $identity   User's identity
	 * @param string|null $ip_address IP address
	 *                                Only used if track_login_ip_address is set to TRUE.
	 *                                If NULL (default value), the current IP address is used.
	 *                                Use get_last_attempt_ip($identity) to retrieve a user's last IP
	 *
	 * @return int The time of the last login attempt for a given IP-address or identity
	 */
	public function get_last_attempt_time($identity, $ip_address = NULL)
	{
		$this->db->select('time');
		$this->db->where('login', $identity);

		if (!isset($ip_address)) {
			$ip_address = $this->input->ip_address();
		}
		$this->db->where('ip_address', $ip_address);

		$this->db->order_by('id', 'desc');
		$qres = $this->db->get('login_attempts', 1);

		if ($qres->num_rows() > 0) {
			return $qres->row()->time;
		}
	}

	/**
	 * Get the IP address of the last time a login attempt occurred from given identity
	 *
	 * @param string $identity User's identity
	 *
	 * @return string
	 */
	public function get_last_attempt_ip($identity)
	{
		$this->db->select('ip_address');
		$this->db->where('login', $identity);
		$this->db->order_by('id', 'desc');
		$qres = $this->db->get('login_attempts', 1);

		if ($qres->num_rows() > 0) {
			return $qres->row()->ip_address;
		}
	}

	public function save_login_records($save)
	{
		if (empty($this->session->userdata("login_id"))) {
			$res = $this->db->insert('login_records', $save);
			$last_id = $this->db->insert_id();
			$this->session->set_userdata('login_id', $last_id);
			return $last_id;
		} else {
			$this->db->where('id', $this->session->userdata("login_id"));
			$res = $this->db->update('login_records', $save);
		}
	}

	public function getUserData($user_id)
	{
		$this->db->select('users.login_id as user_login_id,user_profiles.*');
		$this->db->from('users');
		$this->db->where("users.id", $user_id);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id', 'LEFT');
		//$this->db->join('roles', 'users.role_id = roles.id' , 'LEFT');
		$query = $this->db->get()->row();

		$this->db->select('user_ip_addresses.*');
		$this->db->from('user_ip_addresses');
		$this->db->where("user_ip_addresses.user_id", $user_id);
		$query4 = $this->db->get()->result();

		$this->db->select('user_settings.*');
		$this->db->from('user_settings');
		$this->db->where("user_settings.user_id", $user_id);
		$query5 = $this->db->get()->row();

		$query->ip_addresses = $query4;
		$query->settings = $query5;

		return $query;
	}
	public function changePassword($password, $user_id)
	{
		$newPassword = md5($password);
		$id = $user_id;
		$this->db->set("password", $newPassword);
		$this->db->where("id", $id);
		return $this->db->update("users");
	}


	//*********************************dashboard***************************************************//
	public function getOrderProducts($created_at = '', $year = '', $sdate = '', $edate = '')
	{

		$data = array();
		$this->db->select('orders.*');
		$this->db->from('orders');
		//$this->db->join('orders', 'orders.id=order_products.order_id' , 'LEFT');
		//$this->db->join('products', 'products.id = order_products.product_id' , 'LEFT');

		if ($this->session->userdata('user_role_ids') != '1') {
			$this->db->where("orders.seller_id", $this->session->userdata('seller_id'));
		}


		//if(!empty($order_status)){ $this->db->where("orders.order_status",$delivery_status); }
		if ($sdate != '' && $edate != '') {
			$this->db->where("DATE(orders.created_at)>=", $sdate);
			$this->db->where("DATE(orders.created_at)<=", $edate);
		} else {
			if ($sdate != '') {
				$this->db->where("DATE(orders.created_at)", $sdate);
			}
			if ($edate != '') {
				$this->db->where("DATE(orders.created_at)", $edate);
			}
		}
		if ($year != '') {
			$this->db->where("YEAR(orders.created_at)", $year);
		}

		if ($year == '' && $sdate == '' && $edate == '') {
			if (!empty($created_at)) {
				$this->db->where("DATE(orders.created_at)", $created_at);
			}
		}
		$this->db->where("orders.deleted", "0");
		$this->db->order_by("orders.id", "desc");
		//$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
		if (!empty($limit)) {
			$this->db->limit($limit);
		}

		$query = $this->db->get()->result();
		//echo $this->db->last_query(); die;
		return $query;
	}
	public function getOrderProducts2($limit = '')
	{
		$data = array();
		$created_at = date('Y-m-d');
		//$created_at = '2022-02-06';
		$this->db->select('order_products.*,user_profiles.full_name,order_products.order_no,orders.order_number,orders.created_at,orders.payment_method,orders.payment_status,products.photos');
		$this->db->from('order_products');
		$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		$this->db->join('products', 'products.id = order_products.product_id', 'LEFT');

		if ($this->session->userdata('user_role_ids') != '1') {
			$this->db->where("order_products.seller_id", $this->session->userdata('seller_id'));
		}
		$this->db->where("DATE(order_products.created_at)", $created_at);

		$this->db->order_by("order_products.id", "desc");
		$this->db->group_by("order_products.product_id");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		if (!empty($limit)) {
			$this->db->limit($limit);
		}

		$query = $this->db->get()->result();

		//echo $this->db->last_query(); die;

		if (!empty($query)) {
			foreach ($query as $k => $data) {
				$query[$k]->image_default = '';
				if (!empty($data->photos)) {
					$photos = explode(',', $data->photos);
					$photos = generate_ids_string($photos);
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$query[$k]->image_default = !empty($datas) ? $datas[0]->file_name : '';
				}
			}
		}


		return $query;
	}

	/*public function getSellerLoginData($login)
	{
		$this->db->select('seller.id,seller.email');
		$this->db->from('seller');
		$this->db->where("seller.email",$login);
                $this->db->where("seller.deleted","0");
		$query = $this->db->get()->row();
		return $query;
	}*/

	public function saveSeller($users, $user_profiles, $seller)
	{
		$res1 = $this->db->insert('users', $users);
		$user_id = $this->db->insert_id();
		$user_profiles['user_id'] = $user_id;
		$user_settings['user_id'] = $user_id;
		$user_settings['time_zone'] = 'America/Bogota';
		$seller['addedBy'] = $user_id;
		$this->db->insert('user_profiles', $user_profiles);
		$this->db->insert('user_settings', $user_settings);
		$res = $this->db->insert('seller', $seller);
        $seller_id = $this->db->insert_id();
		return $seller_id;
	}

	public function getCityAllList()
	{
		$this->db->select('* ');
		$this->db->from('location_cities');
		$this->db->where("country_id", '48');
		$this->db->limit(63);
		$this->db->order_by("id", "asc");
		$query = $this->db->get()->result();
		return $query;
	}
	public function updateSellerInformation($post, $users, $emailid)
	{

		//if (!empty($this->session->userdata("seller_id"))) {
		$this->db->where('email', $emailid);
		$res = $this->db->update('seller', $post);
		//echo $this->db->last_query(); die;
		$this->db->where('login_id', $emailid);
		$res = $this->db->update('users', $users);
		//echo $this->db->last_query(); die;
		return $res;
		//} 
	}

	public function getActiveCategoryList($parent_id = "0")
	{
		$this->db->select('sellers_types.*');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted", "0");
		$this->db->where("sellers_types.status", "1");
		$this->db->where("sellers_types.parent_id", $parent_id);
		$this->db->order_by("id", "desc");

		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
	}

	public function getAllChildCategory($parent_id)
	{
		$this->db->select('sellers_types.*');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted", "0");
		$this->db->where("sellers_types.status", "1");
		$this->db->where("sellers_types.parent_id", $parent_id);
		$this->db->order_by("id", "desc");

		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
	}
	public function GetUserInformation($uid)
	{
		$this->db->select('users.login_id ');
		$this->db->from('users');
		$this->db->where("users.id", $uid);
		$this->db->where("users.deleted", "0");
		$this->db->where("users.status", "1");
		$query = $this->db->get()->row();
		return $query;
	}

	//********************************************************************************************//


	public function monthlyReturnCustomers()
	{
		$this->db->select('users.addedOn,orders.* ');
		$this->db->from('orders');
		$this->db->where("orders.seller_id",$this->session->userdata("seller_id"));		
		$this->db->where("'users.addedOn' NOT BETWEEN NOW() - INTERVAL 30 DAY AND NOW() ");
		$this->db->where("orders.created_at BETWEEN NOW() - INTERVAL 30 DAY AND NOW() ");
		$this->db->where("users.deleted", '0');
		$this->db->order_by("users.id", "desc");
		$this->db->group_by("orders.buyer_id");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		$this->db->join('users', 'user_profiles.user_id=users.id', 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		return ($query);
	}
	public function monthloyNewCustomers()
	{
		$this->db->select('users.addedOn,orders.* ');
		$this->db->from('orders');
		$this->db->where("orders.seller_id",$this->session->userdata("seller_id"));		
		$this->db->where("users.addedOn BETWEEN NOW() - INTERVAL 30 DAY AND NOW()");
		$this->db->where("orders.created_at BETWEEN NOW() - INTERVAL 30 DAY AND NOW() ");
		$this->db->where("users.deleted", '0');
		$this->db->order_by("users.id", "desc");
		$this->db->group_by("orders.buyer_id");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		$this->db->join('users', 'user_profiles.user_id=users.id', 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		return ($query);
	}
	public function monthloyTotalOrders()
	{
		$this->db->select('orders.* ');
		$this->db->from('orders');		
		$this->db->where("orders.created_at BETWEEN NOW() - INTERVAL 30 DAY AND NOW() ");	
		$this->db->where("orders.seller_id",$this->session->userdata("seller_id"));	
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		return ($query);
	}
	public function monthloyPositiveFeedback()
	{
		$this->db->select('product_reviews.* ');
		$this->db->from('product_reviews');
		$this->db->where("'product_reviews.addedOn'  BETWEEN NOW() - INTERVAL 30 DAY AND NOW()");
		$this->db->where("product_reviews.rating >=3");
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		return ($query);
	}
	public function monthloyNegativeFeedback()
	{
		$this->db->select('product_reviews.* ');
		$this->db->from('product_reviews');
		$this->db->where("'product_reviews.addedOn'  BETWEEN NOW() - INTERVAL 30 DAY AND NOW()");
		$this->db->where("product_reviews.rating <3");
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		return ($query);
	}

	public function totalOrderSales($start_date,$end_date='')
	{
		$this->db->select_sum('price_total');
		//$this->db->where('orders.order_status', 'completed');
		$this->db->from('orders');		
		$this->db->where("orders.seller_id",$this->session->userdata("seller_id"));		
		if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(orders.created_at) >= '".$start_date."' && DATE(orders.created_at) <= '".$end_date."' ) ");
		}else if(!empty($start_date) && empty($end_date)){
			$this->db->where(" ( DATE(orders.created_at) = '".$start_date."'  ) ");
		}
		$this->db->order_by("id", "desc");
		$query1 = $this->db->get()->row();
		if (!empty($query1->price_total)) {
			$total_price = $query1->price_total;
		}else{
			$total_price = 0;
		}
		return $total_price;
	}
	public function totalOrders($start_date,$end_date)
	{
		$this->db->select('orders.* ');
		$this->db->from('orders');
		$this->db->where("orders.seller_id",$this->session->userdata("seller_id"));		
		if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(orders.created_at) >= '".$start_date."' && DATE(orders.created_at) <= '".$end_date."' ) ");
		}		
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		return ($query);
	}

	public function orderList($order_status,$start_date='', $end_date='')
	{

		$data = array();
		$this->db->select('orders.*,seller.seller_name,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
		$this->db->from('orders');
		if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(orders.created_at) >= '" . $start_date . "' && DATE(orders.created_at) <= '" . $end_date . "' ) ");
		}
                $this->db->where("orders.seller_id",$this->session->userdata("seller_id"));
		$this->db->where("orders.deleted", "0");
		$this->db->where("orders.order_status", $order_status);
		$this->db->order_by("orders.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		$this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query(); die();
		
		return $query;
	}
	public function orderDetails($id, $user_id = '')
	{
		$data = array();
		$this->db->select('orders.*,seller.seller_name,seller.phone_number,seller.address,user_profiles.fname,user_profiles.lname,user_profiles.email,user_profiles.phone_code,user_profiles.phone_no');
		$this->db->from('orders');
		$this->db->where("orders.id", $id);
		$this->db->where("orders.deleted", "0");
		$this->db->order_by("orders.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		$this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');

		$query = $this->db->get()->row();
		//echo $this->db->last_query(); die();
		$query->orderItemList = $this->orderItemList($query->id);

		return $query;
	}
	public function orderItemList($order_id)
	{
		$data = array();
		$this->db->select('order_products.*,orders.order_number,products.photos,COALESCE(banner_upload.file_name, "") as image_default');
		$this->db->from('order_products');
		$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		$this->db->join('products', 'products.id = order_products.product_id', 'LEFT');
		$this->db->join('uploads as banner_upload', 'banner_upload.id = products.photos', 'LEFT');
		$this->db->where("order_products.order_id", $order_id);
		$this->db->order_by("order_products.id", "desc");
		$query = $this->db->get()->result();
		//echo $this->db->last_query();		
		return $query;
	}
	public function saveOrder($post, $id = "")
	{
		if (!empty($id)) {
			$this->db->where('id', $id);
			$res = $this->db->update('orders', $post);
		}
		return $res;
	}

	
	public function totalOrdersByPaymentType($payment_method,$start_date,$end_date)
	{
		$this->db->select_sum('price_total');
		$this->db->from('orders');
		$this->db->where("orders.seller_id",$this->session->userdata("seller_id"));		
		if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(orders.created_at) >= '".$start_date."' && DATE(orders.created_at) <= '".$end_date."' ) ");
		}
		$this->db->where("orders.payment_method",$payment_method);		
		$query1 = $this->db->get()->row();
		if (!empty($query1->price_total)) {
			$total_price = $query1->price_total;
		}else{
			$total_price = 0;
		}
		return $total_price;
	}
	public function topItemsBySales($start_date,$end_date)
	{
		$this->db->select('order_products.product_title,');
		$this->db->select_sum('price_total');
		$this->db->select_sum('product_quantity');
		$this->db->from('order_products');
		$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		$this->db->where("order_products.seller_id",$this->session->userdata("seller_id"));		
		if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(orders.created_at) >= '".$start_date."' && DATE(orders.created_at) <= '".$end_date."' ) ");
		}
                $this->db->order_by("price_total", "desc");
		$this->db->group_by("order_products.product_id");
                $this->db->limit(5);
		$query = $this->db->get()->result();
		//echo $this->db->last_query();		
		return $query;
	}
	public function topCategoriesBySales($start_date,$end_date)
	{
		$this->db->select('order_products.product_title,product_categories.title as category,products.category_id');
		$this->db->select_sum('price_total');
		$this->db->select_sum('product_quantity');
		$this->db->from('order_products');
		$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		$this->db->join('products', 'products.id=order_products.product_id', 'LEFT');
		$this->db->join('product_categories', 'product_categories.id=products.category_id', 'LEFT');

		$this->db->where("order_products.seller_id",$this->session->userdata("seller_id"));		
		if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(orders.created_at) >= '".$start_date."' && DATE(orders.created_at) <= '".$end_date."' ) ");
		}
                $this->db->order_by("price_total", "desc");
		$this->db->group_by("products.category_id");
                $this->db->limit(5);
		$query = $this->db->get()->result();
		//echo $this->db->last_query();		
		return $query;
	}
	public function insert_qr_data($qr, $data)
	{
		$this->db->where('seller_id', $data);
		$this->db->where("deleted", "0");
		$this->db->where("status", "1");
		$query = $this->db->get('qr_scan');
		$count_row = $query->num_rows();
		if ($count_row == 0) {
			$res = $this->db->insert('qr_scan', $qr);
		}
                //echo $this->db->last_query();	die();
		return $res;
	}
        
        public function totalAmountOrderCancel($start_date,$end_date='')
	{
		$this->db->select_sum('price_total');
		$this->db->where('orders.order_status', 'cancelled');
		$this->db->from('orders');		
		$this->db->where("orders.seller_id",$this->session->userdata("seller_id"));		
		if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(orders.created_at) >= '".$start_date."' && DATE(orders.created_at) <= '".$end_date."' ) ");
		}else if(!empty($start_date) && empty($end_date)){
			$this->db->where(" ( DATE(orders.created_at) = '".$start_date."'  ) ");
		}
		$this->db->order_by("id", "desc");
		$query1 = $this->db->get()->row();
		if (!empty($query1->price_total)) {
			$total_price = $query1->price_total;
		}else{
			$total_price = 0;
		}
		return $total_price;
	}
        
        public function updateSellerForgetPassword($users,$otp){
	
                $this->db->set("otp", $otp);
		$this->db->where("login_id", $users['login_id']);
		$rs= $this->db->update("users");
                //pr($this->db->last_query()); die();
                return $rs;
	}
        
        public function changePasswordSeller($login_id,$users){
	
                $this->db->set("password", $users['password']);
		$this->db->where("login_id", $login_id);
		$rs= $this->db->update("users");
                //pr($this->db->last_query()); die();
                return $rs;
	}
	
}

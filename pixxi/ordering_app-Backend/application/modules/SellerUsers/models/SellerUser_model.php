<?php

class SellerUser_model extends CI_Model
{

	public function __construct()
	{
		parent::__construct();
	}

	public function getUserData($user_id)
	{
		$this->db->select('users.login_id as user_login_id,users.status,user_profiles.*');
		$this->db->from('users');
		$this->db->where("users.id", $user_id);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id', 'LEFT');
		$this->db->where("user_profiles.is_main", '1');
		$query = $this->db->get()->row();

		$this->db->select('user_settings.*');
		$this->db->from('user_settings');
		$this->db->where("user_settings.user_id", $user_id);
		$query5 = $this->db->get()->row();

		$query->settings = $query5;

		return $query;
	}

	public function updateUser($user_id, $post1)
	{

		$this->db->where('user_id', $user_id);
		$res = $this->db->update('user_profiles', $post1);
		return $res;
	}
	public function updateUserSettings($user_id, $post1)
	{

		$this->db->where('user_id', $user_id);
		$res = $this->db->update('user_settings', $post1);
		return $res;
	}
	public function addUserContactNo($post)
	{
		return $this->db->insert('user_phones', $post);
	}
	public function addUserEmailId($post)
	{
		return $this->db->insert('user_emails', $post);
	}
	public function addUserIPAddresses($post)
	{
		return $this->db->insert('user_ip_addresses', $post);
	}
	public function checkCurrentPassword($current_password, $user_id)
	{
		$this->db->select('users.*');
		$this->db->from('users');
		$this->db->where("users.id", $user_id);
		$this->db->where("users.password", md5($current_password));
		$res = $this->db->get()->row();
		return $res;
	}
	public function changePassword($password, $user_id)
	{
		$newPassword = md5($password);
		$id = $user_id;
		$this->db->set("password", $newPassword);
		$this->db->where("id", $id);
		return $this->db->update("users");
	}

	public function getLoginRecords($user_email)
	{
		$post = $this->input->post();
		$this->db->select('login_records.*');
		$this->db->from('login_records');
		$this->db->where("login_records.user_email", $user_email);
		$this->db->order_by("id", "desc");
		$datas = $this->db->get()->result();
		foreach ($datas as $k => $rows) {
			$data[] = array(
				$k + 1,
				$rows->ip_address,
				$rows->browser . '(' . $rows->version . ')',
				$rows->platform,
				date('d/m/Y h:i A', $rows->login_time),
				($rows->logout_time > 0) ? date('d/m/Y h:i A', $rows->logout_time) : '--'
			);
		}
		$output = array(
			"data" => $data
		);
		return json_encode($output);
	}
	public function userStatusChange($id)
	{
		$this->db->select('seller.*');
		$this->db->from('seller');
		$this->db->where("seller.id", $id);
		$data = $this->db->get()->row();

		if ($data->status == '1') {
			$this->db->set("status", '0');
		} else {
			$this->db->set("status", '1');
		}
		$this->db->where("id", $id);
		return $this->db->update("seller");
	}
	public function verifiedStatusCompany($id)
	{
		$this->db->select('users.*');
		$this->db->from('users');
		$this->db->where("users.id", $id);
		$data = $this->db->get()->row();

		if ($data->is_admin_verified == '1') {
			$this->db->set("is_admin_verified", '0');
			$this->db->set("is_verified", '0');
		} else {
			$this->db->set("is_admin_verified", '1');
			$this->db->set("is_verified", '1');
		}
		$this->db->where("id", $id);
		$return = $this->db->update("users");
		//echo $this->db->last_query();		
		return $return;
	}
	public function userRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->where("id", $id);
		$return = $this->db->update("seller");
		echo $this->db->last_query();
		die();
		return $return;
	}
	public function roleList()
	{
		$this->db->select('roles.*');
		$this->db->from('roles');
		$this->db->where("roles.deleted", "0");
		$this->db->where("roles.status", "1");
		$this->db->order_by("id", "asc");
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
	}

	public function checkUsername($email)
	{
		$this->db->select('* ');
		$this->db->from('users');
		$this->db->where("login_id", $email);
		$query = $this->db->get()->row();
		return $query;
	}
	public function saveUser($post, $post1, $post2)
	{

		$res = $this->db->insert('users', $post);
		$user_id = $this->db->insert_id();

		$post1['user_id'] = $user_id;
		$post2['user_id'] = $user_id;

		$this->db->insert('user_profiles', $post1);
		$this->db->insert('user_settings', $post2);

		return $user_id;
	}
	public function updateUserDetails($post, $post1, $post2, $user_id)
	{

		$this->db->where('id', $user_id);
		$res = $this->db->update('users', $post);

		$post1['modifiedBy'] = $this->session->userdata('user_id');
		$this->db->where('user_id', $user_id);
		$res2 = $this->db->update('user_profiles', $post1);

		$post2['modifiedBy'] = $this->session->userdata('user_id');
		$this->db->where('user_id', $user_id);
		$res3 = $this->db->update('user_settings', $post2);

		//pr($this->db->last_query());

		return $res3;
	}

	public function getUserDetails($user_id)
	{
		$this->db->select('users.login_id,users.role_ids,user_profiles.fname,user_profiles.lname,');
		$this->db->from('users');
		$this->db->where("users.id", $user_id);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id', 'LEFT');
		$this->db->where("user_profiles.is_main", '1');
		$query = $this->db->get()->row();
		//echo $this->db->last_query();



		return $query;
	}

	public function changePasswordTemporary($password, $user_id)
	{
		//$newPassword = md5($password);		
		$this->db->set("password", $password);
		$this->db->set("is_first_login", '0');
		$this->db->where("id", $user_id);
		$res = $this->db->update("users");
		//echo $this->db->last_query();
		return $res;
	}




	public function getCityAllList()
	{
		$this->db->select('* ');
		$this->db->from('location_cities');
		$this->db->where("country_id", '48');
		$this->db->order_by("id", "asc");
		$query = $this->db->get()->result();
		return $query;
	}








	public function getSellerUsers($role_id)
	{
		//$this->db->select('users.login_id as user_login_id,users.role_ids,users.status,users.is_admin_verified,user_profiles.*,roles.name as role');
		//$this->db->select('orders.*,user_profiles.fname, user_profiles.lname,user_profiles.phone_no, user_profiles.profile_image');
                $this->db->select('orders.*,users.login_id as user_login_id,user_profiles.*');
		$this->db->from('orders');
		//$this->db->where("(NOT find_in_set('2',role_ids) <> 0) && (NOT find_in_set('3',role_ids) <> 0)");
		$this->db->where("orders.deleted", '0');
		$this->db->where("orders.seller_id", $this->session->userdata('seller_id'));
		$this->db->group_by('buyer_id');
                $this->db->join('users', 'users.id = orders.buyer_id', 'LEFT');
		$this->db->join('user_profiles', 'orders.buyer_id = user_profiles.user_id', 'LEFT');
		//$this->db->join('roles', 'roles.id = users.role_ids', 'LEFT');
		//$this->db->join('location_countries', 'location_countries.id = user_profiles.country_id' , 'LEFT');
		//$this->db->join('location_states', 'location_states.id = user_profiles.state_id' , 'LEFT');
		//$this->db->join('location_cities', 'location_cities.id = user_profiles.city_id' , 'LEFT');
		//$this->db->where("user_profiles.is_main", '1');
		$this->db->order_by("orders.buyer_id", "desc");
		$query = $this->db->get()->result();

		return $query;
	}



	public function updateCustomer($post, $user_id)
	{

		$post['modifiedBy'] = $this->session->userdata('user_id');
		$this->db->where('user_id', $user_id);
		$res2 = $this->db->update('user_profiles', $post);

		//$post2['modifiedBy'] =$this->session->userdata('user_id');
		//$this->db->where('user_id', $user_id);
		//$res3 = $this->db->update('user_settings', $post2);

		//pr($this->db->last_query());

		return $res2;
	}

	public function getCustomerDetails($id)
	{
		$this->db->select('users.*, user_profiles.fname, user_profiles.lname,user_profiles.phone_no, user_profiles.profile_image');
		$this->db->from('users');
		$this->db->where("users.deleted", "0");
		$this->db->where("users.id", $id);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id', 'LEFT');
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	}
	public function customerRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		$return = $this->db->update("users");
		pr($this->db->last_query());
		return $return;
	}


	public function getCategoryList($parent_id = "")
	{
		$this->db->select('sellers_types.*');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted", "0");
		if (!empty($parent_id)) {
			$this->db->where("sellers_types.parent_id", $parent_id);
		}
		$this->db->order_by("id", "desc");

		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
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
	
	public function getSellerData($user_id)
	{
		$this->db->select('seller.*,user_profiles.fname as fname,user_profiles.lname as lname,user_profiles.email as email');
		$this->db->from('seller');
		$this->db->where("seller.id", $user_id);
		$this->db->join('user_profiles', 'user_profiles.email = seller.email', 'LEFT');
		$query = $this->db->get()->row();

		//echo $this->db->last_query(); die();	
		return $query;
	}
	public function getSellerTypeList()
	{
		$data = array();
		$this->db->select('sellers_types.*');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted", "0");
		$this->db->where("status", "1");
		$this->db->order_by("id", "asc");
		return $datas = $this->db->get()->result();
	}
	public function getUserScheduleData($day, $user_id)
	{
		$this->db->select('user_schedules.*');
		$this->db->from('user_schedules');
		$this->db->where("user_schedules.user_id", $user_id);
		$this->db->where("user_schedules.day", $day);
		$query = $this->db->get()->row();

		return $query;
	}
	public function updateSallerDetails($post, $post1, $post2, $post3, $user_id)
	{
		$this->db->where('id', $user_id);
		$res = $this->db->update('seller', $post);
		$post1['modifiedBy'] = $this->session->userdata('user_id');
		
		$this->db->where('login_id', $post['email']);
		$res2 = $this->db->update('users', $post1);

		$post2['modifiedBy'] = $this->session->userdata('user_id');
		$this->db->where('email', $post['email']);
		$res3 = $this->db->update('user_profiles', $post2);
		//pr($this->db->last_query());die();
		$post3['user_id'] = $user_id;
		$res4 = $this->db->update('user_settings', $post3);

		return $res;
	}
	public function addUserSchedule($post)
	{
		return $this->db->insert('user_schedules', $post);
	}
}

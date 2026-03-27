<?php

class Order_model extends CI_Model
{

	public function __construct()
	{
		parent::__construct();
	}

	public function saveOrderProduct($post, $id = "")
	{
		if (!empty($id)) {
			$this->db->where('id', $id);
			$res = $this->db->update('order_products', $post);
		} else {
			$res = $this->db->insert('order_products', $post);
		}
		return $res;
	}
	public function saveOrder($post, $refund, $id = "")
	{

		if (!empty($id)) {
			$this->db->where('id', $id);
			$res = $this->db->update('orders', $post);
			if ($post['order_status'] == 'cancelled') {
				$check_refund_data = $this->checkOrderRefund($id);


				if ($check_refund_data == 0) {
					$res = $this->db->insert('order_refund', $refund);
				} else {
					$this->db->set("refund_status", $refund['order_status']);
					$this->db->where("order_id", $id);
					return $return = $this->db->update("order_refund");
				}
			}

			//echo $this->db->last_query();die;
		}
		return $res;
	}
	public function saveRefundOrder($post, $id = "")
	{

		if (!empty($id)) {
			$this->db->where('id', $id);
			$res = $this->db->update('order_refund', $post);

			//echo $this->db->last_query();die;
		}
		return $res;
	}


	public function productStatusChange($id)
	{
		$this->db->select('products.*');
		$this->db->from('products');
		$this->db->where("products.id", $id);
		$data = $this->db->get()->row();

		if ($data->status == '1') {
			$this->db->set("status", '0');
		} else {
			$this->db->set("status", '1');
		}
		$this->db->where("id", $id);
		return $this->db->update("products");
	}
	public function orderRemove($id)
	{
		$this->db->set("deleted", '1');
		$this->db->where("id", $id);
		return $this->db->update("orders");
	}
	public function refundRemove($id)
	{
		$this->db->set("deleted", '1');
		$this->db->where("id", $id);
		return $this->db->update("order_refund");
		//echo $this->db->last_query();die;
	}

	public function orderList($seller_id, $sdate, $edate)
	{

		$data = array();
		$this->db->select('orders.*,seller.seller_name,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
		$this->db->from('orders');
		//if ($this->session->userdata('user_role_ids') != '1') {
		// 	$this->db->where("orders.seller_id", $this->session->userdata('user_id'));
		// }
                if ($this->session->userdata('user_role_ids') != '1') {
			$this->db->where('orders.seller_id', $this->session->userdata('seller_id'));
		}
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
		/*if ($year != '') {
			$this->db->where("YEAR(orders.created_at)", $year);
		}*/
		if ($seller_id != '') {
			$this->db->where('orders.seller_id', $seller_id);
		}
                if ($sdate != '' && $edate != '' && $seller_id != '') {
                    $this->db->where("DATE(orders.created_at)>=", $sdate);
                    $this->db->where("DATE(orders.created_at)<=", $edate);
                    $this->db->where('orders.seller_id', $seller_id);
                }
		$this->db->where("orders.deleted", "0");
		$this->db->order_by("orders.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		$this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query(); die();
		if (!empty($query)) {
			foreach ($query as $k => $data) {
				//$query[$k]->is_review_given= $this->is_review_given($data->product_id,$data->buyer_id);
				$query[$k]->orderItemList = $this->orderItemList($data->id);
			}
		}

		return $query;
	}
	public function refundList()
	{
		$data = array();
		$this->db->select('order_refund.* ,user_profiles.fname,user_profiles.lname,orders.price_total,orders.payment_status');
		$this->db->from('order_refund');
		//$this->db->where("orders.type",$type);
		if ($this->session->userdata('user_role_ids') != '1') {
			$this->db->where('orders.seller_id', $this->session->userdata('seller_id'));
		}

		$this->db->where("order_refund.deleted", "0");
		$this->db->order_by("order_refund.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=order_refund.buyer_id', 'LEFT');
		$this->db->join('orders', 'orders.order_number=order_refund.order_number', 'LEFT');
		$this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
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
		//$this->db->where("orders.deleted","0");
		$this->db->order_by("order_products.id", "desc");
		$query = $this->db->get()->result();
		//echo $this->db->last_query();		
		return $query;
	}
	public function orderDetails($id, $user_id = '')
	{
		$data = array();
		$this->db->select('orders.*,seller.seller_name,seller.phone_number,seller.address,user_profiles.fname,user_profiles.lname,user_profiles.email,user_profiles.phone_code,user_profiles.phone_no');
		$this->db->from('orders');
		$this->db->where("orders.id", $id);
		$this->db->where("orders.deleted", "0");
		//$this->db->where("orders.deleted","0");
		$this->db->order_by("orders.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		$this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');
		//$this->db->join('user_profiles as restaurant', 'restaurant.user_id=orders.seller_id' , 'LEFT');
		//$this->db->join('location_countries', 'location_countries.id = restaurant.store_country_id' , 'LEFT');
		//$this->db->join('location_states', 'location_states.id = restaurant.store_state_id' , 'LEFT');
		//$this->db->join('location_cities', 'location_cities.id = restaurant.store_city_id' , 'LEFT');

		$query = $this->db->get()->row();
		//echo $this->db->last_query(); die();
		$query->orderItemList = $this->orderItemList($query->id);

		return $query;
	}

	public function lebelGenerate($id)
	{
		$data = array();
		$oid = base64_decode($id);
		$this->db->select('orders.*,seller.seller_name,seller.phone_number,seller.address,user_profiles.fname,user_profiles.lname,user_profiles.email,user_profiles.phone_code,user_profiles.phone_no');
		$this->db->from('orders');
		$this->db->where("orders.id", $oid);
		$this->db->where("orders.deleted", "0");
		//$this->db->where("orders.deleted","0");
		$this->db->order_by("orders.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		$this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');

		$query = $this->db->get()->row();
		//echo $this->db->last_query(); die();
		$query->orderItemList = $this->orderItemList($query->id);

		return $query;
	}
	/*public function totalEarning($sdate,$edate)
    {		
		$data= array();
		$this->db->select('orders.*,seller.seller_name,seller.address,seller.phone_number,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');		
		$this->db->from('orders');
		if($this->session->userdata('user_role_ids') != '1'){
			$this->db->where("orders.seller_id",$this->session->userdata('user_id'));
		}
		$this->db->where("orders.order_status",'completed');
                if($sdate!='' && $edate!=''){
                    $this->db->where("DATE(orders.created_at)>=", $sdate);
                    $this->db->where("DATE(orders.created_at)<=", $edate);   
                   }
                   else {
                       if($sdate!=''){
                  $this->db->where("DATE(orders.created_at)",$sdate);
                  //$this->db->where("DATE(task_list.start_date)>=", $sdate);
                  //$this->db->where("DATE(task_list.end_date)<=", $edate);
                  }
                  if($edate!=''){
                  $this->db->where("DATE(orders.created_at)",$edate);

                  }
                   }
                
		$this->db->order_by("orders.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
                $this->db->join('seller', 'seller.id=orders.seller_id' , 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		return $query;
    }*/

	public function totalEarning($seller_id, $sdate, $edate)
	{
		$data = array();
		//$date = !empty($search['date']) ? $search['date'] : date('Y-m-d');
		$this->db->select('orders.seller_id,seller.seller_name,seller.profile_image,seller.phone_number,seller.seller_commission');
		//$this->db->select('orders.*,seller.seller_name,seller.address,seller.phone_number,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
		$this->db->select_sum('price_total');
		$this->db->from('orders');
		$this->db->where("orders.deleted", "0");
		//$this->db->where("DATE(orders.created_at)", $date);
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
		$this->db->where("orders.order_status", 'completed');
                if ($this->session->userdata('user_role_ids') != '1') {
			$this->db->where('orders.seller_id', $seller_id);
		}
                $this->db->order_by("orders.id", "desc");
		$this->db->group_by("orders.seller_id");
		//$this->db->join('user_profiles as seller', 'seller.user_id=orders.seller_id' , 'LEFT');
		$this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query(); die();
		if (!empty($query)) {
			foreach ($query as $k => $data) {
				$query[$k]->order_count = count($this->sellerOrderList($data->seller_id, $sdate, $edate));
			}
		}

		return $query;
	}

	public function sellerOrderList($seller_id, $sdate, $edate)
	{
		$data = array();
		$this->db->select('orders.*,seller.seller_name,seller.profile_image,seller.phone_number,seller.seller_commission,user_profiles.fname,user_profiles.lname');
		//$this->db->select('orders.*,seller.seller_name,seller.address,seller.phone_number,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
		$this->db->from('orders');
		$this->db->where("orders.seller_id", $seller_id);
		//$this->db->where("DATE(orders.created_at)", $date);
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
		$this->db->where("orders.order_status", 'completed');
		$this->db->where("orders.deleted", "0");
		$this->db->order_by("orders.id", "desc");

		//$this->db->join('user_profiles as seller', 'seller.user_id=orders.seller_id' , 'LEFT');
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		$this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query();

		return $query;
	}

	public function getEarningTotalSum($seller_id,$sdate, $edate)
	{
		$data = array();
		$this->db->select_sum('price_total');
		$this->db->from('orders');
		//$this->db->where('orders.order_status', 'completed');
		if ($this->session->userdata('user_role_ids') != '1') {
			$this->db->where("orders.seller_id", $this->session->userdata('seller_id'));
		}
		//$this->db->where("orders.order_status", 'completed');
		$this->db->where("orders.deleted", "0");
                if ($seller_id != '') {
			$this->db->where('orders.seller_id', $seller_id);
		}
		if ($sdate != '' && $edate != '') {
			$this->db->where("DATE(orders.created_at)>=", $sdate);
			$this->db->where("DATE(orders.created_at)<=", $edate);
		} else {
			if ($sdate != '') {
				$this->db->where("DATE(orders.created_at)", $sdate);
				//$this->db->where("DATE(task_list.start_date)>=", $sdate);
				//$this->db->where("DATE(task_list.end_date)<=", $edate);
			}
			if ($edate != '') {
				$this->db->where("DATE(orders.created_at)", $edate);
			}
		}
		$this->db->order_by("id", "desc");
		$datas = $this->db->get()->row();
		//echo $this->db->last_query(); die;
		return ($datas->price_total > 0) ? $datas->price_total : 0;
	}

	public function saleCaseReport($seller_id, $sdate, $edate)
	{
		$data = array();
		$this->db->select('orders.*,seller.id,seller.seller_name,seller.phone_number,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
		$this->db->from('orders');
		if ($this->session->userdata('user_role_ids') != '1') {
			$this->db->where("orders.seller_id", $this->session->userdata('seller_id'));
		}
		if ($seller_id != '') {
			$this->db->where('orders.seller_id', $seller_id);
		}
		if ($sdate != '' && $edate != '') {
			$this->db->where("DATE(orders.created_at)>=", $sdate);
			$this->db->where("DATE(orders.created_at)<=", $edate);
		} else {
			if ($sdate != '') {
				$this->db->where("DATE(orders.created_at)", $sdate);
				//$this->db->where("DATE(task_list.start_date)>=", $sdate);
				//$this->db->where("DATE(task_list.end_date)<=", $edate);
			}
			if ($edate != '') {
				$this->db->where("DATE(orders.created_at)", $edate);
			}
		}
		$this->db->where("orders.deleted", "0");
		$this->db->order_by("orders.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		$this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query(); die();
		return $query;
	}
	public function getSellernameList()
	{
		$data = array();
		$this->db->select('seller.*');
		$this->db->from('seller');
		$this->db->where("seller.deleted", "0");
		$this->db->where("status", "1");
		$this->db->order_by("id", "asc");
		return $datas = $this->db->get()->result();
	}

	public function updateOrderStatus($order_status, $id)
	{
		$this->db->set("order_status", $order_status);
		$this->db->where("id", $id);
		return $this->db->update("orders");
	}
	public function refundDetails($id)
	{
		$data = array();
		$this->db->select('order_refund.*');
		$this->db->from('order_refund');
		$this->db->where("order_refund.id", $id);
		$this->db->where("order_refund.deleted", "0");
		//$this->db->where("orders.deleted","0");
		$this->db->order_by("order_refund.id", "desc");
		$query = $this->db->get()->row();
		return $query;
	}
	public function checkOrderRefund($id)
	{
		$data = array();
		$this->db->select('order_refund.*');
		$this->db->from('order_refund');
		$this->db->where("order_refund.order_id", $id);
		$this->db->where("order_refund.deleted", "0");
		$this->db->order_by("order_refund.id", "desc");
		$query = $this->db->get();
		//echo $this->db->last_query(); die();
		return $query->num_rows();
		//echo $this->db->last_query(); die();

	}
	public function updateRefundStatus($refund_status, $id)
	{
		if ($refund_status == 'completed') {
			echo 'hiiiii';
			$uniqe_id = uniqid();
			$this->db->set("refund_number", $uniqe_id);
		}
		$this->db->set("refund_status", $refund_status);
		$this->db->where("id", $id);
		return $this->db->update("order_refund");
		//echo $this->db->last_query(); die();
	}
        
        public function getProfileImage($uid)
	{
		$data = array();
		$this->db->select('user_profiles.profile_image');
		//$this->db->select('orders.*,seller.seller_name,seller.address,seller.phone_number,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
		$this->db->from('user_profiles');
		$this->db->where("user_profiles.user_id", $uid);
		$query = $this->db->get()->row();
		//echo $this->db->last_query();
                return $query;
	}
        
        public function paymentStatusChange($did)
	{
		$this->db->select('orders.*');
		$this->db->from('orders');
		$this->db->where("orders.id", $did);
		$data = $this->db->get()->row();

		if ($data->payment_status == 'Unpaid') {
			$this->db->set("payment_status", 'Paid');
		} else {
			$this->db->set("payment_status", 'Unpaid');
		}
		$this->db->where("id", $did);
		$return =$this->db->update("orders");
                return $return;
	}
}

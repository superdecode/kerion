<?php

class Coupon_model extends CI_Model
{

	public function __construct()
	{
		parent::__construct();
	}

	public function saveCoupon($post, $id = "")
	{
		if (!empty($id)) {
			$this->db->where('id', $id);
			$res = $this->db->update('coupons', $post);
		} else {
			$res = $this->db->insert('coupons', $post);
		}
		return $res;
	}

	public function getCouponDetails($id)
	{
		$this->db->select('coupons.*');
		$this->db->from('coupons');
		$this->db->where("coupons.deleted", "0");
		$this->db->where("coupons.id", $id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		if (!empty($data)) {
			$data->image_default = '';
			if (!empty($data->banner)) {
				$photos = explode(',', $data->banner);
				$photos = generate_ids_string($photos);
				$this->db->select('uploads.file_name');
				$this->db->from('uploads');
				$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);
				$datas = $this->db->get()->result();
				//echo $this->db->last_query();
				$data->image_default = !empty($datas) ? $datas[0]->file_name : '';
			}
		}

		return $data;
	}
	public function getCoupons()
	{
		$this->db->select('coupons.*,seller.seller_name as sname');
		$this->db->from('coupons');
		$this->db->where("coupons.deleted", "0");
		//$this->db->where("coupons.type",$type);
		if($this->session->userdata('user_id')!='1') {
			$this->db->where("coupons.seller_ids",$this->session->userdata('seller_id'));
		}
		$this->db->join('seller', 'seller.id = coupons.seller_ids', 'LEFT');
		$this->db->order_by("id", "desc");
		$query = $this->db->get()->result();
		if (!empty($query)) {
			foreach ($query as $k => $data) {
				$query[$k]->image_default = '';
				if (!empty($data->banner)) {
					$photos = explode(',', $data->banner);
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
	public function statusChange($id)
	{
		$this->db->select('coupons.*');
		$this->db->from('coupons');
		$this->db->where("coupons.id", $id);
		$data = $this->db->get()->row();

		if ($data->status == '1') {
			$this->db->set("status", '0');
		} else {
			$this->db->set("status", '1');
		}
		$this->db->where("id", $id);
		return $this->db->update("coupons");
	}
	public function dataRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("coupons");
	}
	public function restaurantList()
	{
		$this->db->select('seller.*');
		$this->db->from('seller');
		$this->db->where("seller.deleted", '0');
		$this->db->where("seller.status", '1');
		$this->db->order_by("seller.id", "desc");
		$query = $this->db->get()->result();

		return $query;
	}
	public function storeList($role_ids)
	{
		$this->db->select('users.login_id as user_login_id,users.status,user_profiles.*');
		$this->db->from('users');
		$this->db->where("users.deleted", '0');
		$this->db->where("users.status", '1');
		$this->db->where("users.role_ids", $role_ids);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id', 'LEFT');
		$this->db->order_by("users.id", "desc");
		$query = $this->db->get()->result();

		return $query;
	}
}

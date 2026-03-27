<?php

class Order_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	public function saveOrderProduct($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('order_products', $post);
		}else{
			$res = $this->db->insert('order_products', $post);
		}
		return $res;
	}
	
	public function orderDetails($order_id)
    {		
		
        $data= array();
		$this->db->select('order_products.*,user_profiles.full_name,products.photos,order_products.order_no,orders.order_number,orders.created_at,orders.payment_method,orders.payment_status');		
		$this->db->from('order_products');
		$this->db->join('orders', 'orders.id=order_products.order_id' , 'LEFT');
		$this->db->join('products', 'products.id = order_products.product_id' , 'LEFT');
		$this->db->where("order_products.id",$order_id);
		$this->db->order_by("order_products.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
		$query = $this->db->get()->row();
		//echo $this->db->last_query();
		if(!empty($query)){
			$query->image_default='';
			if(!empty($query->photos)){
				$photos = explode(',',$query->photos);
				$photos = generate_ids_string($photos);					
				$this->db->select('uploads.file_name');
				$this->db->from('uploads');
				$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
				$datas = $this->db->get()->result();
				//echo $this->db->last_query();
				$query->image_default= !empty($datas)?$datas[0]->file_name:'';
			}
			
			//billing_shipping			
			$this->db->where('order_id', $query->order_id);
			$query_shipping = $this->db->get('order_shipping')->row();			
			$query->billing_shipping = $query_shipping;
			
			//buyer
			$this->db->select('* ');
			$this->db->from('user_profiles');
			$this->db->where("user_id",$query->buyer_id);
			$query_buyer = $this->db->get()->row();
			$query->buyer = $query_buyer;
			
		}
		
		return $query;
    }
	public function getOrderProducts()
	{
		$data= array();
		$this->db->select('order_products.*,user_profiles.full_name,order_products.order_no,orders.order_number,orders.created_at,orders.payment_method,orders.payment_status,products.photos');		
		$this->db->from('order_products');
		$this->db->join('orders', 'orders.id=order_products.order_id' , 'LEFT');
		$this->db->join('products', 'products.id = order_products.product_id' , 'LEFT');

		if($this->session->userdata('user_role_ids') != '1'){
			$this->db->where("order_products.seller_id",$this->session->userdata('user_id'));
		}
		//$this->db->where("orders.deleted","0");
		$this->db->order_by("order_products.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
		
		//echo $this->db->last_query();
		
		$query = $this->db->get()->result();
		if(!empty($query)){
			foreach($query as $k=>$data){
				$query[$k]->image_default='';
				if(!empty($data->photos)){
					$photos = explode(',',$data->photos);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$query[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
				}
			}
		}
		
		
		return $query;
				
	}
	public function productStatusChange($id)
	{
		$this->db->select('products.*');
		$this->db->from('products');
		$this->db->where("products.id",$id);
		$data = $this->db->get()->row();
		
		if($data->status=='1')
		{
			$this->db->set("status", '0');
		}
		else
		{
			$this->db->set("status", '1');
		}
		$this->db->where("id", $id);
		return $this->db->update("products");	
	}
	public function productRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("products");	
	}
	//******************************************************************************************************************//
	
	
	
	
	
}
?>

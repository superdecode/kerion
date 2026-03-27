<?php

class Report_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	
    public function getOrders()
    {		
            
		$data= array();
		$this->db->select('orders.*,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');		
		$this->db->from('orders');
		if($this->session->userdata('user_role_ids') != '1'){
			$this->db->where("orders.seller_id",$this->session->userdata('user_id'));
		}
		
                $this->db->where("orders.deleted","0");
		$this->db->order_by("orders.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
		$query = $this->db->get()->result();
		
		
		return $query;
    }
	
    public function getCustomers($role_id)
	{		
		
               $this->db->select('users.*,user_profiles.fname, user_profiles.lname,user_profiles.phone_no, user_profiles.profile_image');
		$this->db->from('users');
		//$this->db->where("(NOT find_in_set('2',role_ids) <> 0) && (NOT find_in_set('3',role_ids) <> 0)");
		$this->db->where("users.deleted",'0');
		if(!empty($role_id)){$this->db->where("users.role_ids",$role_id);}
		$this->db->where("users.role_ids!=",'1');
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id' , 'LEFT');
		$this->db->join('roles', 'roles.id = users.role_ids' , 'LEFT');
		
		$this->db->where("user_profiles.is_main",'1');
		$this->db->order_by("users.id", "desc");
		$query = $this->db->get()->result();
		
		return $query;
	}
        public function getCoupons()
	{
		$this->db->select('coupons.*,seller.seller_name as sname');
		$this->db->from('coupons');
		$this->db->where("coupons.deleted","0");
		//$this->db->where("coupons.type",$type);
                $this->db->join('seller', 'seller.id = coupons.id', 'LEFT');
		$this->db->order_by("id", "desc");
		$query = $this->db->get()->result();
		if(!empty($query)){
			foreach($query as $k=>$data){
				$query[$k]->image_default='';
				if(!empty($data->banner)){
					$photos = explode(',',$data->banner);
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
        
    public function getRefund()
    {		
		$data= array();
		$this->db->select('order_refund.* ,user_profiles.fname,user_profiles.lname,orders.price_total,orders.payment_status');		
		$this->db->from('order_refund');
		//$this->db->where("orders.type",$type);
                $this->db->where("order_refund.deleted","0");
		$this->db->order_by("order_refund.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=order_refund.buyer_id' , 'LEFT');
                $this->db->join('orders', 'orders.order_number=order_refund.order_number' , 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		return $query;
    }
    public function getFeedback()
	{
		$this->db->select('feedbacks.*,feedbacks_images.image as image');
		$this->db->from('feedbacks');
		$this->db->where("feedbacks.deleted","0");
                 $this->db->join('feedbacks_images','feedbacks_images.feedback_id = feedbacks.id', 'LEFT');
		$this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
                
                
				
	} 
        
         public function getprofit($search)
    {		
		$data= array();
		$date = !empty($search['date'])?$search['date']:date('Y-m-d');
		$this->db->select('orders.seller_id,seller.seller_name,seller.profile_image,seller.phone_number,seller.seller_commission');
                //$this->db->select('orders.*,seller.seller_name,seller.address,seller.phone_number,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
		$this->db->select_sum('price_total');
		$this->db->from('orders');
                $this->db->where("orders.deleted","0");
		$this->db->where("DATE(orders.created_at)",$date);
                $this->db->where("orders.order_status",'completed');
		$this->db->order_by("orders.id", "desc");
		$this->db->group_by("orders.seller_id");
		//$this->db->join('user_profiles as seller', 'seller.user_id=orders.seller_id' , 'LEFT');
                 $this->db->join('seller', 'seller.id=orders.seller_id' , 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query(); die();
		if(!empty($query)){
			foreach($query as $k=>$data){				
				$query[$k]->order_count= count($this->sellerOrderList($data->seller_id,$date));
			}
		}
		
		return $query;
    }
    
      public function sellerOrderList($seller_id,$date)
    {		
		$data= array();
		$this->db->select('orders.*,seller.seller_name,seller.profile_image,seller.phone_number,seller.seller_commission	,user_profiles.fname,user_profiles.lname');
                //$this->db->select('orders.*,seller.seller_name,seller.address,seller.phone_number,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
		$this->db->from('orders');	
		$this->db->where("orders.seller_id",$seller_id);
		$this->db->where("DATE(orders.created_at)",$date);
                $this->db->where("orders.order_status",'completed');
                $this->db->where("orders.deleted","0");
		$this->db->order_by("orders.id", "desc");
                
		//$this->db->join('user_profiles as seller', 'seller.user_id=orders.seller_id' , 'LEFT');
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
                 $this->db->join('seller', 'seller.id=orders.seller_id' , 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		
		return $query;
    }
	
}
?>

<?php

class Message_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	public function saveMessage($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('messages', $post);
		}else{
			$res = $this->db->insert('messages', $post);
		}
		return $res;
	}
	
	public function getMessageDetails($id){
		$this->db->select('messages.*');
		$this->db->from('messages');
		$this->db->where("messages.deleted","0");
		$this->db->where("messages.id",$id);
               
                $this->db->order_by("id", "desc");
                //echo $this->db->last_query();
		$data = $this->db->get()->row();
		return $data;
	} 
        public function getSellernameList()
	{
		$data= array();
		$this->db->select('seller.*');
		$this->db->from('seller');
                $this->db->where("seller.deleted","0");
                $this->db->where("status","1");
		$this->db->order_by("id", "asc");
                return $datas = $this->db->get()->result();
				
	}
	public function getMessages()
	{
		$data= array();
		$this->db->select('messages.*,seller.seller_name as seller_name');
		$this->db->from('messages');
		$this->db->where("messages.deleted","0");
                $this->db->join('seller', 'seller.id = messages.seller_id' , 'LEFT');
                $this->db->order_by("messages.id", "desc");
                $this->db->group_by('messages.seller_id');
		
		return $datas = $this->db->get()->result();
				
	}
        public function getMessagesList($seller_id)
	{
		$data= array();
        
		$this->db->select('messages.*,seller.seller_name as seller_name');
		$this->db->from('messages');
		//$this->db->where("messages.status", '1');
                $this->db->where("messages.deleted","0");
                $this->db->where("messages.seller_id",$seller_id);
                $this->db->join('seller', 'seller.id = messages.seller_id' , 'LEFT');
                $this->db->order_by("messages.id", "desc");
                $datas = $this->db->get()->result();
                //pr($this->db->last_query()); die();
		return $datas;		
	}
	public function messageStatusChange($id)
	{
		$this->db->select('messages.*');
		$this->db->from('messages');
		$this->db->where("messages.id",$id);
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
		return $this->db->update("messages");	
	}
	public function messageRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("messages");	
	}
	
        public function getUsersList($role_id)
	{		
		
                $this->db->select('users.id');
		$this->db->from('users');
		$this->db->where("users.deleted",'0');
		if(!empty($role_id)){$this->db->where("users.role_ids",$role_id);}
		$this->db->where("users.role_ids!=",'1');
		$this->db->order_by("users.id", "desc");
		$query = $this->db->get()->result();
                //pr($this->db->last_query()); die();
		return $query;
	}
        
	public function saveNotification($post){
		
			$res = $this->db->insert('message_notifications', $post);
		
		return $res;
	}
	
	
}

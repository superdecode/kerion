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
		$data = $this->db->get()->row();
		return $data;
	} 
	public function getMessages()
	{
		$data= array();
		$this->db->select('messages.*');
		$this->db->from('messages');
		$this->db->where("messages.deleted","0");
		$this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
				
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
	
	
	
	
}
?>

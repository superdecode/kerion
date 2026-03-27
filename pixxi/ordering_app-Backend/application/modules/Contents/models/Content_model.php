<?php

class Content_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	public function saveContent($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('contents', $post);
		}else{
			$res = $this->db->insert('contents', $post);
		}
		return $res;
	}
	
	public function getContentDetails($id){
		$this->db->select('contents.*');
		$this->db->from('contents');
		$this->db->where("contents.deleted","0");
		$this->db->where("contents.id",$id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	} 
	public function getContents()
	{
		$data= array();
		$this->db->select('contents.*');
		$this->db->from('contents');
		$this->db->where("contents.deleted","0");
		$this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
				
	}
	public function contentStatusChange($id)
	{
		$this->db->select('contents.*');
		$this->db->from('contents');
		$this->db->where("contents.id",$id);
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
		return $this->db->update("contents");	
	}
	public function contentRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("contents");	
	}
	
	
	
	
}
?>

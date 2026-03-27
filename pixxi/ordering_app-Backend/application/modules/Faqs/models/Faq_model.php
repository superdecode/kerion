<?php

class Faq_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	public function saveFaq($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('faqs', $post);
		}else{
			$res = $this->db->insert('faqs', $post);
		}
		return $res;
	}
	
	public function getFaqDetails($id){
		$this->db->select('faqs.*');
		$this->db->from('faqs');
		$this->db->where("faqs.deleted","0");
		$this->db->where("faqs.id",$id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	} 
	public function getFaqs()
	{
		$this->db->select('faqs.*');
		$this->db->from('faqs');
		$this->db->where("faqs.deleted","0");
		$this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
				
	} 
	public function FaqsStatusChange($id)
	{
		$this->db->select('faqs.*');
		$this->db->from('faqs');
		$this->db->where("faqs.id",$id);
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
		return $this->db->update("faqs");	
	}
	public function FaqsRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("faqs");	
	}
	public function roleList($parent_id="0")
	{
		$this->db->select('roles.*');
		$this->db->from('roles');
		$this->db->where("roles.deleted","0");
		$this->db->where("roles.parent_id",$parent_id);
		$this->db->order_by("id", "asc");
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
				
	}
	
}
?>

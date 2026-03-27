<?php

class Contact_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	
    public function saveStatus($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('feedbacks', $post);
                        //echo $this->db->last_query(); die();
		}else{
			$res = $this->db->insert('feedbacks', $post);
		}
		return $res;
	}
	public function getContacts_applied()
	{
		$this->db->select('feedbacks.*,feedbacks_images.image as image');
		$this->db->from('feedbacks');
		$this->db->where("feedbacks.deleted","0");
                 $this->db->join('feedbacks_images','feedbacks_images.feedback_id = feedbacks.id', 'LEFT');
		$this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
                
                
				
	} 
        
        
        public function getFeedbackDetails($id){
		$this->db->select('feedbacks.*');
		$this->db->from('feedbacks');
		$this->db->where("feedbacks.deleted","0");
		$this->db->where("feedbacks.id",$id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
                
               
                //echo $this->db->last_query(); die();
		return $data;
	} 
	public function ContactsStatusChange($id)
	{
		$this->db->select('feedbacks.*');
		$this->db->from('feedbacks');
		$this->db->where("feedbacks.id",$id);
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
		return $this->db->update("jobs");	
	}
	public function ContactsRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("feedbacks");	
	}
	
	
}
?>

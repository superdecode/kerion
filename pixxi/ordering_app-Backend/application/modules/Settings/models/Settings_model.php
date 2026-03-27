<?php

class Settings_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	public function save_settings($values)
    {
        foreach($values as $key=>$value)
        {
			$this->db->select('settings.value ');
			$this->db->from('settings');
			$this->db->where("settings.name", $key);
			$this->db->order_by("settings.id", "asc");
			$query = $this->db->get()->row();
			
			//pr($key.'---'.$value);
            //if the key currently exists, update the setting
            if(!empty($query))
            {
                $update = array('value'=>$value);
                $this->db->where('name',$key);
                $res = $this->db->update('settings', $update);				
            }
            //if the key does not exist, add it
            else
            {
                $insert = array('name'=>$key, 'value'=>$value, 'addedOn'=>gmdate('Y-m-d H:i:s'));
                $res = $this->db->insert('settings', $insert);
            }
			//echo $this->db->last_query().'<br>';			
        }
		
		return $res;
		
    }
	public function getEmailTemplates()
	{
		$data= array();
		$post = $this->input->post();
		$this->db->select('email_templates.*');
		$this->db->from('email_templates');
		$this->db->order_by("id", "asc");
		return $datas = $this->db->get()->result();				
	}
	public function getEmailTemplateDetails($id)
	{
		$data= array();
		$post = $this->input->post();
		$this->db->select('email_templates.*');
		$this->db->from('email_templates');
		$this->db->where('id',$id);
		$this->db->order_by("id", "asc");
		return $datas = $this->db->get()->row();				
	}
	public function saveEmailTemplate($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('email_templates', $post);
		}else{
			$res = $this->db->insert('email_templates', $post);
		}
		return $res;
	}
	public function emailTemplateStatusChange($id)
	{
		$this->db->select('email_templates.*');
		$this->db->from('email_templates');
		$this->db->where("email_templates.id",$id);
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
		return $this->db->update("email_templates");	
	}
	
}
?>

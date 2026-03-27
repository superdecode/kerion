<?php

class Role_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	public function saveModule($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('modules', $post);
		}else{
			$res = $this->db->insert('modules', $post);
		}
		return $res;
	}
	
	public function getModuleDetails($id){
		$this->db->select('modules.*');
		$this->db->from('modules');
		$this->db->where("modules.deleted","0");
		$this->db->where("modules.id",$id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	} 
	public function getModules($parent_id)
	{
		$this->db->select('modules.*');
		$this->db->from('modules');
		$this->db->where("modules.deleted","0");
		$this->db->where("modules.parent_id",$parent_id);
		$this->db->order_by("order_no", "desc");
		$datas = $this->db->get()->result();
		return $datas;
				
	}
	public function moduleStatusChange($id)
	{
		$this->db->select('modules.*');
		$this->db->from('modules');
		$this->db->where("modules.id",$id);
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
		return $this->db->update("modules");	
	}
	public function statusChangeRole($id)
	{
		$this->db->select('roles.*');
		$this->db->from('roles');
		$this->db->where("roles.id",$id);
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
		return $this->db->update("roles");	
	}
	public function moduleRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("modules");	
	}
	public function moduleList($parent_id="0")
	{
		$this->db->select('modules.*');
		$this->db->from('modules');
		$this->db->where("modules.deleted","0");
		$this->db->where("modules.status","1");
		$this->db->where("modules.parent_id",$parent_id);
		$this->db->order_by("id", "asc");
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
				
	}
	public function roleList()
	{
		$this->db->select('roles.*');
		$this->db->from('roles');
		$this->db->where("roles.deleted","0");
		//$this->db->where("roles.status","1");
		$this->db->order_by("id", "asc");
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
	}
	public function getModuleList($parent_id='0'){
		$this->db->select('modules.*,parent_module.name as parent_name');
		$this->db->from('modules');
		$this->db->where("modules.deleted","0");
		$this->db->where("modules.status","1");
		$this->db->where("modules.parent_id",$parent_id);
		$this->db->join('modules as parent_module', 'modules.parent_id = parent_module.id' , 'LEFT');
		$this->db->order_by("parent_id", "asc");
		$data = $this->db->get()->result();
		return $data;
	} 
	public function getRoleDetails($id){
		$this->db->select('roles.*');
		$this->db->from('roles');
		$this->db->where("roles.id",$id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	} 
	public function saveRole($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('roles', $post);
		}else{
			$res = $this->db->insert('roles', $post);
			$id = $this->db->insert_id();
		}
		return $id;
	}
	public function saveRolePermission($post){		
		$res = $this->db->insert('role_permissions', $post);
		//$id = $this->db->insert_id();
		return $res;
	}
	
}
?>

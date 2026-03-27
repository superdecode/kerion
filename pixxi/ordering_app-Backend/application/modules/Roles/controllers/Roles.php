<?php defined('BASEPATH') or exit('No direct script access allowed');

class Roles extends BackendController
{
    //
    public $CI;

    /**
     * An array of variables to be passed through to the
     * view, layout,....
     */
    protected $data = array();

    /**
     * [__construct description]
     *
     * @method __construct
     */
    public function __construct()
    {
        parent::__construct();
		$this->load->model('Role_model');		
    }

	public function moduleSave($id=''){
		authenticate();			
		$result=array();
		$query = new stdClass();
		if(!empty($id)){
			$data['header']['site_title'] = 'Modify Module';
			$id= base64_decode($id);
			$query = $this->Role_model->getModuleDetails($id);
		}else{
			$data['header']['site_title'] = 'Add Module';
			$query->name='';
			$query->description='';
			$query->parent_id='0';
			$query->permissions='';
			$query->is_public='1';
			$query->icon='far fa-circle';
			$id='';
		}		
		$data['p_categories'] = $this->Role_model->moduleList();
		if($this->input->post()){			
			$post['section'] =$this->input->post('section');
			$post['name'] =$this->input->post('name');
			$post['description'] =$this->input->post('description');
			$post['parent_id'] =$this->input->post('parent_id');
			$post['alias'] =url_title($this->input->post('name'), 'dash', TRUE);
			$post['is_url'] =!empty($this->input->post('is_url'))?'1':'0';
			$post['is_public'] =!empty($this->input->post('is_public'))?'1':'0';
			$post['url'] =$this->input->post('url');
			$post['icon'] =$this->input->post('icon');
			$post['order_no'] =$this->input->post('order_no');
			$post['permissions']=!empty($this->input->post('permissions'))?implode(',', $this->input->post('permissions')):'';
			
			//pr($post);die;
			if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =date('Y-m-d H:i:s');
			}
			$result = $this->Role_model->saveModule($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Roles/moduleListing');
		}
		//pr($data);die;
		$data['query']=$query;
		$this->render('admin/module_save', $data);  
	}
    public function moduleListing($id="")
    {
		authenticate();	
		$id= base64_decode($id);
		if(!empty($id)){
			$data['header']['site_title'] = 'Sub Module List of '.get_parent_module_name($id);
		}else{
			$data['header']['site_title'] = 'Module List';
		}
		$data['id'] = $id;
		$result=array();
		$this->render('admin/module_listing', $data);
    }
	
    public function statusChangeModule($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Role_model->moduleStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Roles/moduleListing');
    }
	
	public function removeModule($id){
		$id= base64_decode($id);
		$result = $this->Role_model->moduleRemove($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Deleted');							
		}else{
			$this->session->set_flashdata('error_msg', 'Deletion Unsuccessful');				
		}
		redirect('Roles/moduleListing');
	}
	
	public function getModules($parent_id="0"){		
		$datas = $this->Role_model->getModules($parent_id);
		$data = array();
		if(!empty($datas)){
			foreach($datas as $k=> $rows)
			{
				$id = base64_encode($rows->id);
				$edit_link = base_url('Roles/moduleSave/'.$id);
				$list_link = base_url('Roles/moduleListing/'.$id);
				$delete_link = base_url('Roles/removeModule/'.$id);
				$status_link = base_url('Roles/statusChangeModule/'.$id);
				$url = ($rows->is_url=='1')?$rows->url:base_url($rows->url);
				$icon = "<i class='".$rows->icon."'></i>";
				$name = "<a href='".$list_link."'>".$icon.' '.$rows->name."</a>";
				$status_onclick = ($permission_status=='0')?'return false;':'';
				$status = ($rows->status=='1')?'<a href="'.$status_link.'" class="active" onclick="'.$status_onclick.'">Active</a>':'<a href="'.$status_link.'" class="inactive"  onclick="'.$status_onclick.'">Inactive</a>';
				$confirm_msg="return confirm('Do you Want to Delete this??')";
				$actions = '<a href="'.$edit_link.'" class="edit">
								<i class="fas fa-edit"></i>
							  </a>
							  ';
				/*
				<a href="'.$delete_link.'" class="delete" onclick="'.$confirm_msg.'" >
					<i class="fas fa-trash"></i>
				</a>
				*/
				$data[]= array(
					$k+1,
					$name,
					get_parent_module_name($rows->parent_id),
					$url,
					$rows->order_no,
					$status,
					$actions
				);     
			}
		}
		$output = array(
            "data" => $data
        );
        echo json_encode($output);
	}
	public function listing()
    {
		authenticate();	
		$id= base64_decode($id);		
		$data['header']['site_title'] = 'Role List';
		
		$data['id'] = $id;
		$result=array();
		$this->render('admin/listing', $data);
    }
	public function getRoles(){
		$user_role_ids = $this->session->userdata('user_role_ids');	
		$module_permissions = get_module_permission($user_role_ids,'31');		
		$permission_edit = $module_permissions->permission_edit;
		$permission_delete = $module_permissions->permission_delete;
		$permission_status = $module_permissions->permission_status;
		
		
		$datas = $this->Role_model->roleList();
		$data = array();
		if(!empty($datas)){
			foreach($datas as $k=> $rows)
			{
				$id = base64_encode($rows->id);
				$edit_link = base_url('Roles/save/'.$id);
				$delete_link = base_url('Roles/removeRole/'.$id);
				$status_link = base_url('Roles/statusChangeRole/'.$id);
				
				
				$name = "<a href='".$edit_link."'>".$icon.' '.$rows->name."</a>";
				$status_onclick = ($permission_status=='0')?'return false;':'';
				$status = ($rows->status=='1')?'<a href="'.$status_link.'" class="active" onclick="'.$status_onclick.'">Active</a>':'<a href="'.$status_link.'" class="inactive"  onclick="'.$status_onclick.'">Inactive</a>';
				$confirm_msg="return confirm('Do you Want to Delete this??')";
				$actions = '<a href="'.$edit_link.'" class="edit">
								<i class="fas fa-edit"></i>
							  </a>
							  ';
				/*
				<a href="'.$delete_link.'" class="delete" onclick="'.$confirm_msg.'" >
					<i class="fas fa-trash"></i>
				</a>
				*/
				$data[]= array(
					$k+1,
					$name,
					$status,
					$actions
				);     
			}
		}
		$output = array(
            "data" => $data
        );
        echo json_encode($output);
	}
	public function save($id=''){
		authenticate();			
		$result=array();
		$query = new stdClass();
		if(!empty($id)){
			$data['header']['site_title'] = 'Modify Role';
			$id= base64_decode($id);
			$query = $this->Role_model->getRoleDetails($id);
		}else{
			$data['header']['site_title'] = 'Add Role';
			$query->name='';
			$query->description='';
			$id='';
		}		
		if($this->input->post()){
			
			//pr($this->input->post()); 
			
			$module_ids = $this->input->post('module_ids');
			
			$post['name'] =$this->input->post('name');
			$post['description'] =$this->input->post('description');
			
			if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =gmdate('Y-m-d H:i:s');
			}
			$role_id = $this->Role_model->saveRole($post,$id);
			
			$this->db->delete('role_permissions', array('role_id' => $role_id)); 
			foreach($module_ids as $k=>$module_id){
				$permission['module_id'] = $module_id;
				$permission['role_id'] = $role_id;
				$permission['section'] =$this->input->post('sections')[$k];
				$permission['parent_module_id'] =$this->input->post('parent_module_ids')[$k];
				$permission['permission_add'] = !empty($this->input->post('permission_add')[$module_id])?'1':'0';
				$permission['permission_edit'] = !empty($this->input->post('permission_edit')[$module_id])?'1':'0';
				$permission['permission_delete'] = !empty($this->input->post('permission_delete')[$module_id])?'1':'0';
				$permission['permission_view'] = !empty($this->input->post('permission_view')[$module_id])?'1':'0';
				$permission['permission_status'] = !empty($this->input->post('permission_status')[$module_id])?'1':'0';
				$permission['addedBy'] =$this->session->userdata('user_id');
				$permission['addedOn'] =gmdate('Y-m-d H:i:s');
				$perm = $permission['permission_add'] + $permission['permission_edit'] +$permission['permission_delete'] +$permission['permission_view']+$permission['permission_status'] ;
				if($perm > 0){
					$result = $this->Role_model->saveRolePermission($permission);
				}
				//pr($permission);
			}
			if(!empty($role_id)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Roles/listing');
		}
		$modules = $this->Role_model->getModuleList();
		//pr($modules);die;
		$data['query']=$query;
		$data['modules']=$modules;
		$this->render('admin/save', $data);  
	}
	
	public function statusChangeRole($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Role_model->statusChangeRole($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Roles/listing');
    }
	
}

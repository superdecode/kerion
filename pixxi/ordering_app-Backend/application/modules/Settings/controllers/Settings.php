<?php defined('BASEPATH') or exit('No direct script access allowed');

class Settings extends BackendController
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
		$this->load->model('Settings_model');
		$this->load->library('upload');		
    }

	public function general(){
		authenticate();			
		$result=array();
		$query = new stdClass();
		$data['header']['site_title'] = 'Configuración General';
		$this->system_images=realpath(APPPATH . '../assets/uploads/system_images/');
		if($this->input->post()){		
			
			$settings = array();
			//pr($_FILES); die;
			$settings = $this->input->post();
			//*************************************************				
				
				// For Logo Image Upload Start
				
				if($_FILES['logo_image']['name']!="")
				{
					$logo=$this->input->post('logo');
					if(!empty($logo)){unlink($this->system_images.'/'.$logo);}
					$value = $_FILES['logo_image']['name'];
					//echo $value;
					
					$config1 = array(
							'file_name' => 'logo_'.date('Ymdhis'),
							'allowed_types' => 'png|jpg|jpeg|gif|ico|', //jpg|jpeg|gif|
							'upload_path' => $this->system_images,
							'max_size' => 20000
					);
	
					$this->upload->initialize($config1);
					if ( ! $this->upload->do_upload('logo_image')) {
							 // return the error message and kill the script
							$this->session->set_flashdata('error_msg', $this->upload->display_errors());
							redirect('Settings/general');
					}
					$image_data = $this->upload->data();
					$logo=$image_data['file_name'];
					$settings['logo'] = $logo;
				}				
				
				// For Logo Image Upload End
				
				// For Favicon Image Upload Start
				
				if($_FILES['favicon_image']['name']!="")
				{
					$favicon=$this->input->post('image');
					if(!empty($favicon)){unlink($this->system_images.'/'.$favicon);}
					$value = $_FILES['favicon_image']['name'];
					//echo $value;
					
					$config2 = array(
							'file_name' => 'favicon_'.date('Ymdhis'),
							'allowed_types' => 'png|jpg|jpeg|gif|ico|', //jpg|jpeg|gif|
							'upload_path' => $this->system_images,
							'max_size' => 20000
					);
	
					$this->upload->initialize($config2);
					if ( ! $this->upload->do_upload('favicon_image')) {
							 // return the error message and kill the script
							$this->upload->display_errors(); //die();
							$this->session->set_flashdata('error_msg', $this->upload->display_errors());
							redirect('Settings/general');
					}
					$image_data = $this->upload->data();
					$favicon=$image_data['file_name'];
					$settings['favicon'] = $favicon;
				}				
				
				// For Favicon Image Upload End
				
				
				
				
				
				//**************************************************
				
				//pr($settings); die;
				$res=$this->Settings_model->save_settings($settings);
				
				//die;
				if(!empty($res)){
					$this->session->set_flashdata('success_msg', 'Successfully Updated');							
				}else{
					$this->session->set_flashdata('error_msg', 'Updation unsuccessful');				
				}
			redirect('Settings/general');
		}
		
		
		$this->render('admin/general_settings', $data);  
	}
	
	
	public function getStateList($country_id){		                                  
		echo state_list_dropdown('',$country_id);                                   
	}
	public function getCityList($state_id){		                                  
		echo city_list_dropdown('',$state_id);                                   
	}
	
	public function email_templates(){
		authenticate();			
		$result=array();		
		$data['header']['site_title'] = 'Plantillas de correo electrónico';
		$data['datas'] = $this->Settings_model->getEmailTemplates();
		$this->render('admin/email_templates', $data);  
	}
	public function saveEmailTemplate($id){		
		if($this->input->post()){		
			$post['name'] =$this->input->post('name');
			$post['email_from'] =$this->input->post('email_from');
			$post['email_subject'] =$this->input->post('email_subject');
			$post['content'] =$this->input->post('content');
			
			
			if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
				$post['modifiedDate'] =gmdate('Y-m-d H:i:s');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['createdDate'] =gmdate('Y-m-d H:i:s');
			}
			$result = $this->Settings_model->saveEmailTemplate($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Settings/email_templates');
		}
	}
	
	public function statusChangeTemplate($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Settings_model->emailTemplateStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Settings/email_templates');
    }
	public function getEmailTemplates(){
		$user_role_ids = $this->session->userdata('user_role_ids');
		$module_permissions = get_module_permission($user_role_ids,'21');		
		$permission_edit = $module_permissions->permission_edit;
		$permission_delete = $module_permissions->permission_delete;
		
		$datas = $this->Settings_model->getEmailTemplates();
		$data= array();
		if(!empty($datas)){
			foreach($datas as $k=> $rows)
			{
				$id = base64_encode($rows->id);
				$edit_link = ($permission_edit=='1')?base_url('Settings/saveEmailTemplate/'.$id):'#';
				$status_link = ($permission_edit=='1')?base_url('Settings/statusChangeTemplate/'.$id):'#';
				$title = "<a href='".$edit_link."'>".$rows->name."</a>";
				$status_onclick = ($permission_status=='0')?'return false;':'';
				$status = ($rows->status=='1')?'<a href="'.$status_link.'" class="active" onclick="'.$status_onclick.'">Active</a>':'<a href="'.$status_link.'" class="inactive"  onclick="'.$status_onclick.'">Inactive</a>';
				$confirm_msg="return confirm('Do you Want to Delete this??')";
				$actions = '';
				if($permission_edit=='1'){
					$actions.= '<a href="'.$edit_link.'" class="edit">
								<i class="fas fa-edit"></i>
							  </a>';
				}
				if(($permission_edit+$permission_delete)== '0'){
					$actions='<a href="#" class="text-danger" title="No Permssion" style="font-size: 15px;">
								<i class="fas fa-exclamation-circle text-danger"></i>
							  </a>';
				}
				
				$data[]= array(
					$k+1,
					$title,
					$rows->email_subject,
					$rows->email_from,
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
	
	public function editorFileUpload(){
		$this->editor_images=realpath(APPPATH . '../assets/uploads/editor_images/');
		// Parameters
		$type = $this->input->get('type');
		$CKEditor = $this->input->get('CKEditor');
		$funcNum = $this->input->get('CKEditorFuncNum');

		// Image upload
		if($type == 'image'){
			$allowed_extension = array(
			  "png","jpg","jpeg","gif"
			);
			// Get image file extension
			$file_extension = pathinfo($_FILES["upload"]["name"], PATHINFO_EXTENSION);

			if(in_array(strtolower($file_extension),$allowed_extension)){
				$file_name = 'editor_'.date('Ymdhis').'.'.$file_extension;
				if(move_uploaded_file($_FILES['upload']['tmp_name'], "assets/uploads/editor_images/".$file_name)){
				  // File path
					$message = 'Image Upload Success';
					$url = base_url('assets/uploads/editor_images/'.$file_name);
			   
				  echo '<script>window.parent.CKEDITOR.tools.callFunction('.$funcNum.', "'.$url.'", "'.$message.'")</script>';
				}
			}
		}
		exit;
	}
	
}

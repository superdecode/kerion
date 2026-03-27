<?php

class File_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	/*
    *-------------------------------------------------------------------------------------------------
    * FILE MANAGER
    *-------------------------------------------------------------------------------------------------
    */

    //upload image
    public function upload_file_manager_image()
    {       
        $this->upload_images=realpath(APPPATH . '../assets/uploads/files_manager/');
		if($_FILES['file']['name']!="")
		{
			$config = array(
					'file_name' => 'img_'.date('Ymdhis'),
					'allowed_types' => 'png|jpg|jpeg|gif|', //jpg|jpeg|gif|
					'upload_path' => $this->upload_images,
					'max_size' => 20000
			);

			$this->upload->initialize($config);
			if ( ! $this->upload->do_upload('file')) {
					$this->session->set_flashdata('error_msg', $this->upload->display_errors());					
			}
			$image_data = $this->upload->data();
			$image=$image_data['file_name'];
		}
				
        if (!empty($image)) {
            $data = array(
                'image_path' => $image,
                'storage' => "local",
                'user_id' => $this->session->userdata('user_id')
            );
            
            $this->db->insert('uploads', $data);
            //$this->delete_temp_image($temp_path);
			
        }
    }

    //get user file manager images
    public function get_user_file_manager_images()
    {
        $this->db->where('user_id', $this->session->userdata('user_id'));
        $this->db->order_by('id', 'DESC');
        $query = $this->db->get('uploads');
        return $query->result();
    }

    //get file manager image
    public function get_file_manager_image($file_id)
    {
        $this->db->where('id', $file_id);
        $query = $this->db->get('uploads');
        return $query->row();
    }

    //delete file manager image
    public function delete_file_manager_image($file_id)
    {
        $image = $this->get_file_manager_image($file_id);
        if (!empty($image) && $image->user_id == $this->session->userdata('user_id')) {            
            delete_file_from_server("assets/uploads/files_manager/" . $image->file_name);            
            $this->db->where('id', $image->id);
            return $this->db->delete('uploads');
        }
    }
	
	//file manager image upload
    public function file_manager_image_upload($file_name)
    {
		$this->upload_images=realpath(APPPATH . '../assets/uploads/files_manager/');
        if (isset($_FILES[$file_name])) {
            if (empty($_FILES[$file_name]['name'])) {
                return null;
            }
        }
        $config['upload_path'] = $this->upload_images;
        $config['allowed_types'] = 'gif|jpg|jpeg|png';
        $config['file_name'] = 'img_temp_' . generate_unique_id();
        $this->load->library('upload', $config);
        if ($this->upload->do_upload($file_name)) {
            $data = array('upload_data' => $this->upload->data());
            if (isset($data['upload_data']['full_path'])) {
                return $data['upload_data']['full_path'];
            }
            return null;
        } else {
            return null;
        }
    }
	//delete temp image
    public function delete_temp_image($path)
    {
        if (file_exists($path)) {
            @unlink($path);
        }
    }
	
	/*
    *-------------------------------------------------------------------------------------------------
    * AIZ FILE MANAGER
    *-------------------------------------------------------------------------------------------------
    */
	
    public function get_uploaded_files($get)
    {
		if(!empty($get['search'])){
			$this->db->like('file_original_name', $get['search']);
		}
		if(!empty($get['sort'])){
			switch ($get['sort']) {
                case 'newest':
					$this->db->order_by('created_at', 'DESC');
                    break;
                case 'oldest':
					$this->db->order_by('created_at', 'ASC');
                    break;
                case 'smallest':
					$this->db->order_by('file_size', 'ASC');
                    break;
                case 'largest':
					$this->db->order_by('file_size', 'DESC');
                    break;
                default:
					$this->db->order_by('created_at', 'DESC');
                    break;
            }
		}
        $this->db->where('user_id', $this->session->userdata('user_id'));
        
        $query = $this->db->get('uploads');
        return $query->result();
    }
	public function get_file_by_ids($file_ids)
    {
		$ids = explode(',',$file_ids);
        $this->db->where_in("id", $ids);
        $query = $this->db->get('uploads');
        return $query->result();
    }
	
	public function saveUploadFile($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('uploads', $post);
		}else{
			$res = $this->db->insert('uploads', $post);
		}
		return $res;
	}
	
}
?>

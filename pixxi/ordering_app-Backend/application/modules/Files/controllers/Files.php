<?php defined('BASEPATH') or exit('No direct script access allowed');

class Files extends BackendController
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
		$this->load->model('File_model');		
    }
	
	/**
     * --------------------------------------------------------------------------
     * AIZ Files Upload
     * --------------------------------------------------------------------------
     */
	public function show_uploader(){
        //$this->load->view('aiz-uploader');
    }
	public function get_uploaded_files(){
        
		$get = $this->input->get();
		$images = $this->File_model->get_uploaded_files($get);
		$data['data'] = $images;
		echo json_encode($data);
    }
	public function get_file_by_ids(){        
		$request = $this->input->post();
		$images = $this->File_model->get_file_by_ids($request['ids']);
		echo json_encode($images);
    }
	public function upload()
    {
		$type = array(
            "jpg"=>"image",
            "jpeg"=>"image",
            "png"=>"image",
            "svg"=>"image",
            "webp"=>"image",
            "gif"=>"image",
            "mp4"=>"video",
            "mpg"=>"video",
            "mpeg"=>"video",
            "webm"=>"video",
            "ogg"=>"video",
            "avi"=>"video",
            "mov"=>"video",
            "flv"=>"video",
            "swf"=>"video",
            "mkv"=>"video",
            "wmv"=>"video",
            "wma"=>"audio",
            "aac"=>"audio",
            "wav"=>"audio",
            "mp3"=>"audio",
            "zip"=>"archive",
            "rar"=>"archive",
            "7z"=>"archive",
            "doc"=>"document",
            "txt"=>"document",
            "docx"=>"document",
            "pdf"=>"document",
            "csv"=>"document",
            "xml"=>"document",
            "ods"=>"document",
            "xlr"=>"document",
            "xls"=>"document",
            "xlsx"=>"document"
        );
        $this->upload_files=realpath(APPPATH . '../assets/uploads/files_manager/');
		if($_FILES['aiz_file']['name']!="")
		{
			$file_original_name = $_FILES['aiz_file']['name'];
			$ext = explode(".", $file_original_name)[1];
			$config = array(
					'file_name' => 'file_'.time(),
					'allowed_types' => 'png|jpg|jpeg|gif|', //jpg|jpeg|gif|
					'upload_path' => $this->upload_files,
					'max_size' => 20000
			);

			$this->upload->initialize($config);
			if ( ! $this->upload->do_upload('aiz_file')) {
					$this->session->set_flashdata('error_msg', $this->upload->display_errors());					
			}
			$file_data = $this->upload->data();
			
			$post = array(
                'file_original_name' => explode(".", $file_original_name)[0],
                'file_name' => $file_data['file_name'],
                'file_size' => $file_data['file_size'],
                'extension' => $ext,
                'type' => $type[$ext],
                'user_id' => $this->session->userdata('user_id')
            );
			$this->File_model->saveUploadFile($post);
		}
		return '{}';		
        
    }
	
	public function uploaded(){
		$data['header']['site_title'] = 'Upload File List';
		$data['datas'] = $this->File_model->get_user_file_manager_images();
		
		
		$this->render('uploaded', $data);
    }
	public function remove($id){
		$id = base64_decode($id);
		$result = $this->File_model->delete_file_manager_image($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Deleted');							
		}else{
			$this->session->set_flashdata('error_msg', 'Deletion Unsuccessful');				
		}
		redirect('Files/uploaded');
	}
        public function delete_multiple(){
               $ids = $this->input->post('ids');
		//$id = base64_decode($id);
                $oid_arr = explode (",", $ids);
                if(!empty($oid_arr)){
                    foreach($oid_arr as $k=>$img_ids)
                    {
                       $result = $this->File_model->delete_file_manager_image($img_ids);

                    } 

                }
		
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Deleted');							
		}else{
			$this->session->set_flashdata('error_msg', 'Deletion Unsuccessful');				
		}
		redirect('Files/uploaded');
	}
	
}

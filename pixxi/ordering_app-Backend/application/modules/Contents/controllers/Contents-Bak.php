<?php defined('BASEPATH') or exit('No direct script access allowed');

class Contents extends BackendController
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
		$this->load->model('Content_model');
		
		
    }

	public function save($id=''){		
		authenticate();	
		$this->content_images=realpath(APPPATH . '../assets/uploads/content_images/');		
		$result=array();
		
		if($this->input->post()){			
			$post['title'] =$this->input->post('title');
			$post['slug'] =!empty($this->input->post('slug'))?$this->input->post('slug'):url_title($this->input->post('title'), 'dash', TRUE);
			$post['description'] =$this->input->post('description');			
			$post['order_no'] =$this->input->post('order_no');			
			//$post['category_id'] =$this->input->post('category_id');			
			//$post['meta_title'] = $this->input->post('meta_title');		
			//$post['meta_key'] = $this->input->post('meta_key');	
			//$post['meta_description'] = $this->input->post('meta_description');
			
			if($_FILES['content_image']['name']!="")
			{
				$image=$this->input->post('image');
				if(!empty($image)){unlink($this->content_images.'/'.$image);}
				$value = $_FILES['content_image']['name'];
				//echo $value;
				
				$config1 = array(
						'file_name' => 'content_banner_'.date('Ymdhis'),
						'allowed_types' => 'png|jpg|jpeg|gif|ico|', //jpg|jpeg|gif|
						'upload_path' => $this->content_images,
						'max_size' => 20000
				);

				$this->upload->initialize($config1);
				if ( ! $this->upload->do_upload('content_image')) {
						 // return the error message and kill the script
						$this->session->set_flashdata('error_msg', $this->upload->display_errors());
						redirect('Contents/save/'.base64_encode($id));
				}
				$image_data = $this->upload->data();
				$image=$image_data['file_name'];
				$post['image'] = $image;
			}
			
			if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =gmdate('Y-m-d H:i:s');
			}
			$result = $this->Content_model->saveContent($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Contents/listing');
		}
		
	}
    public function listing()
    {
		authenticate();
		$data['datas'] = $this->Content_model->getContents();
		$data['header']['site_title'] = 'Content List';
		$result=array();
		$this->render('admin/listing', $data);
    }
	
    public function statusChange($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Content_model->contentStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Contents/listing');
    }
	
	public function remove($id){
		$result = $this->Content_model->contentRemove($id);
		return $return;
	}
	
	
	
		
}

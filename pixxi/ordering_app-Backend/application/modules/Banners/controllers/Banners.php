<?php defined('BASEPATH') or exit('No direct script access allowed');

class Banners extends BackendController
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
		$this->load->model('Banner_model');		
    }

	public function save($id=''){		
		if($this->input->post()){
                       date_default_timezone_set('America/Bogota');
			$this->banner_images=realpath(APPPATH . '../assets/uploads/banner_images/');
			//pr($_FILES);pr($this->input->post()); die;
			$post['section'] = !empty($this->input->post('section'))?$this->input->post('section'):'';
			$post['title'] =$this->input->post('title');
			//$post['description'] =$this->input->post('description');
                        $post['location'] =$this->input->post('location');
			
			$enable_disable_date = $this->input->post('enable_disable_date');
			$enable_disable_date = explode('to',$enable_disable_date);
			//$post['enable_date'] =$enable_disable_date[0];
			//$post['disable_date'] =!empty($enable_disable_date[1])?$enable_disable_date[1]:'';
			//$post['link'] =$this->input->post('link');
			//$post['button_text'] =$this->input->post('button_text');
			$post['order_no'] =$this->input->post('order_no');
			
			// For Image Upload Start
				$image=$this->input->post('image');
				if($_FILES['banner_image']['name']!="")
				{					
					if(!empty($image)) unlink($this->banner_images.'/'.$image);
					$value = $_FILES['banner_image']['name'];
					//echo $value;
					
					$config = array(
							'file_name' => 'banner_'.date('Ymdhis'),
							'allowed_types' => 'png|jpg|jpeg|gif|', //jpg|jpeg|gif|
							'upload_path' => $this->banner_images,
							'max_size' => 20000
					);
	
					$this->upload->initialize($config);
					if ( ! $this->upload->do_upload('banner_image')) {
							 // return the error message and kill the script
							//$this->upload->display_errors();
							$this->session->set_flashdata('error_msg', $this->upload->display_errors());
							redirect('Banners/listing');
					}
					$image_data = $this->upload->data();
					$image=$image_data['file_name'];
				}
				$post['image'] = $image;
			//*****************************************	
			
			if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =date('Y-m-d H:i:s');
                               
			}
			$result = $this->Banner_model->saveBanner($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');							
			}else{
				$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');				
			}
			redirect('Banners/listing');
		} 
	}
    public function listing()
    {
		authenticate();		
		$data['header']['site_title'] = 'Lista de Banners';			
		$data['datas'] = $this->Banner_model->getBanners();
		$this->render('admin/listing', $data);
		
    }
	
    public function statusChange($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Banner_model->bannerStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');							
		}else{
			$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');				
		}
		redirect('Banners/listing');
    }
	
	public function remove($id){
		$result = $this->Banner_model->bannerRemove($id);
		return $result;
	}
	
	
}

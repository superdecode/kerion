<?php defined('BASEPATH') or exit('No direct script access allowed');

class Faqs extends BackendController
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
		$this->load->model('Faq_model');		
    }

	public function save($id=''){		
		if($this->input->post()){
			
			//pr($_FILES);pr($this->input->post()); die;
			$post['title'] =$this->input->post('title');
                       $post['description'] =$this->input->post('description');
                       if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =gmdate('Y-m-d H:i:s');
			}
			$result = $this->Faq_model->saveFaq($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');							
			}else{
				$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');				
			}
			redirect('Faqs/listing');
		} 
	}
    public function listing()
    {
		authenticate();		
		$data['header']['site_title'] = 'Lista de Preguntas Frecuentes';			
		$data['datas'] = $this->Faq_model->getFaqs();
		$this->render('admin/listing', $data);
		
    }
	
    public function statusChange($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Faq_model->FaqsStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');							
		}else{
			$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');				
		}
		redirect('Faqs/listing');
    }
	
	public function remove($id){
		$result = $this->Faq_model->FaqsRemove($id);
		return $result;
	}
	
	
}

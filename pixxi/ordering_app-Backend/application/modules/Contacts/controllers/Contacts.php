<?php defined('BASEPATH') or exit('No direct script access allowed');

class Contacts extends BackendController
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
		$this->load->model('Contact_model');		
    }

	public function save($id=''){		
		if($this->input->post()){
			
			$post['feedback_status'] =$this->input->post('feedback_status');
			
			//*****************************************	
			
			if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =gmdate('Y-m-d H:i:s');
			}
			$result = $this->Contact_model->saveStatus($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');							
			}else{
				$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');				
			}
			redirect('Contacts/listing');
		} 
	}
    public function listing()
    {
		authenticate();		
		$data['header']['site_title'] = 'Lista de Comentarios';			
		$data['datas'] = $this->Contact_model->getContacts_applied();
                /*foreach($data['datas'] as $k=>$data){
                    
                    $data['datas'] = $this->Contact_model->getFeedbackImage($data->id);
                    //print_r($data);
                }*/
		$this->render('admin/listing', $data);
		
    }
	
    public function statusChange($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Contact_model->ContactsStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');							
		}else{
			$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');				
		}
		redirect('Contacts/listing');
    }
	
    public function remove($id){
		$result = $this->Contact_model->ContactsRemove($id);
		return $result;
	}	
}

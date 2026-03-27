<?php defined('BASEPATH') or exit('No direct script access allowed');

class Messages extends BackendController
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
		$this->load->model('Message_model');
		
		
    }

	public function save($id=''){		
		authenticate();	
		$result=array();
		
		if($this->input->post()){			
			$post['title'] =$this->input->post('title');
			$post['description'] =$this->input->post('description');			
			
			
			if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =gmdate('Y-m-d H:i:s');
			}
			$result = $this->Message_model->saveMessage($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Messages/listing');
		}
		
	}
    public function listing()
    {
		authenticate();
		$data['datas'] = $this->Message_model->getMessages();
		$data['header']['site_title'] = 'Messages List';
		$result=array();
		$this->render('admin/listing', $data);
    }
	
    public function statusChange($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Message_model->messageStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Messages/listing');
    }
	
	public function remove($id){
		$result = $this->Message_model->messageRemove($id);
		return $return;
	}
	
	
	
		
}

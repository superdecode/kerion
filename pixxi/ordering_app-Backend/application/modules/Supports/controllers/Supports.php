<?php defined('BASEPATH') or exit('No direct script access allowed');

class Supports extends BackendController
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
		$this->load->model('Support_model');		
    }

	public function save($id=''){		
		if($this->input->post()){
			$post['sender_id'] =$this->input->post('sender_id');
			$post['receiver_id'] =$this->input->post('receiver_id');		
			$post['message'] =$this->input->post('message');					
			$post['addedOn'] =date('Y-m-d H:i:s');
			$result = $this->Support_model->saveMailbox($post);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Message Sent Successful!!');							
			}else{
				$this->session->set_flashdata('error_msg', 'Message Sent Failed!!');				
			}
			redirect('Supports/listing');
		} 
	}
    public function listing()
    {
		authenticate();		
		$data['header']['site_title'] = 'Support List';
		$receiver_id = $this->session->userdata('user_id');
		$data['datas'] = $this->Support_model->getReceivedMessageList($receiver_id);
		//pr($data['datas']);die;
		$this->render('admin/listing', $data);
		
    }
	
    public function statusChange($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Support_model->statusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Supports/listing');
    }
	
	public function remove($id){
		$result = $this->Support_model->bannerRemove($id);
		return $result;
	}
	
	
}

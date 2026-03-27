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

	public function save($id = '')
	{
		authenticate();
		$result = array();

		if ($this->input->post()) {
			//$post['seller_id'] = $this->input->post('seller_id');
                        if($this->session->userdata('user_id')=='1') {
                         $post['seller_id'] = $this->input->post('seller_id');
                        }
                        else {
                          $post['seller_id'] = $this->session->userdata('seller_id');  
                        }
			$post['description'] = $this->input->post('description');
                        
			//$post2['seller_id'] = $this->input->post('seller_id');
                        
                         if($this->session->userdata('user_id')=='1') {
                         $post2['seller_id'] = $this->input->post('seller_id');
                        }
                        else {
                          $post2['seller_id'] = $this->session->userdata('seller_id');  
                        }
			$post2['description'] = $this->input->post('description');

			if (!empty($id)) {
				$post['modifiedBy'] = $this->session->userdata('user_id');
			} else {
				$post['addedBy'] = $this->session->userdata('user_id');
				$post['addedOn'] = date('Y-m-d H:i:s');
			}

			$user_list = $this->Message_model->getUsersList($role_id = "2");

			foreach ($user_list as $k => $userlist) {
				$post2['user_id'] = $userlist->id;
				$post2['addedOn'] = date('Y-m-d H:i:s');
				$result = $this->Message_model->saveNotification($post2);
			}
				//die()
			
			$result = $this->Message_model->saveMessage($post, $id);

			if (!empty($result)) {
				$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
			} else {
				$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
			}
			redirect('Messages/listing');
		}
	}
	public function listing()
	{
		authenticate();
		if($this->session->userdata('user_role_ids')!='1'){
			redirect('Messages/message_list/'.base64_encode($this->session->userdata('seller_id')));
		}
		$data['datas'] = $this->Message_model->getMessages();
		$data['seller_name'] = $this->Message_model->getSellernameList();
		$data['header']['site_title'] = 'Lista de Mensajes';
		$result = array();
		$this->render('admin/listing', $data);
	}

	public function message_list($seller_id)
	{
		authenticate();
		$seller_id = base64_decode($seller_id);
		$data['datas'] = $this->Message_model->getMessagesList($seller_id);
		$data['seller_name'] = $this->Message_model->getSellernameList();
		$data['header']['site_title'] = 'Detalles de los mensajes';
		$result = array();
		$this->render('admin/message_list', $data);
	}

	public function statusChange($id)
	{
		//authenticate();	
		$ids = base64_decode($id);
                $user_id= $this->session->userdata('seller_id');
		$result = $this->Message_model->messageStatusChange($ids);
		if (!empty($result)) {
			$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
		} else {
			$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
		}
                 if($this->session->userdata('user_id')=='1') {
                    redirect('Messages/listing');
                 }
                 else{
                     redirect('Messages/message_list/'.base64_encode($user_id));
                 }
	}

	public function remove($id)
	{
		$result = $this->Message_model->messageRemove($id);
		return $return;
	}
}

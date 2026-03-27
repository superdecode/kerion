<?php defined('BASEPATH') or exit('No direct script access allowed');

class Coupons extends BackendController
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
		$this->load->model('Coupon_model');
	}

	public function save($id = '')
	{
		if ($this->input->post()) {
			//pr($_FILES);pr($this->input->post()); die;

			$post['title'] = $this->input->post('title');
			$post['description'] = $this->input->post('description');
			$post['banner'] = $this->input->post('banner');
			$post['subtitle'] = $this->input->post('subtitle');
			$post['code'] = $this->input->post('code');
			$post['value'] = $this->input->post('value');
			$post['min_order'] = $this->input->post('min_order');
			$post['max_discount'] = $this->input->post('max_discount');
			$post['discount_type'] = $this->input->post('discount_type');
			//$post['seller_ids'] =!empty($this->input->post('seller_ids'))?implode(',',$this->input->post('seller_ids')):'';
			$post['seller_ids'] = $this->input->post('seller_ids');

			$enable_disable_date = $this->input->post('enable_disable_date');
			$enable_disable_date = explode('to', $enable_disable_date);
			$post['enable_date'] = $enable_disable_date[0];
			$post['disable_date'] = !empty($enable_disable_date[1]) ? $enable_disable_date[1] : '';

			if (!empty($id)) {
				$post['modifiedBy'] = $this->session->userdata('user_id');
			} else {
				$post['addedBy'] = $this->session->userdata('user_id');
				$post['addedOn'] = gmdate('Y-m-d H:i:s');
			}
			$result = $this->Coupon_model->saveCoupon($post, $id);
			if (!empty($result)) {
				$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
			} else {
				$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
			}
			redirect('Coupons/listing');
		}
	}
	public function listing()
	{
		authenticate();
		$data['header']['site_title'] = 'Lista de cupones';
		$data['datas'] = $this->Coupon_model->getCoupons('meals2you');
		$data['restaurantList'] = $this->Coupon_model->restaurantList();
		$this->render('admin/listing', $data);
	}

	public function statusChange($id)
	{
		//authenticate();	
		$id = base64_decode($id);
		$result = $this->Coupon_model->statusChange($id);
		if (!empty($result)) {
			$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
		} else {
			$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
		}
		redirect('Coupons/listing');
	}

	public function remove($id)
	{
		$result = $this->Coupon_model->dataRemove($id);
		return $result;
	}

	//*****************Pharmacy*********************************************** */
	public function psave($id = '')
	{
		if ($this->input->post()) {
			//pr($_FILES);pr($this->input->post()); die;
			$post['type'] = 'pharmacy2you';
			$post['title'] = $this->input->post('title');
			$post['description'] = $this->input->post('description');
			$post['banner'] = $this->input->post('banner');
			$post['subtitle'] = $this->input->post('subtitle');
			$post['code'] = $this->input->post('code');
			$post['value'] = $this->input->post('value');
			$post['min_order'] = $this->input->post('min_order');
			$post['max_discount'] = $this->input->post('max_discount');
			$post['seller_ids'] = !empty($this->input->post('seller_ids')) ? implode(',', $this->input->post('seller_ids')) : '';

			$enable_disable_date = $this->input->post('enable_disable_date');
			$enable_disable_date = explode('to', $enable_disable_date);
			$post['enable_date'] = $enable_disable_date[0];
			$post['disable_date'] = !empty($enable_disable_date[1]) ? $enable_disable_date[1] : '';

			if (!empty($id)) {
				$post['modifiedBy'] = $this->session->userdata('user_id');
			} else {
				$post['addedBy'] = $this->session->userdata('user_id');
				$post['addedOn'] = gmdate('Y-m-d H:i:s');
			}
			$result = $this->Coupon_model->saveCoupon($post, $id);
			if (!empty($result)) {
				$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
			} else {
				$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
			}
			redirect('Coupons/listingPharmacy');
		}
	}
	public function listingPharmacy()
	{
		authenticate();
		$data['header']['site_title'] = 'Lista de cupones';
		$data['datas'] = $this->Coupon_model->getCoupons('pharmacy2you');
		$data['storeList'] = $this->Coupon_model->storeList('4');
		$this->render('admin/listingPharmacy', $data);
	}

	public function pstatusChange($id)
	{
		//authenticate();	
		$id = base64_decode($id);
		$result = $this->Coupon_model->statusChange($id);
		if (!empty($result)) {
			$this->session->set_flashdata('success_msg', 'Actualizado Correctamente');
		} else {
			$this->session->set_flashdata('error_msg', 'Actualización Incorrecta');
		}
		redirect('Coupons/listingPharmacy');
	}
}

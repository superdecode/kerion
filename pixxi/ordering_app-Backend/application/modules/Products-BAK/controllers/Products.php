<?php defined('BASEPATH') or exit('No direct script access allowed');

class Products extends BackendController
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
		$this->load->model('Product_model');
		
		
    }

	public function save($id=''){		
		authenticate();	
                
		$result=array();
		$query = new stdClass();		
		if(!empty($id)){
			$data['header']['site_title'] = 'Modify Product';
			$decode_id= base64_decode($id);
                        
			$query = $this->Product_model->getProductDetails($decode_id);
                        $data['size'] = $this->Product_model->getSizevariationDetails($decode_id);
			$data['categories'] = $this->getAllcategoryDatabyseller($query->seller_id,$query->category_id);
                        
			//pr($query);die;
		}else{
                        	
                        $data['categories'] ='<option value="">Select Category</option>';
			$data['header']['site_title'] = 'Add Product';
			$decode_id='';
			$query->single_purchase = 1;
			$query->group_purchase = 1;
		}
		
		if($this->input->post()){			
			$post['title'] =$this->input->post('title');
                        $post['seller_id'] =$this->input->post('seller_id');
			$post['category_id'] =$this->input->post('category_id');
			$post['description'] =$this->input->post('description');	
			$post['photos'] =$this->input->post('photos');	
                        $post['variant_product'] =$this->input->post('variant_product');
			$post['unit_price'] =$this->input->post('unit_price');	
			$post['discount'] =$this->input->post('discount');	
			$post['sku'] =$this->input->post('sku');
			$discount = ($this->input->post('discount_type')=='amount')?$post['discount'] : round(($post['unit_price'] * $post['discount'] / 100),2 );
			$post['purchase_price'] =$post['unit_price'] - $discount ;	
			$post['slug'] =!empty($this->input->post('slug'))?$this->input->post('slug'):url_title($this->input->post('title'), 'dash', TRUE);
			$post['option_ids'] =!empty($this->input->post('product_option'))?implode(',',$this->input->post('product_option')):'';
			
			
			$enable_disable_date = $this->input->post('enable_date');
			$disable_date = date('Y-m-d', strtotime($enable_disable_date .' +2 day')) ;
			
			//pr($post);die;
			if(!empty($decode_id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =date('Y-m-d H:i:s');
			}
			$pid = $this->Product_model->saveProduct($post,$decode_id);
                        if($this->input->post('size')!='') {
                        foreach($this->input->post('size') as $k=>$size){
                           if(!empty($decode_id)){
                            //$var_id=$this->input->post('variant_id')[$k];   
                           $post2['product_id']=$this->input->post('product_id');
                           
                           } else {
                           $post2['product_id'] =$pid; }
                           $variation_id = $this->input->post('variation_id')[$k];
                           $post2['variation_name'] =$this->input->post('size')[$k];		
                           $post2['price'] =$this->input->post('price')[$k];
                           $post2['stock'] =$this->input->post('stock')[$k];
                           $post2['sku'] =$this->input->post('variantion_sku')[$k];
                           $result=$this->Product_model->saveSizeVariation($post2,$variation_id);
                        }
                        }
                        
                        
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Products/listing');
		}
		$data['parent_categories'] = $this->Product_model->getActiveCategoryList();
                $data['seller_name'] = $this->Product_model->getSellernameList();
		$data['brands'] = $this->Product_model->getActiveBrandList();
		$data['p_option'] = $this->Product_model->getAllproductOption();
		$data['query'] = $query;
		$this->render('admin/save', $data);  
	}
    public function removeEachVariation($id){
		$result = $this->Product_model->eachVariationRemove($id);
                //pr_r($result);
                die();
		return $result;
	}
	public function listing()
    {
		authenticate();
		$data['datas'] = $this->Product_model->getProducts();
               
		$data['header']['site_title'] = 'Products';
		$result=array();
		$this->render('admin/listing', $data);
    }
	
    public function statusChange($id){
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Product_model->productStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Products/listing');
    }
	
	public function remove($id){
		$result = $this->Product_model->productRemove($id);
		return $result;
	}
	
	//*********************************************************************************************//
	public function categories()
    {
		authenticate();
		$data['header']['site_title'] = 'Category List';
		
		$data['datas'] = $this->Product_model->getCategoryList();		
		$data['parent_categories'] = $this->Product_model->getCategoryList('0');
                 $data['s_name'] = $this->Product_model->sellerList();
		//pr($data);die;
		$this->render('admin/categories', $data);
    }
	
	public function saveCategory($id=''){		
		authenticate();	
		$this->content_images=realpath(APPPATH . '../assets/uploads/content_images/');		
		$result=array();
		
		if($this->input->post()){			
			$post['title'] =$this->input->post('title');
			$post['title_tr'] =$this->input->post('title_tr');
			$post['slug'] =!empty($this->input->post('slug'))?$this->input->post('slug'):url_title($this->input->post('title'), 'dash', TRUE);
			$post['order_no'] =$this->input->post('order_no');			
			//$post['parent_id'] =$this->input->post('parent_id');			
			$post['meta_title'] = $this->input->post('meta_title');
			$post['meta_description'] = $this->input->post('meta_description');
			$post['banner'] = $this->input->post('banner');
			$post['seller_id'] =!empty($this->input->post('seller_id'))?implode(',',$this->input->post('seller_id')):'';
			//$post['icon'] = $this->input->post('icon');
			if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =gmdate('Y-m-d H:i:s');
			}
			$result = $this->Product_model->saveCategory($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Products/categories');
		}
		
	}
	public function statusChangeCategory($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Product_model->statusChangeCategory($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Products/categories');
    }
	
	public function removeCategory($id){
		$result = $this->Product_model->removeCategory($id);
		return $result;
	}
	
	//*********************************************************************************************//	
	
	public function brands()
    {
		authenticate();
		$data['header']['site_title'] = 'Brand List';
		
		$data['datas'] = $this->Product_model->getBrandList();		
		$this->render('admin/brands', $data);
    }
	
	public function saveBrand($id=''){		
		authenticate();			
		$result=array();
		
		if($this->input->post()){			
			$post['title'] =$this->input->post('title');
			$post['slug'] =!empty($this->input->post('slug'))?$this->input->post('slug'):url_title($this->input->post('title'), 'dash', TRUE);
			$post['order_no'] =$this->input->post('order_no');			
			$post['meta_title'] = $this->input->post('meta_title');
			$post['meta_description'] = $this->input->post('meta_description');
			$post['banner'] = $this->input->post('banner');
			//$post['icon'] = $this->input->post('icon');
			if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =gmdate('Y-m-d H:i:s');
			}
			$result = $this->Product_model->saveBrand($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Products/brands');
		}
		
	}
	public function statusChangeBrand($id)
    {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Product_model->statusChangeBrand($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Products/brands');
    }
	
	public function removeBrand($id){
		$result = $this->Product_model->removeBrand($id);
		return $result;
	}
	
	//*********************************************************************************************//	
	
	public function getAllcategoryData($seller_id,$selected_id=''){
            //echo 'MYID'.$seller_id;
		$query = $this->Product_model->getAllCategoryData($seller_id);
                //pr($query);die;
		$selected='';
		$html='<option value="">Select category</option>';
		if(!empty($query)){
			foreach($query as $k=>$val){
				if($val->id==$selected_id){ $selected="selected";}else{$selected="";}
				$html.='<option value="'.$val->id.'" '.$selected.' >'.$val->title.'</option>';
			}
		}		
		echo $html;
	}
	
        public function getAllcategoryDatabyseller($seller_id,$selected_id=''){
            //echo 'MYID'.$seller_id;
		$query = $this->Product_model->getAllCategoryData($seller_id);
                //pr($query);die;
		$selected='';
		$html='<option value="">Select category</option>';
		if(!empty($query)){
			foreach($query as $k=>$val){
				if($val->id==$selected_id){ $selected="selected";}else{$selected="";}
				$html.='<option value="'.$val->id.'" '.$selected.' >'.$val->title.'</option>';
			}
		}		
		return $html;
	}
/********************* Attributes Part Start From Here *****************/
        
	public function attributes()
        {
		authenticate();	
                
		$data['header']['site_title'] = 'Options List';			
		$data['datas'] = $this->Product_model->getAttributesList();
                $this->render('admin/attributes', $data);
		
        }
        public function attributeSave($id=''){
               if($this->input->post()){
			
                       $post['attribute_name'] =$this->input->post('attribute_name');
		       
                        if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =gmdate('Y-m-d H:i:s');
			}
			$result = $this->Product_model->saveAttribute($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Products/attributes');
		} 
	}
        public function attributeStatusChange($id)
        {
		//authenticate();	
		$id= base64_decode($id);
		$result = $this->Product_model->attributesStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Products/attributes');
        }
	
	public function attributeRemove($id){
		$result = $this->Product_model->attributeRemove($id);
		return $result;
	}
        public function attributeConfiguration($cid)
        {
		authenticate();	
                $data['header']['site_title'] = 'Configuration List';
                $data['header']['cat_id'] = $cid;			
                $data['datas'] = $this->Product_model->getConfigurationList($cid);
                $this->render('admin/attributes_configuration', $data);
		
        }
         public function attributeConfigurationSave($id=''){
               if($this->input->post()){
			
                       $post['cat_id'] =$this->input->post('cat_id');
                       $post['configuration_name'] =$this->input->post('configuration_name');
		       $cid = base64_encode($post['cat_id']); 
                        if(!empty($id)){
				$post['modifiedBy'] =$this->session->userdata('user_id');
			}else{
				$post['addedBy'] =$this->session->userdata('user_id');
				$post['addedOn'] =gmdate('Y-m-d H:i:s');
			}
			$result = $this->Product_model->saveConfiguration($post,$id);
			if(!empty($result)){
				$this->session->set_flashdata('success_msg', 'Successfully Updated');							
			}else{
				$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
			}
			redirect('Products/attributeConfiguration/'.$cid);
		} 
	}
        public function attributeConfigurationStatusChange($id,$cid)
        {
		//authenticate();	
		$id= base64_decode($id);
                
		$result = $this->Product_model->configurationStatusChange($id);
		if(!empty($result)){
			$this->session->set_flashdata('success_msg', 'Successfully Updated');							
		}else{
			$this->session->set_flashdata('error_msg', 'Updation Unsuccessful');				
		}
		redirect('Products/attributeConfiguration/'.$cid);
        }
        public function attributeconfigurationRemove($id){
		$result = $this->Product_model->configurationRemove($id);
		return $result;
	}
	
}

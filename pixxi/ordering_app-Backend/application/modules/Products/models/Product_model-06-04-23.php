<?php

class Product_model extends CI_Model
{

	public function __construct()
	{
		parent::__construct();
	}

	public function saveProduct($post, $id = "")
	{
		if (!empty($id)) {
			$this->db->where('id', $id);
			$res = $this->db->update('products', $post);
			return $res;
		} else {
			$data['categories'] = '<option value="">Select Categories</option>';
			$res = $this->db->insert('products', $post);
			$last_id = $this->db->insert_id();
			return $last_id;
		}
	}
	/*public function saveSizeVariation($post2,$var_id=""){ 
            if(!empty($var_id)){  echo 'hghfhghfhghfhghfhg';
			$this->db->where('id', $var_id);
			$res = $this->db->update('product_variation_options', $post2);
                         echo $this->db->last_query(); 
                        return $res;
		}
                else { echo 'gggggggggggggggg';
		$res = $this->db->insert('product_variation_options', $post2);
                 die();
                return $res;
                }
               
	}*/
	public function saveSizeVariation($post, $id = "")
	{

		if (!empty($id)) {
			$this->db->where('id', $id);
			$res = $this->db->update('product_variation_options', $post);
			//return $res;
		} else {

			$res = $this->db->insert('product_variation_options', $post);
			//echo $this->db->last_query(); die();
			//die();
			//return $res;
		}

		return $res;
	}
        
        public function saveProductAattributes($post3, $id = "")
	{

		if (!empty($id)) {
			$this->db->where('product_id', $id);
			$res = $this->db->update('product_attributes', $post3);
                        //echo $this->db->last_query(); die();
			//die();
			//return $res;
		} else {

			$res = $this->db->insert('product_attributes', $post3);
			//echo $this->db->last_query(); die();
			//die();
			//return $res;
		}

		return $res;
	}
	public function eachVariationRemove($id)
	{
		$this->db->where('id', $id);
		return $this->db->delete("product_variation_options");
		//echo $this->db->last_query().'<br>';
		//die();
	}
	public function getProductDetails($id)
	{
		$this->db->select('products.*');
		$this->db->from('products');
		$this->db->where("products.deleted", "0");
		$this->db->where("products.id", $id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	}
	public function getSizevariationDetails($id)
	{
		$this->db->select('product_variation_options.*');
		$this->db->from('product_variation_options');
		$this->db->where("product_variation_options.deleted", "0");
		$this->db->where("product_variation_options.product_id", $id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->result();
		//echo $this->db->last_query();die();
		return $data;
	}
	public function getProducts($seller_id)
	{
		$data = array();
		$this->db->select('products.*,seller.seller_name as sname,product_categories.title as cname,product_categories.title as cname');
		if (!empty($seller_id)) {
			$this->db->where("products.seller_id", $seller_id);
		}
		$this->db->from('products');
		$this->db->where("products.deleted", "0");
		//if($this->session->userdata('user_role_ids')!='1'){$this->db->where("products.seller_id",$this->session->userdata('user_id'));}
		if ($this->session->userdata('user_role_ids') == '3' && $this->session->userdata('user_role_ids') != '1') {
			$this->db->where("products.seller_id", $this->session->userdata('seller_id'));
		}
		$this->db->order_by("id", "desc");
		//$this->db->join('user_profiles as seller', 'seller.user_id = products.seller_id' , 'LEFT');
		$this->db->join('seller', 'seller.id = products.seller_id', 'LEFT');
		$this->db->join('product_categories', 'product_categories.id = products.category_id', 'LEFT');
		//echo $this->db->last_query();
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		if (!empty($query)) {
			foreach ($query as $k => $data) {
				$query[$k]->image_default = '';
				if (!empty($data->photos)) {
					$photos = explode(',', $data->photos);
					$photos = generate_ids_string($photos);
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$query[$k]->image_default = !empty($datas) ? $datas[0]->file_name : '';
				}
			}
		}
		return $query;
	}
	public function getAllproductOption()
	{
		$this->db->select('attributes.*');
		$this->db->from('attributes');
		$this->db->where("attributes.deleted", "0");
                if ($this->session->userdata('user_role_ids') == '3' && $this->session->userdata('user_role_ids') != '1') {
			$this->db->where("attributes.seller_id", $this->session->userdata('seller_id'));
		}
		$this->db->order_by("id", "desc");
		$datas = $this->db->get()->result();
		return $datas;
	}
	public function productStatusChange($id)
	{
		$this->db->select('products.*');
		$this->db->from('products');
		$this->db->where("products.id", $id);
		$data = $this->db->get()->row();

		if ($data->status == '1') {
			$this->db->set("status", '0');
		} else {
			$this->db->set("status", '1');
		}
		$this->db->where("id", $id);
		return $this->db->update("products");
	}
	public function productRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("products");
	}
	//******************************************************************************************************************//
	public function getCategoryList($parent_id = "")
	{
		$this->db->select('product_categories.*,seller.seller_name as sname,p_cat.title as parent_cat,banner_upload.file_original_name,banner_upload.file_name as banner_file_name,banner_upload.extension,icon_upload.file_original_name as icon_original_name,icon_upload.file_name as icon_file_name,icon_upload.extension as icon_extension');
		$this->db->from('product_categories');
		$this->db->where("product_categories.deleted", "0");
		if (!empty($parent_id)) {
			$this->db->where("product_categories.parent_id", $parent_id);
		}
		if ($seller_id != '') {
			$this->db->where("(find_in_set('" . $sellerid . "',product_categories.seller_id) <> 0)");
		}
		$this->db->order_by("id", "desc");
		$this->db->join('product_categories as p_cat', 'p_cat.id = product_categories.parent_id', 'LEFT');
		$this->db->join('uploads as banner_upload', 'banner_upload.id = product_categories.banner', 'LEFT');
		$this->db->join('uploads as icon_upload', 'icon_upload.id = product_categories.icon', 'LEFT');
		$this->db->join('seller', 'seller.id = product_categories.seller_id', 'LEFT');
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
	}
	public function getallCategoryList($seller_id)
	{

		$this->db->select('product_categories.*,seller.seller_name as sname,p_cat.title as parent_cat,banner_upload.file_original_name,banner_upload.file_name as banner_file_name,banner_upload.extension,icon_upload.file_original_name as icon_original_name,icon_upload.file_name as icon_file_name,icon_upload.extension as icon_extension');
		$this->db->from('product_categories');
		$this->db->where("product_categories.deleted", "0");
		if (!empty($parent_id)) {
			$this->db->where("product_categories.parent_id", $parent_id);
		}
		if ($seller_id != '') {
			$this->db->where("(find_in_set('" . $seller_id . "',product_categories.seller_id) <> 0)");
		}
                if ($this->session->userdata('user_role_ids') == '3' && $this->session->userdata('user_role_ids') != '1') {
			//$this->db->where("product_categories.seller_id", $this->session->userdata('seller_id'));
                        $this->db->where("(find_in_set('" . $this->session->userdata('seller_id') . "',product_categories.seller_id) <> 0)");
		}
		$this->db->order_by("id", "desc");
		$this->db->join('product_categories as p_cat', 'p_cat.id = product_categories.parent_id', 'LEFT');
		$this->db->join('uploads as banner_upload', 'banner_upload.id = product_categories.banner', 'LEFT');
		$this->db->join('uploads as icon_upload', 'icon_upload.id = product_categories.icon', 'LEFT');
		$this->db->join('seller', 'seller.id = product_categories.seller_id', 'LEFT');
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
	}
	public function getActiveCategoryList()
	{
		//$this->db->select('product_categories.*,p_cat.title as parent_cat,banner_upload.file_original_name,banner_upload.file_name as banner_file_name,banner_upload.extension,icon_upload.file_original_name as icon_original_name,icon_upload.file_name as icon_file_name,icon_upload.extension as icon_extension');
		$this->db->select('product_categories.*');
		//$this->db->select('product_categories.*,p_cat.title as parent_cat');
		$this->db->from('product_categories');
		$this->db->where("product_categories.deleted", "0");
		$this->db->where("product_categories.status", "1");
		//$this->db->where("product_categories.parent_id",$parent_id);
		$this->db->order_by("id", "desc");
		//$this->db->join('product_categories as p_cat', 'p_cat.id = product_categories.parent_id' , 'LEFT');
		//$this->db->join('uploads as banner_upload', 'banner_upload.id = product_categories.banner' , 'LEFT');
		//$this->db->join('uploads as icon_upload', 'icon_upload.id = product_categories.icon' , 'LEFT');
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();

		return $datas;
	}
	public function saveCategory($post, $id = "")
	{
		if (!empty($id)) {
			$this->db->where('id', $id);
			$res = $this->db->update('product_categories', $post);
		} else {
			$res = $this->db->insert('product_categories', $post);
		}
		return $res;
	}

	public function getCategoryDetails($id)
	{
		$this->db->select('product_categories.*,p_cat.title as parent_cat');
		$this->db->from('product_categories');
		$this->db->join('product_categories as p_cat', 'p_cat.id = product_categories.parent_id', 'LEFT');
		$this->db->where("product_categories.id", $id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	}
	public function statusChangeCategory($id)
	{
		$this->db->select('product_categories.*');
		$this->db->from('product_categories');
		$this->db->where("product_categories.id", $id);
		$data = $this->db->get()->row();

		if ($data->status == '1') {
			$this->db->set("status", '0');
		} else {
			$this->db->set("status", '1');
		}
		$this->db->where("id", $id);
		return $this->db->update("product_categories");
	}
	public function removeCategory($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("product_categories");
	}

	//******************************************************************************************************************//

	public function getSellernameList()
	{
		$data = array();
		$this->db->select('seller.*');
		$this->db->from('seller');
		//if($this->session->userdata('user_role_ids')=='1' ||  $this->session->userdata('user_role_ids')=='3'){$this->db->where("seller.email",$this->session->userdata('user_login_id'));}
		if ($this->session->userdata('user_role_ids') == '3' && $this->session->userdata('user_role_ids') != '1') {
			$this->db->where("seller.id", $this->session->userdata('seller_id'));
		}
		$this->db->where("seller.deleted", "0");
		$this->db->where("status", "1");
		$this->db->order_by("id", "asc");
		return $datas = $this->db->get()->result();
	}
	//******************************************************************************************************************//


	public function sellerList()
	{
		$data = array();
		$this->db->select('seller.*');
		$this->db->from('seller');
		$this->db->where("seller.deleted", "0");
                $this->db->where("status", "1");
		$this->db->order_by("id", "asc");
		return $datas = $this->db->get()->result();
		//echo $this->db->last_query(); die();

	}
	public function getAllCategoryData($seller_id)
	{
		$data = array();
		$this->db->select('product_categories.*');
		$this->db->from('product_categories');
		$this->db->where("product_categories.deleted", "0");
		$this->db->where("product_categories.status", "1");
		//$this->db->where("product_categories.seller_id",$seller_id);
		$this->db->where("(find_in_set('" . $seller_id . "',product_categories.seller_id) <> 0)");
		$this->db->order_by("id", "desc");
		$datas = $this->db->get()->result();
		//echo $this->db->last_query(); die();
		return $datas;
	}

	public function getAllCrossProduct($seller_id)
	{
		$data = array();
		$this->db->select('products.*');
		$this->db->from('products');
		$this->db->where("products.deleted", "0");
		$this->db->where("products.status", "1");
		$this->db->where("products.seller_id", $seller_id);
		//$this->db->where("(find_in_set('".$seller_id."',product_categories.seller_id) <> 0)");
		$this->db->order_by("id", "asc");
		$datas = $this->db->get()->result();
		//echo $this->db->last_query(); die();
		return $datas;
	}

	/********************* Attributes Part Start From Here *****************/

	public function getAttributesList()
	{
		$this->db->select('attributes.*,seller.seller_name as sname,');
		$this->db->from('attributes');
		$this->db->where("attributes.deleted", "0");
                if ($this->session->userdata('user_role_ids') == '3' && $this->session->userdata('user_role_ids') != '1') {
			$this->db->where("attributes.seller_id", $this->session->userdata('seller_id'));
		}
                $this->db->join('seller', 'seller.id = attributes.seller_id', 'LEFT');
		$this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
	}
	public function saveAttribute($post, $id = "")
	{
		if (!empty($id)) {
			$this->db->where('id', $id);
			$res = $this->db->update('attributes', $post);
		} else {
			$res = $this->db->insert('attributes', $post);
		}
                
		return $res;
	}
	public function getAttributesDetails($id)
	{
		$this->db->select('attributes.*');
		$this->db->from('attributes');
		$this->db->where("attributes.deleted", "0");
		$this->db->where("attributes.id", $id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	}
	public function attributesStatusChange($id)
	{
		$this->db->select('attributes.*');
		$this->db->from('attributes');
		$this->db->where("attributes.id", $id);
		$data = $this->db->get()->row();

		if ($data->status == '1') {
			$this->db->set("status", '0');
		} else {
			$this->db->set("status", '1');
		}
		$this->db->where("id", $id);
		return $this->db->update("attributes");
	}
	public function attributeRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("attributes");
	}
	public function getConfigurationList($cid)
	{ 
		$cid = base64_decode($cid);
		$this->db->select('attributes_configurations.*');
		$this->db->from('attributes_configurations');
		$this->db->where("attributes_configurations.deleted", "0");
		$this->db->where("cat_id", $cid);
		$this->db->order_by("id", "desc");
		$datas = $this->db->get()->result();
		//echo $this->db->last_query(); die();
		return $datas;
	}
	public function saveConfiguration($post, $id = "")
	{
		if (!empty($id)) {
			$this->db->where('id', $id);
			$res = $this->db->update('attributes_configurations', $post);
		} else {
			$res = $this->db->insert('attributes_configurations', $post);
		}
		return $res;
	}
	public function getConfigurationDetails($id)
	{ 
		$this->db->select('attributes_configurations.*');
		$this->db->from('attributes_configurations');
		$this->db->where("attributes_configurations.deleted", "0");
		$this->db->where("attributes_configurations.id", $id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	}
	public function configurationStatusChange($id)
	{
		$this->db->select('attributes_configurations.*');
		$this->db->from('attributes_configurations');
		$this->db->where("attributes_configurations.id", $id);
		$data = $this->db->get()->row();

		if ($data->status == '1') {
			$this->db->set("status", '0');
		} else {
			$this->db->set("status", '1');
		}
		$this->db->where("id", $id);
		return $this->db->update("attributes_configurations");
	}
	public function configurationRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("attributes_configurations");
	}
        
        public function getInsertedAttributeProductWise($id)
	{
		$this->db->select('product_attributes.*');
		$this->db->from('product_attributes');
		$this->db->where("product_attributes.product_id", $id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	}
        
         public function getFeaturedImage($photos)
	{
		$this->db->select('uploads.file_name');
                $this->db->from('uploads');
                $this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
                $data = $this->db->get()->row();
                //echo $this->db->last_query(); die();
                return $data;
	}
}

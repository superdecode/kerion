<?php

class Import_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }

	public function saveProduct($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('products', $post);
		}else{
                       
			$this->db->select('products.*');
			$this->db->from('products');
			$this->db->where("products.deleted","0");
                        $this->db->where("products.status","1");
			$this->db->where("products.title",$post['title']);
			//$this->db->where("medicines.strength",$post['strength']);
			$this->db->order_by("id", "desc");
			$data = $this->db->get()->row();
			if(empty($data)){
				$res = $this->db->insert('products', $post);
				$id = $this->db->insert_id();
			}else{
				$id="0";
			}			
		}
		return $id;
	}
	
        public function getTotalCountProduct()
	{ 
        
		$this->db->select('products.*');
		$this->db->from('products');
		$this->db->where("products.deleted","0");
                $this->db->where("products.status","1");
		$this->db->order_by("id", "desc");
		$datas = $this->db->get();
                $count= $datas->num_rows();
		//echo $this->db->last_query();
                //die();
		return $count; 
                
               
	}
public function getSellernameList()
	{
		$data= array();
		$this->db->select('seller.*');
		$this->db->from('seller');
                $this->db->where("seller.deleted","0");
                $this->db->where("status","1");
		$this->db->order_by("id", "asc");
                return $datas = $this->db->get()->result();
				
	}
        public function getAllCategoryData($seller_id)
	{
		$data= array();
		$this->db->select('product_categories.*');
		$this->db->from('product_categories');
		$this->db->where("product_categories.deleted","0");
		$this->db->where("product_categories.status","1");
		//$this->db->where("product_categories.seller_id",$seller_id);
                $this->db->where("(find_in_set('".$seller_id."',product_categories.seller_id) <> 0)");
		$this->db->order_by("id", "asc");
		$datas = $this->db->get()->result();
                //echo $this->db->last_query(); die();
                return $datas;
                
	}
        public function getAllproductData($seller_id)
	{
		$data= array();
		$this->db->select('products.*');
		$this->db->from('products');
		$this->db->where("products.deleted","0");
		$this->db->where("products.status","1");
		//$this->db->where("product_categories.seller_id",$seller_id);
                $this->db->where("(find_in_set('".$seller_id."',products.seller_id) <> 0)");
		$this->db->order_by("id", "asc");
		$datas = $this->db->get()->result();
                //echo $this->db->last_query(); die();
                return $datas;
                
	}
        public function getProductDetails($product_name,$seller_id){
		$this->db->select('products.*');
		$this->db->from('products');
		$this->db->where("products.deleted","0");
                $this->db->where("products.status","1");
		$this->db->where("products.title",$product_name);
                $this->db->where("products.seller_id",$seller_id);
		$data = $this->db->get()->row();
		return $data;
	}
        public function getOptionsDetails($option_name){
		$this->db->select('attributes.id');
		$this->db->from('attributes');
		$this->db->where("attributes.deleted","0");
                $this->db->where("attributes.status","1");
		$this->db->where("attributes.attribute_name",$option_name);
                $data = $this->db->get()->row();
		return $data;
	}
        
         public function saveOptions($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('product_variation_options', $post);
		}else{
			$res = $this->db->insert('product_variation_options', $post);
		}
		return $res;
	}
}
?>

<?php

class Api_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	public function getSettings()
	{
		$this->db->select('settings.name,settings.value');
		$this->db->from('settings');
		$this->db->order_by("id", "desc");
		$settings = $this->db->get()->result();
		$return = [];
        foreach($settings as $results)
        {
			if($results->name=='country_id'){
				$return['country']  = get_country_name($results->value);
			}
			if($results->name=='state_id'){
				$return['state']  = get_state_name($results->value);
			}
			if($results->name=='city_id'){
				$return['city']  = get_city_name($results->value);
			}
            $return[$results->name]  = $results->value;
        }
        return $return;		
	}
		
	public function countryList(){
		//$ids = array('45', '102');
		$this->db->select('location_countries.* ');
		$this->db->from('location_countries');
		$this->db->where("location_countries.status", '1');
		//$this->db->where_in("location_countries.id", $ids);
		$this->db->order_by("location_countries.name", "asc");
		$query = $this->db->get()->result();
		return $query;
	}	
	public function stateList($id){
		$this->db->select('location_states.* ');
		$this->db->from('location_states');
		$this->db->where("location_states.country_id", $id);
		$this->db->order_by("location_states.name", "asc");
		$query = $this->db->get()->result();
		return $query;
	}	
	public function cityList($id){
		$this->db->select('location_cities.* ');
		$this->db->from('location_cities');
		$this->db->where("location_cities.country_id", $id);
                $this->db->limit(63);
		//$this->db->order_by("location_cities.name", "asc");
                $this->db->order_by("id", "asc");
		$query = $this->db->get()->result();
		return $query;
	}
	
	//***************************************User Section**********************************************************//
	public function checkUser($post)
	{
		$this->db->select('* ');
		$this->db->from('users');
		$this->db->where("login_id",$post['login_id']);
		if(empty($post['login_type'])){ $this->db->where("password",$post['password']); }
		$this->db->where("deleted","0");
		//$this->db->where("status","1");
		$query = $this->db->get()->row();
		
		return $query;
	}
	public function clear_login_attempts($identity, $old_attempts_expire_period = 86400, $ip_address = NULL)
	{	
		// Make sure $old_attempts_expire_period is at least equals to lockout_time
		$old_attempts_expire_period = max($old_attempts_expire_period, get_settings_value('lockout_time'));
		
		$this->db->where('login', $identity);		
		if (!isset($ip_address))
		{
			$ip_address = $this->input->ip_address();
		}
		$this->db->where('ip_address', $ip_address);
		
		// Purge obsolete login attempts
		$this->db->or_where('time <', time() - $old_attempts_expire_period, FALSE);
		return $this->db->delete('login_attempts');
	}
	public function increase_login_attempts($identity)
	{	
		$data = ['ip_address' => '', 'login' => $identity, 'time' => time()];		
		$data['ip_address'] = $this->input->ip_address();		
		return $this->db->insert('login_attempts', $data);
		
	}
	public function is_max_login_attempts_exceeded($identity, $ip_address = NULL)
	{
		
		$max_attempts = get_settings_value('maximum_login_attempts');
		if ($max_attempts > 0)
		{
			$attempts = $this->get_attempts_num($identity, $ip_address);
			return $attempts >= $max_attempts;
		}
		
	}
	public function get_attempts_num($identity, $ip_address = NULL)
	{
		$lockout_time = time() - get_settings_value('lockout_time'); 
		
		$this->db->select('1', FALSE);
		$this->db->where('login', $identity);
		
		if (!isset($ip_address))
		{
			$ip_address = $this->input->ip_address();
		}
		$this->db->where('ip_address', $ip_address);
		
		$this->db->where('time >', $lockout_time , FALSE);
		$qres = $this->db->get('login_attempts');
		return $qres->num_rows();		
	}
	public function get_last_attempt_time($identity, $ip_address = NULL)
	{	
		$this->db->select('time');
		$this->db->where('login', $identity);
		
		if (!isset($ip_address))
		{
			$ip_address = $this->input->ip_address();
		}
		$this->db->where('ip_address', $ip_address);
		
		$this->db->order_by('id', 'desc');
		$qres = $this->db->get('login_attempts', 1);

		if ($qres->num_rows() > 0)
		{
			return $qres->row()->time;
		}
	}
	public function getUserData($user_id,$follower_id='')
	{
		$this->db->select('users.login_id as user_login_id,users.role_ids as role_id,users.is_verified,,users.status,user_profiles.*');
		$this->db->from('users');
		$this->db->where("users.id",$user_id);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id' , 'LEFT');
		$this->db->where("user_profiles.is_main",'1');
		$query = $this->db->get()->row();
		
		$this->db->select('user_settings.*');
		$this->db->from('user_settings');
		$this->db->where("user_settings.user_id",$user_id);
		$query5 = $this->db->get()->row();
		
		//$query->settings = $query5;
		//$query->is_follow = $this->is_favourite_seller($follower_id,$user_id);
		//$query->total_followers = count($this->favourite_of_seller($user_id));		
		//$query->follow_seller_list = $this->favourite_seller_list($user_id);
		//pr($this->db->last_query()); die();
		return $query;
	}
	public function getUserDataByLoginId($login_id)
	{
		$this->db->select('users.login_id as user_login_id,users.role_ids as role_id,users.is_verified,,users.status,user_profiles.*,location_countries.name as country,location_states.name as state,location_cities.name as city');
		$this->db->from('users');
		$this->db->where("users.login_id",$login_id);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id' , 'LEFT');
		$this->db->where("user_profiles.is_main",'1');
		//$this->db->join('location_countries', 'location_countries.id = user_profiles.country_id' , 'LEFT');
		//$this->db->join('location_states', 'location_states.id = user_profiles.state_id' , 'LEFT');
		//$this->db->join('location_cities', 'location_cities.id = user_profiles.city_id' , 'LEFT');
		
		$query = $this->db->get()->row();
		
		$this->db->select('user_settings.*');
		$this->db->from('user_settings');
		$this->db->where("user_settings.user_id",$query->user_id);
		$query5 = $this->db->get()->row();
		
		$query->settings = $query5;
		
		return $query;
	}
	public function updateUser($user_id,$post){
		
		$this->db->where('id', $user_id);
		$res = $this->db->update('users', $post);
		return $res;
	}
	public function updateUserDetails($post,$user_id){	
		
		$this->db->where('user_id', $user_id);
		$res = $this->db->update('user_profiles', $post);
		//pr($this->db->last_query());
		return $res;
	}
	public function checkCurrentPassword($current_password,$user_id){		
		$this->db->select('users.*');
		$this->db->from('users');
		$this->db->where("users.id",$user_id);
		$this->db->where("users.password",md5($current_password));
		$res = $this->db->get()->row();
		return $res;
	}
    public function changePassword($password,$user_id)
	{
		$newPassword = md5($password);
		$id = $user_id;
		$this->db->set("password", $newPassword);
		$this->db->set("is_first_login", '1');
		$this->db->where("id", $id);
		return $this->db->update("users"); 
	} 
	public function checkUsername($login_id)
	{
		$this->db->select('* ');
		$this->db->from('users');
		$this->db->where("login_id",$login_id);
		$this->db->where("deleted","0");
		//$this->db->where("status","1");
		$query = $this->db->get()->row();
		return $query;
	}
	public function checkEmail($email)
	{
		$this->db->select('* ');
		$this->db->from('user_profiles');
		$this->db->where("email",$email);
		//$this->db->where("status","1");
		$query = $this->db->get()->row();
		return $query;
	}
	public function saveUser($post,$post1){
		
		$res = $this->db->insert('users', $post);
		$user_id = $this->db->insert_id();
		
		$post1['user_id']=$user_id;		
		$post4['user_id']=$user_id;
		
		$this->db->insert('user_profiles', $post1);
		$this->db->insert('user_settings', $post4);
		
		return $user_id;
	}
	public function checkOTP($otp,$user_id){		
		$this->db->select('users.*');
		$this->db->from('users');
		$this->db->where("users.id",$user_id);
		$this->db->where("users.otp",$otp);
		$res = $this->db->get()->row();
		//echo $this->db->last_query();
		return $res;
	}
	
	
	//************************************PRODUCT SECTION***************************************************//
	
	public function productCategoryList($parent_id="0")
	{
		$this->db->select('product_categories.*,p_cat.title as parent_cat,banner_upload.file_original_name,banner_upload.file_name as banner_file_name,banner_upload.extension');
		$this->db->from('product_categories');
		$this->db->where("product_categories.deleted","0");
		$this->db->where("product_categories.status","1");
		$this->db->where("product_categories.parent_id",$parent_id);
		$this->db->order_by("id", "desc");
		$this->db->join('product_categories as p_cat', 'p_cat.id = product_categories.parent_id' , 'LEFT');
		$this->db->join('uploads as banner_upload', 'banner_upload.id = product_categories.banner' , 'LEFT');
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
				
	}
	//get category tree ids array (All subcategories will be returned)
    public function get_category_tree_ids_array($parent_id)
    {
        $ids = array();
        array_push($ids, clean_number($parent_id));       
		$this->db->select('product_categories.*');
		$this->db->from('product_categories');
		$this->db->where("product_categories.deleted","0");
		$this->db->where("product_categories.status","1");
		$this->db->where("product_categories.parent_id",$parent_id);
		$this->db->order_by("id", "desc");
		$rows = $this->db->get()->result();
		
        if (!empty($rows)) {
            foreach ($rows as $row) {
                $ids = array_merge($ids, $this->get_category_tree_ids_array($row->id));
            }
        }
        return ($ids);
    }

	public function favouriteSeller($post){		
		$this->db->select('* ');
		$this->db->from('seller_favourites');
		$this->db->where("user_id",$post['user_id']);
		$this->db->where("seller_id",$post['seller_id']);
		$query = $this->db->get()->row();		
        if (!empty($query)) {
			$res = $this->db->delete('seller_favourites', array('id' => $query->id));
			$msg = "Successfully Un-Followed";
			
        } else {
            $res = $this->db->insert('seller_favourites', $post);
			$msg = "Successfully Followed";
			$msg_tr = "Başarıyla Takip Edildi";
        }
		//echo $this->db->last_query();
		$msgArr[]=$msg;
		$msgArr[]=$msg_tr;
        return $msgArr;
	}
	public function favourite_seller_list($user_id){
		$this->db->select('seller_favourites.*,user_profiles.fname,user_profiles.lname,user_profiles.profile_image,COALESCE(user_profiles.company, "") as company,COALESCE(user_profiles.company_logo, "") as company_logo');
		$this->db->from('seller_favourites');
		$this->db->where("seller_favourites.user_id",$user_id);
		$this->db->join('user_profiles', 'seller_favourites.seller_id = user_profiles.user_id' , 'LEFT');
		$this->db->order_by("seller_favourites.id", "desc");
		$return = $this->db->get()->result();
		if(!empty($return)){
			foreach($return as $k=>$data){
				//$return[$k]->follower_list = ($this->favourite_of_seller($user_id));
				$return[$k]->full_name = $data->fname.' '.$data->lname;
				$return[$k]->follower_count = count($this->favourite_of_seller($user_id));
			}
		}
		
		return $return;
	}
	public function favourite_of_seller($seller_id){
		$this->db->select('seller_favourites.*,user_profiles.full_name,user_profiles.profile_image');
		$this->db->from('seller_favourites');
		$this->db->where("seller_id",$seller_id);
		$this->db->join('user_profiles', 'seller_favourites.user_id = user_profiles.user_id' , 'LEFT');
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->result();
		return $data;
	}
	public function is_favourite_seller($user_id,$seller_id){
		$this->db->select('*');
		$this->db->from('seller_favourites');
		$this->db->where("seller_id",$seller_id);
		$this->db->where("user_id",$user_id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return !empty($data)?'1':'0';
	}
	public function is_favourite($post){		
		$this->db->select('* ');
		$this->db->from('product_wishlists');
		$this->db->where("user_id",$post['user_id']);
		$this->db->where("product_id",$post['product_id']);
		$query = $this->db->get()->row();		
        //echo $this->db->last_query();
        return !empty($query)?'1':'0';
	}
	//get product by id
    public function get_product_by_id($id,$user_id='')
    {           
		$this->db->select('products.*,seller.seller_name as seller_name');
		$this->db->from('products');
		$this->db->where("products.deleted","0");
		$this->db->where("products.status","1");
		$this->db->where("products.id",$id);
                $this->db->join('seller', 'seller.id = products.seller_id' , 'LEFT');
                $return = $this->db->get()->row();
                $variant_product =$return->variant_product ;
                //echo $this->db->last_query();
                if(!empty($return)){
                    if($variant_product==1) {
                    $return->variations_list = $this->get_attributes_variations($return->id);
                    }
                    
                    $return->image_default='';
                    /*if(!empty($return->option_ids)){
                            $options = explode(',',$return->option_ids);
                            $options = generate_ids_string($options);					
                            $this->db->select('attributes_configurations.configuration_name');
                            $this->db->from('attributes_configurations');
                            $this->db->where("attributes_configurations.cat_id IN (" . $options . ")", NULL, FALSE);				$datas = $this->db->get()->result();
                            //echo $this->db->last_query(); 
                            //$return[$k]->option_list= !empty($datas)?$datas[0]->configuration_name:'';
                            //$return[$k]->image_list= !empty($datas)?$datas:[];
                            
                            $return->option_name= !empty($datas)?$datas[0]->configuration_name:'';
                            $return->option_dropdown= !empty($datas)?$datas:[];
                    }*/
                    if(!empty($return->photos)){
				$photos = explode(',',$return->photos);
				$photos = generate_ids_string($photos);					
				$this->db->select('uploads.file_name');
				$this->db->from('uploads');
				$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
				$datas = $this->db->get()->result();
				//echo $this->db->last_query();
				$return->image_default= !empty($datas)?$datas[0]->file_name:'';
				$return->image_list= !empty($datas)?$datas:[];
				
			}
                }
		return $return;		
    }
    
    public function get_attributes_variations($pid)
    {
        $this->db->select('id,variation_name,price,stock,sku');
        $this->db->from('product_variation_options');
        $this->db->where("product_variation_options.product_id",$pid);
         $return = $this->db->get()->result();
         //echo $this->db->last_query();
        return $return;
    }
    
    
	//get related products
    public function get_related_products($product_id, $category_id, $cross_sell, $user_id, $seller_id)
    {
       //echo $product_id;
       //die();
            //$crossid = $this->get_product_by_id($product_id);
            //$pid = explode(',',$crossid->cross_sell);
            
            //foreach($pid as $k=>$pdata){
		$this->db->select('products.*');
		$this->db->from('products');
		//$this->db->join('user_profiles', 'products.seller_id = user_profiles.user_id' , 'LEFT');
		$this->db->join('product_categories', 'product_categories.id = products.category_id' , 'LEFT');
		//$this->db->where(' (products.category_id='.$category_id.' AND products.seller_id = '.$seller_id .' )');
                $this->db->where("products.id",$cross_sell);
		$this->db->where('products.id !=', clean_number($product_id));
		$this->db->where('products.status', '1');
		$this->db->where('products.deleted', '0');
		$this->db->limit(10);		
		$this->db->order_by("products.id", "desc");
		$return = $this->db->get()->result();
		//echo $this->db->last_query(); //die();
		if(!empty($return)){
			foreach($return as $k=>$data){
				$return[$k]->image_default='';
				if(!empty($data->photos)){
					$photos = explode(',',$data->photos);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$return[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
					$return[$k]->image_list= !empty($datas)?$datas:[];
				}
				$post['user_id'] = $user_id;
				$post['product_id'] = $data->id;
				$return[$k]->is_favourite= $this->is_favourite($post);
				$return[$k]->order_count= $this->product_order_count($data->id);
			}
		}
            //}
		
		return $return;
    }
	//get store products
    public function get_store_products($seller_id,$product_id='',$user_id)
    {
       
		$this->db->select('products.id,products.title,products.description,products.slug,products.sku,products.category_id,product_categories.title as category,product_categories.tax_rate,products.unit_price,products.purchase_price,products.discount,products.discount_type,products.current_stock,products.low_stock_quantity,products.seller_id,products.photos,products.est_shipping_days,products.single_purchase,products.group_purchase,products.group_purchase_limit,COALESCE(products.group_purchase_price, "") as group_purchase_price,COALESCE(products.group_purchase_enable_date, "") as group_purchase_enable_date,COALESCE(products.group_purchase_disable_date, "") as group_purchase_disable_date,products.rating,products.rating_users,products.num_of_sale,user_profiles.fname,user_profiles.lname,COALESCE(user_profiles.company, "") as company,COALESCE(user_profiles.company_logo, "") as company_logo,COALESCE(products.title_tr, "") as title_tr,COALESCE(products.description_tr, "") as description_tr,COALESCE(products.unit, "") as unit,COALESCE(products.unit_value, "") as unit_value,products.group_limit');
		$this->db->from('products');
		$this->db->join('user_profiles', 'products.seller_id = user_profiles.user_id' , 'LEFT');
		$this->db->join('product_categories', 'product_categories.id = products.category_id' , 'LEFT');
		if(!empty($product_id)){$this->db->where('products.id !=', clean_number($product_id));}
		$this->db->where('products.seller_id', clean_number($seller_id));
		$this->db->where('products.status', '1');
		$this->db->where('products.deleted', '0');
		//$this->db->limit(10);		
		$this->db->order_by("products.id", "desc");
		$return = $this->db->get()->result();
		//echo $this->db->last_query();
		if(!empty($return)){
			foreach($return as $k=>$data){
				$return[$k]->image_default='';
				if(!empty($data->photos)){
					$photos = explode(',',$data->photos);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$return[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
					$return[$k]->image_list= !empty($datas)?$datas:[];
				}
				$post['user_id'] = $user_id;
				$post['product_id'] = $data->id;
				$return[$k]->is_favourite= $this->is_favourite($post);
				$return[$k]->order_count= $this->product_order_count($data->id);
			}
		}
		return $return;
    }
	//get home products
   
	
	public function addRemoveWishlist($post){		
		$this->db->select('* ');
		$this->db->from('product_wishlists');
		$this->db->where("user_id",$post['user_id']);
                $this->db->where("seller_id",$post['seller_id']);
		$this->db->where("product_id",$post['product_id']);
		$query = $this->db->get()->row();		
        if (!empty($query)) {
			$res = $this->db->delete('product_wishlists', array('id' => $query->id));
			$msg = "Quitado exitosamente de Mi lista";
			
        } else {
            $res = $this->db->insert('product_wishlists', $post);
			$msg = "Agregado exitosamente a Mi lista";
			
        }
		//echo $this->db->last_query();
		$msgArr[]=$msg;
        return $msgArr;
	}
        
        public function CheckWishlist($user_id,$product_id){
		$this->db->select('*');
		$this->db->from('product_wishlists');
		$this->db->where("user_id",$user_id);
		$this->db->where("product_id",$product_id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
                //echo $this->db->last_query();
		return !empty($data)?'1':'0';
	}
	
	
	public function addReview($post){
                $seller = $this->db->insert('seller_reviews', $post);
		$res = $this->db->insert('product_reviews', $post);
                $rating= $this->getSellerRating($post['seller_id']);
                
                $ratings=   $rating->rating ;
                $rating_users = $rating->rating_users;
                
                 $count_rating= $ratings + $post['rating'];
                 $count_users= $rating_users + 1;
                $avearge = $count_rating / $count_users;
                $rateav= round($avearge,2);
		//pr($this->db->last_query());die();
		$insert_id = $this->db->insert_id();
                
                
		
		$this->db->set('rating', "rating + ".$post['rating'], FALSE);
		$this->db->set('rating_users', "rating_users + 1", FALSE);
		$this->db->where('id', $post['product_id']);
		$this->db->update('products');
                
                $this->db->set('rating', "rating + ".$post['rating'], FALSE);
		$this->db->set('rating_users', "rating_users + 1", FALSE);
                $this->db->set('average_rating', $rateav, FALSE);
		$this->db->where('id', $post['seller_id']);
		$this->db->update('seller');
		//pr($this->db->last_query());
		return $insert_id;
	}
	
	public function reviewImageSave($post){		
		$res = $this->db->insert('product_review_images', $post);
		$insert_id = $this->db->insert_id();
		return $res;
	}
	
	//get reviews
    public function get_reviews($product_id,$offset='',$per_page='')
    {		
		$this->db->select('product_reviews.*,DATE_FORMAT(product_reviews.addedOn, "%d-%m-%Y") as addedOn,user_profiles.fname,user_profiles.lname,user_profiles.full_name,user_profiles.profile_image');
		$this->db->where('product_reviews.product_id', $product_id);
		$this->db->where('product_reviews.status', 1);
		$this->db->where('product_reviews.deleted', 0);
		$this->db->order_by('product_reviews.addedOn', 'DESC');
		$this->db->join('user_profiles', 'product_reviews.user_id = user_profiles.user_id' , 'LEFT');
		$this->db->from('product_reviews');
		if(empty($offset)){
			$query = $this->db->get();
		}else{
			$this->db->limit($per_page, $offset);
			$sql = $this->db->get_compiled_select();
			$query = $this->db->query($sql, array(clean_number($offset), clean_number($per_page)));			
		}
		$return=$query->result();
		//echo $this->db->last_query();
		if(!empty($return)){
			foreach($return as $k=>$data){
				$return[$k]->review_images=[];			
				$this->db->select('product_review_images.*');
				$this->db->from('product_review_images');
				$this->db->where('product_review_images.product_review_id', $data->id);				
				$datas = $this->db->get()->result();
				//echo $this->db->last_query();
				$return[$k]->review_images= !empty($datas)?$datas:[];
				
			}
		}
		
        return $return;
    }
	//get reviews
    public function is_review_given($product_id,$user_id,$order_id)
    {		
		$this->db->select('product_reviews.*');
		$this->db->where('product_reviews.product_id', $product_id);
		$this->db->where('product_reviews.user_id', $user_id);
                $this->db->where('product_reviews.order_id', $order_id);
		$this->db->where('product_reviews.status', 1);
		$this->db->where('product_reviews.deleted', 0);
		$this->db->order_by('product_reviews.addedOn', 'DESC');
		$this->db->join('user_profiles', 'product_reviews.user_id = user_profiles.user_id' , 'LEFT');
		$this->db->from('product_reviews');
		$return=$this->db->get()->row();
		//echo $this->db->last_query();
        return !empty($return)?'1':'0';
    }
	
/******************************** get wishlist products developer**********************************/
  public function wishlist_Seller_products($user_id)
    {		
		$this->db->select('product_wishlists.seller_id,seller.seller_name');
                $this->db->from('product_wishlists');
		$this->db->where('product_wishlists.user_id', $user_id);
                $this->db->join('seller', 'seller.id=product_wishlists.seller_id' , 'LEFT');
                 $this->db->group_by('seller_id'); 
		$this->db->order_by('product_wishlists.id', 'DESC');
		$return=$this->db->get()->result();
		//echo $this->db->last_query();
                
                /*if(!empty($return)){
			foreach($return as $k=>$data){
                         $this->Api_model->wishlist_products($user_id);
                        }
                        }*/
                        return $return;
    }
	   
    
    public function wishlist_products($user_id,$seller_id)
    {
       
	$this->db->select('products.id,products.title,products.description,products.slug,products.sku,products.category_id,product_categories.title as category,products.unit_price,products.purchase_price,product_wishlists.option_name,variant_product_id,product_variation_options.variation_name,product_variation_options.price,products.discount,products.discount_type,products.current_stock,products.low_stock_quantity,products.seller_id,products.photos,products.rating');
		$this->db->from('product_wishlists');
		$this->db->join('products', 'products.id = product_wishlists.product_id' , 'LEFT');
		$this->db->join('user_profiles', 'products.seller_id = user_profiles.user_id' , 'LEFT');
		$this->db->join('product_categories', 'product_categories.id = products.category_id' , 'LEFT');
                $this->db->join('product_variation_options', 'product_variation_options.id = product_wishlists.variant_product_id' , 'LEFT');
		$this->db->where('product_wishlists.user_id', $user_id);
                $this->db->where('product_wishlists.seller_id', $seller_id);
		//$this->db->limit(10);		
		$this->db->order_by("product_wishlists.id", "desc");
		$return = $this->db->get()->result();
		//echo $this->db->last_query();
		if(!empty($return)){
			foreach($return as $k=>$data){
				$return[$k]->image_default='';
				if(!empty($data->photos)){
					$photos = explode(',',$data->photos);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$return[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
					$return[$k]->order_count= $this->product_order_count($data->id);
					//$return[$k]->image_list= !empty($datas)?$datas:[];
				}
				$post['user_id'] = $user_id;
				$post['product_id'] = $data->id;
				//$return[$k]->is_favourite= $this->is_favourite($post);
			}
		}
		return $return;
    }
	
	//********************************************************ORDER - CART SECTION**********************************************//
	
	public function addItemtocart($post) {
		$this->db->select('* ');
		$this->db->from('cart');
		$this->db->where("user_id",$post['user_id']);
		$this->db->where("product_id",$post['product_id']);
                if(!empty($post['option_name'])){
                  /*$option_1 = explode(',',$post['option_name']); 
                  print_r($option_1);
                  
                  if(!empty($option_1))
                  {
                    foreach($option_1 as $k=>$o_ids)
                    {
                        echo $o_ids;
                    
                     $option_2 = explode('-',$o_ids); 
                     print_r($option_2);
                    }
                }*/
                    
                 $this->db->where("option_name",$post['option_name']);   
                }
                
                //echo 'variation_id'.$post['variant_product_id'];
		if(!empty($post['variant_product_id'])){
			$this->db->where("variant_product_id",$post['variant_product_id']);
		}
		$query = $this->db->get()->row();
		//echo $this->db->last_query();
                
        if (!empty($query)) {			
            $this->db->where("id", $query->id);
            $this->db->update('cart', $post);
        } else {			
            $this->db->insert('cart', $post);
        }
		$this->db->select('* ');
		$this->db->from('cart');
		$this->db->where("user_id",$post['user_id']);
        $res = $this->db->get()->result();
		//echo $this->db->last_query();
        return count($res);
    }
	public function cartList($user_id,$seller_id) {
            
		//$this->db->select('cart.*,products.id as product_id,products.title,products.slug,products.option_ids,products.sku,products.purchase_price,products.current_stock,products.photos,product_variation_option_prices.type as variation_option,product_variation_option_prices.title as variation_option_title,product_variation_option_prices.price as variation_option_price,product_variation_option_prices.stock as variation_option_stock,product_categories.tax_rate ');
            $this->db->select('cart.*,products.id as product_id,products.title,products.slug,products.option_ids,products.sku,products.unit_price,products.purchase_price,products.inventory_item,products.current_stock,products.photos,product_variation_options.id as variation_id,product_variation_options.variation_name as variation_name,product_variation_options.price as variation_price, product_variation_options.stock as variation_stock,product_variation_options.sku as variation_sku, product_categories.tax_rate');
		$this->db->from('cart');
		$this->db->where("cart.user_id",$user_id);
                $this->db->where("cart.seller_id",$seller_id);
                
		//$this->db->where("is_group_purchase",$is_group_purchase);
		$this->db->join('products', 'products.id = cart.product_id' , 'LEFT');
		$this->db->join('product_categories', 'product_categories.id = products.category_id' , 'LEFT');
		$this->db->join('product_variation_options', 'product_variation_options.id = cart.variant_product_id' , 'LEFT');
		$query = $this->db->get()->result();
                //echo $this->db->last_query();
		if(!empty($query)){
			foreach($query as $k=>$data){
				$query[$k]->image_default='';
				if(!empty($data->photos)){
					$photos = explode(',',$data->photos);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$query[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
				}
			}
		}
		return $query;
	}
	public function deleteCartItem($post){	
		$this->db->delete('cart', array('id' => $post['id']));
		//pr($this->db->last_query());
		$this->db->select('* ');
		$this->db->from('cart');
		$this->db->where("user_id",$post['user_id']);
                $this->db->where("seller_id",$post['seller_id']);

        $res = $this->db->get()->result();
		//echo $this->db->last_query();
        return count($res);
	}
	public function add_order($data_transaction)
    {    date_default_timezone_set('America/Bogota');
        $cart_total = $this->calculate_cart_total($data_transaction['user_id'],$data_transaction['seller_id']);
		//pr($cart_total); die;
		
			//$payment_status='Unpaid';
			$order_status='awating_confirmation';
		
        if (!empty($cart_total)) {
            $digits = 6;
            $pickup = rand(pow(10, $digits-1), pow(10, $digits)-1);
            $data = array(
                'order_number' => uniqid(),
                'buyer_id' => 0,
                'buyer_type' => "guest",
                'order_type' => $data_transaction['order_type'],
                'price_subtotal' => $data_transaction['sub_total'],
                //'price_vat' => $cart_total->vat,
                'seller_id' => $data_transaction["seller_id"],
                //'price_shipping' => $cart_total->shipping_cost,
                //'price_charge_rate' => $cart_total->charge_rate,
                'price_total' => $data_transaction['price_total'],
                'coupon_id' => $data_transaction['coupon_id'],
                'coupon_discount' => $data_transaction['coupon_discount'],
                'remarks' => $data_transaction['remarks'],
                'table_id' => $data_transaction['table_id'],
                'transactionId' => $data_transaction['transactionId'],
                'price_currency' => $cart_total->currency,
                'status' => 0,
               
                'payment_method' => $data_transaction["payment_method"],
                'payment_status' => $data_transaction["payment_status"],
                'pickup_number'  => $pickup,
                'order_status' => $order_status,
                'delivery_status' => "pending",
                'updated_at' => date('Y-m-d H:i:s'),
                'created_at' => date('Y-m-d H:i:s')
            );

			$data["buyer_type"] = "registered";
			$data["buyer_id"] = $data_transaction['user_id'];
            
            if ($this->db->insert('orders', $data)) {
                $order_id = $this->db->insert_id();

                //update order number
                $order_number = $this->update_order_number($order_id);

                //add order shipping
                //$this->add_order_shipping($data_transaction['user_id'],$order_id,$data_transaction['shipping_address_id']);

                //add order products
                $this->add_order_products($data_transaction['user_id'],$data_transaction['seller_id'],$order_id, 'payment_received',$order_number);

                //add payment transaction
                $this->add_payment_transaction($data_transaction['user_id'],$data_transaction, $order_id);

                //clear cart
				$res = $this->db->delete('cart', array('user_id' => $data_transaction['user_id']));
				
                return $order_id;
            }
            return false;
        }
        return false;
    }
	//update order number
    public function update_order_number($order_id)
    {
        $data = array(
            'order_number' => $order_id + 10000
        );
        $this->db->where('id', $order_id);
        $this->db->update('orders', $data);
		return $order_id + 10000;
    }
/*
    //add order shipping
    public function add_order_shipping($user_id,$order_id,$shipping_address_id)
    {
        
		$shipping_address = $this->get_user_shipping_address($shipping_address_id);
		$billing_address = $this->getUserData($user_id);
		$data = array(
			'order_id' => $order_id,
			'shipping_full_name' => $shipping_address->full_name,
			'shipping_email' => $shipping_address->email,
			'shipping_phone_number' => $shipping_address->phone_no,
			'shipping_address' => $shipping_address->address,
			'shipping_area' => $shipping_address->area,
			'shipping_country' => $shipping_address->country,
			'shipping_state' => $shipping_address->state,
			'shipping_city' => $shipping_address->city,
			'shipping_zip_code' => $shipping_address->pincode,
			'billing_full_name' => $billing_address->full_name,
			'billing_email' => $billing_address->email,
			'billing_phone_number' => $billing_address->phone_no,
		);
		$this->db->insert('order_shipping', $data);
        
    }
*/
    //add order products
    public function add_order_products($user_id,$seller_id,$order_id, $order_status,$order_number)
    {
        $order_id = ($order_id);
        $order_no = $order_number.'-'.time();
        $cart_items = $this->get_cart_items($user_id,$seller_id);
	//print_r($cart_items); die();	 
        if (!empty($cart_items)) {
            foreach ($cart_items as $cart_item) {
				//print_r($cart_item); die();
                $product = $this->get_product_by_id($cart_item->product_id);
                 //print_r($product); die();
                $variation_option_ids = ($cart_item->options_array);
				
                if (!empty($product)) {
		$product_vat = ($cart_item->unit_price * $cart_item->quantity * $product->tax_rate)/100;
                    $data = array(
                        'order_id' => $order_id,
                        'order_no' => $order_no,
                        'seller_id' => $product->seller_id,
                        'buyer_id' => $user_id,
                        'buyer_type' => "registered",
                        'product_id' => $product->id,
                        'product_type' => 'Physical',
                        'product_title' => $cart_item->product_title,
                        'product_slug' => $product->slug,
                        'product_sku' => $product->sku,
                        'product_unit_price' => $cart_item->unit_price,
                        'product_option_name' => $cart_item->option_name,
                        'variant_product_id' => $cart_item->variant_product_id,
                        'product_quantity' => $cart_item->quantity,
                        'product_currency' => $cart_item->currency,
                        'product_vat_rate' => $product->tax_rate,
                        'product_vat' => $product_vat,
                        
                        'product_total_price' => $cart_item->total_price,
                        'variation_option_ids' => $variation_option_ids,
                        'order_status' => $order_status,
                        'delivery_status' => 'pending',
                        'is_approved' => 0,
                       
                        'updated_at' => date('Y-m-d H:i:s'),
                        'created_at' => date('Y-m-d H:i:s')
                    );
                    
                    
                    
                    $data["product_total_price"] = $cart_item->total_price + $product_vat + $cart_item->shipping_cost;
		    //print_r($data); 
                    $this->db->insert('order_products', $data);
					//echo $this->db->last_query();
                }
            }
        }
    }
	//add payment transaction
    public function add_payment_transaction($user_id,$data_transaction, $order_id)
    {
        $order_id = clean_number($order_id);
        $data = array(
            'payment_method' => $data_transaction["payment_method"],
            'payment_id' => $data_transaction["payment_id"],
            'order_id' => $order_id,
            'user_id' => $user_id,
            'user_type' => "registered",
            'currency' => '$',
            'payment_amount' => $data_transaction["payment_amount"],
            'payment_status' => $data_transaction["payment_status"],
            'ip_address' => 0,
            'created_at' => date('Y-m-d H:i:s')
        );
        if ($this->db->insert('order_transactions', $data)) {
            //add invoice
            //$this->add_invoice($order_id);
        }
    }
	//get cart items session
    public function get_cart_items($user_id,$seller_id)
    {
        $cart = array();
        $new_cart = array();
        $this->cart_product_ids = array();
        $cart = $this->cartList($user_id,$seller_id);
        //print_r($cart);
        //die();
        foreach ($cart as $cart_item) {
             $product = $this->get_product_by_id($cart_item->product_id);
             
            //die();
            if (!empty($product)) {
                
				$object = $this->get_product_price_and_stock($product, $cart_item->variation_option_ids);
				
				$item = new stdClass();
				$item->cart_item_id = $cart_item->cart_item_id;
				$item->product_id = $product->id;
				$item->product_type = $cart_item->product_type;
                                $item->option_name = $cart_item->option_name;
				$item->product_title = $product->title;
				$item->options_array = $cart_item->variation_option_ids;
                                $item->variant_product_id = $cart_item->variant_product_id;
				$item->quantity = $cart_item->product_quantity;
				//$item->unit_price = $object->price_calculated;
                                $item->unit_price = $cart_item->product_unit_price;
				//$item->total_price = $object->price_calculated * $cart_item->product_quantity;
                                $item->total_price = $cart_item->product_unit_price * $cart_item->product_quantity;
                                //die();
				$item->discount_rate = $object->discount_rate;
				$item->currency = $product->currency;
				//$item->product_vat = $this->calculate_total_vat($object->price_calculated, $product->vat_rate, $cart_item->product_quantity);
				//$item->shipping_cost = $this->get_product_shipping_cost($product, $cart_item->product_quantity);
				$item->product_vat = 0;
				$item->shipping_cost = 0;
				$item->purchase_type = $cart_item->purchase_type;
				$item->quote_request_id = $cart_item->quote_request_id;
				$item->is_stock_available = $object->is_stock_available;
				if ($this->form_settings->shipping != 1) {
					$item->shipping_cost = 0;
				}
				array_push($new_cart, $item);
                
            }
        }
        //print_r($new_cart);
        //die();
        return $new_cart;
    }
	public function calculate_cart_total($user_id,$seller_id)
    {
        $cart = $this->cartList($user_id,$seller_id);
        $cart_total = new stdClass();
        $cart_total->subtotal = 0;
        $cart_total->vat = 0;
        $cart_total->shipping_cost = 0;
        $cart_total->total = 0;
        $cart_total->currency = '$';
        $cart_total->is_stock_available = 1;
        $cart_total->charge_rate = 0;
	//print_r($cart); die();
        if (!empty($cart)) {
            foreach ($cart as $item) {
				//pr($item);
				//die();
                        //pr($item);
                        $product = $this->get_product_by_id($item->product_id);   
                        //pr($product); die();
                        $object = $this->get_product_price_and_stock($product, $item->variation_option_ids);
                        //print_r($object);
                        //echo $object->price_calculated.'--'.$item->product_quantity; die();
                        $cart_total->subtotal += $object->price_calculated * $item->product_quantity;
                        $product_vat = ($object->price_calculated * $item->product_quantity * $object->product_tax_rate)/100;
                        $cart_total->vat += $product_vat;

                        //$cart_total->shipping_cost += $item->shipping_cost;
                        $cart_total->shipping_cost = 0;
                        //pr($cart_total);die();
				
            }
        }
        $cart_total->total = $cart_total->subtotal + $cart_total->vat + $cart_total->shipping_cost + $cart_total->charge_rate;
        return $cart_total;
    }
	//get product price and stock
    public function get_product_price_and_stock($product, $option_id)
    {
        $object = new stdClass();
        $object->price = 0;
        $object->discount_rate = 0;
        $object->price_calculated = 0;
        $object->is_stock_available = 0;
        $object->product_vat = 0;        

        if (!empty($product)) {           
			//print_r($product); die();
            $stock = $product->current_stock;
            $object->product_id = $product->id;
            $object->price = $product->purchase_price;
            $object->discount_rate = $product->discount;
            $object->product_tax_rate = $product->tax_rate;
            $object->product_vat = 0;
	//die();		
            /*if (!empty($option_id)) {
				$option = $this->get_variation_option_prices($option_id);
				//print_r($option);
				if (!empty($option)) {					
					$object->price = $option->price;
					$object->stock = $option->stock;
				}
            }*/
			
            if (empty($object->price)) {
                $object->price = $product->purchase_price;
                $object->discount_rate = $product->discount;
            }
            $object->price_calculated = $product->purchase_price;            
            $object->is_stock_available = 1;
            //print_r($object);
            //die();
            
        }
        return $object;
    }
	
	//get user shipping address
   
	//get user billing address
   
	//get order
    public function get_order($id)
    {
        $id = ($id);
        $this->db->where('id', $id);
        $query = $this->db->get('orders');
        return $query->row();
    }
	//get order products
    public function get_order_products($order_id)
    {
        $order_id = ($order_id);
        $this->db->where('order_id', $order_id);
        $query = $this->db->get('order_products');
        return $query->result();
    }
	 //get order shipping
   
	//get order products
    public function product_order_count($product_id)
    {	
		$this->db->select_sum('product_quantity');
        $this->db->where('product_id', $product_id);
        $query = $this->db->get('order_products');
        $return = $query->row();
		//return $return;
		return !empty($return)?!empty($return->product_quantity)?$return->product_quantity:0:0;
    }
	//decrease product stock after sale
    public function decrease_product_stock_after_sale($order_id)
    {
        $order_products = $this->get_order_products($order_id);
        if (!empty($order_products)) {
            foreach ($order_products as $order_product) {
                $option_id = ($order_product->variation_option_ids);
                if (!empty($option_id)) {
					$option = $this->get_variation_option_prices($option_id);
					
                    if (!empty($option)) {						
						$stock = $option->stock - $order_product->product_quantity;
						if ($stock < 0) {
							$stock = 0;
						}
						$data = array(
							'stock' => $stock
						);
						$this->db->where('id', $option->id);
						$this->db->update('product_variation_option_prices', $data);						
					}
                } else {
                    $product = $this->get_product_by_id($order_product->product_id);
                    if (!empty($product)) {
                        $stock = $product->current_stock - $order_product->product_quantity;
                        if ($stock < 0) {
                            $stock = 0;
                        }
                        $data = array(
                            'current_stock' => $stock
                        );
						$this->db->set('num_of_sale', 'num_of_sale+'.$order_product->product_quantity, FALSE);
                        $this->db->where('id', $product->id);
                        $this->db->update('products', $data);
                    }
                }
            }
        }
    }	
	
    public function orderList($user_id,$status)
    {		
		$data= array();
		$this->db->select('orders.*,seller.seller_name');		
		$this->db->from('orders');
		$this->db->join('seller', 'seller.id=orders.seller_id' , 'LEFT');
		//$this->db->join('products', 'products.id = order_products.product_id' , 'LEFT');
		$this->db->where("orders.buyer_id",$user_id);
                if($status=='ongoing') {
                //$this->db->where("orders.order_status",'awating_confirmation');
                //$this->db->or_where("orders.order_status",'processing');
                $whereongoing = "(orders.order_status ='awating_confirmation' OR orders.order_status='processing')";
                $this->db->where($whereongoing);    
                }
                if($status=='history') {
                //$this->db->where("orders.order_status",'completed' || "orders.order_status",'cancelled');
                $wherecond = "(orders.order_status ='completed' OR orders.order_status='cancelled')";
                $this->db->where($wherecond);
                //$this->db->or_where("orders.order_status",'cancelled');
                }
                //$this->db->group_by('seller_id'); 
		$this->db->where("orders.deleted","0");
		$this->db->order_by("orders.id", "desc");
		//$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query(); 
		if(!empty($query)){
			foreach($query as $k=>$data){
                            
			$query[$k]->order_list = $this->order_list($data->id,$data->buyer_id,$data->seller_id,$status);
                        /*if(!empty($query[$k]->order_list)){
                            foreach($query[$k]->order_list as $k=> $rows)
                            { 
                        $query[$k]->review_given= $this->getUserReviewGiven($rows->product_id,$data->buyer_id);
                            }
                        }*/
			}
		}
		
		return $query;
    }
    public function cancelOrder($order_id,$order_status)
    {		
		$data= array();
                date_default_timezone_set('America/Bogota');
                $this->db->set("order_status", $order_status);
                $this->db->set("updated_at", date('Y-m-d H:i:s'));
		$this->db->where("id", $order_id);
		$return = $this->db->update("orders"); 
                //echo $this->db->last_query(); 
                return ($this->db->affected_rows() > 0);
                
    }
    public function order_list($order_id,$user_id,$seller_id,$status)
    {		
		$data= array();
		$this->db->select('order_products.order_no,order_products.product_id,category_id,product_title,product_quantity,product_currency,product_vat_rate,product_vat,product_total_price,charge_rate,product_unit_price,product_option_name,variant_product_id,product_variation_options.variation_name,product_variation_options.price,user_profiles.fname,user_profiles.lname,order_products.order_no,orders.order_number,products.photos');		
		$this->db->from('order_products');
		$this->db->join('orders', 'orders.id=order_products.order_id' , 'LEFT');
		$this->db->join('products', 'products.id = order_products.product_id' , 'LEFT');
                $this->db->join('product_variation_options', 'product_variation_options.id = order_products.variant_product_id' , 'LEFT');
		$this->db->where("order_products.order_id",$order_id);
		//$this->db->where("order_products.delivery_status",$status);
		$this->db->order_by("order_products.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
                
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
                //echo 'variant pis:'.$query['variant_product_id'];
		if(!empty($query)){
                    
			foreach($query as $k=>$data){
                                
				$query[$k]->image_default='';
				if(!empty($data->photos)){
					$photos = explode(',',$data->photos);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
                                       //echo 'pid'. $data->product_id.'<br>';
                                        //echo 'uid:='. $data->buyer_id;
					$query[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
					$query[$k]->is_review_given= $this->is_review_given($data->product_id,$user_id,$order_id);
				}
			}
		}
		
		return $query;
    }
    
     /*public function orderagainList($user_id,$seller_id,$status)
    {		
		$data= array();
		$this->db->select('order_no,product_id,product_title,product_quantity,product_currency,product_vat_rate,product_vat,product_total_price,charge_rate,product_unit_price,user_profiles.fname,user_profiles.lname,order_products.order_no,orders.order_number,products.photos');		
		$this->db->from('order_products');
		$this->db->join('orders', 'orders.id=order_products.order_id' , 'LEFT');
		$this->db->join('products', 'products.id = order_products.product_id' , 'LEFT');
		$this->db->where("order_products.buyer_id",$user_id);
                $this->db->where("order_products.seller_id",$seller_id);
		$this->db->where("order_products.delivery_status",$status);
		$this->db->order_by("order_products.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		if(!empty($query)){
			foreach($query as $k=>$data){
				$query[$k]->image_default='';
				if(!empty($data->photos)){
					$photos = explode(',',$data->photos);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$query[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
					$query[$k]->is_review_given= $this->is_review_given($data->product_id,$data->buyer_id);
				}
			}
		}
		
		return $query;
    }*/
   
	public function orderDetails($order_id)
    {		
		
        $data= array();
		$this->db->select('order_products.*,user_profiles.full_name,user_profiles.fname,user_profiles.lname,order_products.order_no,orders.order_number,products.photos');		
		$this->db->from('order_products');
		$this->db->join('orders', 'orders.id=order_products.order_id' , 'LEFT');
		$this->db->join('products', 'products.id = order_products.product_id' , 'LEFT');
		$this->db->where("order_products.id",$order_id);
		$this->db->order_by("order_products.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
		$query = $this->db->get()->row();
		//echo $this->db->last_query();
		if(!empty($query)){
			$query->image_default='';
			if(!empty($query->photos)){
				$photos = explode(',',$query->photos);
				$photos = generate_ids_string($photos);					
				$this->db->select('uploads.file_name');
				$this->db->from('uploads');
				$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
				$datas = $this->db->get()->result();
				//echo $this->db->last_query();
				$query->image_default= !empty($datas)?$datas[0]->file_name:'';
			}
			
			//billing_shipping			
			$this->db->where('order_id', $query->order_id);
			$query_shipping = $this->db->get('order_shipping')->row();			
			$query->billing_shipping = $query_shipping;
			
			//buyer
			$this->db->select('* ');
			$this->db->from('user_profiles');
			$this->db->where("user_id",$query->buyer_id);
			$query_buyer = $this->db->get()->row();
			$query->buyer = $query_buyer;
			
		}
		
		return $query;
    }
		

	//********************************************************SELLER SECTION**********************************************//
	
	
	
	
	//******************************************************** SECTION**********************************************//
	
	public function BannerList($type)
	{
		$this->db->select('banners.*');
		$this->db->from('banners');
		$this->db->where("banners.deleted","0");
                $this->db->where("banners.location",$type);
		$this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
				
	}
        public function SellerTypeImage($parent_id="0")
	{
		$this->db->select('sellers_types.id,sellers_types.seller_type,sellers_types.image');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted","0");
                $this->db->where("sellers_types.status","1");
                $this->db->where("sellers_types.parent_id",$parent_id);
                $this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
				
	}
        public function ischildCategorySeller($parent_id)
	{
		
                $this->db->select('*');
		$this->db->from('sellers_types');
                $this->db->where("sellers_types.deleted","0");
                $this->db->where("sellers_types.status","1");
		$this->db->where("parent_id",$parent_id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
                //echo $this->db->last_query();
		return !empty($data)?'1':'0';
				
	}
        public function RatingList($user_id)
	{
		$this->db->select('products.*,seller.seller_name as seller_name');
		$this->db->from('products');
                //$this->db->select_max('products.rating');
                $this->db->limit(6);
                $this->db->where("products.deleted","0");
                $this->db->where("products.status","1");
                $this->db->join('seller', 'seller.id = products.seller_id' , 'LEFT');
		$this->db->order_by("rating", "desc");
		$return = $this->db->get()->result();
                //echo $this->db->last_query();
                if(!empty($return)){
			foreach($return as $k=>$data){
				$return[$k]->image_default='';
				if(!empty($data->photos)){
                                $photos = explode(',',$data->photos);
                                $photos = generate_ids_string($photos);					
                                $this->db->select('uploads.file_name');
                                $this->db->from('uploads');
                                $this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);				                                  $datas = $this->db->get()->result();
                                //echo $this->db->last_query();
                                $return[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
                                }
                                $post['user_id'] = $user_id;
				$post['product_id'] = $data->id;
                                $return[$k]->is_favourite= $this->is_favourite($post);
                        }
                }
		return $return;		
	}
         public function Recomended_products($user_id)
	{
		$this->db->select('products.*,seller.seller_name as seller_name');
		$this->db->from('products');
                //$this->db->select_max('products.rating');
                $this->db->limit(6);
                $this->db->where("products.deleted","0");
                $this->db->where("products.status","1");
                $this->db->where("products.recommended_product","1");
                $this->db->join('seller', 'seller.id = products.seller_id' , 'LEFT');
		$this->db->order_by("order_no", "ASC");
		$return = $this->db->get()->result();
                //echo $this->db->last_query();
                if(!empty($return)){
			foreach($return as $k=>$data){
				$return[$k]->image_default='';
				if(!empty($data->photos)){
                                $photos = explode(',',$data->photos);
                                $photos = generate_ids_string($photos);					
                                $this->db->select('uploads.file_name');
                                $this->db->from('uploads');
                                $this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);				                                  $datas = $this->db->get()->result();
                                //echo $this->db->last_query();
                                $return[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
                                }
                                $post['user_id'] = $user_id;
				$post['product_id'] = $data->id;
                                $return[$k]->is_favourite= $this->is_favourite($post);
                        }
                }
		return $return;		
	}
        public function sellerDetails($sellerid)
	{
		$this->db->select('seller.*, sellers_types.seller_type as seller_category');
		$this->db->from('seller');
                $this->db->where("seller.id",$sellerid);
                $this->db->where("seller.deleted","0");
		$this->db->where("seller.status","1");
                $this->db->join('sellers_types', 'sellers_types.id = seller.seller_type' , 'LEFT');
                //$this->db->join('sellers_types', 'sellers_types.id = seller.chld_category_id' , 'LEFT');
		return $datas = $this->db->get()->row();
                
                //echo $this->db->last_query();die();
				
	}
        public function sellersubcategory($child_id)
        {
        
		$this->db->select('id,seller_type');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted","0");
		$this->db->where("sellers_types.status","1");
		$this->db->where("sellers_types.id",$child_id);
		$this->db->order_by("id", "desc");
		$datas = $this->db->get()->row();
                //echo $this->db->last_query(); 
                return $datas;
		
        
        }
         public function sellerSubcategorydetails($parent_id)
        {
        
		$this->db->select('sellers_types.id,sellers_types.seller_type,sellers_types.image');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted","0");
                $this->db->where("sellers_types.status","1");
                $this->db->where("sellers_types.parent_id",$parent_id);
                $this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
		
        
        }
        public function sellerSchedules($id)
        {
        
		$this->db->select('user_schedules.day_name as day,user_schedules.time_from as open_time,user_schedules.time_to as close_time,user_schedules.type as shop_status');
		$this->db->from('user_schedules');
		$this->db->where("user_schedules.user_id",$id);
		$this->db->order_by("id", "asc");
		$datas = $this->db->get()->result();
                //echo $this->db->last_query(); 
                return $datas;
		
        
        }
        public function sellerProducts($sellerid,$uid,$dine_in,$take_out)
	{
		$this->db->select('products.* ,product_categories.title as cname');
		$this->db->from('products');
                $this->db->where("products.seller_id",$sellerid);
                $this->db->where("products.deleted","0");
		$this->db->where("products.status","1");
                if($dine_in==1){
                $this->db->where('products.dine_in', 1);
                }
                if($take_out==1){
                $this->db->where('products.take_out', 1);
                }
                $this->db->order_by("products.category_id", "asc");
                $this->db->join('product_categories', 'product_categories.id = products.category_id' , 'LEFT');
		$return = $this->db->get()->result();
                if(!empty($return)){
			foreach($return as $k=>$data){
                               $return[$k]->image_default='';
				if(!empty($data->photos)){
					$photos = explode(',',$data->photos);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$return[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
					//$return[$k]->image_list= !empty($datas)?$datas:[];
				}
				$post['user_id'] = $user_id;
				$post['product_id'] = $data->id;
				$return[$k]->is_favourite= $this->is_favourite($post);
			}
		}
                 //echo $this->db->last_query();
                return $return;
               
				
	}
         public function sellerCategorySearch($cateid)
	{
		$this->db->select('products.* ,product_categories.title as cname');
		$this->db->from('products');
                $this->db->where("products.category_id ",$cateid);
                $this->db->where("products.deleted","0");
		$this->db->where("products.status","1");
                $this->db->join('product_categories', 'product_categories.id = products.category_id' , 'LEFT');
		return $datas = $this->db->get()->result();
                //echo $this->db->last_query();die();
				
	}
        public function sellerCategory($sellerid)
	{
		$this->db->select('product_categories.*');
		$this->db->from('product_categories');
                $this->db->where("(find_in_set('".$sellerid."',seller_id) <> 0)");
                $this->db->where("product_categories.deleted","0");
		$this->db->where("product_categories.status","1");
                //$this->db->join('product_categories', 'product_categories.id = products.category_id' , 'LEFT');
		$return = $this->db->get()->result();
                if(!empty($return)){
			foreach($return as $k=>$data){
				$return[$k]->cat_image='';
				if(!empty($data->banner)){
                                $photos = explode(',',$data->banner);
                                $photos = generate_ids_string($photos);					
                                $this->db->select('uploads.file_name');
                                $this->db->from('uploads');
                                $this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);				                                  $datas = $this->db->get()->result();
                                //echo $this->db->last_query();
                                $return[$k]->cat_image= !empty($datas)?$datas[0]->file_name:'';
                                }
                        }
                }
                return $return;
                //echo $this->db->last_query();die();
				
	}
        public function SellerList($search,$parent_id,$child_id,$city)
	{
                $this->db->select('*');
                $this->db->from('products');
                $this->db->where("deleted","0");
                $this->db->where("status","1");
                $this->db->like('products.title', $search);
                $this->db->order_by("id", "desc");
                $datas = $this->db->get()->result();
                //echo $this->db->last_query();
                
                $this->db->select('*');
                $this->db->from('sellers_types');
                $this->db->where("deleted","0");
                $this->db->where("status","1");
                $this->db->like('sellers_types.seller_type', $search);
                $this->db->order_by("id", "desc");
                $sellertype_data = $this->db->get()->result();
                
                $this->db->select('*');
                $this->db->from('seller');
                $this->db->where("deleted","0");
                $this->db->where("status","1");
                $this->db->like('seller.seller_name', $search);
                $this->db->order_by("id", "desc");
                $sellername_data = $this->db->get()->result();
                
                 //echo $this->db->last_query();
                 
                if(!empty($datas)){
                        foreach($datas as $k=>$data){
                                $sellerArr[]= $data->seller_id;
                        }
                }
		
                if(!empty($sellertype_data)){
                        foreach($sellertype_data as $k=>$data_seller){
                                $sellerTypeArr[]= $data_seller->id;
                        }
                }
                
                if(!empty($sellername_data)){
                        foreach($sellername_data as $k=>$seller_name){
                                $sellerNameArr[]= $seller_name->seller_name;
                        }
                }
            
		$this->db->select('seller.*');
		$this->db->from('seller');
                $this->db->where("seller.seller_type!=","");
                
                $this->db->where("seller.status","1");
		$this->db->where("seller.deleted","0");
                
                //$this->db->where("seller.location",$type);
                if($search!=''){
                   
                    if(!empty($datas))
                    {
                     $this->db->where_in("seller.id",$sellerArr);
                     }
                     
                    if(!empty($sellertype_data))
                    {
                     $this->db->where_in("seller.chld_category_id",$sellerTypeArr);
                    }
                    
                    if(!empty($sellername_data))
                    {
                     $this->db->where_in("seller.seller_name",$sellerNameArr);
                    }
                }
                if($parent_id!=''){
                    $this->db->where('seller.seller_type', $parent_id);
                }
                if($child_id!=''){
                    $this->db->where('seller.chld_category_id', $child_id);
                }
                if($city!=''){
                    $this->db->like('seller.city', $city);
                }
               
		$this->db->order_by("id", "desc");
		$return = $this->db->get()->result();
                
                //echo $this->db->last_query();
                
                if(!empty($return)){
			foreach($return as $k=>$data){
				$return[$k]->type_list='';
                                //echo 'datattattatt'.$data->seller_type;
				if(!empty($data->seller_type)){
					$type = explode(',',$data->seller_type); //print_r($type);
					$type = generate_ids_string($type);					
					$this->db->select('sellers_types.seller_type');
					$this->db->from('sellers_types');
					$this->db->where("sellers_types.id IN (" . $type . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					//$return[$k]->type_list= !empty($datas)?$datas[0]->seller_type:'';
					$return[$k]->list_type= !empty($datas)?$datas:[];
				}
				
				
			}
		}
		return $return;		
	}
        
         public function MessageList($user_id)
	{
                
	      /*$this->db->select('message_notifications.seller_id,message_notifications.user_id,seller.seller_name as seller_name,seller.profile_image as seller_image');
             
                //$this->db->select('*');
		$this->db->from('message_notifications');
                //$this->db->select_max('message_notifications.id', 'id');
                //$this->db->select_max('message_notifications.id' , 'id');
                $this->db->where("message_notifications.user_id",$user_id);
		$this->db->where("message_notifications.deleted","0");
                $this->db->where("message_notifications.status","1");
                $this->db->join('seller','seller.id = message_notifications.seller_id' , 'LEFT');
                 $this->db->order_by("message_notifications.id", "desc");
                $this->db->group_by('message_notifications.seller_id');
                */
                $this->db->select('message_notifications.seller_id,message_notifications.user_id,seller.seller_name as seller_name,seller.profile_image as seller_image');
                $this->db->from('message_notifications');
                $this->db->select_max('message_notifications.id' , 'id'); // this will produce max(ur_time) as max_ur_time
                 $this->db->where("message_notifications.user_id",$user_id);
                 $this->db->where("message_notifications.deleted","0");
                $this->db->where("message_notifications.status","1");
                 $this->db->join('seller','seller.id = message_notifications.seller_id' , 'LEFT');
                $this->db->order_by('id', 'desc');
                $this->db->group_by('seller_id');
                
                $datas = $this->db->get()->result();
                //echo $this->db->last_query();
                return $datas;
				
	}
         public function MessageSellerWise($seller_id,$user_id)
	{
                
		$this->db->select('message_notifications.description as message,message_notifications.addedOn as time');
		$this->db->from('message_notifications');
                $this->db->where("message_notifications.seller_id",$seller_id);
                $this->db->where("message_notifications.user_id",$user_id);
		$this->db->where("message_notifications.deleted","0");
                $this->db->where("message_notifications.status","1");
                $this->db->limit(1);  
                $this->db->order_by("message_notifications.addedOn", "desc");
                $datas = $this->db->get()->result();
                //echo $this->db->last_query();die();
                return $datas;
				
	}
        public function MessageAllSellerWise($seller_id,$user_id)
	{
                
		$this->db->select('message_notifications.description as message,message_notifications.addedOn as time');
		$this->db->from('message_notifications');
                $this->db->where("message_notifications.seller_id",$seller_id);
                $this->db->where("message_notifications.user_id",$user_id);
		$this->db->where("message_notifications.deleted","0");
                $this->db->where("message_notifications.status","1");
                $this->db->order_by("message_notifications.id", "asc");
                $datas = $this->db->get()->result();
                //echo $this->db->last_query();die();
                return $datas;
				
	}
        public function SeenCount($seller_id,$user_id)
	{
                
		$this->db->select('message_notifications.*');
		$this->db->from('message_notifications');
                $this->db->where("message_notifications.is_seen",0);
                $this->db->where("message_notifications.seller_id",$seller_id);
                $this->db->where("message_notifications.user_id",$user_id);
		$this->db->where("message_notifications.deleted","0");
                $this->db->where("message_notifications.status","1");
                $this->db->order_by("message_notifications.addedOn", "desc");
                $datas = $this->db->count_all_results();
                //echo $this->db->last_query();
                return $datas;
				
	}
        public function getContentBySlug($slug)
	{
		$this->db->select('*');
		$this->db->from('contents');
		$this->db->where("slug",$slug);
		$this->db->where("deleted","0");
		$this->db->where("status","1");
		$datas = $this->db->get()->row();	
		//pr($this->db->last_query());
		return $datas;
	}
        public function getFaq()
	{
		$this->db->select('*');
		$this->db->from('faqs');
		$this->db->where("deleted","0");
		$this->db->where("status","1");
		$datas = $this->db->get()->result();	
		//pr($this->db->last_query());
		return $datas;
	}
         public function get_products_list($user_id,$category_id,$seller_id='',$dine_in,$take_out)
	{
                
		$this->db->select('products.*,seller.seller_name as seller_name');
		$this->db->from('products');
		$this->db->where("products.deleted","0");
                $this->db->where("products.status","1");
                $this->db->join('seller', 'seller.id = products.seller_id' , 'LEFT');
                //$this->db->where("seller.location",$type);
                if($category_id!=''){
                $category_tree_ids = generate_ids_string(explode(',',$category_id));
                if (!empty($category_tree_ids)) {
                $this->db->where("products.category_id IN (" . $category_tree_ids . ")", NULL, FALSE);
                $this->db->order_by('products.addedOn', 'DESC');
                }
                }
                if($dine_in==1){
                $this->db->where('products.dine_in', 1);
                }
                if($take_out==1){
                $this->db->where('products.take_out', 1);
                }
                if(!empty($seller_id)){
                $this->db->where('products.seller_id', $seller_id);
                }
		$this->db->order_by("id", "desc");
		$return = $this->db->get()->result();
                //echo $this->db->last_query();die();
                //$return[$k]->optionname= '';   
                if(!empty($return)){
			foreach($return as $k=>$data){
                            /****** Option Code ************/
                            /*
                            if(!empty($data->option_ids)){
                            $oid_arr = explode(',',$data->option_ids);
                            foreach($oid_arr as $k=>$option_ids){
                            //$return[$k]->optionname= '';    
                            $return[$k]->optionname = $this->optionName($option_ids);
                            
                            } 
                        } */
                            /******* End Option Code **********/
                            
                            
                            
				$return[$k]->image_default='';
				if(!empty($data->photos)){
					$photos = explode(',',$data->photos);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$return[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
					//$return[$k]->image_list= !empty($datas)?$datas:[];
				}
				$post['user_id'] = $user_id;
				$post['product_id'] = $data->id;
				$return[$k]->is_favourite= $this->is_favourite($post);
				//$return[$k]->order_count= $this->product_order_count($data->id);
			}
		}
                return $return;
				
	}
        public function addFeedback($post){		
		$res = $this->db->insert('feedbacks', $post);
		 //pr($this->db->last_query()); die();
                $insert_id = $this->db->insert_id();
		return $insert_id;
	}
        
        public function getCoupon($userid,$seller_id){		
		$this->db->select('coupons.*,seller.seller_name');
		$this->db->from('coupons');
                if($seller_id!=''){
                 //$this->db->where("(find_in_set('".$seller_id."',seller_ids) <> 0)");
                 $this->db->where("coupons.seller_ids",$seller_id);   
                }
                $this->db->join('seller','seller.id = coupons.seller_ids', 'LEFT');
                $this->db->where('coupons.disable_date >= NOW()');
                //$this->db->where('coupons.paymentdate <=', $month_end);
		$this->db->where("coupons.deleted","0");
                $this->db->where("coupons.status","1");
                
                $this->db->order_by("id", "desc");
		$query = $this->db->get()->result();
                //pr($this->db->last_query()); 
                if(!empty($query)){
			foreach($query as $k=>$data){
				$query[$k]->coupon_image='';
				if(!empty($data->banner)){
					$photos = explode(',',$data->banner);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$query[$k]->coupon_image= !empty($datas)?$datas[0]->file_name:'';
				}
			}
		}
                //pr($this->db->last_query()); 
                return $query;
	}
        
        public function getItemSerach($userid,$seller_id,$item_name){		
		$this->db->select('products.*,seller.seller_name');
		$this->db->from('products');
                $this->db->where("products.seller_id",$seller_id);   
                $this->db->like('products.title', $item_name);  
                $this->db->join('seller','seller.id = products.seller_id', 'LEFT');
		$this->db->where("products.deleted","0");
                $this->db->where("products.status","1");
                
                $this->db->order_by("id", "desc");
		$return = $this->db->get()->result();
                //pr($this->db->last_query()); 
                 if(!empty($return)){
			foreach($return as $k=>$data){
                               $return[$k]->image_default='';
				if(!empty($data->photos)){
					$photos = explode(',',$data->photos);
					$photos = generate_ids_string($photos);					
					$this->db->select('uploads.file_name');
					$this->db->from('uploads');
					$this->db->where("uploads.id IN (" . $photos . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					$return[$k]->image_default= !empty($datas)?$datas[0]->file_name:'';
					//$return[$k]->image_list= !empty($datas)?$datas:[];
				}
				
			}
		}
                //pr($this->db->last_query()); 
                return $return;
	}
        public function feedbackImageSave($post){		
		$res = $this->db->insert('feedbacks_images', $post);
		$insert_id = $this->db->insert_id();
		return $res;
	}
         public function optionName($option_ids){
            
                $this->db->select('attributes.attribute_name,attributes.id');
		$this->db->from('attributes');
                $this->db->where("attributes.id",$option_ids);
		$this->db->order_by("id", "desc");
		$return = $this->db->get()->row();
                if(!empty($return)){
                $return->optionList=$this->optionList($option_ids);
                }
                return $return;
        }
         public function optionList($attr_id){
            
                $this->db->select('attributes_configurations.configuration_name,cat_id');
		$this->db->from('attributes_configurations');
                $this->db->where("attributes_configurations.cat_id",$attr_id);
		$this->db->order_by("id", "desc");
		$return = $this->db->get()->result();
                // pr($this->db->last_query()); 
                return $return;
        }
        
         public function refundList($user_id,$status)
    {		
		$data= array();
		$this->db->select('order_refund.*,seller.seller_name,orders.price_subtotal,orders.price_total,orders.payment_method,orders.coupon_id,orders.coupon_discount');		
		$this->db->from('order_refund');
		$this->db->join('seller', 'seller.id=order_refund.seller_id' , 'LEFT');
                $this->db->join('orders', 'orders.order_number=order_refund.order_number' , 'LEFT');
		//$this->db->join('products', 'products.id = order_products.product_id' , 'LEFT');
		$this->db->where("order_refund.buyer_id",$user_id);
                if($status=='ongoing') {
                $this->db->where("order_refund.refund_status",'ongoing');
                }
                if($status=='completed') {
                //$this->db->where("order_refund.refund_status",'completed');
                //$this->db->or_where("order_refund.refund_status",'cancelled');
                
                $whereongoing = "(order_refund.refund_status ='completed' OR order_refund.refund_status='cancelled')";
                $this->db->where($whereongoing);  
                
                }
                
                //$this->db->group_by('seller_id'); 
		$this->db->where("order_refund.deleted","0");
		$this->db->order_by("order_refund.id", "desc");
		//$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id' , 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query(); die();
		if(!empty($query)){
			foreach($query as $k=>$data){
			$query[$k]->order_list = $this->order_list($data->order_id,$data->buyer_id,$data->seller_id,$status); 
			}
		}
		
		return $query;
    }
    public function saveRefund($data)
    {
        return $this->db->insert('order_refund', $data);
    }
   public function sellerType($type)
	{
		$this->db->select('seller_type');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted","0");
                $this->db->where("sellers_types.status","1");
                $this->db->where("sellers_types.id",$type);
                $this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
				
	}
        
    public function cancelRefund($order_id,$status)
    {		
		$data= array();
                date_default_timezone_set('America/Bogota');
                $this->db->set("refund_status", $status);
                $this->db->set("updated_at", date('Y-m-d H:i:s'));
		$this->db->where("order_id", $order_id);
		$return = $this->db->update("order_refund"); 
                //echo $this->db->last_query(); 
                return ($this->db->affected_rows() > 0);
                
    }
    
     public function deleteMessage($user_id,$seller_id,$flag)
	{
         
         if($flag=='all')
         {
            $this->db->where('user_id', $user_id);
            $res = $this->db->delete('message_notifications');
            return $res;
                
                //echo $this->db->last_query();die();
         }
        else
         {
            $this->db->where('user_id', $user_id);
            $this->db->where('seller_id', $seller_id);
            $res = $this->db->delete('message_notifications');
            return $res;
                
                //echo $this->db->last_query();die();
         }
	}
        
         public function seenMessages($user_id,$seller_id)
	{
                $update_seen = array('is_seen' => 1);
                $this->db->where('user_id', $user_id);
                $this->db->where('seller_id', $seller_id);
		$res = $this->db->update('message_notifications', $update_seen);	
		return $res;
	}
        
        public function top20SellerList($user_id)
	{
                $this->db->select('seller.id,seller.seller_name, seller.profile_image');
		$this->db->from('seller');
                $this->db->where("seller.seller_type!=","");
		$this->db->where("seller.deleted","0");
                $this->db->where("seller.status","1");
                $this->db->limit(20);	
                $this->db->order_by("seller.rating", "desc");
		return $datas = $this->db->get()->result();
	}
        
         public function get_filtered_sellers($user_id, $sort_with_rating,$sort_with_discount,$category_id,$over_4_and_5_star,$new_in_pixxi, $offset, $per_page)
	{
                $this->db->select('seller.*');
		$this->db->from('seller');
		$this->db->where("seller.deleted","0");
                $this->db->where("seller.status","1");
                
                /*if ($sort_with_discount == "y") {
                    $where[]=$this->db->select('coupons.id');
                    $this->db->join('coupons','coupons.seller_ids = seller.id', 'LEFT');
                    $this->db->where('coupons.disable_date >= NOW()');
                }*/
                if ($category_id !='') 
                {    
                
                    $cate_arr = explode (",", $category_id);
                    if(!empty($cate_arr))
                    {
                        foreach($cate_arr as $k2=>$cate_ids)
                        {
                            $where[] = " ( seller.seller_type ='".$cate_ids."') ";

                        }
                    }
                }
                
                if ($over_4_and_5_star !='') 
                {   $rating_4 =4;
                    $rating_5 =5; 
                   $rate[] = " ( seller.average_rating >='".$rating_4."') ";
                   //$rate[] = " ( seller.rating ='".$rating_5."') ";
                }
                if ($new_in_pixxi !='') 
                {  
                  
                   $new[] = " ( seller.addedOn BETWEEN DATE_SUB(NOW(), INTERVAL 100 DAY) AND NOW()) ";
                   //$this->db->where('addedOn BETWEEN DATE_SUB(NOW(), INTERVAL 15 DAY) AND NOW()');
                }
                
                if ($category_id !='') {
                $d_where = implode('OR ',$where);
		$this->db->where('('.$d_where.')');
                 }
                 
                if ($over_4_and_5_star !='') {
                $d_rate = implode('OR ',$rate);
		$this->db->where('('.$d_rate.')');
                 }
                 if ($new_in_pixxi !='') {
                $d_new = implode('OR ',$new);
		$this->db->where('('.$d_new.')');
                $this->db->order_by("seller.addedOn desc");
                 }
                //print_r($d_rating);
                 
               
                 
                if ($sort_with_discount == "y") {
                    $this->db->select('coupons.id');
                    $this->db->join('coupons','coupons.seller_ids = seller.id', 'LEFT');
                    $this->db->where('coupons.disable_date >= NOW()');
                }
                
               if ($sort_with_rating == "y") { 
                   $this->db->order_by("seller.average_rating desc");
                    //$rating1[] = " ( seller.rating desc) ";
                }
               
                //return $datas;
                $this->db->limit($per_page, $offset);
		$sql = $this->db->get_compiled_select();
		$query = $this->db->query($sql, array(clean_number($offset), clean_number($per_page)));
                $return=$query->result();
                 //echo $this->db->last_query();
                //return $return;
                if(!empty($return)){
			foreach($return as $k=>$data){
				$return[$k]->type_list='';
                                //echo 'datattattatt'.$data->seller_type;
				if(!empty($data->seller_type)){
					$type = explode(',',$data->seller_type); //print_r($type);
					$type = generate_ids_string($type);					
					$this->db->select('sellers_types.seller_type');
					$this->db->from('sellers_types');
					$this->db->where("sellers_types.id IN (" . $type . ")", NULL, FALSE);					
					$datas = $this->db->get()->result();
					//echo $this->db->last_query();
					//$return[$k]->type_list= !empty($datas)?$datas[0]->seller_type:'';
					$return[$k]->list_type= !empty($datas)?$datas:[];
				}
				
				
			}
		}
		return $return;	
	}
        
        public function getSellerRating($seller_id)
	{
		$this->db->select('seller.*');
		$this->db->from('seller');
		$this->db->where("id",$seller_id);
		$this->db->where("deleted","0");
		$this->db->where("status","1");
		$query = $this->db->get()->row();
                //echo $this->db->last_query();
		return $query;
	}
        public function deleteOrder($order_id)
	{
                $this->db->set("deleted", '1');
                //$this->db->where("order_status", 'completed');
		$this->db->where("id", $order_id);
		 $this->db->update("orders");
                return $afftectedRows = $this->db->affected_rows();
                
                //echo $this->db->last_query();
	}
         public function deleteRefund($refund_id)
	{
                $this->db->set("deleted", '1');
                //$this->db->where("refund_status", 'completed');
		$this->db->where("id", $refund_id);
		 $this->db->update("order_refund");
                return $afftectedRows = $this->db->affected_rows();
                
                //echo $this->db->last_query();
	}
        public function getUserReviewGiven($id,$user_id)
	{
                $this->db->select('product_reviews.rating');
		$this->db->from('product_reviews');
		$this->db->where("order_id",$id);
                $this->db->where("user_id",$user_id);
		$this->db->where("deleted","0");
		$this->db->where("status","1");
                $this->db->limit(1);
		$query = $this->db->get()->result();
                //echo $this->db->last_query();
		return $query;
                
                //echo $this->db->last_query();
	}
         public function isStockAvailable($pid){
		$this->db->select('*');
		$this->db->from('products');
		$this->db->where('current_stock >', '0');
		$this->db->where("id",$pid);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
                //echo $this->db->last_query();
		return !empty($data)?'1':'0';
	}
       
}
?>

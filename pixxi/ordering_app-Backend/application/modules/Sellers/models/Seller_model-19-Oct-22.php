<?php

class Seller_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	public function getUserData($user_id)
	{
		$this->db->select('users.login_id as user_login_id,users.status,user_profiles.*');
		$this->db->from('users');
		$this->db->where("users.id",$user_id);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id' , 'LEFT');
		$this->db->where("user_profiles.is_main",'1');
		$query = $this->db->get()->row();
		
		$this->db->select('user_settings.*');
		$this->db->from('user_settings');
		$this->db->where("user_settings.user_id",$user_id);
		$query5 = $this->db->get()->row();
		
		$query->settings = $query5;
		
		return $query;
	}
        public function getSellerData($user_id)
	{
		$this->db->select('*');
		$this->db->from('seller');
		$this->db->where("id", $user_id);
		$query = $this->db->get()->row();
		//echo $this->db->last_query(); die();	
		return $query;
               
	}
	
	public function updateUser($user_id,$post1){
		
		$this->db->where('user_id', $user_id);
		$res = $this->db->update('user_profiles', $post1);
		return $res;
	}
	public function updateUserSettings($user_id,$post1){
		
		$this->db->where('user_id', $user_id);
		$res = $this->db->update('user_settings', $post1);
		return $res;
	}
	
   
	
        public function getSeller()
	{		
		$this->db->select('seller.* ,location_cities.name as cname');
		$this->db->from('seller');
		$this->db->where("seller.deleted","0");
		$this->db->order_by("id", "desc");
                $this->db->join('location_cities', 'location_cities.id = seller.city' , 'LEFT');
		return $datas = $this->db->get()->result();
	}
        public function getQrCode()
	{		
		$this->db->select('qr_scan.*,seller.seller_name as sname');
		$this->db->from('qr_scan');
		$this->db->where("qr_scan.deleted","0");
		$this->db->order_by("id", "desc");
                $this->db->join('seller', 'seller.id = qr_scan.seller_id' , 'LEFT');
		return $datas = $this->db->get()->result();
	}
	public function userStatusChange($id)
	{
		$this->db->select('seller.*');
		$this->db->from('seller');
		$this->db->where("seller.id",$id);
		$data = $this->db->get()->row();
		
		if($data->status=='1')
		{
			$this->db->set("status", '0');
		}
		else
		{
			$this->db->set("status", '1');
		}
		$this->db->where("id", $id);
		return $this->db->update("seller");	
	}
	public function verifiedStatusCompany($id)
	{
		$this->db->select('users.*');
		$this->db->from('users');
		$this->db->where("users.id",$id);
		$data = $this->db->get()->row();
		
		if($data->is_admin_verified=='1')
		{
			$this->db->set("is_admin_verified", '0');
			$this->db->set("is_verified", '0');
		}
		else
		{
			$this->db->set("is_admin_verified", '1');
			$this->db->set("is_verified", '1');
		}
		$this->db->where("id", $id);
		$return = $this->db->update("users");
		//echo $this->db->last_query();		
		return $return;
	}
	public function userRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->where("id", $id);
		$return= $this->db->update("seller");
                //echo $this->db->last_query();	die();
                $this->QrCodeRemove($id);
                return $return;
	}
	public function roleList()
	{
		$this->db->select('roles.*');
		$this->db->from('roles');
		$this->db->where("roles.deleted","0");
		$this->db->where("roles.status","1");
		$this->db->order_by("id", "asc");
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
				
	}
	
	public function checkUsername($email)
	{
		$this->db->select('* ');
		$this->db->from('users');
		$this->db->where("login_id",$email);
		$query = $this->db->get()->row();
		return $query;
	}
	public function saveUser($post,$post1,$post2){
		
		$res = $this->db->insert('users', $post);
		$user_id = $this->db->insert_id();
		
		$post1['user_id']=$user_id;		
		$post2['user_id']=$user_id;
		
		$this->db->insert('user_profiles', $post1);
		$this->db->insert('user_settings', $post2);
		
		return $user_id;
	}
	public function updateUserDetails($post,$post1,$post2,$user_id){
		
		$this->db->where('id', $user_id);
		$res = $this->db->update('users', $post);
		
		$post1['modifiedBy'] =$this->session->userdata('user_id');
		$this->db->where('user_id', $user_id);
		$res2 = $this->db->update('user_profiles', $post1);
		
		$post2['modifiedBy'] =$this->session->userdata('user_id');
		$this->db->where('user_id', $user_id);
		$res3 = $this->db->update('user_settings', $post2);
		
		//pr($this->db->last_query());
		
		return $res3;
	}
        public function updateSallerDetails($post,$user_id){
		
		$this->db->where('id', $user_id);
		$res = $this->db->update('seller', $post);
		//pr($this->db->last_query());
		return $res;
	}
	public function getUserDetails($user_id)
	{		
		$this->db->select('users.login_id,users.role_ids,user_profiles.fname,user_profiles.lname,');
		$this->db->from('users');
		$this->db->where("users.id",$user_id);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id' , 'LEFT');
		$this->db->where("user_profiles.is_main",'1');
		$query = $this->db->get()->row();
		//echo $this->db->last_query();
		
		
		
		return $query;
	}
	
	public function changePasswordTemporary($password,$user_id)
	{
		//$newPassword = md5($password);		
		$this->db->set("password", $password);
		$this->db->set("is_first_login", '0');
		$this->db->where("id", $user_id);
		$res = $this->db->update("users"); 
		//echo $this->db->last_query();
		return $res;
	} 
	
	public function languageList()
	{
		$this->db->select('*');
		$this->db->from('languages');
		$this->db->where("languages.deleted","0");
		$this->db->where("languages.status","1");
		$this->db->order_by("name", "asc");
		$datas = $this->db->get()->result();
		return $datas;
	}
	public function employeeList($user_id)
	{
		$this->db->select('users.login_id as user_login_id,users.role_ids,users.status,user_profiles.id as user_profile_id,user_profiles.*');
		$this->db->from('users');
		$this->db->where("users.parent_id",$user_id);
		$this->db->join('user_profiles', 'users.id = user_profiles.user_id' , 'LEFT');
		$this->db->where("user_profiles.is_main",'1');
		$query = $this->db->get()->result();		
		return $query;
	}
	public function getUserScheduleData($day,$user_id)
	{
		$this->db->select('user_schedules.*');
		$this->db->from('user_schedules');
		$this->db->where("user_schedules.user_id",$user_id);
		$this->db->where("user_schedules.day",$day);
		$query = $this->db->get()->row();
                
		return $query;
	}
	public function addUserSchedule($post){
		return $this->db->insert('user_schedules', $post);
	}
	public function jobList(){
		$this->db->select('* ');
		$this->db->from('jobs');
		$this->db->where("status", '1');
		$this->db->where("deleted", '0');
		$this->db->order_by("title", "asc");
		$query = $this->db->get()->result();
		return $query;
	}
	public function interestList(){
		$this->db->select('* ');
		$this->db->from('interests');
		$this->db->where("status", '1');
		$this->db->where("deleted", '0');
		$this->db->order_by("title", "asc");
		$query = $this->db->get()->result();
		return $query;
	}
	public function educationList(){
		$this->db->select('* ');
		$this->db->from('educations');
		$this->db->where("status", '1');
		$this->db->where("deleted", '0');
		$this->db->order_by("title", "asc");
		$query = $this->db->get()->result();
		return $query;
	}
	public function saveSeller($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('seller', $post);
		}else{
			$res = $this->db->insert('seller', $post);
                        $res = $this->db->insert_id();
		}
		return $res;
	}
        public function getCityAllList(){
		$this->db->select('* ');
		$this->db->from('location_cities');
		$this->db->where("country_id", '48');
		$this->db->order_by("id", "asc");
		$query = $this->db->get()->result();
		return $query;
	}
        public function saveSellerType($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('sellers_types', $post);
		}else{
			$res = $this->db->insert('sellers_types', $post);
		}
		return $res;
	}
        public function getSellerTypeDetails($id){
		$this->db->select('sellers_types.*');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted","0");
		$this->db->where("sellers_types.id",$id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	}
        public function getSellerType()
	{
		$this->db->select('sellers_types.*,p_cat.seller_type as parent_cat');
		$this->db->from('sellers_types');
                $this->db->join('sellers_types as p_cat', 'p_cat.id = sellers_types.parent_id' , 'LEFT');
		$this->db->where("sellers_types.deleted","0");
		$this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
				
	} 
        public function typeStatusChange($id)
	{
		$this->db->select('sellers_types.*');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.id",$id);
		$data = $this->db->get()->row();
		
		if($data->status=='1')
		{
			$this->db->set("status", '0');
		}
		else
		{
			$this->db->set("status", '1');
		}
		$this->db->where("id", $id);
		return $this->db->update("sellers_types");	
	}
	public function SellerTypeRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("sellers_types");	
	}
        public function getSellerTypeList()
	{
		$data= array();
		$this->db->select('sellers_types.*');
		$this->db->from('sellers_types');
                $this->db->where("sellers_types.deleted","0");
                $this->db->where("status","1");
		$this->db->order_by("id", "asc");
                return $datas = $this->db->get()->result();
				
	}
        
        public function insert_qr_data($qr,$data){
               $this->db->where('seller_id', $data);
               $this->db->where("deleted","0");
                $this->db->where("status","1");
               $query = $this->db->get('qr_scan');
                $count_row = $query->num_rows();
		if($count_row==0){            
		$res = $this->db->insert('qr_scan', $qr);
                }
		return $res;
	}
        
        public function QrCodeRemove($id)
	{       //echo 'tetetttttttttttttttttttttt'.$id; 
        
        
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->where("seller_id", $id);
		$return= $this->db->update("qr_scan");
                //echo $this->db->last_query();	die();
               return $return;
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
        public function getCategoryList($parent_id="")
	{
		$this->db->select('sellers_types.*');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted","0");
		if(!empty($parent_id)){ $this->db->where("sellers_types.parent_id",$parent_id); }
		$this->db->order_by("id", "desc");
		
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
				
	}
        
        
        public function getActiveCategoryList($parent_id="0")
	{
		$this->db->select('sellers_types.*');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted","0");
		$this->db->where("sellers_types.status","1");
		$this->db->where("sellers_types.parent_id",$parent_id);
		$this->db->order_by("id", "desc");
		
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
				
	}
        public function getAllChildCategory($parent_id)
	{
		$this->db->select('sellers_types.*');
		$this->db->from('sellers_types');
		$this->db->where("sellers_types.deleted","0");
		$this->db->where("sellers_types.status","1");
		$this->db->where("sellers_types.parent_id",$parent_id);
		$this->db->order_by("id", "desc");
		
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
				
	}
        
      public function saveTableNumber($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('sellers_table', $post);
                        return $res;
		}else{
                    
                   
                       $res = $this->db->insert('sellers_table', $post);
                    //echo $this->db->last_query(); die();
                        $res = $this->db->insert_id();
		        return $res;
		}
		
	}
	public function getSellerTable()
	{
		$this->db->select('sellers_table.*,seller.seller_name as sname, qr_scan_table_wise.file as qrimage');
		$this->db->from('sellers_table');
                $this->db->join('seller', 'seller.id = sellers_table.seller_id' , 'LEFT');
                $this->db->join('qr_scan_table_wise', 'qr_scan_table_wise.table_id = sellers_table.id' , 'LEFT');
                //$this->db->group_by('seller_id'); 
		$this->db->where("sellers_table.deleted","0");
		$this->db->order_by("sellers_table.seller_id", "asc");
                $this->db->order_by("sellers_table.table_number", "asc");
		$datas = $this->db->get()->result();
                //echo $this->db->last_query(); die();
                return $datas;
				
	}
        public function getSellerTableNumber($id){
		$this->db->select('sellers_table.*');
		$this->db->from('sellers_table');
		$this->db->where("sellers_table.deleted","0");
		$this->db->where("sellers_table.id",$id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	}
        
        public function getSellerTableCount($seller_id)
	{
                $data= array();
                $this->db->select('sellers_table.*');
		$this->db->from('sellers_table');
		$this->db->where("sellers_table.deleted","0");
                $this->db->where("sellers_table.seller_id",$seller_id);
                $this->db->order_by("id", "desc");
		$data = $this->db->count_all_results();
                
                //echo $this->db->last_query(); die;
                return $data;
                //return ($data > 0)?$data: 0 ;
	}
        public function SellerTableRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("sellers_table");	
	}
         public function insert_qr_table_data($qr,$s_id,$t_id){
             
             //print_r($qr);
             //echo $s_id;
             //echo $t_id;
             //die();
               $this->db->where('seller_id', $s_id);
               $this->db->where('table_id', $t_id);
               $this->db->where("deleted","0");
               $this->db->where("status","1");
               $query = $this->db->get('qr_scan_table_wise');
                $count_row = $query->num_rows();
		if($count_row==0){            
		$res = $this->db->insert('qr_scan_table_wise', $qr);
                }
		return $res;
	}
        
        public function qrGenerate($id)
	{        $oid = base64_decode($id);
		$this->db->select('qr_scan.*');
		$this->db->from('qr_scan');
                 
		$this->db->where("qr_scan.deleted","0");
		$this->db->where("qr_scan.id",$oid);
		$datas = $this->db->get()->row();
                //echo $this->db->last_query(); die();
                return $datas;
				
	}
        public function TableqrGenerate($id)
	{        $oid = base64_decode($id);
		$this->db->select('qr_scan_table_wise.*');
		$this->db->from('qr_scan_table_wise');
                $this->db->where("qr_scan_table_wise.deleted","0");
		$this->db->where("qr_scan_table_wise.id",$oid);
		$datas = $this->db->get()->row();
                //echo $this->db->last_query(); die();
                return $datas;
				
	}
}
?>

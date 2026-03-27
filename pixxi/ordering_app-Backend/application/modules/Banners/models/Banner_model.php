<?php

class Banner_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	public function saveBanner($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('banners', $post);
		}else{
			$res = $this->db->insert('banners', $post);
		}
		return $res;
	}
	
	public function getBannerDetails($id){
		$this->db->select('banners.*');
		$this->db->from('banners');
		$this->db->where("banners.deleted","0");
		$this->db->where("banners.id",$id);
		$this->db->order_by("id", "desc");
		$data = $this->db->get()->row();
		return $data;
	} 
	public function getBanners()
	{
		$this->db->select('banners.*');
		$this->db->from('banners');
		$this->db->where("banners.deleted","0");
		$this->db->order_by("id", "desc");
		return $datas = $this->db->get()->result();
				
	} 
	public function bannerStatusChange($id)
	{
		$this->db->select('banners.*');
		$this->db->from('banners');
		$this->db->where("banners.id",$id);
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
		return $this->db->update("banners");	
	}
	public function bannerRemove($id)
	{
		$this->db->set("status", '0');
		$this->db->set("deleted", '1');
		$this->db->set("modifiedBy", $this->session->userdata('user_id'));
		$this->db->where("id", $id);
		return $this->db->update("banners");	
	}
	public function roleList($parent_id="0")
	{
		$this->db->select('roles.*');
		$this->db->from('roles');
		$this->db->where("roles.deleted","0");
		$this->db->where("roles.parent_id",$parent_id);
		$this->db->order_by("id", "asc");
		$datas = $this->db->get()->result();
		//echo $this->db->last_query();
		return $datas;
				
	}
	
}
?>

<?php

class Support_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
	
	public function saveMailbox($post,$id=""){
		if(!empty($id)){
			$this->db->where('id', $id);
			$res = $this->db->update('user_chats', $post);
		}else{
			$res = $this->db->insert('user_chats', $post);
			$id = $this->db->insert_id();
		}
		return $id;
	}	
	
	
	public function getSentMessageList($sender_id,$parent_id='0')
	{	
		$this->db->select('user_chats.* ,sender.fname as sender_fname,sender.lname as sender_lname,sender.profile_image as sender_profile_image,sender_user.login_id as sender_login_id,receiver.fname as receiver_fname,receiver.lname as receiver_lname,receiver_user.login_id as receiver_login_id ,receiver.profile_image as receiver_profile_image');
		$this->db->from('user_chats');
		$this->db->where('user_chats.deleted', '0');
		//$this->db->where('user_chats.status', '1');
		$this->db->where('user_chats.parent_id', $parent_id);
		$this->db->where('user_chats.sender_id', $sender_id);
		
		$this->db->join('user_profiles as sender', 'sender.user_id = user_chats.sender_id', 'LEFT');
		$this->db->join('users as sender_user', 'sender_user.id = user_chats.sender_id', 'LEFT');
		$this->db->join('user_profiles as receiver', 'receiver.user_id = user_chats.receiver_id' , 'LEFT');
		$this->db->join('users as receiver_user', 'receiver_user.id = user_chats.receiver_id', 'LEFT');
		$this->db->order_by("user_chats.id", "desc");
		$query = $this->db->get()->result();	
		//echo $this->db->last_query();
		return $query;
	}
	public function getReceivedMessageList($receiver_id,$parent_id='0')
	{	
		$search = '( user_chats.receiver_id='.$receiver_id.' )';
		$this->db->where($search);
		
		$this->db->select('user_chats.* ,sender.full_name as sender_full_name,sender.profile_image as sender_profile_image,receiver.full_name as receiver_full_name,receiver.profile_image as receiver_profile_image');
		$this->db->from('user_chats');
		$this->db->where('('.$search.')');
		$this->db->join('user_profiles as sender', 'sender.user_id = user_chats.sender_id', 'LEFT');
		$this->db->join('user_profiles as receiver', 'receiver.user_id = user_chats.receiver_id', 'LEFT');
		$this->db->order_by("user_chats.modifiedOn", "desc");
		$this->db->group_by("user_chats.sender_id");		
		$query = $this->db->get()->result();
		//echo $this->db->last_query(); die;
		//return $query;	
		
		if(!empty($query)){
			foreach($query as $k=>$data){
				$result[] = $this->getReceiverChatList($receiver_id,$data->sender_id,'1','0');				
			}
			arsort($result);
		}
		
		return $result;
	}
	
	public function getChatList($receiver_id,$sender_id,$limit='', $start='')
	{
		
		$search = '( user_chats.receiver_id='.$receiver_id.' AND user_chats.sender_id='.$sender_id.' ) OR ( user_chats.receiver_id='.$sender_id.' AND user_chats.sender_id='.$receiver_id.' )';
		$this->db->where($search);
		
		$this->db->select('user_chats.* ,sender.full_name as sender_full_name,sender.profile_image as sender_profile_image,receiver.full_name as receiver_full_name,receiver.profile_image as receiver_profile_image ');
		$this->db->from('user_chats');
		$this->db->where('('.$search.')');
		$this->db->join('user_profiles as sender', 'sender.user_id = user_chats.sender_id', 'LEFT');
		$this->db->join('user_profiles as receiver', 'receiver.user_id = user_chats.receiver_id', 'LEFT');
		//$this->db->order_by("DATE(addedOn)", "desc");
		$this->db->order_by("user_chats.id", "asc");
		if ($limit != '' && $start != '') {
		   $this->db->limit($limit, $start);
		}
		if($limit=='1'){
			$query = $this->db->get()->row();
		}else{
			$query = $this->db->get()->result();
		}
		return $query;	
	}
	public function getReceiverChatList($receiver_id,$sender_id,$limit='', $start='')
	{
		
		$search = '( user_chats.receiver_id='.$receiver_id.' AND user_chats.sender_id='.$sender_id.' )';
		$this->db->where($search);
		
		$this->db->select('user_chats.* ,sender.full_name as sender_full_name,sender.profile_image as sender_profile_image,receiver.full_name as receiver_full_name,receiver.profile_image as receiver_profile_image ');
		$this->db->from('user_chats');
		$this->db->where('('.$search.')');
		$this->db->join('user_profiles as sender', 'sender.user_id = user_chats.sender_id', 'LEFT');
		$this->db->join('user_profiles as receiver', 'receiver.user_id = user_chats.receiver_id', 'LEFT');
		//$this->db->order_by("DATE(addedOn)", "desc");
		$this->db->order_by("user_chats.id", "desc");
		if ($limit != '' && $start != '') {
		   $this->db->limit($limit, $start);
		}
		if($limit=='1'){
			$query = $this->db->get()->row();
		}else{
			$query = $this->db->get()->result();
		}
		return $query;	
	}
	public function statusChange($id)
	{
		$this->db->select('user_chats.*');
		$this->db->from('user_chats');
		$this->db->where("user_chats.id",$id);
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
		return $this->db->update("user_chats");	
	}
	
	
}
?>

<?php

class Frontend_model extends CI_Model {

    public function __construct() {		
		parent::__construct();
    }
    public function activeAccount($login_id){
       
            $post['is_verified'] = '1';
            $post['status'] = '1';
            $this->db->where('login_id', $login_id);
            $res = $this->db->update('users', $post);
    }
    
    public function PaymentReceved($amount,$tax){
        
    }
	
}
?>

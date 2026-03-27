<?php defined('BASEPATH') or exit('No direct script access allowed');

/**
 * CodeIgniter-HMVC
 *
 * @package    CodeIgniter-HMVC
 * @author     N3Cr0N (N3Cr0N@list.ru)
 * @copyright  2019 N3Cr0N
 * @license    https://opensource.org/licenses/MIT  MIT License
 * @link       <URI> (description)
 * @version    GIT: $Id$
 * @since      Version 0.0.1
 * @filesource
 *
 */

		
class Frontend extends FrontendController
{
    /**
     * [__construct description]
     *
     * @method __construct
     */
    public function __construct()
    {
        parent::__construct();
	$this->load->model('Frontend_model');	
		
    }

    
    public function confirm_activation($login_id){
        $data = array();		
        $data['header']['site_title'] = 'Confirm Account Email';
        $email = base64_decode($login_id);
        $this->Frontend_model->activeAccount($email);      
        $this->load->view('confirm_activation', $data); 
          
    }
    
    //public function payment($amount,$buyer_email){
    public function payment($amount,$tax,$description,$email){
        $data = array();		
        $data['header']['site_title'] = 'Payment';
        $data['amount'] = $amount;
        $data['tax'] = $tax;
        $data['email'] = $email;
        $data['description'] = $description;
        
        $this->Frontend_model->PaymentReceved($amount,$tax,$description,$email);      
        $this->load->view('payment_form', $data); 
          
    }
    
     public function responseUrl(){
        $data = array();		
        $data['header']['site_title'] = 'Response Page';
        
        
        //$this->Frontend_model->responsePage();      
        $this->load->view('response', $data); 
          
    }
	
    public function confirmationUrl(){
        $data = array();		
        $data['header']['site_title'] = 'Confirmation Page';
        
        
        //$this->Frontend_model->responsePage();      
        $this->load->view('confirmationUrl', $data); 
          
    }
	
}

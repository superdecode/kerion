<?php defined('BASEPATH') or exit('No direct script access allowed');

require APPPATH . 'libraries/REST_Controller.php';
class Api extends REST_Controller
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
    public function __construct(){
        parent::__construct();
		$this->load->model('Api_model');
        $this->load->helper(array('form'));
		
        $this->load->library(array('form_validation','image_lib'));
		
		$config = array(
                'protocol'  => 'smtp',
                'smtp_host' => 'mail.xxxxx.com',
                'smtp_port' => 465,
                'smtp_user' => 'no-reply@xxxxxx.com',
                'smtp_pass' => 'xxxxxxxx',
                'mailtype'  => 'html',
                'charset'   => 'utf-8'
		);
		$this->load->library('email', $config);
    }
	
	public function index_get(){
		$this->response(['status' => '0', 'message' => 'Endpoint not specified'], REST_Controller::HTTP_NOT_FOUND);
	}

	public function settings_get(){
		$data['status']='1';
		$data['settings_image_url']=base_url('assets/uploads/system_images/');
		$settings = $this->Api_model->getSettings();			
		$data['settings'] = $settings;
		$data['message']='Éxito';$data['message_tr']='Başarı';
		
        $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function countries_get(){       
		$data['status']='1';		
		$countryList = $this->Api_model->countryList();
		$data['data'] = $countryList;
		$data['message']='Éxito';$data['message_tr']='Başarı';
		
        $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function states_post(){     
		$data['status']='1';
		$config = array(
            array(
                'field' => 'country_id',
                'label' => 'Country Id',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);			
			$country_id =$post['country_id'];
			$data['data']=$this->Api_model->stateList($country_id);
			$data['message']='Éxito';$data['message_tr']='Başarı';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
        $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function cities_post(){       
		$data['status']='1';
		$config = array(
            array(
                'field' => 'country_id',
                'label' => 'Country Id',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);				
			$country_id =$post['country_id'];
			$data['data']=$this->Api_model->cityList($country_id);
			$data['message']='Éxito';$data['message_tr']='Éxito';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        //$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
        $this->response($data, REST_Controller::HTTP_OK);
	}
	
	
	
	public function home_post(){
		$data['status']='1';
		$data['banner_images'] = base_url('assets/uploads/banner_images/');	
		$data['product_image_url'] = base_url('assets/uploads/files_manager/');
                $data['seller_type_image'] = base_url('assets/uploads/seller_type_images/');
		
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim'
            ),
             array(
                'field' => 'location',
                'label' => 'Banner Location',
                'rules' => 'trim'
            )        

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
                        $location =$post['location'];
                        $user_id =$post['user_id'];
			$post = $this->security->xss_clean($post);	
			//$data['datas'] = $this->Api_model->get_home_products($user_id, $offset, $per_page);
                        $data['banners'] = $this->Api_model->BannerList($location);
                        $sellertype = $this->Api_model->SellerTypeImage('0');
                        
                        if(!empty($sellertype)){
                            foreach($sellertype as $k=> $rows)
                            { 
                                $sellertype[$k]->is_child= $this->Api_model->ischildCategorySeller($rows->id);
                            }
                        }
                        $data['sellertypeimage']= $sellertype;
                        //$data['recomended'] = $this->Api_model->RatingList($user_id);
                        $data['recomended'] = $this->Api_model->Recomended_products($user_id);
                       
			$data['message']='Éxito';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));		
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}
        
        public function seller_details_post(){
		
                $data['seller_image'] = base_url('assets/uploads/user_images/');
                $data['cat_image'] = base_url('assets/uploads/files_manager/');
                $data['product_image_url'] = base_url('assets/uploads/files_manager/');
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'dine_in',
                'label' => 'Dine in',
                'rules' => 'trim'
            ),
            array(
                'field' => 'take_out',
                'label' => 'Take out',
                'rules' => 'trim'
            )        
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$get['user_id'] =$post['user_id'];
			$sellerid =$post['seller_id'];
                        $cateid =$post['cat_id'];
                        $dine_in =$post['dine_in'];
                        $take_out =$post['take_out'];
                        
			$res = $this->Api_model->sellerDetails($sellerid);
                        if(!empty($res)){
                          $data['status']='1';   
                       //echo 'childcate'. $res->chld_category_id;
                        $subcategory = $this->Api_model->sellersubcategory($res->chld_category_id);
                        $sellerSchedules = $this->Api_model->sellerSchedules($res->id);
                        
                        $product = $this->Api_model->sellerProducts($sellerid,$post['user_id'],$dine_in,$take_out);
                        /*foreach($product_list as $k=>$rows){
                            $oid =$rows->option_ids; 
                            $oid_arr = explode (",", $oid);
                        
                            //print_r($oid_arr);
                            if(!empty($oid_arr)){
                                foreach($oid_arr as $k2=>$option_ids)
                                {
                                   $option[] = $this->Api_model->optionName($option_ids);

                                } 
                            
                            }
                            $product_list[$k]->option_list=$option;
                        } */
                        //$category_search = $this->Api_model->sellerCategorySearch($cateid);
                        $seller_category = $this->Api_model->sellerCategory($sellerid);
                        
                        $data['details']= $res;
                        
                        $data['details']->subcategory= $subcategory;
                        $data['details']->shop_schedules= $sellerSchedules;
                        $data['category']= $seller_category;
                        $data['product']= $product;
                        //$data['products']=$product_list;
                        $data['message']='success';
			//$data['message_tr']= $res[1];
			//$data['count']= count($this->Api_model->favourite_of_seller($post['seller_id']));
                        }
                        else{
                            $data['status']='0';
                        }
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
        
        public function seller_subcategory_post(){
              
		$data['status']='1';
                $data['seller_type_image'] = base_url('assets/uploads/seller_type_images/');
		$config = array(
            array(
                'field' => 'category_id',
                'label' => 'Category Id',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			
                        $category_id =$post['category_id'];
                        $data['sub_category'] = $this->Api_model->sellerSubcategorydetails($category_id);
                        //$data['details']= $res;
                        
                        
                        $data['message']='success';
			//$data['message_tr']= $res[1];
			//$data['count']= count($this->Api_model->favourite_of_seller($post['seller_id']));
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
        
/*************** Category List Developer*******************/    
        
public function category_list_post(){
		$data['status']='1';	
                $data['cat_image'] = base_url('assets/uploads/files_manager/');
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$get['user_id'] =$post['user_id'];
			$sellerid =$post['seller_id'];
                        $cateid =$post['cat_id'];
                        
                        $seller_category = $this->Api_model->sellerCategory($sellerid);
                        $data['category']= $seller_category;
                        $data['message']='success';
			//$data['message_tr']= $res[1];
			//$data['count']= count($this->Api_model->favourite_of_seller($post['seller_id']));
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}        
        
        
/*************** Seller List Developer*******************/ 
        
        public function seller_list_post(){
		$data['status']='1';
		$data['seller_image'] = base_url('assets/uploads/user_images/');
		
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'search',
                'label' => 'Search',
                'rules' => 'trim'
            ),
            array(
                'field' => 'parent_id',
                'label' => 'Parent id',
                'rules' => 'trim'
            ),
             array(
                'field' => 'child_id',
                'label' => 'Child id',
                'rules' => 'trim'
            ),        
            array(
                'field' => 'city',
                'label' => 'city',
                'rules' => 'trim'
            ),
            array(
                'field' => 'dine_in',
                'label' => 'dine_in',
                'rules' => 'trim'
            ),
            array(
                'field' => 'take_out',
                'label' => 'take_out',
                'rules' => 'trim'
            ),        

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post      = $this->input->post();
                        $search    = $post['search'];
                        $parent_id = $post['parent_id'];
                        $child_id  = $post['child_id'];
                        $city      = $post['city'];
			$post      = $this->security->xss_clean($post);	
			
                        $sellerlist = $this->Api_model->SellerList($search,$parent_id,$child_id,$city);
                        $return = [];
                        if(!empty($sellerlist)){
                            foreach($sellerlist as $k=>$seller_schedule)
                            {
                                $sellerlist[$k]->user_schedule = $this->Api_model->sellerSchedules($seller_schedule->id);
                            }
                        }
                        //print_r($data["sellerlist"]);
                        /*foreach($data["sellerlist"] as $k=>$rows)
                        {
                            $seller_type =$rows->seller_type;
                            $type_arr = explode (",", $seller_type);
                            //print_r($type_arr);
                            if(!empty($type_arr))
                            {
                                foreach($type_arr as $k2=>$type_ids)
                                {
                                 $type[] = $this->Api_model->sellerType($type_ids);

                                } 
                                print_r($type);
                            }
                            //$sellerlist[$k]->type_list=$type;
                        } */
                        //$data['sellerlist']=$sellerlist;
                         //$data["sellerlist"]->type_list=$type;
                        
                        $data['seller_list']= $sellerlist;
                        $data['message']='Éxito';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        	
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}
        
/*************** Message List Developer*******************/
        
  public function message_list_post(){
		$data['status']='1';
                $data['seller_image'] = base_url('assets/uploads/user_images/');
		
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
         
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
                        $post = $this->security->xss_clean($post);
                        $user_id    = $post['user_id'];
                        $data['message_list'] = $this->Api_model->MessageList($user_id);
                        
                        
                        foreach($data['message_list'] as $k=>$rows){
                            $sid =$rows->seller_id;
                            $uid =$rows->user_id;
                            $data['message_list'][$k]->seen_count = $this->Api_model->SeenCount($sid,$uid);
                            $data['message_list'][$k]->message = $this->Api_model->MessageSellerWise($sid,$uid);
                            
                            
                            //$data['seen_count'] = $this->Api_model->SeenCount($sid,$uid);
                        }
                        //$data['message_list']->message =$message;
                        
                        $data['message']='Éxito';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        	
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}
        
  public function message_seller_list_post(){
		$data['status']='1';
		
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
           array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            ),         
         
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
                        $user_id =$post['user_id'];
                        $seller_id =$post['seller_id'];
                        
                        $post = $this->security->xss_clean($post);
                        $data['message_list'] = $this->Api_model->MessageAllSellerWise($seller_id,$user_id);
                       
                        //$data['message_list']->message =$message;
                        $data['message']='Éxito';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        	
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}      
        
 /*************** Content Page Developer*******************/ 
        
 public function content_post(){
		$data['status']='1';
		$data['content_image_url'] = base_url('assets/uploads/content_images/');	
		
		$config = array(
            array(
                'field' => 'slug',
                'label' => 'User Id',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);				
			$slug =$post['slug'];
			$data['faq']=$this->Api_model->getContentBySlug($slug);
			$data['message']='Éxito';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}       

/*************** Faq Page Developer*******************/ 
        
 public function faq_post(){
		$data['status']='1';
		
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'user_id',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);				
			$data['faq']=$this->Api_model->getFaq();
			$data['message']='Éxito';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}  
        
/*************** Feedback Form Developer*******************/ 
        
public function coupon_list_post(){
    
   $data['status']='1';

        $config = array(
    array(
        'field' => 'user_id',
        'label' => 'user_id',
        'rules' => 'trim|required'
    ),
     array(
        'field' => 'seller_id',
        'label' => 'Seller id',
        'rules' => 'trim'
    ),        
            
    );
    $this->form_validation->set_rules($config);
            if ($this->form_validation->run()) 
    {
                    $post = $this->input->post();
                    $post = $this->security->xss_clean($post);
                    $data['coupon_image'] = base_url('assets/uploads/files_manager/');
                    $userid =$post['user_id'];
                    $seller_id =$post['seller_id'];
                    /*$data['sellerlist'] = $this->Api_model->SellerList($search,$type_id);
                    if(!empty($data['list'])){
                        foreach($data['list'] as $k=> $rows)
                        {
                        
                        }
                        }*/
                    
                    
                    $data['coupon_list']=$this->Api_model->getCoupon($userid,$seller_id);
                    $data['message']='Éxito';			
            }else{
                    $data['status']='0';
                    $data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));			
            }
            $this->response($data, REST_Controller::HTTP_OK);
	} 

public function menu_item_search_post(){
    
   $data['status']='1';

        $config = array(
    array(
        'field' => 'user_id',
        'label' => 'user_id',
        'rules' => 'trim|required'
    ),
     array(
        'field' => 'seller_id',
        'label' => 'Seller id',
        'rules' => 'trim|required'
    ),
    array(
        'field' => 'menu_name',
        'label' => 'Menu name',
        'rules' => 'trim'
    )        
            
    );
    $this->form_validation->set_rules($config);
            if ($this->form_validation->run()) 
    {
                    $post = $this->input->post();
                    $post = $this->security->xss_clean($post);
                    $data['product_image'] = base_url('assets/uploads/files_manager/');
                    $userid      = $post['user_id'];
                    $seller_id   = $post['seller_id'];
                    $item_name = $post['menu_name'];
                    
                    $product_list =$this->Api_model->getItemSerach($userid,$seller_id,$item_name);
                    foreach($product_list as $k=>$rows){
                            $oid =$rows->option_ids; 
                            $oid_arr = explode (",", $oid);
                        
                            //print_r($oid_arr);
                            if(!empty($oid_arr)){
                                foreach($oid_arr as $k2=>$option_ids)
                                {
                                   $option[] = $this->Api_model->optionName($option_ids);

                                } 
                            
                            }
                            $product_list[$k]->option_list=$option;
                        }
                        $data['item_search']=$product_list;
                    
                    $data['message']='Éxito';			
            }else{
                    $data['status']='0';
                    $data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));			
            }
            $this->response($data, REST_Controller::HTTP_OK);
	}        
        
public function feedback_post(){
		$this->feedback_images=realpath(APPPATH . '../assets/uploads/feedback_images/');
		$data['status']='1';
		$data['feedback_images_url']=base_url('assets/uploads/feedback_images/');
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'experience',
                'label' => 'Experience',
                'rules' => 'trim|required'
            ),        
	    array(
                'field' => 'email',
                'label' => 'Email',
                'rules' => 'trim'
            ), 
            array(
                'field' => 'phone',
                'label' => 'Phone',
                'rules' => 'trim'
            ),
	    array(
                'field' => 'message',
                'label' => 'Message',
                'rules' => 'trim'
            ),
            array(
                'field' => 'feedback_type',
                'label' => 'Feedback Type',
                'rules' => 'trim'
            )        

        );
        $this->form_validation->set_rules($config);
	   if ($this->form_validation->run()) 
            {
                $post = $this->input->post();
                $post = $this->security->xss_clean($post);

                
                $post['user_id'] = $post['user_id'];
                $post['experience'] = $post['experience'];
                $post['email'] = $post['email'];
                $post['phone'] = $post['phone'];
                $post['message'] = $post['message'];
                $post['feedback_type'] = $post['feedback_type'];
                
                $feedback_id =$this->Api_model->addFeedback($post);

                
			/*$image=$post['image'];
			if($_FILES['feedback_image']['name']!="")
			{					
				if(!empty($image))
				{ 
					if (file_exists($this->feedback_images.'/'.$image)) {
						unlink($this->feedback_images.'/'.$image); 
					}					
				}
				$value = $_FILES['feedback_image']['name'];
				//echo $value;
				
				$config = array(
						'file_name' => 'feedback_'.$post['user_id'].'_'.time(),
						'allowed_types' => 'png|jpg|jpeg|gif|', //jpg|jpeg|gif|
						'upload_path' => $this->feedback_images,
						'max_size' => 20000
				);

				$this->upload->initialize($config);
				if ( ! $this->upload->do_upload('feedback_image')) {
						 // return the error message and kill the script
						$data['status']='0';
						$data['message']=$this->upload->display_errors();
				}
                                $image_data = $this->upload->data();
                                $image=$image_data['file_name'];
				
			}*/
                
                //************************************************************//
			$files = $_FILES;
			//$data['files']=$files;
			if(!empty($_FILES['images']['name'][0])){
				$cpt = count($_FILES['images']['name']);
				//$data['cpt']=$cpt;
				for($i=0; $i<$cpt; $i++)
				{
					if(!empty($files['images']['name'][$i])){
						$_FILES['images']['name']= $files['images']['name'][$i];
						$_FILES['images']['type']= $files['images']['type'][$i];
						$_FILES['images']['tmp_name']= $files['images']['tmp_name'][$i];
						$_FILES['images']['error']= $files['images']['error'][$i];
						$_FILES['images']['size']= $files['images']['size'][$i];    

						$config = array(
								'file_name' => 'feedback_'.time(),
								'allowed_types' => '*', //jpg|jpeg|gif|
								'upload_path' => $this->feedback_images,
								'max_size' => 20000
						);
						$this->upload->initialize($config);
						
						if ( ! $this->upload->do_upload('images')) {
							 // return the error message and kill the script
							$data['status']='0';
							$data['message']=$this->upload->display_errors();
						}else{
							$dataInfo = $this->upload->data();
							$reviewImageSave['image'] = $dataInfo['file_name'];
							$reviewImageSave['feedback_id'] = $feedback_id;
							$reviewImageSave['user_id'] =$post['user_id'];
							$res = $this->Api_model->feedbackImageSave($reviewImageSave);
							//$data['dataInfo']=$dataInfo;
						}				
					}				
				}
			}
			//************************************************************//
			//$post['image'] = $image;
			$data['message']='Feedback Sent Éxitofully';
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}       
        
/*************** Change Password Developer*******************/         
 
	public function change_password_post(){
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');
		$data['status']='1';
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'current_password',
                'label' => 'Current Password',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'new_password',
                'label' => 'New Password',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'verify_password',
                'label' => 'Verify Password',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$user_id = $post['user_id'];
			$current_password = $post['current_password'];
			$verify_password = $post['verify_password'];
			$new_password = $post['new_password'];
			
			if($new_password==$verify_password){				
				$current_password_chk = $this->Api_model->checkCurrentPassword($current_password,$user_id);
				if(empty($current_password_chk)){
					$data['status']='0';
					$data['message']='¡La contraseña antigua no es correcta!';
				}else{
					$previous_password_chk = $this->Api_model->checkCurrentPassword($verify_password,$user_id);
					if(!empty($previous_password_chk)){
						$data['status']='0';
						$data['message']='¡La nueva contraseña es igual a la contraseña anterior!';
					}else{
						$passwordChange = $this->Api_model->changePassword($verify_password,$user_id);
						if($passwordChange==TRUE){
							$data['message']='Contraseña actualizada correctamente';
						}else{						
							$data['status']='0';
							$data['message']='¡Contraseña no cambiada!';
						}
					}
				}
			}else{				
				$data['status']='0';
				$data['message']='¡Verificar contraseña!';
			}
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}      
//***************************************USER SECTION*********************************************************************//
	
	public function user_login_post(){
		$data['status']='1';
		$data['user_image_url']=base_url('assets/uploads/user_images/');
		$config = array(
            array(
                'field' => 'login_id',
                'label' => 'Login Id',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'password',
                'label' => 'Password',
                'rules' => 'trim'
            ),
			array(
                'field' => 'device_type',
                'label' => 'Device Type',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'device_id',
                'label' => 'Device Id',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'login_type',
                'label' => 'Login Type',
                'rules' => 'trim'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$post['password'] =md5($post['password']);
			$checkUser=$this->Api_model->checkUser($post);
			if ($this->Api_model->is_max_login_attempts_exceeded($post['login_id']))
			{
				$data['status']='0';
				$data['message']='Bloqueado temporalmente.  Inténtalo de nuevo más tarde.';	
					
				
			}else{
				if(!empty($checkUser)){
					if($checkUser->role_ids=='2'){
						if($checkUser->is_verified=='1'){
							$res=$this->Api_model->getUserData($checkUser->id);
							// Lockout Function
							if ($this->Api_model->is_max_login_attempts_exceeded($res->user_login_id))
							{
								$data['status']='0';
								$data['message']='Bloqueado temporalmente.  Inténtalo de nuevo más tarde.';
								
							}
							$this->Api_model->clear_login_attempts($res->user_login_id);
							if($post['device_type']=='ios'){
								$update['ios_device_id']=$post['device_id'];
							}else{
								$update['android_device_id']=$post['device_id'];
							}
							$update['login_type']=$post['login_type'];
							$this->Api_model->updateUser($res->user_id,$update);
							$data['user_details']=$res;
							$data['message']='Éxito';
                                                        
						}else{
							$data['status']='0';
							$data['message']='Tu cuenta no está verificada. ¡Revisa tu bandeja de entrada o carpeta de correo no deseado y valida tu cuenta!';	
								
						}
					}else{
						$data['status']='0';
						$data['message']='Su cuenta no tiene ningún acceso de inicio de sesión aquí';
						
					}
				}else{
					$this->Api_model->increase_login_attempts($post['login_id']);
					$data['status']='2';
					$data['message']='¡Autenticación incorrecta!';
					
				}
			}
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));		
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function user_profile_details_post(){
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');
		$data['status']='1';
		$data['user_image_url']=base_url('assets/uploads/user_images/');
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$user_id = $post['user_id'];
			//$follower_id = $post['follower_id'];
			$data['user_details']=$this->Api_model->getUserData($user_id,$follower_id);
			$data['message']='Éxito';
                        //$data['message_tr']='Başarı';	
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function forgot_password_post(){
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');
		$data['status']='1';
		$config = array(
            array(
                'field' => 'email',
                'label' => 'Email',
                'rules' => 'trim|required|valid_email'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$email = $post['email'];
			$checkEmail = $this->Api_model->checkUsername($post['email']);
			if(!empty($checkEmail)){
				
				//$otp =substr( $this->googleauthenticator->createSecret(),0,4);
				$digits = 4;
                                $otp=rand(pow(10, $digits-1), pow(10, $digits)-1);
				$users['otp'] = $otp;
				$result = $this->Api_model->updateUser($checkEmail->id,$users);
				
				$this->email->set_mailtype("html");
				$this->email->set_newline("\r\n");
				
				$email_temp = get_email_template('user_forgot_password');
				$msg = str_replace("[var.pass_otp]",$otp,$email_temp->content);
				$msg = str_replace("[var.system_name]",get_settings_value('system_name'),$msg);
				
				$this->email->to($post['email']);
				//$this->email->bcc('sayanoffline@gmail.com');
				$this->email->from($email_temp->email_from);
				$this->email->subject($email_temp->email_subject);
				$this->email->message($msg);
				$email_send = $this->email->send();
				
				$data['user_id']=$checkEmail->id;
				$data['otp']=$otp;
				$data['email_send']=$email_send;
				$data['message']='Se envió una contraseña de un solo uso a su ID de correo electrónico';
				
				
			}else{
				$data['status']='0';
				$data['message']='No se encontró el ID de correo electrónico';	
					
			}
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
        public function update_otp_verify_post(){
		
		$data['status']='1';
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'otp',
                'label' => 'OTP',
                'rules' => 'trim|required'
            ),
			
		
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$user_id = $post['user_id'];
			$otp = $post['otp'];
			//$verify_password = $post['verify_password'];
			//$new_password = $post['new_password'];
							
				$current_password_chk = $this->Api_model->checkOTP($otp,$user_id);
				if(empty($current_password_chk)){
					$data['status']='0';
					$data['message']='Código de verificación no coincide';
					
				}
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function update_password_post(){
		//$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');
		$data['status']='1';
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'otp',
                'label' => 'OTP',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'new_password',
                'label' => 'New Password',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'verify_password',
                'label' => 'Verify Password',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$user_id = $post['user_id'];
			$otp = $post['otp'];
			$verify_password = $post['verify_password'];
			$new_password = $post['new_password'];
			
			if($new_password==$verify_password){				
				$current_password_chk = $this->Api_model->checkOTP($otp,$user_id);
				if(empty($current_password_chk)){
					$data['status']='0';
					$data['message']='Código de verificación no coincide';
					
				}else{
					$passwordChange = $this->Api_model->changePassword($verify_password,$user_id);
					if($passwordChange==TRUE){
						$data['message']='Contraseña actualizada correctamente';
						
					}else{						
						$data['status']='0';
						$data['message']='¡Contraseña no cambiada!';
						
					}
				}
			}else{				
				$data['status']='0';
				$data['message']='¡Verificar contraseña!';
				
			}
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function user_registration_post(){
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');
		$data['status']='1';
		$config = array(
             array(
                'field' => 'fname',
                'label' => 'Fname',
                'rules' => 'trim|required'
            ),
                  
            array(
                'field' => 'email',
                'label' => 'Email',
                'rules' => 'trim|required|valid_email'
            ),
			array(
                'field' => 'password',
                'label' => 'Password',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'confirm_password',
                'label' => 'Confirm Password',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'role_id',
                'label' => 'Role',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'phone_no',
                'label' => 'Phone',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			
			$users['role_ids'] =$post['role_id'];
			$users['login_id'] =$post['email'];
			//$users['login_id'] = generateUserLoginId();
			$users['password'] =md5($post['password']);
			$users['addedOn'] =gmdate('Y-m-d H:i:s');
			$users['is_first_login'] ='1';
			$users['status'] ='0';
			$users['is_verified'] ='0';
			
			$user_profiles['fname'] =$post['fname'];
                        $user_profiles['lname'] =$post['lname'];
			$user_profiles['email'] =$post['email'];
			$user_profiles['phone_no'] =$post['phone_no'];
			$user_profiles['addedOn'] =gmdate('Y-m-d H:i:s');
						
			$checkUsername = $this->Api_model->checkUsername($post['email']);
			if(!empty($checkUsername)){
				$data['status']='0';
				$data['message']='El correo electrónico ya se encuentra registrado';
				//$data['message_tr']='Yinelenen E-posta Kimliği Bulundu';
			}else{
				if($post['password']==$post['confirm_password']){
					
					$result = $this->Api_model->saveUser($users,$user_profiles);
					if(!empty($result)){
						//$data['user_image_url']=base_url('assets/uploads/user_images/');
						$data['user_details']=$this->Api_model->getUserData($result);
						
												
						$email_temp = get_email_template('new_user_registration');
						$msg = str_replace("[var.login_id]",$users['login_id'],$email_temp->content);
						$msg = str_replace("[var.password]",$post['password'],$msg);
						$msg = str_replace("[var.full_name]",$post['fname'] .' '. $post['lname'],$msg);
						$msg = str_replace("[var.system_name]",get_settings_value('system_name'),$msg);
						
						$this->email->set_mailtype("html");
						$this->email->set_newline("\r\n");
						$this->email->to($post['email']);
						//$this->email->bcc('sayanoffline@gmail.com');
						$this->email->from($email_temp->email_from);
						$this->email->subject($email_temp->email_subject);
						$this->email->message($msg);
						//$this->email->send();
                                                
                                                //*******Email Sent to User*******//
					$confirmation_url = base_url('Frontend/confirm_activation/'.base64_encode($users['login_id']));
					$this->email->set_mailtype("html");
					$this->email->set_newline("\r\n");
					
					$email_temp2 = get_email_template('email_confirmation');
					//$email_temp2->content = $this->load->view('activation_email_template', $data,TRUE);
					$msg2 = str_replace("[var.first_name]",$user_profiles['fname'],$email_temp2->content);					
					$msg2 = str_replace("[var.confirmation_link]",$confirmation_url,$msg2);
					$msg2 = str_replace("[var.system_name]",get_settings_value('system_name'),$msg2);
					
					$this->email->to($post['email']);
					//$this->email->to('demo@gmail.com');
					//$this->email->bcc('demo@xxxxx.com');
					$this->email->from($email_temp2->email_from);
					$this->email->subject($email_temp2->email_subject);
					$this->email->message($msg2);
					$this->email->send();
					//*******************************//
											
						
						$data['message']='Te has registrado exitosamente. ¡Solo estas a un paso de completar tu registro. Simplemente revisa tu bandeja de entrada o carpeta de correo no deseado y valida tu cuenta!';
						//$data['message_tr']='Başarıyla Kaydoldunuz!!';
					}else{
						$data['status']='0';
						$data['message']='Error de registro';				
						//$data['message_tr']='Error de registro';				
					}					
					
				}else{
					$data['status']='0';
					$data['message']='¡Confirmar contraseña!';
				}
			}
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
		
	
		$this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function seller_registration_post(){
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');
		$data['status']='1';
		$config = array(
            array(
                'field' => 'email',
                'label' => 'Email',
                'rules' => 'trim|required|valid_email'
            ),
			array(
                'field' => 'password',
                'label' => 'Password',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'confirm_password',
                'label' => 'Confirm Password',
                'rules' => 'trim|required'
            ),
			array(
                'field' => 'role_id',
                'label' => 'Role',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			
			$users['role_ids'] =$post['role_id'];
			$users['login_id'] =$post['email'];
			//$users['login_id'] =generateUserLoginId();
			$users['password'] =md5($post['password']);
			$users['addedOn'] =gmdate('Y-m-d H:i:s');
			$users['is_first_login'] ='1';
			$users['status'] ='1';
			
			$user_profiles['shop_name'] =$post['shop_name'];
			$user_profiles['fname'] =$post['fname'];
			$user_profiles['lname'] =$post['lname'];
			$user_profiles['email'] =$post['email'];
			$user_profiles['phone_no'] =$post['phone_no'];
			$user_profiles['country_id'] =$post['country_id'];
			$user_profiles['state_id'] =$post['state_id'];
			$user_profiles['city_id'] =$post['city_id'];
			$user_profiles['address'] =$post['address'];
			
			$user_profiles['sales_categories'] =$post['sales_categories'];
			$user_profiles['company'] =$post['company'];
			$user_profiles['company_type_id'] =$post['company_type_id'];
			$user_profiles['tax_number'] =$post['tax_number'];
			$user_profiles['commercial_reg_no'] =$post['commercial_reg_no'];
			$user_profiles['tax_office_province'] =$post['tax_office_province'];
			$user_profiles['tax_office_directorate'] =$post['tax_office_directorate'];
			
			$user_profiles['account_holder'] =$post['account_holder'];
			$user_profiles['bank_name'] =$post['bank_name'];
			$user_profiles['bank_branch_name'] =$post['bank_branch_name'];
			$user_profiles['bank_branch_code'] =$post['bank_branch_code'];
			$user_profiles['back_account_no'] =$post['back_account_no'];
			$user_profiles['iban'] =$post['iban'];
			
			
			$user_profiles['addedOn'] =gmdate('Y-m-d H:i:s');
						
			$checkUsername = $this->Api_model->checkUsername($post['email']);
			if(!empty($checkUsername)){
				$data['status']='0';
				$data['message']='El correo electrónico ya se encuentra registrado';
			}else{
				if($post['password']==$post['confirm_password']){
					
					$result = $this->Api_model->saveUser($users,$user_profiles);
					if(!empty($result)){
						$data['user_image_url']=base_url('assets/uploads/user_images/');
						$data['user_details']=$this->Api_model->getUserData($result);
						
						
						
						$email_temp = get_email_template('new_user_registration');
						$msg = str_replace("[var.login_id]",$users['login_id'],$email_temp->content);
						$msg = str_replace("[var.password]",$post['password'],$msg);
						$msg = str_replace("[var.full_name]",$post['full_name'],$msg);
						$msg = str_replace("[var.system_name]",get_settings_value('system_name'),$msg);
						
						$this->email->set_mailtype("html");
						$this->email->set_newline("\r\n");
						$this->email->to($post['email']);
						$this->email->bcc('sayanoffline@gmail.com');
						$this->email->from($email_temp->email_from);
						$this->email->subject($email_temp->email_subject);
						$this->email->message($msg);
						$this->email->send();
											
						
						$data['message']='You Have Registered Éxitofully!!';
					}else{
						$data['status']='0';
						$data['message']='Error de registro';				
					}					
					
				}else{
					$data['status']='0';
					$data['message']='¡Confirmar contraseña!';
				}
			}
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
	
		$this->response($data, REST_Controller::HTTP_OK);
	}
	
	
	
	public function user_address_list_post(){
		
		$data['status']='1';
		$data['message']='Éxito';$data['message_tr']='Başarı';
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);			
			$user_id = $post['user_id'];
			$data['address_list']=$this->Api_model->getUserAddressList($user_id);
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}
	
	

	public function user_profile_update_post(){
		$this->user_images=realpath(APPPATH . '../assets/uploads/user_images/');
		$data['status']='1';
		$data['user_image_url']=base_url('assets/uploads/user_images/');
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'fname',
                'label' => 'fname',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'lname',
                'label' => 'lname',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'phone',
                'label' => 'phone',
                'rules' => 'trim|required'
            ),        
            array(
                'field' => 'profile_avatar',
                'label' => 'Profile Avatar',
                'rules' => 'trim'
            ),
			array(
                'field' => 'profile_image',
                'label' => 'Profile Image',
                'rules' => 'trim'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$user_id = $post['user_id'];
			
			$user_profile['fname'] = $post['fname'];
                        $user_profile['lname'] = $post['lname'];
			$user_profile['phone_no'] = $post['phone'];
			$user_profile['modifiedBy'] =$user_id;
			
		
			
			$image=$post['profile_image'];
			if($_FILES['profile_avatar']['name']!="")
			{					
				if(!empty($image))
				{ 
					if (file_exists($this->user_images.'/'.$image)) {
						unlink($this->user_images.'/'.$image); 
					}					
				}
				$value = $_FILES['profile_avatar']['name'];
				//echo $value;
				
				$config = array(
						'file_name' => 'avatar_'.$user_id.'_'.time(),
						'allowed_types' => 'png|jpg|jpeg|gif|', //jpg|jpeg|gif|
						'upload_path' => $this->user_images,
						'max_size' => 20000
				);

				$this->upload->initialize($config);
				if ( ! $this->upload->do_upload('profile_avatar')) {
						 // return the error message and kill the script
						$data['status']='0';
						$data['message']=$this->upload->display_errors();
				}else{
					$image_data = $this->upload->data();
					$configer =  array(
					  'image_library'   => 'gd2',
					  'source_image'    =>  $image_data['full_path'],
					  'new_image' => realpath(APPPATH . '../assets/uploads/user_images/'),
					  'maintain_ratio'  =>  TRUE,
					  'width'           =>  250,
					  'height'          =>  250,
					);
					$this->image_lib->clear();
					$this->image_lib->initialize($configer);
					if ( ! $this->image_lib->resize()){
						$data['status']='0';
						$data['message']=$this->image_lib->display_errors();
					}
					$this->image_lib->clear();
			
					$image=$image_data['file_name'];
				}
			}
			$user_profile['profile_image'] = $image;
			$res = $this->Api_model->updateUserDetails($user_profile,$user_id);
                        $data['user_details']=$this->Api_model->getUserData($user_id);
			
			//$data['user_details']=$this->Api_model->getUserData($user_id);
			$data['message']='Perfil actualizado correctamente';
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	//**********************************************Product SECTION**************************************************************//
	
	public function product_categories_post(){
		$data['status']='1';
		$config = array(
            array(
                'field' => 'parent_id',
                'label' => 'Parent Id',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);				
			$parent_id =$post['parent_id'];
			$data['image_url']=base_url('assets/uploads/files_manager/');
			$data['data']=$this->Api_model->productCategoryList($parent_id);
			$data['message']='Éxito';$data['message_tr']='Başarı';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
        $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function products_post(){
		$data['status']='1';
		$data['product_image_url'] = base_url('assets/uploads/files_manager/');
		
		$config = array(
            array(
                'field' => 'category_id',
                'label' => 'Category Id',
                'rules' => 'trim'
            ),
             array(
                'field' => 'dine_in',
                'label' => 'Dine In',
                'rules' => 'trim'
            ),
             array(
                'field' => 'take_out',
                'label' => 'Take Out',
                'rules' => 'trim'
            ),        
            array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'user_id',
                'label' => 'user_id',
                'rules' => 'trim|required'
            )         

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);	
			
			$user_id =$post['user_id'];
			$category_id =$post['category_id'];
                        $seller_id =$post['seller_id'];
                        $dine_in =$post['dine_in'];
                        $take_out =$post['take_out'];
			$product_list =  $this->Api_model->get_products_list($user_id, $category_id,$seller_id,$dine_in,$take_out);
                        
                        /*foreach($product_list as $k=>$rows){
                            $oid =$rows->option_ids; 
                            $oid_arr = explode (",", $oid);
                        
                            //print_r($oid_arr);
                            
                            if(!empty($oid_arr)){
                                foreach($oid_arr as $k2=>$option_ids)
                                {
                                   
                                   $option_name= $this->Api_model->optionName($option_ids);
                                   if (!empty($option_name)) {
                                    $option[]=$option_name;
                                    
                                     }
                                } 
                            
                            }
                            $product_list[$k]->option_list=$option;
                            
                        } */
                        $data['products']=$product_list;
                         $data['message']='Éxito';
                        
                        			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function product_details_post(){
		$data['status']='1';
		$data['user_image_url'] = base_url('assets/uploads/user_images/');	
		$data['product_image_url'] = base_url('assets/uploads/files_manager/');
		//$data['review_image_url'] = base_url('assets/uploads/review_images/');	
		
		$config = array(
            array(
                'field' => 'product_id',
                'label' => 'Product Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);	
			$data["product"] = $this->Api_model->get_product_by_id($post['product_id']);
                        
                        $oid =$data["product"]->option_ids; 
                        $oid_arr = explode (",", $oid);
                        if(!empty($oid_arr))
                        {
                            foreach($oid_arr as $k=>$option_ids)
                            {
                             $option[] = $this->Api_model->optionName($option_ids);

                            } 
                        
                        }
                        $data["product"]->option_list=$option;
                        $data['message']='Éxito';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        	
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}	
	
	public function add_remove_wishlist_post(){
		$data['status']='1';		
		$config = array(
            array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'product_id',
                'label' => 'Product Id',
                'rules' => 'trim|required'
            ),        
            array(
                'field' => 'variation_id',
                'label' => 'Variation Id',
                'rules' => 'trim'
            ),
            array(
                'field' => 'option_name',
                'label' => 'Option Id',
                'rules' => 'trim'
            )        

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$save['seller_id'] =$post['seller_id'];
			$save['user_id'] =$post['user_id'];
			$save['product_id'] =$post['product_id'];
                        $save['variant_product_id'] =$post['variation_id'];
                        $save['option_name'] =$post['option_name'];
			$res = $this->Api_model->addRemoveWishlist($save);
			$data['message']= $res[0];
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                       		
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
        
        public function check_wishlist_post(){
		$data['status']='1';		
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),        
            array(
                'field' => 'product_id',
                'label' => 'Product Id',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$user_id =$post['user_id'];
			$product_id =$post['product_id'];
			$res = $this->Api_model->CheckWishlist($user_id,$product_id);
			$data['status']= $res[0];
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                       		
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function wishlist_products_post(){
		$data['status']='1';
		$data['user_image_url'] = base_url('assets/uploads/user_images/');	
		$data['product_image_url'] = base_url('assets/uploads/files_manager/');
		
		$config = array(
                  
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim'
            )

        );
        $this->form_validation->set_rules($config);
        
 /*************************** MULTIPLE ARRAY CODE **************************/
        
	if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
                        $user_id =$post['user_id'];
                        $seller_list= $this->Api_model->wishlist_Seller_products($user_id);
                        $return = [];
                        if(!empty($seller_list)){
                        foreach($seller_list as $k=> $rows)
                        { 
			$seller_list[$k]->Wishlist_product= $this->Api_model->wishlist_products($user_id,$rows->seller_id);
                        }
                        }
                        $data['seller_list']= $seller_list;
			$data['message']='Éxito';
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}
        
        public function order_now_from_wishlist_post(){
		$data['status']='1';		
		$config = array(
            array(
                'field' => 'json_value',
                'label' => 'Json Value',
                'rules' => 'trim|required'
            ),
            
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$personJSON = $post['json_value'];
                        $jsonvalue = json_decode($personJSON);
                        //print_r($jsonvalue);
                        foreach($jsonvalue as $k=>$value){
                          
                           $save['product_id'] =  $value->product_id;
                           $save['product_quantity'] =  $value->quantity;
                          //echo $value->product_id;
                           $data["product"] = $this->Api_model->get_product_by_id($value->product_id);
                           //var_dump($data);
                           $save['category_id'] =$data["product"]->category_id;
                           $save['product_unit_price'] =$data["product"]->purchase_price;
                           //$save['variation_option_ids'] =$post['variation_option_ids'];
                           $save['option_name'] =$value->option;
                           $save['variant_product_id'] =$value->variation_id;

                           $save['user_id'] =  $value->user_id;
                           $save['seller_id'] =  $value->seller_id; 
                           $total_length = $this->Api_model->addItemtocart($save);
                        
                        if (!empty($total_length)) {
				$data['product_image_url'] = base_url('assets/uploads/files_manager/');
				$data['count'] = $total_length;
				$data['list'] = $this->Api_model->cartList($value->user_id,$value->seller_id);
				$data['status'] = 1;
				$data['message'] = 'Artículo añadido correctamente al carrito';
				
			}else {
				$data['status'] = 0;
				$data['message'] = 'Algo salió mal';
				
			}
                        }
                        }else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                       		
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function add_review_post(){
		$data['status']='1';		
		$config = array(
            array(
                'field' => 'order_id',
                'label' => 'Order Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'rating',
                'label' => 'Rating',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'comments',
                'label' => 'Comments',
                'rules' => 'trim'
            ),
            array(
                'field' => 'like/dislike',
                'label' => 'Like/Dislike',
                'rules' => 'trim'
            )        
                    

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
                        $data['product_list'] = $this->Api_model->get_order_products($post['order_id']);
                        //print_r($data); die();
                        
                        if(!empty($data['product_list'])){
                        foreach($data['product_list'] as $k=> $rows)
                        {
                        $save['user_id'] =$post['user_id'];
                        $save['seller_id'] =$post['seller_id'];
			$save['order_id'] =$post['order_id'];
                        $save['product_id'] =$rows->product_id;
			$save['rating'] =$post['rating'];
			$save['review'] =$post['comments'];
			$save['like/dislike'] =$post['like/dislike'];
			$save['addedOn'] =date('Y-m-d H:i:s');
                        $data["add_review"] = $this->Api_model->addReview($save);
                        }
                        }
                        
			$data['message'] = 'Éxitofully Review Submitted';
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function product_reviewes_post(){
		$data['status']='1';
		$data['user_image_url'] = base_url('assets/uploads/user_images/');	
		$data['product_image_url'] = base_url('assets/uploads/files_manager/');
		$data['review_image_url'] = base_url('assets/uploads/review_images/');	
		
		$config = array(
            array(
                'field' => 'product_id',
                'label' => 'Product Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim'
            ),array(
                'field' => 'offset',
                'label' => 'offset',
                'rules' => 'trim'
            ),array(
                'field' => 'per_page',
                'label' => 'per page',
                'rules' => 'trim'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);	
			
			$data['reviews'] = $this->Api_model->get_reviews($post['product_id'],$post['offset'],$post['per_page']);
			$data['review_count'] = count($data['reviews']);
			
			
			
			$data['message']='Éxito';$data['message_tr']='Başarı';			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));		
		}
		$this->response($data, REST_Controller::HTTP_OK);
	}
	
	
//******************************************CART + ORDER SECTION*************************************************************//
	
	public function add_to_cart_post(){
		$data['status']='1';
		
		$config = array(
            array(
                'field' => 'product_id',
                'label' => 'Product Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'product_quantity',
                'label' => 'quantity',
                'rules' => 'trim|required'
            ),array(
                'field' => 'option_name',
                'label' => 'option_name',
                'rules' => 'trim'
            ),array(
                'field' => 'product_unit_price',
                'label' => 'unit price',
                'rules' => 'trim|required'
            )
            ,array(
                'field' => 'category_id',
                'label' => 'Category id',
                'rules' => 'trim|required'
            )
            ,array(
                'field' => 'seller_id',
                'label' => 'Seller id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'variation_id',
                'label' => 'Variation id',
                'rules' => 'trim'
            )        

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$save['user_id'] =$post['user_id'];
			$save['product_id'] =$post['product_id'];
                        $save['seller_id'] =$post['seller_id'];
			$save['product_unit_price'] =$post['product_unit_price'];
			$save['product_quantity'] =$post['product_quantity'];
                        $save['option_name'] =$post['option_name'];
                        $save['category_id'] =$post['category_id'];
			$save['variant_product_id'] =$post['variation_id'];
			$save['updated_at'] =date('Y-m-d H:i:s');
			
			
			$total_length = $this->Api_model->addItemtocart($save);
			if (!empty($total_length)) {
				$data['product_image_url'] = base_url('assets/uploads/files_manager/');
				$data['count'] = $total_length;
				$data['list'] = $this->Api_model->cartList($post['user_id'],$post['seller_id']);
				$data['status'] = 1;
				$data['message'] = 'Artículo añadido correctamente al carrito';
				
			} else {
				$data['status'] = 0;
				$data['message'] = 'Algo salió mal';
				
			}
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function remove_from_cart_post(){
		$data['status']='1';
		
		$config = array(
            array(
                'field' => 'id',
                'label' => 'Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            )        

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			$pid = explode (",", $post['id']);
                        if(!empty($pid))
                        {
                         foreach($pid as $k=>$p_ids)
                            {   
                            $save['id'] =$p_ids;
                            $save['user_id'] =$post['user_id'];
                            $save['seller_id'] =$post['seller_id'];    
                            $total_length = $this->Api_model->deleteCartItem($save);
                            }   
                        } else {
                            $save['id'] =$post['id'];
                            $save['user_id'] =$post['user_id'];
                            $save['seller_id'] =$post['seller_id'];    
                            $total_length = $this->Api_model->deleteCartItem($save);
                        }
			
			$data['product_image_url'] = base_url('assets/uploads/files_manager/');
			$data['count'] = $total_length;
			$data['list'] = $this->Api_model->cartList($post['user_id'],$post['seller_id']);
			$data['status'] = 1;
			$data['message'] = 'Artículo eliminado correctamente del carrito';
			
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	//******************************************CART List ******************************************************//
	public function cart_list_post(){
		$data['status']='1';
		
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            ),
		
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			$data['product_image_url'] = base_url('assets/uploads/files_manager/');
			$data['list'] = $this->Api_model->cartList($post['user_id'],$post['seller_id']);
                        if(!empty($data['list'])){
                                    foreach($data['list'] as $k=> $rows)
                                    {
                                        $data["list"][$k]->is_stock_available = $this->Api_model->isStockAvailable($rows->product_id);
                                    }
                                }
			$data['status'] = 1;
			$data['message'] = 'Éxito';
                        
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
        
	public function checkout_details_post(){
		$data['status']='1';
		$data['product_image_url'] = base_url('assets/uploads/files_manager/');
		
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
	    array(
                'field' => 'seller_id',
                'label' => 'Seller id',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
                $post = $this->input->post();
                $post = $this->security->xss_clean($post);

                $user_id = $post['user_id'];
                $sellerid = $post['seller_id'];
                $res = $this->Api_model->sellerDetails($sellerid);
                $data['list'] = $this->Api_model->cartList($post['user_id'],$post['seller_id']);
                //print_r($data);
                //print_r($data['list']);
                //$related_products=array();
                if(!empty($data['list'])){
                        foreach($data['list'] as $k=> $rows)
                        {
                           $crossid = $this->Api_model->get_product_by_id($rows->product_id);
                           if($crossid->cross_sell!=0) {
                           $pid = explode(',',$crossid->cross_sell); 
                           //print_r($pid);
                           if (!empty($pid)) {
                            foreach($pid as $k2=>$pdata)
                            {
                            $related_products[]= $this->Api_model->get_related_products($rows->product_id, $rows->category_id, $pdata, $user_id,$sellerid)[0];   
                             }
                           }
                           }
                        }
                }
                
                $calculate_cart_total = $this->Api_model->calculate_cart_total($post['user_id'],$post['seller_id']);
                
                $data["related_products"]=$related_products;
                $data['seller_details'] = $res;
                $data['status'] = 1;
                $data['message'] = 'Éxito';
                        
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	public function checkout_post(){
		$data['status']='1';
		
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
	    array(
                'field' => 'seller_id',
                'label' => 'Seller id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'price_total',
                'label' => 'Price Total',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'sub_total',
                'label' => 'Sub Total',
                'rules' => 'trim|required'
            ),        
            array(
                'field' => 'order_type',
                'label' => 'Order type',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'payment_status',
                'label' => 'Payment Status',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'payment_method',
                'label' => 'Payment Method',
                'rules' => 'trim|required'
            ),        
            array(
                'field' => 'coupon_id',
                'label' => 'Coupon id',
                'rules' => 'trim'
            ),
            array(
                'field' => 'coupon_discount',
                'label' => 'Coupon discount',
                'rules' => 'trim'
            ),
            array(
                'field' => 'phone',
                'label' => 'Phone',
                'rules' => 'trim'
            ),
            array(
                'field' => 'remarks',
                'label' => 'Remarks',
                'rules' => 'trim'
            ),
            array(
                'field' => 'table_id',
                'label' => 'table_id',
                'rules' => 'trim'
            ),
            array(
                'field' => 'transactionId',
                'label' => 'transactionId',
                'rules' => 'trim'
            )        
                    
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$user_id = $post['user_id'];
                        $sellerid = $post['seller_id'];
                        //$sellerid = $post['seller_id'];
                        
			$payment_status = $post['payment_status'];
			$order_type = $post['order_type'];
                        $price_total = $post['price_total'];
                        $sub_total = $post['sub_total'];
                        $coupon_id = $post['coupon_id'];
                        $coupon_discount = $post['coupon_discount'];
                        $phone = $post['phone'];
                        $remarks = $post['remarks'];
                        $table_id = $post['table_id'];
                        $transactionId = $post['transactionId'];
			
			$calculate_cart_total = $this->Api_model->calculate_cart_total($post['user_id'],$post['seller_id']);
			
			$order_id = $this->Api_model->add_order($post);
                        $order = $this->Api_model->get_order($order_id);
			$this->Api_model->decrease_product_stock_after_sale($order->id);
			
			$data['seller_details'] = $res;
			$data['order_id'] = $order_id;
			$data['order_details'] = $order;
			//$data['group_purchase_details'] = $calculate_cart_total;
			
			
			
			
			$data['status'] = 1;
			$data['message'] = 'Éxito';
                        
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	public function order_list_post(){       
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
           
            array(
                'field' => 'status',
                'label' => 'Status',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$data['status']='1';
			$data['product_image_url'] = base_url('assets/uploads/files_manager/');
			$orders = $this->Api_model->orderList($post['user_id'],$post['status']);
                        //print_r($orders);
                        $res = $this->Api_model->sellerDetails($post['seller_id']);
                        if(!empty($orders)){
                            foreach($orders as $k=> $rows)
                            { //echo $rows->id;
                                $orders[$k]->review_given= $this->Api_model->getUserReviewGiven($rows->id,$post['user_id']);
                            }
                        }
                        $data['orders']= $orders; 
			$data['message']='Éxito';
                        $data['details']= $res;
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
        public function order_cancel_post(){       
		$config = array(
           
            array(
                'field' => 'order_id',
                'label' => 'Order Id',
                'rules' => 'trim|required'
            ),        
           
            array(
                'field' => 'status',
                'label' => 'Status',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
                        $order_id = $post['order_id'];
                        $order_status = $post['status'];
			$data['status']='1';
			
			$cancel = $this->Api_model->cancelOrder($order_id,$order_status);
                        $get_order = $this->Api_model->get_order($order_id);
                        
                        $post['order_status'] =$get_order->order_status;
                        //$post['refund_status'] =$get_order->order_status;
                                
                        $post['order_number'] =$get_order->order_number;
                        $post['buyer_id'] =$get_order->buyer_id;
                        $post['seller_id'] =$get_order->seller_id;
                        $post['order_id'] =$order_id;
                        //$checkrefund = $this->Api_model->checkRefund($order_id);
                        //$saverefund = $this->Api_model->saveRefund($post);
                        
                        if (!empty($cancel)) {
			$data['message']='Artículo cancelado correctamente del pedido';
                        $saverefund = $this->Api_model->saveRefund($post);
                        } else {
                           $data['status']='0'; 
                           $data['message']='Algo salió mal';
                        }
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
        
        /*public function order_again_post(){       
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'product_id',
                'label' => 'Product Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'product_quantity',
                'label' => 'quantity',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'category_id',
                'label' => 'Category id',
                'rules' => 'trim|required'
            ),
           
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$pid =$post['product_id'];
                        $pid_arr = explode (",", $pid);
                        
                        //print_r($pid_arr);
                        $quan= $post['product_quantity'];
                        $quan_arr = explode (",", $quan);
                        
                        //print_r($quan_arr);
                        $catid= $post['category_id'];
                        $catid_arr = explode (",", $catid);
                        
                        //print_r($catid_arr);
                        $price= $post['product_unit_price'];
                        $price_arr = explode (",", $price);
                        
                        //print_r($price_arr);
                        
                       
                        foreach($pid_arr as $k=>$product_id){
                            
                        $save['product_id'] =$product_id;
                        $save['product_quantity'] =$quan_arr[$k];
                        $save['category_id'] =$catid_arr[$k];
                        $data["product"] = $this->Api_model->get_product_by_id($product_id);
                        $save['product_unit_price'] =$data["product"]->purchase_price;
                        
                        $save['user_id'] =$post['user_id'];
                        $save['seller_id'] =$post['seller_id']; 
                        $save['updated_at'] =date('Y-m-d H:i:s');
                        //print_r($save);
                        $total_length = $this->Api_model->addItemtocart($save);
                        }
                        
                       
			//$save['variation_option_ids'] =$post['variation_option_ids'];
                        
			
                        if (!empty($total_length)) {
				$data['product_image_url'] = base_url('assets/uploads/files_manager/');
				$data['count'] = $total_length;
				$data['list'] = $this->Api_model->cartList($post['user_id']);
				$data['status'] = 1;
				$data['message'] = 'Artículo añadido correctamente al carrito';
				
			}else {
				$data['status'] = 0;
				$data['message'] = 'Algo salió mal';
				
			}
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}*/
        
        public function order_again_post(){       
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            ),
             array(
                'field' => 'order_id',
                'label' => 'Order Id',
                'rules' => 'trim|required'
            )        
          
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			/*$pid =$post['product_id'];
                        $pid_arr = explode (",", $pid);
                        
                        //print_r($pid_arr);
                        $quan= $post['product_quantity'];
                        $quan_arr = explode (",", $quan);
                        
                        //print_r($quan_arr);
                        $catid= $post['category_id'];
                        $catid_arr = explode (",", $catid);
                        
                        //print_r($catid_arr);
                        $price= $post['product_unit_price'];
                        $price_arr = explode (",", $price);
                        
                        //print_r($price_arr);
                        
                       
                        foreach($pid_arr as $k=>$product_id){
                            
                        $save['product_id'] =$product_id;
                        $save['product_quantity'] =$quan_arr[$k];
                        $save['category_id'] =$catid_arr[$k];
                        $data["product"] = $this->Api_model->get_product_by_id($product_id);
                        $save['product_unit_price'] =$data["product"]->purchase_price;
                        
                        $save['user_id'] =$post['user_id'];
                        $save['seller_id'] =$post['seller_id']; 
                        $save['updated_at'] =date('Y-m-d H:i:s');
                        //print_r($save);
                        $total_length = $this->Api_model->addItemtocart($save);
                        }*/
                       
                       $order_details = $this->Api_model->get_order_products($post['order_id']);
                       //print_r($order_details);
                       foreach($order_details as $k=>$item){
                        $save['product_id'] =$item->product_id; 
                        $save['product_quantity']= $item->product_quantity;
                        $save['option_name'] = $item->product_option_name;
                        $data["product"] = $this->Api_model->get_product_by_id($item->product_id);
                        $save['product_unit_price'] =$data["product"]->purchase_price;
                        $save['category_id'] =$data["product"]->category_id;
                        $save['user_id'] =$post['user_id'];
                        $save['seller_id'] =$post['seller_id'];
                        //$save['order_id'] =$post['order_id'];
                        $save['updated_at'] =date('Y-m-d H:i:s');
                        $total_length = $this->Api_model->addItemtocart($save);
                       }
                      
			//$save['variation_option_ids'] =$post['variation_option_ids'];
                        
			
                        if (!empty($total_length)) {
				$data['product_image_url'] = base_url('assets/uploads/files_manager/');
				$data['count'] = $total_length;
				$data['list'] = $this->Api_model->cartList($post['user_id'],$post['seller_id']);
                                if(!empty($data['list'])){
                                    foreach($data['list'] as $k=> $rows)
                                    {
                                        $data["list"][$k]->is_stock_available = $this->Api_model->isStockAvailable($rows->product_id);
                                    }
                                }
				$data['status'] = 1;
				$data['message'] = 'Artículo añadido correctamente al carrito';
				
			}else {
				$data['status'] = 0;
				$data['message'] = 'Algo salió mal';
				
			}
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}

	public function order_details_post(){    
		$config = array(
            array(
                'field' => 'order_id',
                'label' => 'Order Id',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			$data['status']='1';
			$data['product_image_url'] = base_url('assets/uploads/files_manager/');
			$data['order'] = $this->Api_model->orderDetails($post['order_id']);
			
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        			
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
	
	
	//******************************************Seller SECTION*************************************************************//
	public function follow_seller_post(){
		$data['status']='1';		
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$save['user_id'] =$post['user_id'];
			$save['seller_id'] =$post['seller_id'];
			$res = $this->Api_model->favouriteSeller($save);
			$data['message']= $res[0];
			$data['message_tr']= $res[1];
			$data['count']= count($this->Api_model->favourite_of_seller($post['seller_id']));
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));$data['message_tr']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}
	
	
	
	//****************************************** SECTION*************************************************************//
	
	public function test_push_notification_post(){	
		$data['status']='1';
		$config = array(
            array(
                'field' => 'device_id',
                'label' => 'Device Id',
                'rules' => 'trim|required'
            ),array(
                'field' => 'device_type',
                'label' => 'Device Type',
                'rules' => 'trim|required'
            ),array(
                'field' => 'title',
                'label' => '',
                'rules' => 'trim|required'
            ),array(
                'field' => 'body',
                'label' => '',
                'rules' => 'trim|required'
            )

        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$device_id = $post['device_id'];
			$device_type = $post['device_type'];
			
			$arrNotification["body"] =$post['body'];
			$arrNotification["title"] = $post['title'];
			$arrNotification["sound"] = "default";
			$arrNotification["type"] = 1;
			
			$push = send_notification($device_id, $arrNotification,$device_type);
			
			$data['info']= $arrNotification;
			$data['push']= $push;
			$data['message']='Éxito'; 	
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));			
		}
		
		 $this->response($data, REST_Controller::HTTP_OK);
	}

/*************** Refund List Developer*******************/
        
public function refund_list_post(){       
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
           
            array(
                'field' => 'status',
                'label' => 'Status',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$data['status']='1';
			$data['product_image_url'] = base_url('assets/uploads/files_manager/');
			$data['refunds'] = $this->Api_model->refundList($post['user_id'],$post['status']);
                        //$res = $this->Api_model->sellerDetails($post['seller_id']);
			$data['message']='Éxito';
                        $data['details']= $res;
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}

/***************** Refund Detils List *********************/
        
public function refund_Details_list_post(){       
		$config = array(
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
           
            array(
                'field' => 'status',
                'label' => 'Status',
                'rules' => 'trim|required'
            )
        );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			
			$data['status']='1';
			$data['product_image_url'] = base_url('assets/uploads/files_manager/');
			$data['refunds'] = $this->Api_model->refundList($post['user_id'],$post['status']);
                        //$res = $this->Api_model->sellerDetails($post['seller_id']);
			$data['message']='Éxito';
                        $data['details']= $res;
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
        
         public function cancel_refund_post(){       
		$config = array(
           
            array(
                'field' => 'order_id',
                'label' => 'Order Id',
                'rules' => 'trim|required'
            ),        
           );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			$order_id = $post['order_id'];
                        $data['status']='1';
                        $status='cancelled';
			$cancel = $this->Api_model->cancelRefund($order_id,$status);
                        
                        if (!empty($cancel)) {
			$data['message']='Ítem cancelado exitosamente';
                       
                        } else {
                           $data['status']='0'; 
                           $data['message']='Algo salió mal';
                        }
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
        
        public function delete_message_post(){       
		$config = array(
           
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
           
            array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim'
            ),
            array(
                'field' => 'flag',
                'label' => 'flag',
                'rules' => 'trim'
            )        
           );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			$user_id = $post['user_id'];
                        $seller_id = $post['seller_id'];
                        $flag = $post['flag'];
                        $data['status']='1';
                        
			$delete = $this->Api_model->deleteMessage($user_id,$seller_id,$flag);
                        
                        if (!empty($delete)) {
			$data['message']='Message deleted successfully';
                       
                        } else {
                           $data['status']='0'; 
                           $data['message']='Algo salió mal';
                        }
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
        
        public function messages_seen_post(){       
		$config = array(
           
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
           
            array(
                'field' => 'seller_id',
                'label' => 'Seller Id',
                'rules' => 'trim'
            ),
                   
           );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			$user_id = $post['user_id'];
                        $seller_id = $post['seller_id'];
                        $data['status']='1';
                        
			$delete = $this->Api_model->seenMessages($user_id,$seller_id);
                        
                        if (!empty($delete)) {
			$data['message']='Mensaje actualizado exitosamente';
                       
                        } else {
                           $data['status']='0'; 
                           $data['message']='Algo salió mal';
                        }
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
        
        public function top_20_seller_list_post(){  
                $data['status']='1';
		$data['seller_image'] = base_url('assets/uploads/user_images/');
		
		$config = array(
           
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
                
           );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			$user_id = $post['user_id'];
                        $data['status']='1';
                        $data['top_20_seller']  = $this->Api_model->top20SellerList($user_id);
                        $data['message']='Éxito';
                       
                       
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
        
         public function sort_seller_post(){  
                $data['status']='1';
		$data['seller_image'] = base_url('assets/uploads/user_images/');
		
		$config = array(
           
            array(
                'field' => 'user_id',
                'label' => 'User Id',
                'rules' => 'trim|required'
            ),
            array(
                'field' => 'sort_with_rating',
                'label' => 'Sort with reting',
                'rules' => 'trim'
            ),
             array(
                'field' => 'sort_with_discount',
                'label' => 'sort with discount',
                'rules' => 'trim'
            ),
             array(
                'field' => 'category_id',
                'label' => 'Category id',
                'rules' => 'trim'
            ),
             array(
                'field' => 'over_4_and_5_star',
                'label' => 'Over 4 and 5 star',
                'rules' => 'trim'
            ),
             array(
                'field' => 'new_in_pixxi',
                'label' => 'New in pixxi',
                'rules' => 'trim'
            ),        
                
           );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			$user_id = $post['user_id'];
                        $offset =$post['offset'];
			$per_page =$post['per_page'];
			$sort_with_rating =$post['sort_with_rating'];
                        $sort_with_discount =$post['sort_with_discount'];
                        $category_id =$post['category_id'];
                        $over_4_and_5_star =$post['over_4_and_5_star'];
                        $new_in_pixxi =$post['new_in_pixxi'];
                        
                        $data['status']='1';
                        $sellerlist =  $this->Api_model->get_filtered_sellers($user_id, $sort_with_rating, $sort_with_discount, $category_id, $over_4_and_5_star, $new_in_pixxi, $offset, $per_page);
                        $return = [];
                        if(!empty($sellerlist)){
                            foreach($sellerlist as $k=>$seller_schedule)
                            {
                                $sellerlist[$k]->user_schedule = $this->Api_model->sellerSchedules($seller_schedule->id);
                            }
                        }
                        $data['seller_list']= $sellerlist;
                        $data['message']='Éxito';
                       
                       
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
        
         public function delete_order_post(){       
		$config = array(
          
            array(
                'field' => 'order_id',
                'label' => 'Order Id',
                'rules' => 'trim|required'
            ),
                  
           );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			$user_id = $post['user_id'];
                        $order_id = $post['order_id'];
                        $data['status']='1';
                        
			$delete = $this->Api_model->deleteOrder($order_id);
                        
                        if ($delete==1) {
			$data['message']='Orden eliminada exitosamente';
                       
                        } else {
                           $data['status']='0'; 
                           $data['message']='Algo salió mal';
                        }
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
         public function delete_refund_post(){       
		$config = array(
          
            array(
                'field' => 'refund_id',
                'label' => 'Refund Id',
                'rules' => 'trim|required'
            ),
                  
           );
        $this->form_validation->set_rules($config);
		if ($this->form_validation->run()) 
        {
			$post = $this->input->post();
			$post = $this->security->xss_clean($post);
			$refund_id = $post['refund_id'];
                        $data['status']='1';
                        
			$delete = $this->Api_model->deleteRefund($refund_id);
                        
                        if ($delete==1) {
			$data['message']='Reembolsó eliminado exitosamente';
                       
                        } else {
                           $data['status']='0'; 
                           $data['message']='Algo salió mal';
                        }
                        
		}else{
			$data['status']='0';
			$data['message']=preg_replace("@\n@","",strip_tags(validation_errors()));
                        		
		}
        $this->response($data, REST_Controller::HTTP_OK);
	}
}

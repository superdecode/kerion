<?php

class Report_model extends CI_Model
{

        public function __construct()
        {
                parent::__construct();
        }


        public function getOrders()
        {

                $data = array();
                $this->db->select('orders.*,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
                $this->db->from('orders');
                if ($this->session->userdata('user_role_ids') != '1') {
                        $this->db->where("orders.seller_id", $this->session->userdata('seller_id'));
                }

                $this->db->where("orders.deleted", "0");
                $this->db->order_by("orders.id", "desc");
                $this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
                $query = $this->db->get()->result();


                return $query;
        }

        public function getCustomers($role_id)
        {

                $this->db->select('users.*,user_profiles.fname, user_profiles.lname,user_profiles.phone_no, user_profiles.profile_image');
                $this->db->from('users');
                //$this->db->where("(NOT find_in_set('2',role_ids) <> 0) && (NOT find_in_set('3',role_ids) <> 0)");
                $this->db->where("users.deleted", '0');
                if (!empty($role_id)) {
                        $this->db->where("users.role_ids", $role_id);
                }
                $this->db->where("users.role_ids!=", '1');
                $this->db->join('user_profiles', 'users.id = user_profiles.user_id', 'LEFT');
                $this->db->join('roles', 'roles.id = users.role_ids', 'LEFT');

                $this->db->where("user_profiles.is_main", '1');
                $this->db->order_by("users.id", "desc");
                $query = $this->db->get()->result();

                return $query;
        }
        public function getCoupons()
        {
                $this->db->select('coupons.*,seller.seller_name as sname');
                $this->db->from('coupons');
                $this->db->where("coupons.deleted", "0");
                //$this->db->where("coupons.type",$type);
                $this->db->join('seller', 'seller.id = coupons.id', 'LEFT');
                $this->db->order_by("id", "desc");
                $query = $this->db->get()->result();
                if (!empty($query)) {
                        foreach ($query as $k => $data) {
                                $query[$k]->image_default = '';
                                if (!empty($data->banner)) {
                                        $photos = explode(',', $data->banner);
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

        public function getRefund()
        {
                $data = array();
                $this->db->select('order_refund.* ,user_profiles.fname,user_profiles.lname,orders.price_total,orders.payment_status');
                $this->db->from('order_refund');
                //$this->db->where("orders.type",$type);
                if ($this->session->userdata('user_role_ids') != '1') {
                        $this->db->where("order_refund.seller_id", $this->session->userdata('seller_id'));
                }
                $this->db->where("order_refund.deleted", "0");
                $this->db->order_by("order_refund.id", "desc");
                $this->db->join('user_profiles', 'user_profiles.user_id=order_refund.buyer_id', 'LEFT');
                $this->db->join('orders', 'orders.order_number=order_refund.order_number', 'LEFT');
                $query = $this->db->get()->result();
                //echo $this->db->last_query();
                return $query;
        }
        public function getFeedback()
        {
                $this->db->select('feedbacks.*,feedbacks_images.image as image');
                $this->db->from('feedbacks');
                $this->db->where("feedbacks.deleted", "0");
                $this->db->join('feedbacks_images', 'feedbacks_images.feedback_id = feedbacks.id', 'LEFT');
                $this->db->order_by("id", "desc");
                return $datas = $this->db->get()->result();
        }

        public function getprofit($seller_id, $sdate, $edate)
        {
                $data = array();
                //$date = !empty($search['date']) ? $search['date'] : date('Y-m-d');
                $this->db->select('orders.seller_id,seller.seller_name,seller.profile_image,seller.phone_number,seller.seller_commission');
                //$this->db->select('orders.*,seller.seller_name,seller.address,seller.phone_number,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
                $this->db->select_sum('price_total');
                $this->db->from('orders');
                $this->db->where("orders.deleted", "0");
                //$this->db->where("DATE(orders.created_at)", $date);
                if ($sdate != '' && $edate != '') {
			$this->db->where("DATE(orders.created_at)>=", $sdate);
			$this->db->where("DATE(orders.created_at)<=", $edate);
		} else {
			if ($sdate != '') {
				$this->db->where("DATE(orders.created_at)", $sdate);
			}
			if ($edate != '') {
				$this->db->where("DATE(orders.created_at)", $edate);
			}
		}
                $this->db->where("orders.order_status", 'completed');
                if ($this->session->userdata('user_role_ids') != '1') {
                        $this->db->where("orders.seller_id", $seller_id);
                }
                $this->db->order_by("orders.id", "desc");
                $this->db->group_by("orders.seller_id");
                //$this->db->join('user_profiles as seller', 'seller.user_id=orders.seller_id' , 'LEFT');
                $this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');
                $query = $this->db->get()->result();
                //echo $this->db->last_query(); die();
                if (!empty($query)) {
                        foreach ($query as $k => $data) {
                                $query[$k]->order_count = count($this->sellerOrderList($data->seller_id, $sdate, $edate));
                        }
                }

                return $query;
        }

        public function sellerOrderList($seller_id, $sdate, $edate)
        {
                $data = array();
                $this->db->select('orders.*,seller.seller_name,seller.profile_image,seller.phone_number,seller.seller_commission,user_profiles.fname,user_profiles.lname');
                //$this->db->select('orders.*,seller.seller_name,seller.address,seller.phone_number,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
                $this->db->from('orders');
                $this->db->where("orders.seller_id", $seller_id);
                //$this->db->where("DATE(orders.created_at)", $date);
                if ($sdate != '' && $edate != '') {
			$this->db->where("DATE(orders.created_at)>=", $sdate);
			$this->db->where("DATE(orders.created_at)<=", $edate);
		} else {
			if ($sdate != '') {
				$this->db->where("DATE(orders.created_at)", $sdate);
			}
			if ($edate != '') {
				$this->db->where("DATE(orders.created_at)", $edate);
			}
		}
                $this->db->where("orders.order_status", 'completed');
                $this->db->where("orders.deleted", "0");
                $this->db->order_by("orders.id", "desc");

                //$this->db->join('user_profiles as seller', 'seller.user_id=orders.seller_id' , 'LEFT');
                $this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
                $this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');
                $query = $this->db->get()->result();
                //echo $this->db->last_query();

                return $query;
        }
        public function gross_sell($seller_id, $date)
        {

                $this->db->select_sum('price_subtotal');
                //$this->db->select('orders.*');
                $this->db->from('orders');
                //$this->db->from('orders');
                //$this->db->where('orders.order_status','completed');
                //$this->db->or_where('orders.order_status','cancelled');
                $wherecond = "(orders.order_status ='completed' OR orders.order_status='cancelled')";
                $this->db->where($wherecond);
                if ($seller_id != '1') {
                        $this->db->where("orders.seller_id", $seller_id);
                }
                if (!empty($date)) {
                        $this->db->where("DATE(orders.created_at)", $date);
                }
                $this->db->order_by("id", "desc");
                $query1 = $this->db->get()->row();
                //echo $this->db->last_query();
                if (!empty($query1->price_subtotal)) {
                        return $total_price = $query1->price_subtotal;
                } else {
                        return 0;
                }
        }

        public function return_order($seller_id, $date)
        {
                $this->db->select('order_refund.* ');
                $this->db->from('order_refund');
                $this->db->where('order_refund.refund_status', 'completed');
                if ($seller_id != '1') {
                        $this->db->where("order_refund.seller_id", $seller_id);
                }
                if (!empty($date)) {
                        $this->db->where("DATE(order_refund.created_at)", $date);
                }
                $this->db->order_by("id", "desc");
                $query1 = $this->db->get()->result();
                $sum = 0;
                foreach ($query1 as $value) {
                        $price_tot = $this->Report_model->totalReturnOrde($value->order_id);
                        $sum = $sum + $price_tot->price_total;
                }
                return $sum;
        }

        public function totalReturnOrde($order_id)
        {
                $this->db->select('orders.price_total');
                $this->db->from('orders');
                $this->db->where('orders.id', $order_id);
                $query = $this->db->get()->row();
                return $query;
        }

        public function discount_coupons($seller_id, $date)
        {

                $this->db->select_sum('coupon_discount');
                //$this->db->where('orders.order_status','completed');
                //$this->db->or_where('orders.order_status','cancelled');
                $wherecond = "(orders.order_status ='completed' OR orders.order_status='cancelled')";
                $this->db->where($wherecond);
                $this->db->from('orders');
                if ($seller_id != '1') {
                        $this->db->where("orders.seller_id", $seller_id);
                }
                if (!empty($date)) {
                        $this->db->where("DATE(orders.created_at)", $date);
                }
                $this->db->order_by("id", "desc");
                $query1 = $this->db->get()->row();
                if (!empty($query1->coupon_discount)) {
                        return $total_price = $query1->coupon_discount;
                } else {
                        return 0;
                }
        }


        public function gross_sell_summary($seller_id, $start_date, $end_date)
        {

                $this->db->select_sum('price_subtotal');
                $this->db->from('orders');

                $wherecond = "(orders.order_status ='completed' OR orders.order_status='cancelled')";
                $this->db->where($wherecond);
                if ($seller_id != '1') {
                        $this->db->where("orders.seller_id", $seller_id);
                }

                if (!empty($start_date)) {
                        $this->db->where(" ( DATE(orders.created_at) >= '" . $start_date . "' && DATE(orders.created_at) <= '" . $end_date . "' ) ");
                }
                $this->db->order_by("id", "desc");
                $query1 = $this->db->get()->row();
                //echo $this->db->last_query();
                if (!empty($query1->price_subtotal)) {
                        return $total_price = $query1->price_subtotal;
                } else {
                        return 0;
                }
        }

        public function return_order_summary($seller_id, $start_date, $end_date)
        {
                $this->db->select('order_refund.* ');
                $this->db->from('order_refund');
                $this->db->where('order_refund.refund_status', 'completed');
                if ($seller_id != '1') {
                        $this->db->where("order_refund.seller_id", $seller_id);
                }
                if (!empty($start_date)) {
                        //$this->db->where("DATE(order_refund.created_at)",$date);
                        $this->db->where(" ( DATE(order_refund.created_at) >= '" . $start_date . "' && DATE(order_refund.created_at) <= '" . $end_date . "' ) ");
                }
                $this->db->order_by("id", "desc");
                $query1 = $this->db->get()->result();
                $sum = 0;
                foreach ($query1 as $value) {
                        $price_tot = $this->Report_model->totalReturnOrde($value->order_id);
                        $sum = $sum + $price_tot->price_total;
                }
                return $sum;
        }
        public function discount_coupons_summary($seller_id, $start_date, $end_date)
        {

                $this->db->select_sum('coupon_discount');
                $wherecond = "(orders.order_status ='completed' OR orders.order_status='cancelled')";
                $this->db->where($wherecond);
                $this->db->from('orders');
                if ($seller_id != '1') {
                        $this->db->where("orders.seller_id", $seller_id);
                }
                if (!empty($start_date)) {
                        $this->db->where(" ( DATE(orders.created_at) >= '" . $start_date . "' && DATE(orders.created_at) <= '" . $end_date . "' ) ");
                }
                $this->db->order_by("id", "desc");
                $query1 = $this->db->get()->row();
                if (!empty($query1->coupon_discount)) {
                        return $total_price = $query1->coupon_discount;
                } else {
                        return 0;
                }
        }
        
        public function getSellernameList()
	{
		$data = array();
		$this->db->select('seller.*');
		$this->db->from('seller');
		$this->db->where("seller.deleted", "0");
		$this->db->where("status", "1");
		$this->db->order_by("id", "asc");
		return $datas = $this->db->get()->result();
	}
        
        public function saleCaseReport($seller_id, $sdate, $edate)
	{
		$data = array();
		$this->db->select('orders.*,seller.id,seller.seller_name,seller.phone_number,user_profiles.fname,user_profiles.lname,user_profiles.phone_no');
		$this->db->from('orders');
		if ($this->session->userdata('user_role_ids') != '1') {
                        $this->db->where("orders.seller_id", $this->session->userdata('seller_id'));
                }
		
		if ($sdate != '' && $edate != '') {
			$this->db->where("DATE(orders.created_at)>=", $sdate);
			$this->db->where("DATE(orders.created_at)<=", $edate);
		} else {
			if ($sdate != '') {
				$this->db->where("DATE(orders.created_at)", $sdate);
				//$this->db->where("DATE(task_list.start_date)>=", $sdate);
				//$this->db->where("DATE(task_list.end_date)<=", $edate);
			}
			if ($edate != '') {
				$this->db->where("DATE(orders.created_at)", $edate);
			}
		}
		$this->db->where("orders.deleted", "0");
		$this->db->order_by("orders.id", "desc");
		$this->db->join('user_profiles', 'user_profiles.user_id=orders.buyer_id', 'LEFT');
		$this->db->join('seller', 'seller.id=orders.seller_id', 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query(); die();
		return $query;
	}
        public function getEarningTotalSum($seller_id,$sdate, $edate)
	{
		$data = array();
		$this->db->select_sum('price_total');
		$this->db->from('orders');
		//$this->db->where('orders.order_status', 'completed');
		
                if ($this->session->userdata('user_role_ids') != '1') {
                        $this->db->where("orders.seller_id", $this->session->userdata('seller_id'));
                }
		//$this->db->where("orders.order_status", 'completed');
		$this->db->where("orders.deleted", "0");
                
		if ($sdate != '' && $edate != '') {
			$this->db->where("DATE(orders.created_at)>=", $sdate);
			$this->db->where("DATE(orders.created_at)<=", $edate);
		} else {
			if ($sdate != '') {
				$this->db->where("DATE(orders.created_at)", $sdate);
				//$this->db->where("DATE(task_list.start_date)>=", $sdate);
				//$this->db->where("DATE(task_list.end_date)<=", $edate);
			}
			if ($edate != '') {
				$this->db->where("DATE(orders.created_at)", $edate);
			}
		}
		$this->db->order_by("id", "desc");
		$datas = $this->db->get()->row();
		//echo $this->db->last_query(); die;
		return ($datas->price_total > 0) ? $datas->price_total : 0;
	}
        
        public function getTopSelesItemsGraph($seller_id,$date)
	{
		$this->db->select('order_products.product_title');
		$this->db->select_sum('price_total');
                //$this->db->select_sum('product_unit_price');
                //$this->db->select_sum('product_unit_price');
		$this->db->select_sum('product_quantity');
		$this->db->from('order_products');
                $this->db->limit(5);
		$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		$this->db->where("order_products.seller_id",$seller_id);
                if (!empty($date)) {
                        $this->db->where("DATE(order_products.created_at)", $date);
                }
		$this->db->group_by("order_products.product_id");
                $this->db->order_by("price_total", "desc");
                
		$query = $this->db->get()->result();
		//echo $this->db->last_query();	die();	
		return $query;
	}
        
       
        
        public function getdataAvailable($seller_id,$date)
	{
		$this->db->select('order_products.product_title');
		$this->db->select_sum('price_total');
                //$this->db->select_sum('product_unit_price');
                //$this->db->select_sum('product_unit_price');
		$this->db->select_sum('product_quantity');
		$this->db->from('order_products');
                //$this->db->limit(5);
		$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		$this->db->where("order_products.seller_id",$seller_id);
                if (!empty($date)) {
                        $this->db->where("DATE(order_products.created_at)", $date);
                }
		$this->db->group_by("order_products.product_id");
                $this->db->order_by("price_total", "desc");
                
		$query = $this->db->get()->row();
		//echo $this->db->last_query();	die();	
                return !empty($query)?'1':'0';
		
	}
        public function getTopSelesitems($seller_id,$start_date,$end_date)
	{
		$this->db->select('order_products.product_title,order_products.product_id,order_products.order_id,order_products.variant_product_id');
		$this->db->select_sum('price_total');
                $this->db->select_sum('product_unit_price');
                //$this->db->select_sum('product_unit_price');
		$this->db->select_sum('product_quantity');
		$this->db->from('order_products');
                //$this->db->limit(5);
		$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		$this->db->where("order_products.seller_id",$seller_id);
                if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(order_products.created_at) >= '".$start_date."' && DATE(order_products.created_at) <= '".$end_date."' ) ");
		}
		//$this->db->group_by("order_products.product_id");
                $this->db->order_by("order_products.created_at", "asc");
                
		$query = $this->db->get()->result();
		//echo $this->db->last_query();	die();	
		return $query;
	}
        
        public function getProducts($id)
	{
		$data = array();
		$this->db->select('products.*,product_categories.title as cname');
		$this->db->from('products');
                $this->db->where("products.id", $id);
		$this->db->where("products.deleted", "0");
		
		$this->db->order_by("id", "desc");
		$this->db->join('product_categories', 'product_categories.id = products.category_id', 'LEFT');
		//echo $this->db->last_query();
		$query = $this->db->get()->row();
		//echo $this->db->last_query();
		return $query;
	}
        
        public function getProductsDiscount($orderid)
	{
		$data = array();
		$this->db->select('orders.coupon_discount');
		$this->db->from('orders');
                $this->db->where("orders.id", $orderid);
		$this->db->where("orders.deleted", "0");
		$query = $this->db->get()->row();
		//echo $this->db->last_query();
		return $query;
	}
        
         public function getProductsVariant($pid,$start_date,$end_date)
	{
		$data = array();
		$this->db->select('order_products.*');
		$this->db->from('order_products');
                $this->db->where("order_products.product_id", $pid);
		//$this->db->where("order_products.deleted", "0");
                if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(order_products.created_at) >= '".$start_date."' && DATE(order_products.created_at) <= '".$end_date."' ) ");
		}
                $this->db->order_by("order_products.id", "desc");
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		return $query;
	}
        
        public function getVariantDetails($vid)
	{
		$data = array();
		$this->db->select('product_variation_options.variation_name,product_variation_options.price,product_variation_options.stock as vstock,product_variation_options.sku as vsku');
		$this->db->from('product_variation_options');
                $this->db->where("product_variation_options.id", $vid);
		$this->db->where("product_variation_options.deleted", "0");
		$query = $this->db->get()->row();
		//echo $this->db->last_query();
		return $query;
	}
        
        /************************** New Code *********************/
        public function getAllProducts($user_id)
	{
		$data = array();
		$this->db->select('products.*,product_categories.title as cname');
		$this->db->from('products');
                $this->db->where("products.seller_id", $user_id);
		$this->db->where("products.deleted", "0");
                $this->db->where("products.status", "1");
                $this->db->join('product_categories', 'product_categories.id = products.category_id', 'LEFT');
		$query = $this->db->get()->result();
		//echo $this->db->last_query();
		return $query;
	}
        public function getOrderData($id,$date)
	{
		$data = array();
		
                $this->db->select_sum('product_total_price');
                $this->db->where('order_products.product_id', $id);
                if (!empty($date)) {
                        $this->db->where("DATE(order_products.created_at)", $date);
                }
                $this->db->group_by("order_products.product_id");
                $this->db->order_by("order_products.created_at", "asc");
                $query = $this->db->get('order_products');
                $return = $query->row();
                //echo $this->db->last_query();
		//return $return;
		return !empty($return)?!empty($return->product_total_price)?$return->product_total_price:0:0;
		
	}
        
        public function getTotalGrossSell($order_id)
        {

                $this->db->select_sum('price_subtotal');
                $this->db->from('orders');
                $this->db->where('orders.id',$order_id);
                $this->db->order_by("id", "desc");
                $query1 = $this->db->get()->row();
                //echo $this->db->last_query();
                if (!empty($query1->price_subtotal)) {
                        return $total_price = $query1->price_subtotal;
                } else {
                        return 0;
                }
        }
        
        /***************** New Code***************/
        
        public function getOrderDataItemSale($pid,$start_date,$end_date)
	{
		$this->db->select('order_products.product_title,order_products.product_title,order_products.product_id,order_products.order_id,order_products.variant_product_id');
		$this->db->select_sum('product_total_price');
                
                $this->db->select_sum('product_unit_price');
                $this->db->select_sum('product_quantity');
                $this->db->from('order_products');
                $this->db->where('order_products.product_id', $pid);
		$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		//$this->db->where("order_products.seller_id",$seller_id);
                 if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(order_products.created_at) >= '".$start_date."' && DATE(order_products.created_at) <= '".$end_date."' ) ");
		}
		//$this->db->group_by("order_products.product_id");
                $this->db->order_by("order_products.created_at", "asc");
                
		$query = $this->db->get()->row();
		//echo $this->db->last_query();	die();	
		return $query;
	}
        
        public function getOrderDiscount($pid,$date)
	{
		$this->db->select('order_products.product_title,order_products.product_title,order_products.product_id,order_products.order_id,order_products.variant_product_id');
		$this->db->select_sum('product_total_price');
                
                $this->db->select_sum('product_unit_price');
                $this->db->select_sum('product_quantity');
                $this->db->from('order_products');
                $this->db->where('order_products.product_id', $pid);
		$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		//$this->db->where("order_products.seller_id",$seller_id);
                  if (!empty($date)) {
                        $this->db->where("DATE(order_products.created_at)", $date);
                }
		//$this->db->group_by("order_products.product_id");
                //$this->db->order_by("order_products.created_at", "asc");
                
		$query = $this->db->get()->row();
		//echo $this->db->last_query();	die();	
		return $query;
	}
         public function getOrderNetSale($pid,$start_date,$end_date)
	{
		$this->db->select('order_products.product_unit_price,order_products.product_quantity');
		
                $this->db->from('order_products');
                $this->db->where('order_products.product_id', $pid);
		$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		//$this->db->where("order_products.seller_id",$seller_id);
                 if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(order_products.created_at) >= '".$start_date."' && DATE(order_products.created_at) <= '".$end_date."' ) ");
		}
		//$this->db->group_by("order_products.product_id");
                $this->db->order_by("order_products.created_at", "asc");
                
		$query = $this->db->get()->result();
		//echo $this->db->last_query();	die();	
		return $query;
	}
        
           public function getOrderDataCancelItemSale($pid,$start_date,$end_date)
	{
		$this->db->select('order_products.product_title,order_products.product_title,order_products.product_id,order_products.order_id,order_products.variant_product_id');
		$this->db->select_sum('order_status');
                $this->db->select_sum('product_total_price');
                $this->db->select_sum('product_unit_price');
                $this->db->select_sum('product_quantity');
                $this->db->from('order_products');
                $this->db->where('order_status','cancelled');
                $this->db->where('order_products.product_id', $pid);
		//$this->db->join('orders', 'orders.id=order_products.order_id', 'LEFT');
		//$this->db->where("order_products.seller_id",$seller_id);
                 if (!empty($start_date) && !empty($end_date)) {
			$this->db->where(" ( DATE(order_products.created_at) >= '".$start_date."' && DATE(order_products.created_at) <= '".$end_date."' ) ");
		}
		//$this->db->group_by("order_products.product_id");
                $this->db->order_by("order_products.created_at", "asc");
                
		$query = $this->db->get()->row();
		//echo $this->db->last_query();	die();	
		return $query;
	}
        
        
}

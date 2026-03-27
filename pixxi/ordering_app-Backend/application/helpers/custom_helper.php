<?php

/* 
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */

//reset flash data
if (!function_exists('reset_flash_data')) {
	function reset_flash_data()
	{
		$ci = &get_instance();
		$ci->session->set_flashdata('errors', "");
		$ci->session->set_flashdata('error', "");
		$ci->session->set_flashdata('success', "");
	}
}

function convertToReadableSize($size)
{
	$base = log($size) / log(1024);
	$suffix = array("KB", "MB", "GB", "TB");
	$f_base = floor($base);
	return round(pow(1024, $base - floor($base)), 1) . $suffix[$f_base];
}

//clean slug
if (!function_exists('clean_slug')) {
	function clean_slug($slug)
	{
		$ci = &get_instance();
		$slug = urldecode($slug);
		$slug = $ci->security->xss_clean($slug);
		$slug = remove_special_characters($slug, true);
		return $slug;
	}
}

//clean number
if (!function_exists('clean_number')) {
	function clean_number($num)
	{
		$ci = &get_instance();
		$num = trim($num);
		$num = $ci->security->xss_clean($num);
		$num = intval($num);
		return $num;
	}
}

//clean string
if (!function_exists('clean_str')) {
	function clean_str($str)
	{
		$ci = &get_instance();
		$str = $ci->security->xss_clean($str);
		$str = remove_special_characters($str, false);
		return $str;
	}
}


//remove special characters
if (!function_exists('remove_special_characters')) {
	function remove_special_characters($str, $is_slug = false)
	{
		$str = trim($str);
		$str = str_replace('#', '', $str);
		$str = str_replace(';', '', $str);
		$str = str_replace('!', '', $str);
		$str = str_replace('"', '', $str);
		$str = str_replace('$', '', $str);
		$str = str_replace('%', '', $str);
		$str = str_replace('(', '', $str);
		$str = str_replace(')', '', $str);
		$str = str_replace('*', '', $str);
		$str = str_replace('+', '', $str);
		$str = str_replace('/', '', $str);
		$str = str_replace('\'', '', $str);
		$str = str_replace('<', '', $str);
		$str = str_replace('>', '', $str);
		$str = str_replace('=', '', $str);
		$str = str_replace('?', '', $str);
		$str = str_replace('[', '', $str);
		$str = str_replace(']', '', $str);
		$str = str_replace('\\', '', $str);
		$str = str_replace('^', '', $str);
		$str = str_replace('`', '', $str);
		$str = str_replace('{', '', $str);
		$str = str_replace('}', '', $str);
		$str = str_replace('|', '', $str);
		$str = str_replace('~', '', $str);
		if ($is_slug == true) {
			$str = str_replace(" ", '-', $str);
			$str = str_replace("'", '', $str);
		}
		return $str;
	}
}

//remove forbidden characters
if (!function_exists('remove_forbidden_characters')) {
	function remove_forbidden_characters($str)
	{
		$str = str_replace(';', '', $str);
		$str = str_replace('"', '', $str);
		$str = str_replace('$', '', $str);
		$str = str_replace('%', '', $str);
		$str = str_replace('*', '', $str);
		$str = str_replace('/', '', $str);
		$str = str_replace('\'', '', $str);
		$str = str_replace('<', '', $str);
		$str = str_replace('>', '', $str);
		$str = str_replace('=', '', $str);
		$str = str_replace('?', '', $str);
		$str = str_replace('[', '', $str);
		$str = str_replace(']', '', $str);
		$str = str_replace('\\', '', $str);
		$str = str_replace('^', '', $str);
		$str = str_replace('`', '', $str);
		$str = str_replace('{', '', $str);
		$str = str_replace('}', '', $str);
		$str = str_replace('|', '', $str);
		$str = str_replace('~', '', $str);
		return $str;
	}
}


function get_country_name($id)
{
	$CI = &get_instance();
	$names = array();

	$CI->db->select('location_countries.name ');
	$CI->db->from('location_countries');
	$CI->db->where("location_countries.id", $id);
	$CI->db->order_by("location_countries.name", "asc");
	$query = $CI->db->get()->row_array();
	if (!empty($query)) {
		$names[] = $query['name'];
	}

	return implode(',', $names);
}
function get_state_name($id)
{
	$CI = &get_instance();
	$names = array();

	$CI->db->select('location_states.name ');
	$CI->db->from('location_states');
	$CI->db->where("location_states.id", $id);
	$CI->db->order_by("location_states.name", "asc");
	$query = $CI->db->get()->row_array();
	if (!empty($query)) {
		$names[] = $query['name'];
	}
	return implode(',', $names);
}
function get_city_name($id)
{
	$CI = &get_instance();
	$names = array();

	$CI->db->select('location_cities.name ');
	$CI->db->from('location_cities');
	$CI->db->where("location_cities.id", $id);
	$CI->db->order_by("location_cities.name", "asc");
	$query = $CI->db->get()->row_array();
	if (!empty($query)) {
		$names[] = $query['name'];
	}
	return implode(',', $names);
}

function country_list_dropdown($selected_id = '')
{
	$CI = &get_instance();
	$CI->db->select('location_countries.* ');
	$CI->db->from('location_countries');
	$CI->db->where("location_countries.status", '1');
	$CI->db->order_by("location_countries.name", "asc");
	$query = $CI->db->get()->result();

	$selected = '';
	$html = '<option value="">Select</option>';
	foreach ($query as $k => $val) {
		if ($val->id == $selected_id) {
			$selected = "selected";
		} else {
			$selected = "";
		}
		$html .= '<option value="' . $val->id . '" ' . $selected . ' >' . $val->name . '</option>';
	}

	echo $html;
}
function state_list_dropdown($selected_id = '', $id)
{
	$CI = &get_instance();
	$CI->db->select('location_states.* ');
	$CI->db->from('location_states');
	$CI->db->where("location_states.country_id", $id);
	$CI->db->order_by("location_states.name", "asc");
	$query = $CI->db->get()->result();

	$selected = '';
	$html = '<option value="">Select</option>';
	foreach ($query as $k => $val) {
		if ($val->id == $selected_id) {
			$selected = "selected";
		} else {
			$selected = "";
		}
		$html .= '<option value="' . $val->id . '" ' . $selected . ' >' . $val->name . '</option>';
	}

	echo $html;
}


function city_list_dropdown($selected_id = '', $id)
{
	$CI = &get_instance();
	$CI->db->select('location_cities.* ');
	$CI->db->from('location_cities');
	$CI->db->where("location_cities.state_id", $id);
	$CI->db->order_by("location_cities.name", "asc");
	$query = $CI->db->get()->result();

	$selected = '';
	$html = '<option value="">Select</option>';
	foreach ($query as $k => $val) {
		if ($val->id == $selected_id) {
			$selected = "selected";
		} else {
			$selected = "";
		}
		$html .= '<option value="' . $val->id . '" ' . $selected . ' >' . $val->name . '</option>';
	}

	echo $html;
}

function currency_list_dropdown($selected_id = '')
{
	$CI = &get_instance();
	$CI->db->select('currencies.* ');
	$CI->db->from('currencies');
	$CI->db->where("currencies.status", 'ok');
	$CI->db->order_by("currencies.name", "asc");
	$query = $CI->db->get()->result();

	$selected = '';
	$html = '<option value="">Select</option>';
	foreach ($query as $k => $val) {
		if ($val->code == $selected_id) {
			$selected = "selected";
		} else {
			$selected = "";
		}
		$html .= '<option value="' . $val->code . '" ' . $selected . ' >' . $val->name . '</option>';
	}

	echo $html;
}



function pr($obj)
{
	echo '<pre>';
	print_r($obj);
	echo '</pre>';
}
function get_settings_value($name)
{
	$CI = &get_instance();
	$CI->db->select('settings.value ');
	$CI->db->from('settings');
	$CI->db->where("settings.name", $name);
	$CI->db->order_by("settings.id", "asc");
	$query = $CI->db->get()->row_array();
	if (!empty($query)) {
		return $query['value'];
	} else {
		return;
	}
}

function authenticate()
{
	$CI = &get_instance();
	$current_userId = $CI->session->userdata("user_id");
	$current_userEmail = $CI->session->userdata("user_email");
	if (empty($current_userId) && empty($current_userEmail)) {
		echo "<script>window.parent.location.href='" . base_url() . "'</script>";
	}
}
function front_authenticate()
{
	$CI = &get_instance();
	$examinee_id = $CI->session->userdata("examinee_id");
	$examinee_contact_no = $CI->session->userdata("examinee_contact_no");
	if (empty($examinee_id) && empty($examinee_contact_no)) {
		echo "<script>window.parent.location.href='" . base_url() . "'</script>";
	}
}
function get_role_name($id)
{
	$CI = &get_instance();
	$CI->db->select('roles.name ');
	$CI->db->from('roles');
	$CI->db->where("roles.id", $id);
	$CI->db->order_by("roles.id", "asc");
	$query = $CI->db->get()->row_array();
	if (!empty($query)) {
		return $query['name'];
	} else {
		return;
	}
}
function get_role_names($ids)
{
	$CI = &get_instance();
	$ids = explode(',', $ids);
	$names = array();
	foreach ($ids as $k => $id) {
		$CI->db->select('roles.name ');
		$CI->db->from('roles');
		$CI->db->where("roles.id", $id);
		$CI->db->order_by("roles.id", "asc");
		$query = $CI->db->get()->row_array();
		if (!empty($query)) {
			$names[] = $query['name'];
		}
	}
	return implode(',', $names);
}

function get_email_template($email_template_key)
{
	$CI = &get_instance();
	$CI->db->select('email_templates.*');
	$CI->db->from('email_templates');
	$CI->db->where('email_templates.email_template_key', $email_template_key);
	$CI->db->order_by("email_templates.id", "asc");
	$query = $CI->db->get()->row();
	if (!empty($query)) {
		return $query;
	} else {
		return;
	}
}


//**************************Roles Modules****************************//
function get_parent_module_name($id)
{
	$CI = &get_instance();
	$CI->db->select('modules.name ');
	$CI->db->from('modules');
	$CI->db->where("modules.id", $id);
	$CI->db->order_by("modules.id", "asc");
	$query = $CI->db->get()->row_array();
	if (!empty($query)) {
		return $query['name'];
	} else {
		return "Self Parent";
	}
}
function get_role_permission($role_id = '', $module_id, $action)
{

	if (!empty($role_id)) {
		$CI = &get_instance();
		$CI->db->select('role_permissions.* ');
		$CI->db->from('role_permissions');
		$CI->db->where("role_permissions.role_id", $role_id);
		$CI->db->where("role_permissions.module_id", $module_id);
		$CI->db->order_by("role_permissions.id", "asc");
		$query = $CI->db->get()->row();
		//echo $CI->db->last_query();
		if (!empty($query)) {
			if ($action == 'add') {
				$return = $query->permission_add;
			} elseif ($action == 'edit') {
				$return = $query->permission_edit;
			} elseif ($action == 'delete') {
				$return = $query->permission_delete;
			} elseif ($action == 'status') {
				$return = $query->permission_status;
			} else {
				$return = $query->permission_view;
			}

			return $return;
		} else {
			return "0";
		}
	} else {
		return '0';
	}
}


function get_left_menus($role_id, $module_id = '', $section = '')
{
	$CI = &get_instance();
	$query = array();
	$result = array();
	if (!empty($role_id)) {

		//$CI->db->select('role_permissions.*,modules.name as module_name,modules.url as module_url,modules.icon as module_icon,modules.order_no as module_order_no,modules.is_url as module_is_url,modules.section ');
		$CI->db->select('role_permissions.id,role_permissions.module_id,role_permissions.parent_module_id,role_permissions.section as section_id,modules.name as module_name,modules.url as module_url,modules.icon as module_icon,modules.order_no as module_order_no,modules.is_url as module_is_url,modules.section ');
		$CI->db->from('role_permissions');
		$CI->db->where("role_permissions.role_id", $role_id);

		if (empty($module_id)) {
			$CI->db->join('modules', 'modules.id = role_permissions.parent_module_id', 'LEFT');
			$CI->db->group_by('role_permissions.parent_module_id');
			$CI->db->where("modules.is_public", '1');
			$CI->db->order_by("modules.order_no", "asc");
		} else {
			$CI->db->where("role_permissions.parent_module_id", $module_id);
			$CI->db->join('modules', 'modules.id = role_permissions.module_id', 'LEFT');
			$CI->db->where("modules.is_public", '1');
			$CI->db->order_by("modules.order_no", "asc");
		}
		$query = $CI->db->get()->result();
		//echo $CI->db->last_query().'<br><br><br>';
		if (!empty($query)) {
			foreach ($query as $k => $menu) {
				$result[$menu->module_id] = $menu;
			}
		}
	}

	return $result;
}


function get_left_menus1($role_id, $module_id = '')
{
	$CI = &get_instance();
	$query = array();
	$result = array();
	if (!empty($role_id)) {

		$CI->db->select('role_permissions.id,role_permissions.section as section_id,modules.section ');
		$CI->db->from('role_permissions');
		$CI->db->where("role_permissions.role_id", $role_id);
		$CI->db->join('modules', 'modules.id = role_permissions.module_id', 'LEFT');
		$CI->db->where("modules.status", '1');
		$CI->db->where("modules.deleted", '0');
		$CI->db->group_by('role_permissions.section');
		$CI->db->order_by("role_permissions.section", "asc");
		$query = $CI->db->get()->result();

		foreach ($query as $k => $qry) {

			$CI->db->select('role_permissions.id,role_permissions.module_id,role_permissions.parent_module_id,role_permissions.section as section_id,modules.name as module_name,modules.url as module_url,modules.icon as module_icon,modules.order_no as module_order_no,modules.is_url as module_is_url,modules.section ');
			$CI->db->from('role_permissions');
			$CI->db->where("role_permissions.role_id", $role_id);
			$CI->db->where("role_permissions.section", $qry->section_id);

			$CI->db->where("role_permissions.parent_module_id", $module_id);
			$CI->db->join('modules', 'modules.id = role_permissions.module_id', 'LEFT');
			$CI->db->where("modules.is_public", '1');
			$CI->db->where("modules.status", '1');
			$CI->db->where("modules.deleted", '0');
			$CI->db->order_by("modules.order_no", "asc");
			$query2 = $CI->db->get()->result();
			//echo $CI->db->last_query().'<br><br><br>';
			if (!empty($query2)) {
				foreach ($query2 as $k2 => $menu2) {
					//pr($menu2);
					$result[$qry->section][$menu2->module_order_no] = $menu2;
				}
			}

			$CI->db->select('role_permissions.id,role_permissions.module_id,role_permissions.parent_module_id,role_permissions.section as section_id,modules.name as module_name,modules.url as module_url,modules.icon as module_icon,modules.order_no as module_order_no,modules.is_url as module_is_url,modules.section ');
			$CI->db->from('role_permissions');
			$CI->db->where("role_permissions.role_id", $role_id);
			$CI->db->where("role_permissions.section", $qry->section_id);
			$CI->db->join('modules', 'modules.id = role_permissions.parent_module_id', 'LEFT');
			$CI->db->group_by('role_permissions.parent_module_id');
			$CI->db->where("modules.is_public", '1');
			$CI->db->where("modules.status", '1');
			$CI->db->where("modules.deleted", '0');
			$CI->db->order_by("modules.order_no", "asc");
			$query3 = $CI->db->get()->result();
			//echo $CI->db->last_query().'<br><br><br>';
			if (!empty($query3)) {
				foreach ($query3 as $k3 => $menu3) {
					$result[$qry->section][$menu3->module_order_no] = $menu3;
					if ($menu3->parent_module_id != '0') {
						$result[$qry->section][$menu3->module_order_no]->child_modules = get_left_menus($role_id, $menu3->parent_module_id);
					}
				}
			}
			usort($result[$qry->section], build_sorter('module_order_no'));
		}
	}

	return $result;
}

function build_sorter($key)
{
	return function ($a, $b) use ($key) {
		return strnatcmp($a->$key, $b->$key);
	};
}




function get_modules_by_section($section, $parent_id = '0')
{
	$CI = &get_instance();
	$query = array();
	$result = array();
	if (!empty($section)) {
		$CI->db->select('modules.* ');
		$CI->db->from('modules');
		$CI->db->where("modules.status", '1');
		$CI->db->where("modules.is_public", '1');
		$CI->db->where("modules.parent_id", $parent_id);
		$CI->db->where("modules.section", $section);
		$CI->db->order_by("modules.order_no", "asc");
		$query = $CI->db->get()->result();
		//echo $CI->db->last_query();

	}

	return $query;
}


function active_menu($module_name, $controller_name, $function_name)
{
	$CI = &get_instance();
	$result = array();
	$url = ($module_name == $controller_name) ? $module_name . '/' . $function_name : $module_name . '/' . $controller_name . '/' . $function_name;

	$CI->db->select('modules.*');
	$CI->db->from('modules');
	$CI->db->where("modules.url", $url);
	$CI->db->where("modules.parent_id!= ", '0');
	$CI->db->where("modules.status", '1');
	$query = $CI->db->get()->row();

	if (!empty($query)) {
		$result['active_parent'] = $query->parent_id;
		$result['active_child'] = $query->id;
	} else {
		$CI->db->select('modules.*');
		$CI->db->from('modules');
		$CI->db->where("modules.url", $url);
		$CI->db->where("modules.parent_id", '0');
		$CI->db->where("modules.status", '1');
		$query = $CI->db->get()->row();

		if (!empty($query)) {
			$result['active_parent'] = $query->parent_id;
			$result['active_child'] = $query->id;
		}
	}
	return $result;
}

function get_module_permission($role_id, $module_id)
{
	$query = new stdClass();
	if (!empty($role_id)) {
		$CI = &get_instance();
		$CI->db->select('role_permissions.permission_add,role_permissions.permission_edit,role_permissions.permission_delete,role_permissions.permission_view,role_permissions.permission_status ');
		$CI->db->from('role_permissions');
		$CI->db->where("role_permissions.role_id", $role_id);
		$CI->db->where("role_permissions.module_id", $module_id);
		$CI->db->order_by("role_permissions.id", "asc");
		$query = $CI->db->get()->row();
		//echo $CI->db->last_query();
		return $query;
	} else {
		return $query;
	}
}


function password_strength($password)
{
	$password_length = 8;
	$returnVal = True;

	if (strlen($password) < $password_length) {
		$returnVal = False;
	}

	if (!preg_match("#[0-9]+#", $password)) {
		$returnVal = False;
	}

	if (!preg_match("#[a-z]+#", $password)) {
		$returnVal = False;
	}

	if (!preg_match("#[A-Z]+#", $password)) {
		$returnVal = False;
	}

	if (!preg_match("/[\'^£$%&*()}{@#~?><>,|=_+!-]/", $password)) {
		$returnVal = False;
	}
	return $returnVal;
}


//delete file from server
if (!function_exists('delete_file_from_server')) {
	function delete_file_from_server($path)
	{
		$full_path = FCPATH . $path;
		if (strlen($path) > 15 && file_exists($full_path)) {
			@unlink($full_path);
		}
	}
}



//price formatted
if (!function_exists('price_formatted')) {
	function price_formatted($price, $currency, $format = null)
	{
		$ci = &get_instance();
		//$price = $price / 100;
		$dec_point = '.';
		$thousands_sep = ',';
		if ($ci->thousands_separator != '.') {
			$dec_point = '.';
			$thousands_sep = '.';
		}

		if (is_int($price)) {
			$price = number_format($price, 0, $dec_point, $thousands_sep);
		} else {
			$price = number_format($price, 2, $dec_point, $thousands_sep);
		}
		$price = price_currency_format($price, $currency);
		return $price;
	}
}

//price currency format
if (!function_exists('price_currency_format')) {
	function price_currency_format($price, $currency)
	{
		$ci = &get_instance();
		$currency = 'RM';
		$space = " ";
		$price = "<span>" . $currency . "</span>" . $space . $price;
		/*if ($ci->payment_settings->currency_symbol_format == "left") {
            $price = "<span>" . $currency . "</span>" . $space . $price;
        } else {
            $price = $price . $space . "<span>" . $currency . "</span>";
        }*/
		return $price;
	}
}



//set cached data by lang
if (!function_exists('set_cache_data')) {
	function set_cache_data($key, $data)
	{
		$ci = &get_instance();

		$ci->load->driver('cache', array('adapter' => 'apc', 'backup' => 'file'));
		$ci->cache->save($key, $data, 50000);
	}
}
//get cached data by lang
if (!function_exists('get_cached_data')) {
	function get_cached_data($key)
	{
		$ci = &get_instance();
		$ci->load->driver('cache', array('adapter' => 'apc', 'backup' => 'file'));
		if ($data = $ci->cache->get($key)) {
			return $data;
		}
	}
}
//count item
if (!function_exists('item_count')) {
	function item_count($items)
	{
		if (!empty($items)) {
			return count($items);
		}
		return 0;
	}
}



//print date
if (!function_exists('formatted_date')) {
	function formatted_date($timestamp)
	{
		return date("Y-m-d / H:i", strtotime($timestamp));
	}
}

//print formatted hour
if (!function_exists('formatted_hour')) {
	function formatted_hour($timestamp)
	{
		return date("H:i", strtotime($timestamp));
	}
}

if (!function_exists('time_ago')) {
	function time_ago($timestamp)
	{
		$time_ago = strtotime($timestamp);
		$current_time = time();
		$time_difference = $current_time - $time_ago;
		$seconds = $time_difference;
		$minutes = round($seconds / 60);           // value 60 is seconds
		$hours = round($seconds / 3600);           //value 3600 is 60 minutes * 60 sec
		$days = round($seconds / 86400);          //86400 = 24 * 60 * 60;
		$weeks = round($seconds / 604800);          // 7*24*60*60;
		$months = round($seconds / 2629440);     //((365+365+365+365+366)/5/12)*24*60*60
		$years = round($seconds / 31553280);     //(365+365+365+365+366)/5 * 24 * 60 * 60
		if ($seconds <= 60) {
			return trans("just_now");
		} else if ($minutes <= 60) {
			if ($minutes == 1) {
				return "1 minute ago";
			} else {
				return "$minutes minutes ago";
			}
		} else if ($hours <= 24) {
			if ($hours == 1) {
				return "1 hour ago";
			} else {
				return "$hours hours ago";
			}
		} else if ($days <= 30) {
			if ($days == 1) {
				return "1 day ago";
			} else {
				return "$days days ago";
			}
		} else if ($months <= 12) {
			if ($months == 1) {
				return "1 month ago";
			} else {
				return "$months months ago";
			}
		} else {
			if ($years == 1) {
				return "1 year ago";
			} else {
				return "$years years ago";
			}
		}
	}
}


//get file manager image
if (!function_exists('get_file_manager_image')) {
	function get_file_manager_image($image)
	{
		$path = base_url('assets/admin/media/illustrations/404-hd.png');
		$ci = &get_instance();
		if (!empty($image)) {
			$path = base_url() . "assets/uploads/files_manager/" . $image->image_path;
		}
		return $path;
	}
}
//generate unique id
if (!function_exists('generate_unique_id')) {
	function generate_unique_id()
	{
		$id = uniqid("", TRUE);
		$id = str_replace(".", "-", $id);
		return $id . "-" . rand(10000000, 99999999);
	}
}
//generate ids string
if (!function_exists('generate_ids_string')) {
	function generate_ids_string($array)
	{
		if (empty($array)) {
			return "0";
		} else {
			$array_new = array();
			foreach ($array as $item) {
				if (!empty(clean_number($item))) {
					array_push($array_new, clean_number($item));
				}
			}
			return implode(',', $array_new);
		}
	}
}

function order_count($seller_id, $delivery_status = '', $created_at = '')
{
	$CI = &get_instance();
	$CI->db->select('orders.* ');
	$CI->db->from('orders');
	if (!empty($delivery_status)) {
		$CI->db->where("orders.order_status", $delivery_status);
	}
	if (!empty($created_at)) {
		$CI->db->where("DATE(orders.created_at)", $created_at);
	}
	if ($seller_id != '1') {
		$CI->db->where("orders.seller_id", $seller_id);
	}
	$CI->db->order_by("orders.id", "desc");
	$query = $CI->db->get()->result();
	//echo $CI->db->last_query();
	if (!empty($query)) {
		return count($query);
	} else {
		return 0;
	}
}

function totalRevenue($seller_id, $created_at = '')
{
	$CI = &get_instance();
	$total_price = 0;
	$comission = 10;
	$CI->db->select_sum('price_total');
	$CI->db->where('orders.order_status', 'completed');
	$CI->db->from('orders');
	if ($seller_id != '1') {
		$CI->db->where("orders.seller_id", $seller_id);
	}
	if (!empty($created_at)) {
		$CI->db->where("DATE(orders.created_at)", $created_at);
	}
	$CI->db->order_by("id", "desc");
	$query1 = $CI->db->get()->row();
	if (!empty($query1->price_total)) {
		$total_price = $query1->price_total;
	}
	//echo $CI->db->last_query();
	$pixxi_earning = ($total_price * $comission / 100);

	return $pixxi_earning;
}

function thirty_days_order_count($seller_id, $delivery_status = '', $created_at = '')
{
	$CI = &get_instance();
	$CI->db->select('orders.* ');
	$CI->db->from('orders');
	if (!empty($delivery_status)) {
		$CI->db->where("orders.order_status", $delivery_status);
	}
	if (!empty($created_at)) {
		$CI->db->where("DATE(orders.created_at)", $created_at);
	}
	if ($seller_id != '1') {
		$CI->db->where("orders.seller_id", $seller_id);
	}
	$CI->db->where('created_at BETWEEN DATE_SUB(NOW(), INTERVAL 30 DAY) AND NOW()');
	$CI->db->order_by("orders.id", "desc");
	$query = $CI->db->get()->result();
	//echo $CI->db->last_query();
	if (!empty($query)) {
		return count($query);
	} else {
		return 0;
	}
}

function total_customer($role_ids)
{
	$CI = &get_instance();
	$CI->db->select('users.* ');
	$CI->db->from('users');

	$CI->db->where("users.role_ids", $role_ids);
	$CI->db->where('addedOn BETWEEN DATE_SUB(NOW(), INTERVAL 30 DAY) AND NOW()');
	$CI->db->where("users.deleted", '0');
	$CI->db->order_by("users.id", "desc");
	$query = $CI->db->get()->result();
	//echo $CI->db->last_query();
	if (!empty($query)) {
		return count($query);
	} else {
		return 0;
	}
}


function percentage_calc($num1,$num2){
	//echo $num1.'----'.$num2;
	if($num1!='0' || $num2!='0'){
		if($num1 > $num2 ){
			$return['number'] = ($num2!='0')?(($num1-$num2)/$num2 * 100):$num1;
			$return['badge'] = 'success';
			$return['sign'] = 'fa-chevron-up';
		}else{
			$return['number'] = ($num1!='0')?(($num2-$num1)/$num1 * 100):$num2;
			$return['badge'] = 'danger';
			$return['sign'] = 'fa-chevron-down';
		}
	}else{
		$return['number'] = 0;
		$return['badge'] = 'success';
		$return['sign'] = 'fa-chevron-up';
	}
	$return['number'] = round($return['number'],2);
	return $return;
}

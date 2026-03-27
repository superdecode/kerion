<?php defined('BASEPATH') or exit('No direct script access allowed');

class Imports extends BackendController
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
  public function __construct()
  {
    parent::__construct();
    $this->load->model('Import_model');
    $this->load->library('Csvimport');
  }
  public function master_products()
  {
    authenticate();
    $result = array();
    $query = new stdClass();
    $data['header']['site_title'] = 'Importar Lista Maestra de Productos';
    $data['prod_count'] = $this->Import_model->getTotalCountProduct();
    $data['seller_name'] = $this->Import_model->getSellernameList();
    
    if($this->session->userdata('user_id')!='1'){
      $data['categories'] = $this->getAllcategoryData($this->session->userdata('seller_id'),0);
    }else{
      $data['categories'] = '<option value="">Seleccionar Categorías</option>';
    }
    

    if ($this->input->post()) {

      if (is_uploaded_file($_FILES['file']['tmp_name'])) {
        //validate whether uploaded file is a csv file
        $csvMimes = array('text/x-comma-separated-values', 'text/comma-separated-values', 'application/octet-stream', 'application/vnd.ms-excel', 'application/x-csv', 'text/x-csv', 'text/csv', 'application/csv', 'application/excel', 'application/vnd.msexcel', 'text/plain');
        $mime = get_mime_by_extension($_FILES['file']['name']);
        $fileArr = explode('.', $_FILES['file']['name']);
        $ext = end($fileArr);
        if (($ext == 'csv') && in_array($mime, $csvMimes)) {
          $file = $_FILES['file']['tmp_name'];
          $csvData = $this->csvimport->get_array($file);
          $headerArr = array("Product_Name", "Description", "Unit_price", "Sku", "Inventory_item", "Stock", "Variant_product", "Discount_type", "Discount", "Dine_in", "Take_out");
          if (!empty($csvData)) {
            //Validate CSV headers
            $csvHeaders = array_keys($csvData[0]);
            $headerMatched = 1;
            foreach ($headerArr as $header) {
              if (!in_array(trim($header), $csvHeaders)) {
                $headerMatched = 0;
              }
            }
            if ($headerMatched == 0) {
              $this->session->set_flashdata("error_msg", "Los encabezados CSV no coinciden.");
              redirect('Imports/master_products');
            } else {
              $count = 0;
              foreach ($csvData as $row) {
                $option = explode(",", $row['Options']);
                if (!empty($option)) {
                  $isbnList = [];
                  foreach ($option as $k2 => $option_name) {
                    $getProductDetails = $this->Import_model->getOptionsDetails($option_name);
                    $isbnList[] = $getProductDetails->id;
                  }
                }

                $isbn = implode(",", $isbnList);

                $post['title'] = $row['Product_Name'];
                $post['seller_id'] = $this->input->post('seller_id');
                $post['category_id'] = $this->input->post('category_id');
                //$post['seller_id'] =$row['Seller_id'];
                //$post['category_id'] =$row['Category_id'];
                $post['description'] = $row['Description'];
                $post['unit_price'] = $row['Unit_price'];
                $post['dine_in'] = $row['Dine_in'];
                $post['take_out'] = $row['Take_out'];
                $post['sku'] = $row['Sku'];
                $post['inventory_item'] = $row['Inventory_item'];
                $post['current_stock'] = $row['Stock'];
                $post['variant_product'] = $row['Variant_product'];
                $post['discount_type'] = $row['Discount_type'];
                $post['discount'] = $row['Discount'];

                $discount = ($row['Discount_type'] == 'flat') ? $row['Discount'] : round(($row['Unit_price'] * $row['Discount'] / 100), 2);
                $post['purchase_price'] = $row['Unit_price'] - $discount;
                //$post['option_ids'] = $isbn;
                //$post['slug'] =!empty($this->input->$row('slug'))?$this->input->post('slug'):url_title($this->input->post('title'), 'dash', TRUE); 
                date_default_timezone_set('Asia/Dubai');

                $post['addedBy'] = $this->session->userdata('user_id');
                $post['addedOn'] = date('Y-m-d H:i:s');
                $result = $this->Import_model->saveProduct($post);
                $count++;
              }


              $this->session->set_flashdata("success_msg", "Archivo CSV importado con éxito.");
              redirect('Imports/master_products');
            }
          }
        } else {
          $this->session->set_flashdata("error_msg", "Seleccione solo archivo CSV.");
          redirect('Imports/master_products');
        }
      } else {
        $this->session->set_flashdata("error_msg", "Seleccione un archivo CSV para cargar.");
        redirect('Imports/master_products');
      }
    }
    $this->render('admin/master_products', $data);
  }


  public function getAllcategoryData($seller_id,$is_html=1, $selected_id = '')
  {
    //echo 'MYID'.$seller_id;
    $query = $this->Import_model->getAllCategoryData($seller_id);
    //pr($query);die;
    $selected = '';
    $html = '<option value="">Seleccionar Categoría</option>';
    if (!empty($query)) {
      foreach ($query as $k => $val) {
        if ($val->id == $selected_id) {
          $selected = "selected";
        } else {
          $selected = "";
        }
        $html .= '<option value="' . $val->id . '" ' . $selected . ' >' . $val->title . '</option>';
      }
    }
    if($is_html=='1'){
      echo $html;
    }else{
      return $html;
    }
    
  }
  public function getAllproductsData($seller_id, $selected_id = '')
  {
    //echo 'MYID'.$seller_id;
    $query = $this->Import_model->getAllproductData($seller_id);
    //pr($query);die;
    $selected = '';
    $html = '<option value="">Seleccionar Productos</option>';
    if (!empty($query)) {
      foreach ($query as $k => $val) {
        if ($val->id == $selected_id) {
          $selected = "selected";
        } else {
          $selected = "";
        }
        $html .= '<option value="' . $val->id . '" ' . $selected . ' >' . $val->title . '</option>';
      }
    }
    echo $html;
  }

  public function products_size()
  {
    authenticate();
    $result = array();
    $query = new stdClass();
    $data['header']['site_title'] = 'Tamaño de los productos de importación';
    $data['seller_name'] = $this->Import_model->getSellernameList();
    $data['categories'] = '<option value="">Selecciona Categorías</option>';
    $data['products'] = '<option value="">Seleccionar Productos</option>';
    if ($this->input->post()) {

      if (is_uploaded_file($_FILES['file']['tmp_name'])) {
        //validate whether uploaded file is a csv file
        $csvMimes = array('text/x-comma-separated-values', 'text/comma-separated-values', 'application/octet-stream', 'application/vnd.ms-excel', 'application/x-csv', 'text/x-csv', 'text/csv', 'application/csv', 'application/excel', 'application/vnd.msexcel', 'text/plain');
        $mime = get_mime_by_extension($_FILES['file']['name']);
        $fileArr = explode('.', $_FILES['file']['name']);
        $ext = end($fileArr);
        if (($ext == 'csv') && in_array($mime, $csvMimes)) {
          $file = $_FILES['file']['tmp_name'];
          $csvData = $this->csvimport->get_array($file);
          $headerArr = array("Product_name", "Size", "Price", "Sku");
          if (!empty($csvData)) {
            //Validate CSV headers
            $csvHeaders = array_keys($csvData[0]);
            $headerMatched = 1;
            foreach ($headerArr as $header) {
              if (!in_array(trim($header), $csvHeaders)) {
                $headerMatched = 0;
              }
            }
            if ($headerMatched == 0) {
              $this->session->set_flashdata("error_msg", "Los encabezados CSV no coinciden.");
              redirect('Imports/products_size');
            } else {
              $count = 0;
              foreach ($csvData as $row) {
                $seller_id = $this->input->post('seller_id');
                $getProductDetails = $this->Import_model->getProductDetails($row['Product_name'], $seller_id);
                if (!empty($getProductDetails)) {
                  //$post['seller_id'] =$this->input->post('seller_id');
                  //$post['title'] =$row['Product_Name'];
                  $post['product_id'] = $getProductDetails->id;
                  $post['variation_name'] = $row['Size'];
                  $post['price'] = $row['Price'];
                  $post['sku'] = $row['Sku'];
                  date_default_timezone_set('Asia/Dubai');

                  $post['addedBy'] = $this->session->userdata('user_id');
                  $post['addedOn'] = date('Y-m-d H:i:s');
                  $result = $this->Import_model->saveOptions($post);
                }
              }


              $this->session->set_flashdata("success_msg", "Archivo CSV importado con éxito.");
              redirect('Imports/products_size');
            }
          }
        } else {
          $this->session->set_flashdata("error_msg", "Seleccione solo archivo CSV.");
          redirect('Imports/products_size');
        }
      } else {
        $this->session->set_flashdata("error_msg", "Seleccione un archivo CSV para cargar.");
        redirect('Imports/products_size');
      }
    }
    $this->render('admin/products_size', $data);
  }
}

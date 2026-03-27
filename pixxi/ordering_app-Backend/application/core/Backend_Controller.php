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

class BackendController extends MY_Controller
{
    //
    public $CI;

    /**
     * An array of variables to be passed through to the
     * view, layout, ....
     */
    protected $data = array();

    /**
     * [__construct description]
     *
     * @method __construct
     */
    public function __construct()
    {
        // To inherit directly the attributes of the parent class.
        parent::__construct();		
		$this->load->database();
        // CI profiler
        $this->output->enable_profiler(false);

        // This function returns the main CodeIgniter object.
        // Normally, to call any of the available CodeIgniter object or pre defined library classes then you need to declare.
        $CI =& get_instance();

        //Example data
        // Site name
        $this->data['sitename'] = 'Test';

        //Example data
        // Browser tab
        $this->data['site_title'] = ucfirst('Admin Dashboard');
		
		$this->session_id = session_id();
		$timezone = !empty($this->session->userdata("user_time_zone"))?$this->session->userdata("user_time_zone"):'Asia/Kolkata';
		date_default_timezone_set($timezone);
		
    }

    /**
     * [render_page description]
     *
     * @method render_page
     *
     * @param  [type]      $view [description]
     * @param  [type]      $data [description]
     *
     * @return [type]            [description]
     */
    protected function render($view, $data)
    {
        $this->load->view('templates/admin/header', $data);
        $this->load->view('templates/admin/main_sidebar', $data);
        $this->load->view('templates/admin/content_header', $data);
        $this->load->view($view, $data);        
        $this->load->view('templates/admin/content_footer', $data);
        $this->load->view('templates/admin/footer', $data);
    }
}

<?php
/**
 * Plugin Name: LE-SOFT MAKE — Sales & Furniture Design Portal
 * Plugin URI:  https://leadingedge.me
 * Description: Connected Sales & Design Portal for LE-SOFT MAKE module with centralized Product Database, custom dimensional sizing, version-tracked approvals, and direct TrueNAS PostgREST / Supabase integration.
 * Version:     1.6.0
 * Author:      Leading Edge Technologies
 * Author URI:  https://leadingedge.me
 * Text Domain: le-make-sales-portal
 * Domain Path: /languages
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

define('LE_MAKE_PLUGIN_VERSION', '1.6.0');
define('LE_MAKE_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('LE_MAKE_PLUGIN_URL', plugin_dir_url(__FILE__));

// Include required classes
require_once LE_MAKE_PLUGIN_DIR . 'includes/class-nas-db-client.php';
require_once LE_MAKE_PLUGIN_DIR . 'includes/class-api-controller.php';
require_once LE_MAKE_PLUGIN_DIR . 'includes/class-admin-settings.php';

class LEMakeSalesPortalPlugin {

    private static $instance = null;

    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));

        add_action('init', array($this, 'register_roles_and_caps'));
        add_action('init', array($this, 'register_shortcodes'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_scripts'));
        add_filter('script_loader_tag', array($this, 'filter_script_loader_tag'), 10, 2);
        add_filter('wp_inline_script_attributes', array($this, 'filter_inline_script_attributes'), 10, 2);
        add_filter('litespeed_optm_js_exc', array($this, 'litespeed_exclude_scripts'));
        
        // Background sync cron event
        add_action('le_make_hourly_sync_event', array($this, 'run_background_sync'));

        // Initialize components
        LEMakeAdminSettings::get_instance();
        LEMakeApiController::get_instance();
    }

    public function activate() {
        $this->register_roles_and_caps();

        // Set default options if not exists
        if (!get_option('le_make_nas_url')) {
            update_option('le_make_nas_url', 'http://100.88.85.6:3001');
        }
        if (!get_option('le_make_nas_local_url')) {
            update_option('le_make_nas_local_url', 'http://192.168.1.14:3001');
        }
        if (!get_option('le_make_nas_tunnel_url')) {
            update_option('le_make_nas_tunnel_url', 'https://db.lenas.me');
        }
        if (!get_option('le_make_supabase_url')) {
            update_option('le_make_supabase_url', 'https://ildkkgjrolcjijwfokek.supabase.co');
        }

        // Schedule background sync cron if not already scheduled
        if (!wp_next_scheduled('le_make_hourly_sync_event')) {
            wp_schedule_event(time(), 'hourly', 'le_make_hourly_sync_event');
        }

        flush_rewrite_rules();
    }

    public function register_roles_and_caps() {
        // 1. Salesperson Role
        add_role('make_salesperson', __('Salesperson', 'le-make-sales-portal'), array(
            'read'                     => true,
            'access_make_sales_portal' => true,
            'create_make_orders'       => true,
            'approve_make_orders'      => true,
        ));

        // 2. Furniture Designer Role
        add_role('make_designer', __('Furniture Designer', 'le-make-sales-portal'), array(
            'read'                     => true,
            'access_make_sales_portal' => true,
            'create_make_orders'       => true,
            'approve_make_orders'      => true,
            'set_make_pricing'         => true,
            'review_make_specs'        => true,
        ));

        // 3. Factory Manager Role
        add_role('make_factory_manager', __('Factory Manager', 'le-make-sales-portal'), array(
            'read'                     => true,
            'access_make_sales_portal' => true,
            'update_production_status' => true,
            'upload_production_photos' => true,
        ));

        // 4. Add capabilities to administrator
        $admin = get_role('administrator');
        if ($admin) {
            $admin->add_cap('access_make_sales_portal');
            $admin->add_cap('create_make_orders');
            $admin->add_cap('approve_make_orders');
            $admin->add_cap('set_make_pricing');
            $admin->add_cap('review_make_specs');
            $admin->add_cap('update_production_status');
            $admin->add_cap('upload_production_photos');
            $admin->add_cap('manage_make_settings');
            $admin->add_cap('modify_all_make_data');
        }
    }

    public function deactivate() {
        $timestamp = wp_next_scheduled('le_make_hourly_sync_event');
        if ($timestamp) {
            wp_unschedule_event($timestamp, 'le_make_hourly_sync_event');
        }
        flush_rewrite_rules();
    }

    public function run_background_sync() {
        $client = LEMakeNasDbClient::get_instance();
        // 1. Sync pending offline orders into NAS
        $client->sync_pending_offline_orders_to_nas();
        // 2. Sync pending offline files into NAS Storage
        $client->sync_pending_files_to_nas();
        // 3. Backfill any historical NAS orders/products into Supabase
        $client->backfill_nas_to_supabase();
        // 4. Enforce 1GB rolling window limit on Supabase Storage
        $client->prune_supabase_storage_to_1gb();
    }

    public function register_shortcodes() {
        add_shortcode('make_sales_portal', array($this, 'render_sales_portal_shortcode'));
        add_shortcode('le_make_portal', array($this, 'render_sales_portal_shortcode'));
    }

    public function filter_script_loader_tag($tag, $handle) {
        if ($handle === 'le-make-portal-js') {
            return str_replace('<script ', '<script data-no-optimize="1" data-cfasync="false" ', $tag);
        }
        return $tag;
    }

    public function filter_inline_script_attributes($attrs, $javascript) {
        if (strpos($javascript, 'LE_MAKE_CONFIG') !== false) {
            $attrs['data-no-optimize'] = '1';
            $attrs['data-cfasync'] = 'false';
        }
        return $attrs;
    }

    public function litespeed_exclude_scripts($excludes) {
        if (!is_array($excludes)) {
            $excludes = array();
        }
        $excludes[] = 'portal.js';
        $excludes[] = 'le-make-portal-js';
        $excludes[] = 'LE_MAKE_CONFIG';
        return $excludes;
    }

    public function enqueue_frontend_scripts($force = false) {
        global $post;
        $has_shortcode = $force || (is_a($post, 'WP_Post') && (has_shortcode($post->post_content, 'make_sales_portal') || has_shortcode($post->post_content, 'le_make_portal')));

        if ($has_shortcode || is_admin()) {
            $css_file = LE_MAKE_PLUGIN_DIR . 'assets/css/portal.css';
            $css_ver  = LE_MAKE_PLUGIN_VERSION . '.' . (file_exists($css_file) ? filemtime($css_file) : time());

            $js_file  = LE_MAKE_PLUGIN_DIR . 'assets/js/portal.js';
            $js_ver   = LE_MAKE_PLUGIN_VERSION . '.' . (file_exists($js_file) ? filemtime($js_file) : time());

            if (!wp_style_is('le-make-portal-css', 'enqueued')) {
                wp_enqueue_style(
                    'le-make-portal-css',
                    LE_MAKE_PLUGIN_URL . 'assets/css/portal.css',
                    array(),
                    $css_ver
                );
            }

            // Google Fonts (Playfair Display + Plus Jakarta Sans)
            if (!wp_style_is('le-make-google-fonts', 'enqueued')) {
                wp_enqueue_style(
                    'le-make-google-fonts',
                    'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&display=swap',
                    array(),
                    null
                );
            }

            if (!wp_script_is('le-make-portal-js', 'enqueued')) {
                wp_enqueue_script(
                    'le-make-portal-js',
                    LE_MAKE_PLUGIN_URL . 'assets/js/portal.js',
                    array(),
                    $js_ver,
                    true
                );

                $is_logged_in = is_user_logged_in();
                $user_payload = null;

                if ($is_logged_in) {
                    $current_user = wp_get_current_user();
                    $user_roles = (array)$current_user->roles;

                    $is_admin = current_user_can('administrator') || current_user_can('manage_options');
                    $is_designer = in_array('make_designer', (array)$user_roles, true) || current_user_can('set_make_pricing');
                    $is_factory_manager = in_array('make_factory_manager', (array)$user_roles, true) || in_array('factory_manager', (array)$user_roles, true) || current_user_can('update_production_status');
                    $is_salesperson = in_array('make_salesperson', (array)$user_roles, true) || (!$is_admin && !$is_designer && !$is_factory_manager);

                    $display_role = 'Salesperson';
                    if ($is_admin) {
                        $display_role = 'Administrator';
                    } elseif ($is_designer) {
                        $display_role = 'Furniture Designer';
                    } elseif ($is_factory_manager) {
                        $display_role = 'Factory Manager';
                    }

                    $user_payload = array(
                        'id'                  => $current_user->ID,
                        'name'                => $current_user->display_name ?: $current_user->user_login,
                        'email'               => $current_user->user_email,
                        'roleName'            => $display_role,
                        'isAdmin'             => $is_admin,
                        'isDesigner'          => $is_designer,
                        'isFactoryManager'    => $is_factory_manager,
                        'isSalesperson'       => $is_salesperson,
                        'canApprove'          => current_user_can('approve_make_orders') || $is_admin,
                        'canCreate'           => current_user_can('create_make_orders') || $is_admin || $is_designer,
                        'canSetPricing'       => current_user_can('set_make_pricing') || $is_admin || $is_designer,
                        'canEditCost'         => $is_admin || $is_designer || $is_salesperson,
                        'canEditSale'         => $is_admin || $is_designer,
                        'canUpdateProduction' => $is_factory_manager || $is_admin,
                    );
                }

                $portal_config = array(
                    'apiUrl'     => esc_url_raw(rest_url('le-make/v1/')),
                    'nonce'      => wp_create_nonce('wp_rest'),
                    'isLoggedIn' => $is_logged_in,
                    'user'       => $user_payload,
                    'loginUrl'   => wp_login_url(get_permalink()),
                    'version'    => $js_ver,
                );

                wp_localize_script('le-make-portal-js', 'LE_MAKE_CONFIG', $portal_config);
                wp_add_inline_script('le-make-portal-js', 'window.LE_MAKE_CONFIG = ' . wp_json_encode($portal_config) . ';', 'before');
            }
        }
    }

    public function render_sales_portal_shortcode($atts) {
        // Prevent all caching engines from caching this dynamic SPA page
        if (!defined('DONOTCACHEPAGE')) {
            define('DONOTCACHEPAGE', true);
        }
        if (!headers_sent()) {
            nocache_headers();
            header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
            header('Pragma: no-cache');
            header('Expires: 0');
        }
        do_action('litespeed_control_set_nocache', 'LE MAKE Portal Dynamic SPA');

        $this->enqueue_frontend_scripts(true);
        ob_start();
        include LE_MAKE_PLUGIN_DIR . 'templates/sales-portal-template.php';
        return ob_get_clean();
    }
}

// Initialize plugin
LEMakeSalesPortalPlugin::get_instance();

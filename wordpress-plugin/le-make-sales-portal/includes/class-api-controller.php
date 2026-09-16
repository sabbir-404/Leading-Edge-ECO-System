<?php
/**
 * WordPress REST API Controller for LE-SOFT MAKE Portal
 * Exposes /wp-json/le-make/v1 endpoints with permission checks and validation
 */

if (!defined('ABSPATH')) {
    exit;
}

class LEMakeApiController {

    private static $instance = null;
    private $namespace = 'le-make/v1';

    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    public function register_routes() {
        // Public Auth Endpoints
        register_rest_route($this->namespace, '/auth/login', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'auth_login'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route($this->namespace, '/auth/logout', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'auth_logout'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route($this->namespace, '/auth/me', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'auth_me'),
            'permission_callback' => '__return_true',
        ));

        // Products Catalog
        register_rest_route($this->namespace, '/products', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'get_products'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Product Purchase History
        register_rest_route($this->namespace, '/products/(?P<id>\d+)/history', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'get_product_history'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Salesperson Orders
        register_rest_route($this->namespace, '/orders', array(
            array(
                'methods'             => 'GET',
                'callback'            => array($this, 'get_orders'),
                'permission_callback' => array($this, 'check_user_permission'),
            ),
            array(
                'methods'             => 'POST',
                'callback'            => array($this, 'create_order'),
                'permission_callback' => array($this, 'check_user_permission'),
            ),
        ));

        // Single Order Details
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'get_order_details'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Approve Order Version
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)/approve', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'approve_order_version'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Reject Order Version
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)/reject', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'reject_order_version'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Version Diff
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)/diff', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'get_version_diff'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Version History List
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)/versions', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'get_order_versions'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Dashboard Stats
        register_rest_route($this->namespace, '/stats', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'get_stats'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // System & NAS Offline Failover Status
        register_rest_route($this->namespace, '/system-status', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'get_system_status'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Sync Check & Drain Trigger
        register_rest_route($this->namespace, '/sync-check', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'sync_check'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Attachment Upload (with offline buffering)
        register_rest_route($this->namespace, '/upload-attachment', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'upload_attachment'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Production Stage Update
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)/stage-update', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'update_stage'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Attach File/Image to Existing Order (Admin, Designer, Salesman)
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)/attach', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'attach_file_to_order'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // In-Portal & Push Notifications
        register_rest_route($this->namespace, '/notifications', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'get_notifications'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        register_rest_route($this->namespace, '/notifications/(?P<id>\d+)/read', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'mark_notification_read'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        register_rest_route($this->namespace, '/notifications/read-all', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'mark_all_notifications_read'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Auto-Publish Single User from Software DB
        register_rest_route($this->namespace, '/publish-user', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'publish_user'),
            'permission_callback' => array($this, 'check_publish_permission'),
        ));

        // Staff User Synchronization with TrueNAS NAS DB
        register_rest_route($this->namespace, '/sync-users', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'sync_users'),
            'permission_callback' => array($this, 'check_publish_permission'),
        ));

        // Media Proxy to serve TrueNAS Storage files through WordPress (bypasses Cloudflare Access 403 on client browsers)
        // Registered under both le-make/v1 and le-make-portal/v1 to prevent rest_no_route errors
        register_rest_route($this->namespace, '/media-proxy', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'media_proxy'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route('le-make-portal/v1', '/media-proxy', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'media_proxy'),
            'permission_callback' => '__return_true',
        ));
    }

    public function check_user_permission() {
        return is_user_logged_in();
    }

    /**
     * Check permission for publishing or syncing users from software database
     */
    public function check_publish_permission(WP_REST_Request $request) {
        if (current_user_can('manage_options') || current_user_can('administrator')) {
            return true;
        }

        $secret = $request->get_header('X-LE-Publish-Secret') ?: $request->get_param('secret');
        $anon_key = get_option('le_make_anon_key');
        $cf_secret = get_option('le_make_cf_client_secret');

        if (!empty($secret)) {
            if ($anon_key && hash_equals($anon_key, $secret)) {
                return true;
            }
            if ($cf_secret && hash_equals($cf_secret, $secret)) {
                return true;
            }
        }

        // Also permit if the target user actually exists and is active in the software database
        $username = sanitize_text_field($request->get_param('username') ?? '');
        if (!empty($username)) {
            $client = LEMakeNasDbClient::get_instance();
            $nas_user = $client->get_user_by_login($username);
            if ($nas_user && !empty($nas_user['is_active'])) {
                return true;
            }
        }

        return false;
    }

    /**
     * Authenticate user via in-portal login form.
     * Enforces dual-database synchronization:
     * 1. If user is registered on the software database (LESOFT / TrueNAS), automatically
     *    publishes/provisions them into the website database (wp_users) upon valid login.
     * 2. Must exist and be active in the LESOFT database.
     * 3. Validates against either WordPress password or LESOFT bcrypt password.
     */
    public function auth_login(WP_REST_Request $request) {
        $params = $request->get_json_params() ?: $request->get_params();
        $username = sanitize_text_field($params['username'] ?? $params['log'] ?? '');
        $password = $params['password'] ?? $params['pwd'] ?? '';
        $remember = !empty($params['remember']);

        if (empty($username) || empty($password)) {
            return new WP_REST_Response(array('error' => 'Please enter both username and password.'), 400);
        }

        $nas_client = LEMakeNasDbClient::get_instance();

        // 1. Check if user already exists in the Website database (wp_users)
        $wp_user = get_user_by('login', $username);
        if (!$wp_user && is_email($username)) {
            $wp_user = get_user_by('email', $username);
        }

        // 2. Query software database (TrueNAS / Supabase users table)
        $nas_user = $nas_client->get_user_by_login($username);
        if (!$nas_user && $wp_user) {
            $nas_user = $nas_client->get_user_by_login($wp_user->user_login);
            if (!$nas_user && !empty($wp_user->user_email)) {
                $nas_user = $nas_client->get_user_by_login($wp_user->user_email);
            }
            if (!$nas_user) {
                $meta_nas_id = get_user_meta($wp_user->ID, 'le_nas_user_id', true);
                if ($meta_nas_id) {
                    $nas_user = $nas_client->get_user_by_id($meta_nas_id);
                }
            }
        }

        // Must exist and be active in software database
        if (!$nas_user || empty($nas_user['is_active'])) {
            return new WP_REST_Response(array(
                'error' => 'Access restricted. User account was not found or is inactive in the LESOFT database.'
            ), 403);
        }

        // 3. If user exists in software database but is NOT yet published to the website database:
        if (!$wp_user) {
            // Verify password against software database bcrypt hash
            if (empty($nas_user['password_hash']) || !password_verify($password, $nas_user['password_hash'])) {
                return new WP_REST_Response(array(
                    'error' => 'Invalid username or password. Please verify your credentials.'
                ), 401);
            }

            // Automatically publish/provision into WordPress website database
            $published = $nas_client->publish_user_to_wp($nas_user, $password);
            if (is_wp_error($published)) {
                return new WP_REST_Response(array(
                    'error' => 'Failed to publish user to website database: ' . $published->get_error_message()
                ), 500);
            }
            $wp_user = $published;
        } else {
            // User already exists in website database: validate against WP pass or LESOFT bcrypt pass
            $is_valid = false;
            if (wp_check_password($password, $wp_user->user_pass, $wp_user->ID)) {
                $is_valid = true;
            } elseif (!empty($nas_user['password_hash']) && password_verify($password, $nas_user['password_hash'])) {
                $is_valid = true;
                // Sync password to WordPress so both databases remain synchronized
                wp_set_password($password, $wp_user->ID);
            }

            if (!$is_valid) {
                return new WP_REST_Response(array(
                    'error' => 'Invalid username or password. Please verify your credentials.'
                ), 401);
            }

            // Synchronize role and meta from LESOFT
            $role_slug = $nas_client->map_nas_role_to_wp($nas_user);
            if ($role_slug !== 'administrator' || user_can($wp_user, 'administrator')) {
                $wp_user->set_role($role_slug);
            }
            update_user_meta($wp_user->ID, 'le_nas_user_id', $nas_user['id']);
        }

        // Sign in WordPress session
        wp_set_current_user($wp_user->ID);
        wp_set_auth_cookie($wp_user->ID, $remember);

        $userData = $this->build_user_payload($wp_user);
        $nonce = wp_create_nonce('wp_rest');

        return rest_ensure_response(array(
            'success'    => true,
            'isLoggedIn' => true,
            'user'       => $userData,
            'nonce'      => $nonce,
        ));
    }

    /**
     * Endpoint to automatically publish a user from software database into WordPress website database
     */
    public function publish_user(WP_REST_Request $request) {
        $params = $request->get_json_params() ?: $request->get_params();
        $username = sanitize_text_field($params['username'] ?? '');
        $password = $params['password'] ?? null;

        if (empty($username)) {
            return new WP_REST_Response(array('error' => 'Username is required.'), 400);
        }

        $client = LEMakeNasDbClient::get_instance();
        $nas_user = $client->get_user_by_login($username);

        if (!$nas_user) {
            // Build record from incoming parameters if software replication is in progress
            $nas_user = array(
                'id'        => intval($params['softwareUserId'] ?? $params['id'] ?? 0),
                'username'  => $username,
                'email'     => sanitize_email($params['email'] ?? ''),
                'full_name' => sanitize_text_field($params['fullName'] ?? $params['full_name'] ?? $username),
                'role'      => sanitize_text_field($params['role'] ?? 'operator'),
                'phone'     => sanitize_text_field($params['phone'] ?? ''),
                'is_active' => 1
            );
        }

        $published = $client->publish_user_to_wp($nas_user, $password);
        if (is_wp_error($published)) {
            return new WP_REST_Response(array('error' => $published->get_error_message()), 500);
        }

        $user_id = is_object($published) && isset($published->ID) ? $published->ID : intval($published);
        $user_login = is_object($published) && isset($published->user_login) ? $published->user_login : $username;
        $user_roles = is_object($published) && !empty($published->roles) ? (array)$published->roles : array();
        $primary_role = !empty($user_roles) ? $user_roles[0] : 'make_salesperson';

        return rest_ensure_response(array(
            'success'    => true,
            'wp_user_id' => $user_id,
            'username'   => $user_login,
            'role'       => $primary_role,
            'message'    => 'User successfully published to website database.'
        ));
    }


    public function auth_logout() {
        wp_logout();
        return rest_ensure_response(array('success' => true, 'isLoggedIn' => false));
    }

    public function auth_me() {
        $user = wp_get_current_user();
        if (!$user->exists()) {
            return rest_ensure_response(array('isLoggedIn' => false, 'user' => null));
        }

        return rest_ensure_response(array(
            'isLoggedIn' => true,
            'user'       => $this->build_user_payload($user),
            'nonce'      => wp_create_nonce('wp_rest'),
        ));
    }

    private function build_user_payload($user) {
        $user_roles = (array)$user->roles;
        $is_admin = user_can($user, 'administrator') || user_can($user, 'manage_options');
        $is_designer = in_array('make_designer', $user_roles, true) || user_can($user, 'set_make_pricing');
        $is_factory_manager = in_array('make_factory_manager', $user_roles, true) || in_array('factory_manager', $user_roles, true) || user_can($user, 'update_production_status');
        $is_salesperson = in_array('make_salesperson', $user_roles, true) || (!$is_admin && !$is_designer && !$is_factory_manager);

        $display_role = 'Salesperson';
        if ($is_admin) {
            $display_role = 'Administrator';
        } elseif ($is_designer) {
            $display_role = 'Furniture Designer';
        } elseif ($is_factory_manager) {
            $display_role = 'Factory Manager';
        }

        return array(
            'id'                  => $user->ID,
            'name'                => $user->display_name ?: $user->user_login,
            'email'               => $user->user_email,
            'roleName'            => $display_role,
            'isAdmin'             => $is_admin,
            'isDesigner'          => $is_designer,
            'isFactoryManager'    => $is_factory_manager,
            'isSalesperson'       => $is_salesperson,
            'canApprove'          => user_can($user, 'approve_make_orders') || $is_admin,
            'canCreate'           => user_can($user, 'create_make_orders') || $is_admin || $is_designer,
            'canSetPricing'       => user_can($user, 'set_make_pricing') || $is_admin || $is_designer,
            // Strictly only Admin and Designer can view or edit cost prices
            'canViewCost'         => $is_admin || $is_designer,
            'canEditCost'         => $is_admin || $is_designer,
            'canEditSale'         => $is_admin || $is_designer,
            'canUpdateProduction' => $is_factory_manager || $is_admin,
        );
    }

    public static function format_media_url($url) {
        if (empty($url) || !is_string($url)) return $url;
        if (strpos($url, 'media-proxy') !== false) {
            return $url;
        }
        // Normalize any legacy local IP or Tailscale IP to public Cloudflare storage domain
        $normalized = preg_replace('#^http://(?:192\.168\.\d+\.\d+|100\.\d+\.\d+\.\d+|localhost|127\.0\.0\.1):8081#i', 'https://storage.lenas.me', $url);
        if (strpos($normalized, 'storage.lenas.me') !== false || strpos($normalized, 'lenas.me/files/') !== false) {
            return add_query_arg('file', rawurlencode($normalized), rest_url('le-make/v1/media-proxy'));
        }
        return $normalized;
    }

    public function get_products(WP_REST_Request $request) {
        $search = $request->get_param('search') ?: '';
        $client = LEMakeNasDbClient::get_instance();
        $products = $client->get_active_products($search);

        if (is_wp_error($products)) {
            return new WP_REST_Response(array('error' => $products->get_error_message()), 500);
        }

        if (is_array($products)) {
            foreach ($products as &$p) {
                if (!empty($p['main_image'])) {
                    $p['main_image'] = self::format_media_url($p['main_image']);
                }
            }
        }

        return rest_ensure_response($products);
    }

    public function get_product_history(WP_REST_Request $request) {
        $product_id = intval($request->get_param('id'));
        $client = LEMakeNasDbClient::get_instance();
        $history = $client->get_product_purchase_history($product_id);

        return rest_ensure_response($history);
    }

    public function get_orders(WP_REST_Request $request) {
        $status = $request->get_param('status') ?: '';
        $current_user = wp_get_current_user();
        $user_roles = (array)$current_user->roles;
        $is_admin = current_user_can('administrator') || current_user_can('manage_options');
        $is_designer = in_array('make_designer', $user_roles, true);
        $is_factory = in_array('make_factory_manager', $user_roles, true) || in_array('factory_manager', $user_roles, true) || current_user_can('update_production_status');

        // Salesperson sees their own orders; Admin, Designer, and Factory Manager see all orders
        $salesperson_id = (!$is_admin && !$is_designer && !$is_factory) ? $current_user->ID : null;

        $client = LEMakeNasDbClient::get_instance();
        $orders = $client->get_salesperson_orders($salesperson_id, $status);

        if (is_wp_error($orders)) {
            return new WP_REST_Response(array('error' => $orders->get_error_message()), 500);
        }

        if (is_array($orders)) {
            foreach ($orders as &$o) {
                if (!empty($o['current_stage_photo'])) {
                    $o['current_stage_photo'] = self::format_media_url($o['current_stage_photo']);
                }
                if (!empty($o['items']) && is_array($o['items'])) {
                    foreach ($o['items'] as &$it) {
                        if (!empty($it['technical_drawing_url'])) {
                            $it['technical_drawing_url'] = self::format_media_url($it['technical_drawing_url']);
                        }
                        if (!empty($it['pdf_urls']) && is_array($it['pdf_urls'])) {
                            $it['pdf_urls'] = array_map(array('LEMakeApiController', 'format_media_url'), $it['pdf_urls']);
                        }
                    }
                }
            }
        }

        return rest_ensure_response($orders);
    }

    public function get_order_details(WP_REST_Request $request) {
        $order_id = intval($request->get_param('id'));
        $client = LEMakeNasDbClient::get_instance();
        $order = $client->get_order_by_id($order_id);

        if (is_wp_error($order)) {
            return new WP_REST_Response(array('error' => $order->get_error_message()), 500);
        }

        if (!$order) {
            return new WP_REST_Response(array('error' => 'Order not found'), 404);
        }

        if (!empty($order['current_stage_photo'])) {
            $order['current_stage_photo'] = self::format_media_url($order['current_stage_photo']);
        }
        if (!empty($order['items']) && is_array($order['items'])) {
            foreach ($order['items'] as &$it) {
                if (!empty($it['technical_drawing_url'])) {
                    $it['technical_drawing_url'] = self::format_media_url($it['technical_drawing_url']);
                }
                if (!empty($it['pdf_urls']) && is_array($it['pdf_urls'])) {
                    $it['pdf_urls'] = array_map(array('LEMakeApiController', 'format_media_url'), $it['pdf_urls']);
                }
            }
        }

        return rest_ensure_response($order);
    }

    /**
     * Calculate a future date by adding N working days (skipping Fridays).
     * Friday (day-of-week = 5) is the weekend in Bangladesh.
     */
    private static function calculate_working_days_date($working_days, $start_date = null) {
        $date = $start_date ? new \DateTime($start_date) : new \DateTime('now', new \DateTimeZone('Asia/Dhaka'));
        $added = 0;
        while ($added < $working_days) {
            $date->modify('+1 day');
            // Skip Friday (day 5)
            if ((int)$date->format('w') !== 5) {
                $added++;
            }
        }
        return $date->format('Y-m-d');
    }

    public function create_order(WP_REST_Request $request) {
        $params = $request->get_json_params();
        $current_user = wp_get_current_user();

        if (empty($params['customer_name']) || empty($params['customer_phone'])) {
            return new WP_REST_Response(array('error' => 'Customer name and phone number are required.'), 400);
        }

        $reference_bill_no = sanitize_text_field($params['reference_bill_no'] ?? '');
        if (empty($reference_bill_no)) {
            return new WP_REST_Response(array('error' => 'Reference Bill Number is required.'), 400);
        }

        $target_delivery_days = !empty($params['target_delivery_days']) ? intval($params['target_delivery_days']) : null;
        $target_date = !empty($params['target_delivery_date']) ? sanitize_text_field($params['target_delivery_date']) : (!empty($params['delivery_date']) ? sanitize_text_field($params['delivery_date']) : null);

        if (empty($target_date) && !empty($target_delivery_days)) {
            $target_date = self::calculate_working_days_date($target_delivery_days);
        }

        if (empty($target_date)) {
            return new WP_REST_Response(array('error' => 'Targeted Delivery Days is mandatory.'), 400);
        }

        if (empty($params['items']) || !is_array($params['items'])) {
            return new WP_REST_Response(array('error' => 'At least one product item is required.'), 400);
        }

        $user_roles = (array)$current_user->roles;
        $is_admin = current_user_can('administrator') || current_user_can('manage_options');
        $is_designer = in_array('make_designer', $user_roles, true) || current_user_can('set_make_pricing');
        $can_set_cost = $is_admin || $is_designer;

        $total_cost = 0;
        $total_sale = null;
        $has_sale = false;

        foreach ($params['items'] as &$it) {
            $qty = intval($it['quantity'] ?? 1);
            if (!$can_set_cost) {
                // Strictly ignore/zero out any cost price submitted by salesperson
                $it['item_cost_price'] = 0;
            }
            $total_cost += floatval($it['item_cost_price'] ?? 0) * $qty;
            if (isset($it['item_sale_price']) && $it['item_sale_price'] !== '' && $it['item_sale_price'] !== null) {
                $has_sale = true;
                $total_sale = ($total_sale ?? 0) + (floatval($it['item_sale_price']) * $qty);
            }
        }
        unset($it);

        $req_date = $params['requested_delivery_date'] ?? null;

        $order_data = array(
            'reference_bill_no'       => $reference_bill_no,
            'target_delivery_days'    => $target_delivery_days,
            'furniture_name'          => $params['furniture_name'] ?? $params['items'][0]['product_name'],
            'description'             => $params['description'] ?? '',
            'quantity'                => intval($params['quantity'] ?? count($params['items'])),
            'priority'                => $params['priority'] ?? 'Normal',
            'delivery_date'           => $target_date,
            'target_delivery_date'    => $target_date,
            'requested_delivery_date' => $req_date,
            'salesman_id'             => $current_user->ID,
            'salesperson_name'        => $current_user->display_name ?: $current_user->user_login,
            'customer_name'           => $params['customer_name'],
            'customer_phone'          => $params['customer_phone'],
            'customer_email'          => $params['customer_email'] ?? '',
            'shipping_address'        => $params['shipping_address'] ?? '',
            'location_landmark'       => $params['location_landmark'] ?? '',
            'receiver_name'           => $params['receiver_name'] ?? '',
            'receiver_phone'          => $params['receiver_phone'] ?? '',
            'special_instructions'    => $params['special_instructions'] ?? '',
            'cost_price'              => $can_set_cost ? $total_cost : 0,
            'sale_price'              => $has_sale ? $total_sale : null
        );

        $client = LEMakeNasDbClient::get_instance();
        $res = $client->create_order($order_data, $params['items']);

        if (is_wp_error($res)) {
            return new WP_REST_Response(array('error' => $res->get_error_message()), 500);
        }

        return rest_ensure_response($client->sanitize_for_role($res, $current_user));
    }

    public function approve_order_version(WP_REST_Request $request) {
        $order_id = intval($request->get_param('id'));
        $params = $request->get_json_params();
        $version_number = intval($params['version_number'] ?? 1);
        $comments = $params['comments'] ?? '';
        $current_user = wp_get_current_user();
        $approved_by = $current_user->display_name ?: $current_user->user_login;

        $client = LEMakeNasDbClient::get_instance();
        $res = $client->approve_order_version($order_id, $version_number, $approved_by, $comments);

        if (is_wp_error($res)) {
            return new WP_REST_Response(array('error' => $res->get_error_message()), 500);
        }

        return rest_ensure_response($res);
    }

    public function reject_order_version(WP_REST_Request $request) {
        $order_id = intval($request->get_param('id'));
        $params = $request->get_json_params();
        $version_number = intval($params['version_number'] ?? 1);
        $reason = $params['reason'] ?? '';
        $current_user = wp_get_current_user();
        $rejected_by = $current_user->display_name ?: $current_user->user_login;

        if (empty($reason)) {
            return new WP_REST_Response(array('error' => 'Please state the reason for requesting revision.'), 400);
        }

        $client = LEMakeNasDbClient::get_instance();
        $res = $client->reject_order_version($order_id, $version_number, $rejected_by, $reason);

        if (is_wp_error($res)) {
            return new WP_REST_Response(array('error' => $res->get_error_message()), 500);
        }

        return rest_ensure_response($res);
    }

    public function get_version_diff(WP_REST_Request $request) {
        $order_id = intval($request->get_param('id'));
        $v_from = intval($request->get_param('v_from') ?: 1);
        $v_to = intval($request->get_param('v_to') ?: 2);

        $client = LEMakeNasDbClient::get_instance();
        $diff = $client->get_version_diff($order_id, $v_from, $v_to);

        if (is_wp_error($diff)) {
            return new WP_REST_Response(array('error' => $diff->get_error_message()), 500);
        }

        return rest_ensure_response($diff);
    }

    public function get_order_versions(WP_REST_Request $request) {
        $order_id = intval($request->get_param('id'));
        $client = LEMakeNasDbClient::get_instance();
        $versions = $client->get_order_versions($order_id);

        if (is_wp_error($versions)) {
            return new WP_REST_Response(array('error' => $versions->get_error_message()), 500);
        }

        return rest_ensure_response($versions);
    }

    public function get_stats(WP_REST_Request $request) {
        $current_user = wp_get_current_user();
        $is_admin = current_user_can('administrator') || current_user_can('manage_options');
        $is_designer = in_array('make_designer', (array)$current_user->roles, true);
        $salesperson_id = (!$is_admin && !$is_designer) ? $current_user->ID : null;

        $client = LEMakeNasDbClient::get_instance();
        $orders = $client->get_salesperson_orders($salesperson_id);

        if (is_wp_error($orders) || !is_array($orders)) {
            return rest_ensure_response(array(
                'total'            => 0,
                'pending_pricing'  => 0,
                'action_required'  => 0,
                'in_production'    => 0,
                'delivered'        => 0,
            ));
        }

        $total = count($orders);
        $pending_pricing = 0;
        $action_required = 0;
        $in_production = 0;
        $delivered = 0;

        foreach ($orders as $o) {
            $status = $o['status'] ?? '';
            $app_status = $o['approval_status'] ?? '';

            if ($app_status === 'pending_pricing' || $status === 'Awaiting Pricing') {
                $pending_pricing++;
            }
            if ($app_status === 'modification_pending_approval' || $app_status === 'priced') {
                $action_required++;
            }
            if (in_array($status, array('In Production', 'Welding', 'Painting', 'Ready for Dispatch', 'Placed'), true)) {
                $in_production++;
            }
            if ($status === 'Delivered') {
                $delivered++;
            }
        }

        return rest_ensure_response(array(
            'total'            => $total,
            'pending_pricing'  => $pending_pricing,
            'action_required'  => $action_required,
            'in_production'    => $in_production,
            'delivered'        => $delivered,
        ));
    }

    public function get_system_status() {
        $client = LEMakeNasDbClient::get_instance();
        $orders_queue = get_option('le_make_pending_orders_to_nas', array());
        $files_queue  = get_option('le_make_pending_file_transfers', array());
        $storage_usage = $client->get_supabase_storage_usage();
        
        return rest_ensure_response(array(
            'nas_online'         => $client->is_nas_online(),
            'active_tier'        => $client->get_connection_tier(),
            'active_url'         => $client->get_active_url(),
            'pending_orders'     => count($orders_queue),
            'pending_files'      => count($files_queue),
            'pending_sync_count' => count($orders_queue) + count($files_queue),
            'supabase_storage'   => array(
                'used_mb'  => $storage_usage['total_mb'],
                'limit_mb' => 1024,
                'count'    => $storage_usage['count']
            )
        ));
    }

    public function sync_check() {
        $client = LEMakeNasDbClient::get_instance();
        $client->resolve_active_endpoint(true);
        $orders_synced = 0;
        $files_synced  = 0;
        $backfilled    = 0;
        $pruned_mb     = 0;

        if ($client->is_nas_online()) {
            $orders_synced = $client->sync_pending_offline_orders_to_nas();
            $files_synced  = $client->sync_pending_files_to_nas();
            $backfilled    = $client->backfill_nas_to_supabase();
            $prune_res     = $client->prune_supabase_storage_to_1gb();
            $pruned_mb     = $prune_res['freed_mb'] ?? 0;
        }

        return rest_ensure_response(array(
            'nas_online'    => $client->is_nas_online(),
            'active_tier'   => $client->get_connection_tier(),
            'orders_synced' => $orders_synced,
            'files_synced'  => $files_synced,
            'backfilled'    => $backfilled,
            'pruned_mb'     => $pruned_mb
        ));
    }

    public function upload_attachment(WP_REST_Request $request) {
        $files = $request->get_file_params();
        if (empty($files['file'])) {
            return new WP_REST_Response(array('error' => 'No file was uploaded.'), 400);
        }

        $file = $files['file'];
        $client = LEMakeNasDbClient::get_instance();
        $filename = sanitize_file_name($file['name']);
        $unique_name = time() . '_' . wp_generate_password(6, false) . '_' . $filename;
        $mime_type = $file['type'] ?: 'application/octet-stream';
        $file_content = file_get_contents($file['tmp_name']);

        // Case A: If TrueNAS is online, stream to TrueNAS Storage
        if ($client->is_nas_online()) {
            $nas_storage = get_option('le_make_nas_storage_url', LEMakeNasDbClient::DEFAULT_TUNNEL_STORAGE);
            $boundary = wp_generate_password(24, false);

            $body = "--{$boundary}\r\n";
            $body .= "Content-Disposition: form-data; name=\"file\"; filename=\"" . $unique_name . "\"\r\n";
            $body .= "Content-Type: " . $mime_type . "\r\n\r\n";
            $body .= $file_content . "\r\n";
            $body .= "--{$boundary}--\r\n";

            $res = wp_remote_post(rtrim($nas_storage, '/') . '/upload', array(
                'method'    => 'POST',
                'timeout'   => 30,
                'headers'   => array(
                    'Content-Type'             => 'multipart/form-data; boundary=' . $boundary,
                    'CF-Access-Client-Id'     => LEMakeNasDbClient::DEFAULT_CF_CLIENT_ID,
                    'CF-Access-Client-Secret' => LEMakeNasDbClient::DEFAULT_CF_CLIENT_SECRET
                ),
                'body'      => $body,
                'sslverify' => false
            ));

            if (!is_wp_error($res) && wp_remote_retrieve_response_code($res) < 300) {
                $nas_file_url = rtrim($nas_storage, '/') . '/files/' . $unique_name;

                // Also keep copy in Supabase Storage and enforce 1GB rolling window
                $sb_url = $client->upload_file_to_supabase_storage($unique_name, $file_content, $mime_type);
                $client->prune_supabase_storage_to_1gb();

                return rest_ensure_response(array(
                    'success'      => true,
                    'url'          => $nas_file_url,
                    'supabase_url' => is_wp_error($sb_url) ? null : $sb_url,
                    'filename'     => $unique_name,
                    'storage'      => 'nas_and_supabase'
                ));
            }
        }

        // Case B: TrueNAS Offline — Upload directly to Supabase Storage
        $sb_url = $client->upload_file_to_supabase_storage($unique_name, $file_content, $mime_type);
        $client->prune_supabase_storage_to_1gb();

        // Local buffer
        $wp_uploads = wp_upload_dir();
        $target_dir = $wp_uploads['basedir'] . '/le-make-temp';
        if (!file_exists($target_dir)) {
            wp_mkdir_p($target_dir);
        }
        $target_file = $target_dir . '/' . $unique_name;
        move_uploaded_file($file['tmp_name'], $target_file);
        $temp_local_url = $wp_uploads['baseurl'] . '/le-make-temp/' . $unique_name;

        $primary_url = (!is_wp_error($sb_url) && !empty($sb_url)) ? $sb_url : $temp_local_url;

        // Queue in pending file transfers for TrueNAS when online
        $queue = get_option('le_make_pending_file_transfers', array());
        $queue[] = array(
            'filename'     => $unique_name,
            'local_path'   => $target_file,
            'temp_url'     => $primary_url,
            'supabase_url' => is_wp_error($sb_url) ? null : $sb_url,
            'mime_type'    => $mime_type,
            'created_at'   => time()
        );
        update_option('le_make_pending_file_transfers', $queue);

        return rest_ensure_response(array(
            'success'     => true,
            'url'         => $primary_url,
            'filename'    => $unique_name,
            'storage'     => 'supabase_temp_offline',
            'nas_offline' => true
        ));
    }

    /**
     * Update production stage for an approved order
     */
    /**
     * Attach a file or photo to an existing order (Admin, Designer, Salesman)
     */
    public function attach_file_to_order(WP_REST_Request $request) {
        $order_id = intval($request->get_param('id'));
        $params = $request->get_json_params() ?: $request->get_params();
        $file_url = esc_url_raw($params['file_url'] ?? '');
        $file_name = sanitize_text_field($params['file_name'] ?? 'Attached File');
        $note = sanitize_textarea_field($params['note'] ?? '');

        if (empty($file_url)) {
            return new WP_REST_Response(array('error' => 'File URL is required.'), 400);
        }

        $current_user = wp_get_current_user();
        $user_roles = (array)$current_user->roles;
        $is_admin = current_user_can('administrator') || current_user_can('manage_options');
        $is_designer = in_array('make_designer', $user_roles, true);
        $is_salesman = in_array('make_salesperson', $user_roles, true) || in_array('salesperson', $user_roles, true);
        $is_factory = in_array('make_factory_manager', $user_roles, true) || in_array('factory_manager', $user_roles, true) || current_user_can('update_production_status');

        if (!$is_admin && !$is_designer && !$is_salesman && !$is_factory) {
            return new WP_REST_Response(array('error' => 'You do not have permission to attach files to orders.'), 403);
        }

        $client = LEMakeNasDbClient::get_instance();
        $res = $client->attach_file_to_order($order_id, $file_url, $file_name, $note, $current_user);

        if (is_wp_error($res)) {
            return new WP_REST_Response(array('error' => $res->get_error_message()), 500);
        }

        return rest_ensure_response($res);
    }

    public function update_stage(WP_REST_Request $request) {
        $order_id = intval($request->get_param('id'));
        $params = $request->get_json_params() ?: $request->get_params();
        $stage = sanitize_text_field($params['stage'] ?? '');
        $note = sanitize_textarea_field($params['note'] ?? '');
        $photo_url = esc_url_raw($params['photo_url'] ?? '');

        if (empty($stage)) {
            return new WP_REST_Response(array('error' => 'Production stage is required.'), 400);
        }

        $current_user = wp_get_current_user();
        $user_roles = (array)$current_user->roles;
        $is_admin = current_user_can('administrator') || current_user_can('manage_options');
        $is_factory = in_array('make_factory_manager', $user_roles, true) || in_array('factory_manager', $user_roles, true) || current_user_can('update_production_status');
        $is_designer = in_array('make_designer', $user_roles, true);

        if (!$is_admin && !$is_factory && !$is_designer) {
            return new WP_REST_Response(array('error' => 'You do not have permission to update production stages.'), 403);
        }

        $production_stages = array(
            'Work in process',
            'Production On Going',
            'Primary QC',
            'Color Ongoing',
            'QC Final',
            'Packaging',
            'Ready to Ship',
            'Delivered'
        );

        $client = LEMakeNasDbClient::get_instance();

        // Sequential stage verification
        $order_res = $client->request('make_orders?id=eq.' . $order_id . '&select=id,status', 'GET');
        $current_status = (!is_wp_error($order_res) && !empty($order_res)) ? ($order_res[0]['status'] ?? '') : '';

        $current_idx = array_search($current_status, $production_stages, true);
        $target_idx = array_search($stage, $production_stages, true);

        if ($target_idx === false) {
            return new WP_REST_Response(array('error' => 'Invalid production stage: ' . esc_html($stage)), 400);
        }

        if ($current_idx === false) {
            // First sequential stage must be 'Work in process'
            if ($target_idx !== 0) {
                return new WP_REST_Response(array(
                    'error' => 'Stages must be updated sequentially. The initial stage must be "' . $production_stages[0] . '".'
                ), 400);
            }
        } else {
            // Allowed to stay at current stage (updating notes/photos) or advance to next ($current_idx + 1)
            if ($target_idx > $current_idx + 1) {
                $next_allowed = $production_stages[$current_idx + 1];
                return new WP_REST_Response(array(
                    'error' => 'Stages must be updated sequentially. The next required stage is "' . $next_allowed . '". You cannot skip ahead.'
                ), 400);
            }
        }

        $user_role_label = $is_factory ? 'factory_manager' : ($is_admin ? 'administrator' : 'designer');
        $updated_by = $current_user->display_name ?: $current_user->user_login;

        $res = $client->update_order_stage($order_id, $stage, $note, $photo_url, $updated_by, $user_role_label);

        if (is_wp_error($res)) {
            return new WP_REST_Response(array('error' => $res->get_error_message()), 500);
        }

        return rest_ensure_response($res);
    }

    /**
     * Retrieve notifications for current user from TrueNAS notifications table
     */
    public function get_notifications(WP_REST_Request $request) {
        $current_user = wp_get_current_user();
        $client = LEMakeNasDbClient::get_instance();
        $limit = intval($request->get_param('limit') ?: 30);
        $notifs = $client->get_user_notifications($current_user->ID, $limit);

        $unread = 0;
        if (is_array($notifs)) {
            foreach ($notifs as &$n) {
                if (!empty($n['photo_url'])) {
                    $n['photo_url'] = self::format_media_url($n['photo_url']);
                }
                if (empty($n['is_read'])) {
                    $unread++;
                }
            }
            unset($n);
        }

        return rest_ensure_response(array(
            'notifications' => is_array($notifs) ? $notifs : array(),
            'unread_count'  => $unread
        ));
    }

    /**
     * Mark single notification read
     */
    public function mark_notification_read(WP_REST_Request $request) {
        $id = intval($request->get_param('id'));
        $client = LEMakeNasDbClient::get_instance();
        $res = $client->mark_notification_read($id);
        return rest_ensure_response(array('success' => true));
    }

    /**
     * Mark all notifications read for current user
     */
    public function mark_all_notifications_read(WP_REST_Request $request) {
        $current_user = wp_get_current_user();
        $client = LEMakeNasDbClient::get_instance();
        $res = $client->mark_all_notifications_read($current_user->ID);
        return rest_ensure_response(array('success' => true));
    }

    /**
     * Synchronize staff users (Super Admins, Admins, Salesmen, Designers, Factory Managers) from TrueNAS to WordPress
     */
    public function sync_users(WP_REST_Request $request) {
        $client = LEMakeNasDbClient::get_instance();
        $result = $client->sync_all_software_users_to_wp();

        return rest_ensure_response(array(
            'success'      => true,
            'result'       => $result,
            'synced_count' => ($result['created'] ?? 0) + ($result['updated'] ?? 0),
            'message'      => sprintf(
                'Synced %d users from software database (%d created, %d updated).',
                $result['total'] ?? 0,
                $result['created'] ?? 0,
                $result['updated'] ?? 0
            )
        ));
    }

    /**
     * Proxy media files (images, PDFs) from TrueNAS Storage through WordPress
     * Injecting the required Cloudflare Access Service Token so client browsers never get 403 Forbidden.
     * If TrueNAS is offline or unreachable, seamlessly falls back to Supabase Storage (make-portal-files).
     */
    public function media_proxy(WP_REST_Request $request) {
        $file_param = $request->get_param('file');
        if (empty($file_param)) {
            $file_param = $request->get_param('url');
        }
        if (empty($file_param)) {
            $file_param = $request->get_param('path');
        }

        if (empty($file_param)) {
            status_header(400);
            echo 'File parameter is required';
            exit;
        }

        // Unwrap any nested proxy URL if accidentally passed
        if (strpos($file_param, 'media-proxy') !== false && strpos($file_param, 'file=') !== false) {
            $parts = parse_url($file_param);
            if (!empty($parts['query'])) {
                parse_str($parts['query'], $q_params);
                if (!empty($q_params['file'])) {
                    $file_param = $q_params['file'];
                }
            }
        }

        // Decode if double encoded
        if (strpos($file_param, 'http%3A') === 0 || strpos($file_param, 'https%3A') === 0) {
            $file_param = rawurldecode($file_param);
        }

        $file_param = trim($file_param);
        // Normalize any local IP or Tailscale IP
        $file_param = preg_replace('#^http://(?:192\.168\.\d+\.\d+|100\.\d+\.\d+\.\d+|localhost|127\.0\.0\.1):8081#i', 'https://storage.lenas.me', $file_param);

        $clean_file_path = parse_url($file_param, PHP_URL_PATH);
        if (empty($clean_file_path)) {
            $clean_file_path = $file_param;
        }

        // Extract subpath under /files/
        if (strpos($clean_file_path, '/files/') !== false) {
            $subpath = substr($clean_file_path, strpos($clean_file_path, '/files/') + 7);
        } else {
            $subpath = ltrim($clean_file_path, '/');
        }

        $file_name = basename($clean_file_path);

        $client = LEMakeNasDbClient::get_instance();
        $body = null;
        $content_type = null;

        // 1. PRIMARY: Try reading from TrueNAS Storage if reported online
        if ($client->is_nas_online()) {
            $nas_storage = get_option('le_make_nas_storage_url', LEMakeNasDbClient::DEFAULT_TUNNEL_STORAGE);
            $target_nas_url = rtrim($nas_storage, '/') . '/files/' . $subpath;

            $cf_id = get_option('le_make_cf_client_id', LEMakeNasDbClient::DEFAULT_CF_CLIENT_ID);
            $cf_secret = get_option('le_make_cf_client_secret', LEMakeNasDbClient::DEFAULT_CF_CLIENT_SECRET);
            $headers = array();
            if (!empty($cf_id)) $headers['CF-Access-Client-Id'] = trim($cf_id);
            if (!empty($cf_secret)) $headers['CF-Access-Client-Secret'] = trim($cf_secret);

            $response = wp_remote_get($target_nas_url, array(
                'headers'     => $headers,
                'timeout'     => 8,
                'redirection' => 5,
                'sslverify'   => false,
            ));

            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
                $body = wp_remote_retrieve_body($response);
                $content_type = wp_remote_retrieve_header($response, 'content-type');
            }
        }

        // 2. FAILOVER: If NAS is offline or returned error (e.g. 530/502), read from Supabase Storage
        if (empty($body)) {
            $supabase_url = rtrim(get_option('le_make_supabase_url', LEMakeNasDbClient::DEFAULT_SUPABASE_URL), '/');
            $bucket = LEMakeNasDbClient::DEFAULT_SUPABASE_STORAGE_BUCKET;
            $target_sb_url = $supabase_url . '/storage/v1/object/public/' . $bucket . '/' . $file_name;

            $sb_res = wp_remote_get($target_sb_url, array(
                'timeout'     => 15,
                'redirection' => 5,
                'sslverify'   => false
            ));

            if (!is_wp_error($sb_res) && wp_remote_retrieve_response_code($sb_res) === 200) {
                $body = wp_remote_retrieve_body($sb_res);
                $content_type = wp_remote_retrieve_header($sb_res, 'content-type');
            }
        }

        // 3. Fallback: check local staging directory if file was buffered during upload
        if (empty($body)) {
            $wp_uploads = wp_upload_dir();
            $local_path = $wp_uploads['basedir'] . '/le-make-temp/' . $file_name;
            if (file_exists($local_path)) {
                $body = file_get_contents($local_path);
            }
        }

        if (empty($body)) {
            status_header(404);
            echo 'File not found on NAS or cloud failover storage';
            exit;
        }

        if (empty($content_type) || $content_type === 'application/octet-stream' || $content_type === 'text/plain') {
            $path_info = pathinfo($file_name);
            $ext = strtolower($path_info['extension'] ?? '');
            $mime_map = array(
                'webp' => 'image/webp',
                'jpg'  => 'image/jpeg',
                'jpeg' => 'image/jpeg',
                'png'  => 'image/png',
                'gif'  => 'image/gif',
                'svg'  => 'image/svg+xml',
                'pdf'  => 'application/pdf',
            );
            if (isset($mime_map[$ext])) {
                $content_type = $mime_map[$ext];
            } else {
                $content_type = 'application/octet-stream';
            }
        }

        if (ob_get_level()) {
            ob_clean();
        }

        header('Content-Type: ' . $content_type);
        header('Content-Length: ' . strlen($body));
        header('Content-Disposition: inline; filename="' . sanitize_file_name($file_name) . '"');
        header('Cache-Control: public, max-age=86400');
        header('Access-Control-Allow-Origin: *');

        echo $body;
        exit;
    }
}


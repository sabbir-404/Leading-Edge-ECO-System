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

        // Custom furniture costing requests: endpoints are capability checked
        // again in each callback because the table is accessed with server keys.
        register_rest_route($this->namespace, '/costing-requests', array(
            array('methods' => 'GET', 'callback' => array($this, 'get_costing_requests'), 'permission_callback' => array($this, 'check_user_permission')),
            array('methods' => 'POST', 'callback' => array($this, 'create_costing_request'), 'permission_callback' => array($this, 'check_user_permission')),
        ));
        register_rest_route($this->namespace, '/costing-requests/(?P<id>\\d+)', array(
            array('methods' => 'DELETE', 'callback' => array($this, 'delete_costing_request'), 'permission_callback' => array($this, 'check_user_permission')),
        ));
        register_rest_route($this->namespace, '/costing-requests/(?P<id>\\d+)/items/(?P<item_id>\\d+)/price', array(
            array('methods' => 'POST', 'callback' => array($this, 'price_costing_request_item'), 'permission_callback' => array($this, 'check_user_permission')),
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

        // Request Production Approval on held order
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)/request-approval', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'request_production_approval'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Decide Production Approval (Approve/Reject override)
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)/decide-approval', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'decide_production_approval'),
            'permission_callback' => array($this, 'check_admin_permission'),
        ));

        // Record Order Payment
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)/payments', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'record_order_payment'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        // Get Order Payments Ledger
        register_rest_route($this->namespace, '/orders/(?P<id>\d+)/payments', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'get_order_payments'),
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
            'permission_callback' => array($this, 'check_user_permission'),
        ));

        register_rest_route('le-make-portal/v1', '/media-proxy', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'media_proxy'),
            'permission_callback' => array($this, 'check_user_permission'),
        ));
    }

    public function check_user_permission() {
        // Keep the portal API unavailable to unrelated authenticated WordPress
        // accounts. Portal roles and administrators receive this capability.
        return is_user_logged_in() && (current_user_can('access_make_sales_portal') || current_user_can('manage_options'));
    }

    public function check_admin_permission() {
        return is_user_logged_in() && (current_user_can('manage_options') || current_user_can('administrator'));
    }

    /**
     * Check permission for publishing or syncing users from software database
     */
    public function check_publish_permission(WP_REST_Request $request) {
        if (current_user_can('manage_options') || current_user_can('administrator')) {
            return true;
        }

        $secret = $request->get_header('X-LE-Publish-Secret') ?: $request->get_param('secret');
        if (empty($secret)) {
            return false;
        }

        $client = LEMakeNasDbClient::get_instance();
        $cf_secret = $client->get_cf_secret();
        $service_key = $client->get_service_key();
        $anon_key = $client->get_anon_key();
        $publish_secret = defined('LE_MAKE_PUBLISH_SECRET') ? LE_MAKE_PUBLISH_SECRET : get_option('le_make_publish_secret', '');

        if (!empty($publish_secret) && hash_equals($publish_secret, $secret)) {
            return true;
        }
        if (!empty($cf_secret) && hash_equals($cf_secret, $secret)) {
            return true;
        }
        if (!empty($service_key) && hash_equals($service_key, $secret)) {
            return true;
        }
        if (!empty($anon_key) && hash_equals($anon_key, $secret)) {
            return true;
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

        $display_role = 'Salesman';
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
            // Factory managers may see production cost but never sale price.
            'canViewCost'         => $is_admin || $is_designer || $is_factory_manager,
            'canViewSale'         => !$is_factory_manager,
            'canEditCost'         => $is_admin || $is_designer,
            'canEditSale'         => $is_admin || $is_designer,
            'canUpdateProduction' => $is_factory_manager || $is_admin,
            'canReadCostingRequests' => user_can($user, 'read_make_costing_requests') || $is_admin || $is_designer || $is_factory_manager,
            'canReadAllCostingRequests' => user_can($user, 'read_all_make_costing_requests') || $is_admin || $is_designer || $is_factory_manager,
            'canCreateCostingRequest' => user_can($user, 'create_make_costing_request') || $is_admin,
            'canPriceCostingRequest' => user_can($user, 'price_make_costing_request') || $is_admin || $is_designer,
            'canDeleteCostingRequest' => user_can($user, 'delete_make_costing_request') || $is_admin || $is_designer,
            'canOrderCostingRequest' => user_can($user, 'place_order_from_costing_request') || $is_admin,
        );
    }

    private function costing_request_actor_id($user) {
        return intval(get_user_meta($user->ID, 'le_nas_user_id', true));
    }

    private function costing_request_files($value) {
        if (!is_array($value)) return array();
        $files = array();
        foreach (array_slice($value, 0, 20) as $url) {
            if (is_string($url) && strlen($url) < 2048 && preg_match('#^https://#i', $url)) $files[] = esc_url_raw($url);
        }
        return array_values(array_unique($files));
    }

    private function costing_request_role_data($data, $user) {
        $admin = user_can($user, 'administrator') || user_can($user, 'manage_options');
        $designer = user_can($user, 'set_make_pricing') || user_can($user, 'price_make_costing_request');
        $factory = user_can($user, 'update_production_status');
        if (!$admin && !$designer) {
            $remove = $factory ? array('sale_price', 'product_drawing_url') : array('cost_price', 'blueprint_url');
            foreach ($remove as $field) if (is_array($data) && array_key_exists($field, $data)) unset($data[$field]);
        }
        if (is_array($data)) {
            foreach ($data as $key => $value) if (is_array($value)) $data[$key] = $this->costing_request_role_data($value, $user);
        }
        return $data;
    }

    public function get_costing_requests(WP_REST_Request $request) {
        $user = wp_get_current_user();
        if (!user_can($user, 'read_make_costing_requests') && !user_can($user, 'read_all_make_costing_requests') && !user_can($user, 'manage_options')) {
            return new WP_REST_Response(array('error' => 'You do not have permission to view costing requests.'), 403);
        }
        $client = LEMakeNasDbClient::get_instance();
        $search = sanitize_text_field((string)$request->get_param('search'));
        $endpoint = 'make_costing_requests?select=*&order=created_at.desc&limit=200';
        if ($search !== '') {
            $term = rawurlencode(substr(preg_replace('/[^\\pL\\pN _-]/u', '', $search), 0, 80));
            if ($term !== '') $endpoint .= '&or=(request_number.ilike.*' . $term . '*,customer_name.ilike.*' . $term . '*,requester_name.ilike.*' . $term . '*,remarks.ilike.*' . $term . '*)';
        }
        if (!user_can($user, 'read_all_make_costing_requests') && !user_can($user, 'manage_options')) {
            $endpoint .= '&requested_by=eq.' . $this->costing_request_actor_id($user);
        }
        $rows = $client->request_portal_data($endpoint, 'GET');
        if (is_wp_error($rows)) return new WP_REST_Response(array('error' => $rows->get_error_message()), 502);
        if (!is_array($rows)) $rows = array();
        $request_ids = array_values(array_filter(array_map(function ($row) { return intval($row['id'] ?? 0); }, $rows)));
        $children_by_request = array();
        if ($request_ids) {
            $children = $client->request_portal_data('make_costing_request_items?request_id=in.(' . implode(',', $request_ids) . ')&order=id.asc&limit=1000', 'GET');
            if (is_array($children)) foreach ($children as $child) $children_by_request[intval($child['request_id'])][] = $child;
        }
        $items = array();
        foreach ($rows as $row) {
            $id = intval($row['id'] ?? 0);
            $row['items'] = $children_by_request[$id] ?? array();
            foreach (array('file_urls') as $field) if (!empty($row[$field]) && is_array($row[$field])) $row[$field] = array_map(array('LEMakeApiController', 'format_media_url'), $row[$field]);
            foreach ($row['items'] as &$item) {
                foreach (array('blueprint_url', 'product_image', 'product_drawing_url') as $field) if (!empty($item[$field])) $item[$field] = self::format_media_url($item[$field]);
                if (!empty($item['file_urls']) && is_array($item['file_urls'])) $item['file_urls'] = array_map(array('LEMakeApiController', 'format_media_url'), $item['file_urls']);
            }
            unset($item);
            $items[] = $this->costing_request_role_data($row, $user);
        }
        return rest_ensure_response($items);
    }

    public function create_costing_request(WP_REST_Request $request) {
        $user = wp_get_current_user();
        if (!user_can($user, 'create_make_costing_request') && !user_can($user, 'manage_options')) return new WP_REST_Response(array('error' => 'You do not have permission to create costing requests.'), 403);
        $body = $request->get_json_params();
        $source_items = isset($body['items']) && is_array($body['items']) ? array_slice($body['items'], 0, 30) : array();
        if (!$source_items) return new WP_REST_Response(array('error' => 'Add at least one furniture item.'), 400);
        $actor_id = $this->costing_request_actor_id($user);
        if ($actor_id <= 0) return new WP_REST_Response(array('error' => 'This WordPress account is not linked to an LE-SOFT user yet. Ask an administrator to publish or sync the account, then retry.'), 409);
        $client = LEMakeNasDbClient::get_instance();
        $parent = array(
            'requested_by' => $actor_id,
            'requester_name' => sanitize_text_field($user->display_name ?: $user->user_login),
            'customer_name' => sanitize_text_field((string)($body['customer_name'] ?? '')),
            'customer_phone' => sanitize_text_field((string)($body['customer_phone'] ?? '')),
            'remarks' => sanitize_textarea_field((string)($body['remarks'] ?? '')),
            'file_urls' => $this->costing_request_files($body['file_urls'] ?? array()),
            'status' => 'submitted',
        );
        $created = $client->request_portal_data('make_costing_requests', 'POST', $parent);
        if (is_wp_error($created) || empty($created[0]['id'])) return new WP_REST_Response(array('error' => is_wp_error($created) ? $created->get_error_message() : 'Database did not return the new request.'), 502);
        $request_id = intval($created[0]['id']);
        foreach ($source_items as $source) {
            $name = sanitize_text_field((string)($source['item_name'] ?? ''));
            $quantity = floatval($source['quantity'] ?? 0);
            if ($name === '' || $quantity <= 0 || $quantity > 100000) {
                $client->request_portal_data('make_costing_requests?id=eq.' . $request_id, 'DELETE');
                return new WP_REST_Response(array('error' => 'Each item needs a name and positive quantity.'), 400);
            }
            $item = array(
                'request_id' => $request_id, 'item_name' => $name, 'quantity' => $quantity,
                'remarks' => sanitize_textarea_field((string)($source['remarks'] ?? '')),
                'file_urls' => $this->costing_request_files($source['file_urls'] ?? array()), 'status' => 'submitted'
            );
            $saved = $client->request_portal_data('make_costing_request_items', 'POST', $item);
            if (is_wp_error($saved)) {
                $client->request_portal_data('make_costing_requests?id=eq.' . $request_id, 'DELETE');
                return new WP_REST_Response(array('error' => 'Could not save request items: ' . $saved->get_error_message()), 502);
            }
        }
        return new WP_REST_Response(array('success' => true, 'id' => $request_id), 201);
    }

    public function price_costing_request_item(WP_REST_Request $request) {
        $user = wp_get_current_user();
        if (!user_can($user, 'price_make_costing_request') && !user_can($user, 'manage_options')) return new WP_REST_Response(array('error' => 'Only a furniture designer or administrator can price this request.'), 403);
        $request_id = intval($request->get_param('id'));
        $item_id = intval($request->get_param('item_id'));
        $body = $request->get_json_params();
        $product_name = sanitize_text_field((string)($body['product_name'] ?? ''));
        $product_code = sanitize_text_field((string)($body['product_code'] ?? ''));
        if ($product_name === '' || $product_code === '' || !is_numeric($body['sale_price'] ?? null) || !is_numeric($body['cost_price'] ?? null) || floatval($body['sale_price']) < 0 || floatval($body['cost_price']) < 0) {
            return new WP_REST_Response(array('error' => 'Product name, product code, cost price, and sale price are required.'), 400);
        }
        $client = LEMakeNasDbClient::get_instance();
        $lookup = $client->request_portal_data('make_costing_request_items?id=eq.' . $item_id . '&request_id=eq.' . $request_id . '&select=*', 'GET');
        if (is_wp_error($lookup) || empty($lookup[0])) return new WP_REST_Response(array('error' => 'Costing request item was not found.'), 404);
        $item = $lookup[0];
        $product = array(
            'product_code' => $product_code, 'product_name' => $product_name,
            'cost_price' => floatval($body['cost_price']), 'sale_price' => floatval($body['sale_price']),
            'main_image' => esc_url_raw((string)($body['product_image'] ?? '')) ?: null,
            'blueprint_url' => esc_url_raw((string)($body['blueprint_url'] ?? '')) ?: null,
            'product_drawing_url' => esc_url_raw((string)($body['product_drawing_url'] ?? '')) ?: null,
            'requestion_item_id' => $item_id, 'is_active' => true
        );
        if (!empty($item['product_id'])) {
            $product_result = $client->request_portal_data('make_products?id=eq.' . intval($item['product_id']), 'PATCH', $product);
        } else {
            $existing = $client->request_portal_data('make_products?requestion_item_id=eq.' . $item_id . '&select=id&limit=1', 'GET');
            if (is_wp_error($existing)) return new WP_REST_Response(array('error' => $existing->get_error_message()), 502);
            if (!empty($existing[0]['id'])) {
                $product_id = intval($existing[0]['id']);
                $product_result = $client->request_portal_data('make_products?id=eq.' . $product_id, 'PATCH', $product);
            } else {
                $product_result = $client->request_portal_data('make_products', 'POST', $product);
            }
        }
        if (is_wp_error($product_result) || empty($product_result[0]['id'])) return new WP_REST_Response(array('error' => is_wp_error($product_result) ? $product_result->get_error_message() : 'Could not create linked product.'), 502);
        $product_id = intval($product_result[0]['id']);
        $item_update = array(
            'product_name' => $product_name, 'product_code' => $product_code,
            'cost_price' => floatval($body['cost_price']), 'sale_price' => floatval($body['sale_price']),
            'blueprint_url' => $product['blueprint_url'], 'product_drawing_url' => $product['product_drawing_url'],
            'product_image' => $product['main_image'], 'designer_notes' => sanitize_textarea_field((string)($body['designer_notes'] ?? '')),
            'product_id' => $product_id, 'status' => 'priced', 'updated_at' => gmdate('c')
        );
        $updated = $client->request_portal_data('make_costing_request_items?id=eq.' . $item_id . '&request_id=eq.' . $request_id, 'PATCH', $item_update);
        if (is_wp_error($updated)) return new WP_REST_Response(array('error' => 'Product saved but request item update failed: ' . $updated->get_error_message()), 502);
        $request_items = $client->request_portal_data('make_costing_request_items?request_id=eq.' . $request_id . '&select=status', 'GET');
        $all_priced = is_array($request_items) && count($request_items) > 0;
        foreach ((array)$request_items as $request_line) if (!in_array(($request_line['status'] ?? ''), array('priced', 'ordered'), true)) $all_priced = false;
        $client->request_portal_data('make_costing_requests?id=eq.' . $request_id, 'PATCH', array('status' => $all_priced ? 'priced' : 'in_progress', 'updated_at' => gmdate('c')));
        $request_row = $client->request_portal_data('make_costing_requests?id=eq.' . $request_id . '&select=request_number,requested_by,requester_name', 'GET');
        $recipient_id = intval($request_row[0]['requested_by'] ?? 0);
        if ($recipient_id > 0) {
            $notification = array(
                'title' => 'Furniture costing is ready',
                'message' => sanitize_text_field($product_name . ' has been priced and is ready to review.'),
                'recipient_id' => $recipient_id,
                'sender_id' => $this->costing_request_actor_id($user) ?: null,
                'action_path' => '/make/requestion',
                'action_label' => 'View costing',
                'metadata' => array('type' => 'make_costing_request_priced', 'request_id' => $request_id, 'item_id' => $item_id, 'product_id' => $product_id),
                'is_read' => false,
                'created_at' => gmdate('c')
            );
            $client->request_portal_data('notifications', 'POST', $notification);
        }
        return rest_ensure_response(array('success' => true, 'product_id' => $product_id));
    }

    public function delete_costing_request(WP_REST_Request $request) {
        $user = wp_get_current_user();
        if (!user_can($user, 'delete_make_costing_request') && !user_can($user, 'manage_options')) return new WP_REST_Response(array('error' => 'Only a furniture designer or administrator can delete costing requests.'), 403);
        $client = LEMakeNasDbClient::get_instance();
        $result = $client->request_portal_data('make_costing_requests?id=eq.' . intval($request->get_param('id')), 'DELETE');
        if (is_wp_error($result)) return new WP_REST_Response(array('error' => $result->get_error_message()), 502);
        return rest_ensure_response(array('success' => true));
    }

    public static function format_media_url($url) {
        if (empty($url) || !is_string($url)) return $url;
        if (strpos($url, 'media-proxy') !== false) {
            return $url;
        }
        // Normalize any legacy local IP or Tailscale IP to public Cloudflare storage domain
        $normalized = preg_replace('#^http://(?:192\.168\.\d+\.\d+|100\.\d+\.\d+\.\d+|localhost|127\.0\.0\.1):8081#i', 'https://storage.lenas.me', $url);
        $is_nas_media = strpos($normalized, 'storage.lenas.me') !== false || strpos($normalized, 'lenas.me/files/') !== false;
        $is_supabase_media = strpos($normalized, '/storage/v1/object/public/make-portal-files/') !== false || strpos($normalized, '/storage/v1/object/make-portal-files/') !== false;
        if ($is_nas_media || $is_supabase_media) {
            // Legacy public-bucket URLs must also pass through the authenticated,
            // signed proxy so the browser never bypasses role-based access.
            $expires = time() + HOUR_IN_SECONDS;
            $signature = self::sign_media_reference($normalized, $expires);
            return add_query_arg(array(
                'file' => $normalized,
                'exp'  => $expires,
                'sig'  => $signature,
            ), rest_url('le-make/v1/media-proxy'));
        }
        return $normalized;
    }

    private static function sign_media_reference($file, $expires) {
        $key = function_exists('wp_salt') ? wp_salt('auth') : '';
        return $key !== '' ? hash_hmac('sha256', $file . '|' . (int) $expires, $key) : '';
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
                foreach (array('blueprint_url', 'product_drawing_url') as $drawing_field) {
                    if (!empty($p[$drawing_field])) {
                        $p[$drawing_field] = self::format_media_url($p[$drawing_field]);
                    }
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
        $nas_user_id = get_user_meta($current_user->ID, 'le_nas_user_id', true);
        $salesperson_id = (!$is_admin && !$is_designer && !$is_factory) ? (intval($nas_user_id) ?: -1) : null;

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
                if (!empty($o['invoice_attachment_urls']) && is_array($o['invoice_attachment_urls'])) {
                    $o['invoice_attachment_urls'] = array_map(array('LEMakeApiController', 'format_media_url'), $o['invoice_attachment_urls']);
                }
                if (!empty($o['pdf_urls']) && is_array($o['pdf_urls'])) {
                    $o['pdf_urls'] = array_map(array('LEMakeApiController', 'format_media_url'), $o['pdf_urls']);
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

        $current_user = wp_get_current_user();
        $roles = (array)$current_user->roles;
        $can_view_all = current_user_can('manage_options') || current_user_can('modify_all_make_data') ||
            in_array('make_designer', $roles, true) || in_array('make_factory_manager', $roles, true) ||
            in_array('factory_manager', $roles, true) || current_user_can('update_production_status');
        if (!$can_view_all) {
            $nas_user_id = intval(get_user_meta($current_user->ID, 'le_nas_user_id', true));
            if ($nas_user_id < 1 || intval($order['salesman_id'] ?? 0) !== $nas_user_id) {
                return new WP_REST_Response(array('error' => 'Order not found'), 404);
            }
        }

        if (!empty($order['current_stage_photo'])) {
            $order['current_stage_photo'] = self::format_media_url($order['current_stage_photo']);
        }
        if (!empty($order['invoice_attachment_urls']) && is_array($order['invoice_attachment_urls'])) {
            $order['invoice_attachment_urls'] = array_map(array('LEMakeApiController', 'format_media_url'), $order['invoice_attachment_urls']);
        }
        if (!empty($order['pdf_urls']) && is_array($order['pdf_urls'])) {
            $order['pdf_urls'] = array_map(array('LEMakeApiController', 'format_media_url'), $order['pdf_urls']);
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

        if (!user_can($current_user, 'create_make_orders') && !user_can($current_user, 'manage_options')) {
            return new WP_REST_Response(array('error' => 'You do not have permission to create production orders.'), 403);
        }

        if (empty($params['customer_name'])) {
            return new WP_REST_Response(array('error' => 'Customer name is required.'), 400);
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

        $nas_user_id = get_user_meta($current_user->ID, 'le_nas_user_id', true);
        $salesman_id = !empty($nas_user_id) ? intval($nas_user_id) : null;

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
            'salesman_id'             => $salesman_id,
            'salesperson_name'        => $current_user->display_name ?: $current_user->user_login,
            'customer_name'           => sanitize_text_field($params['customer_name'] ?? ''),
            'customer_phone'          => !empty($params['customer_phone']) ? sanitize_text_field($params['customer_phone']) : null,
            'customer_email'          => !empty($params['customer_email']) ? sanitize_email($params['customer_email']) : null,
            'shipping_address'        => $params['shipping_address'] ?? '',
            'location_landmark'       => $params['location_landmark'] ?? '',
            'receiver_name'           => $params['receiver_name'] ?? '',
            'receiver_phone'          => $params['receiver_phone'] ?? '',
            'special_instructions'    => $params['special_instructions'] ?? '',
            'cost_price'              => $can_set_cost ? $total_cost : 0,
            'sale_price'              => $has_sale ? $total_sale : null
        );

        $attachments = array();
        if (!empty($params['invoice_attachments']) && is_array($params['invoice_attachments'])) {
            $attachments = array_map('sanitize_text_field', $params['invoice_attachments']);
        } elseif (!empty($params['invoice_attachment_urls']) && is_array($params['invoice_attachment_urls'])) {
            $attachments = array_map('sanitize_text_field', $params['invoice_attachment_urls']);
        } elseif (!empty($params['pdf_urls']) && is_array($params['pdf_urls'])) {
            $attachments = array_map('sanitize_text_field', $params['pdf_urls']);
        }

        if (!empty($attachments)) {
            $order_data['invoice_attachment_urls'] = $attachments;
            $order_data['pdf_urls'] = $attachments;
        }

        $client = LEMakeNasDbClient::get_instance();
        $res = $client->create_order($order_data, $params['items']);

        if (is_wp_error($res)) {
            return new WP_REST_Response(array('error' => $res->get_error_message()), 500);
        }

        // Mark request items once the linked order has actually persisted.
        // Keep this secondary: a status-sync problem must not undo a valid order.
        foreach ($params['items'] as $order_item) {
            $requestion_item_id = intval($order_item['requestion_item_id'] ?? 0);
            if ($requestion_item_id > 0) {
                $client->request_portal_data('make_costing_request_items?id=eq.' . $requestion_item_id, 'PATCH', array('status' => 'ordered', 'updated_at' => gmdate('c')));
                $request_item = $client->request_portal_data('make_costing_request_items?id=eq.' . $requestion_item_id . '&select=request_id', 'GET');
                $request_id = intval($request_item[0]['request_id'] ?? 0);
                if ($request_id > 0) {
                    $all_items = $client->request_portal_data('make_costing_request_items?request_id=eq.' . $request_id . '&select=status', 'GET');
                    $all_ordered = is_array($all_items) && count($all_items) > 0;
                    foreach ((array)$all_items as $request_line) if (($request_line['status'] ?? '') !== 'ordered') $all_ordered = false;
                    if ($all_ordered) $client->request_portal_data('make_costing_requests?id=eq.' . $request_id, 'PATCH', array('status' => 'ordered', 'updated_at' => gmdate('c')));
                }
            }
        }

        return rest_ensure_response($client->sanitize_for_role($res, $current_user));
    }

    public function approve_order_version(WP_REST_Request $request) {
        if (!current_user_can('approve_make_orders') && !current_user_can('manage_options')) return new WP_REST_Response(array('error' => 'You do not have permission to approve order versions.'), 403);
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
        if (!current_user_can('approve_make_orders') && !current_user_can('manage_options')) return new WP_REST_Response(array('error' => 'You do not have permission to request order revisions.'), 403);
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
            'nas_authorization_error' => $client->get_nas_authorization_error(),
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
        if (empty($files['file']) || !empty($files['file']['error'])) {
            return new WP_REST_Response(array('error' => 'No file was uploaded or upload encountered an error.'), 400);
        }

        $file = $files['file'];
        $client = LEMakeNasDbClient::get_instance();

        // Reference file limit is aligned with the desktop MAKE module.
        $max_size = 50 * 1024 * 1024;
        if (!empty($file['size']) && $file['size'] > $max_size) {
            return new WP_REST_Response(array('error' => 'File size exceeds maximum allowed limit of 50MB.'), 400);
        }

        // 2. Reject active content and executable formats. Furniture references
        // may otherwise be any opaque document/CAD/media format.
        $orig_name = sanitize_file_name($file['name'] ?? '');
        $ext = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));
        $blocked_exts = array('php','phtml','php3','php4','php5','phps','phar','inc','pl','py','cgi','asp','aspx','sh','bash','exe','bat','cmd','js','html','htm','svg','com','msi','dll','app','jar','class','ps1','vbs','wsf','scr','sys','wasm');
        if ($ext === '' || in_array($ext, $blocked_exts, true)) {
            return new WP_REST_Response(array('error' => 'This file type cannot be uploaded as a portal attachment.'), 400);
        }

        // Protect against double extensions or executable token injection
        $lower_name = strtolower($file['name'] ?? '');
        $blocked_tokens = array('.php', '.phtml', '.php3', '.php4', '.php5', '.phps', '.phar', '.inc', '.pl', '.py', '.cgi', '.asp', '.aspx', '.sh', '.bash', '.exe', '.bat', '.cmd', '.js', '.html', '.htm', '.svg');
        foreach ($blocked_tokens as $token) {
            if (strpos($lower_name, $token) !== false) {
                return new WP_REST_Response(array('error' => 'Disallowed file name or extension.'), 400);
            }
        }

        // 3. Magic bytes / Binary header validation
        if (!file_exists($file['tmp_name']) || !is_readable($file['tmp_name'])) {
            return new WP_REST_Response(array('error' => 'Uploaded temporary file is inaccessible.'), 400);
        }

        $handle = @fopen($file['tmp_name'], 'rb');
        if (!$handle) {
            return new WP_REST_Response(array('error' => 'Unable to verify uploaded file contents.'), 400);
        }
        $header = fread($handle, 16);
        fclose($handle);

        $is_valid_magic = false;
        $mime_type = 'application/octet-stream';

        if (in_array($ext, array('jpg', 'jpeg'), true) && strpos($header, "\xFF\xD8\xFF") === 0) {
            $is_valid_magic = true;
            $mime_type = 'image/jpeg';
        } elseif ($ext === 'png' && strpos($header, "\x89PNG\r\n\x1a\n") === 0) {
            $is_valid_magic = true;
            $mime_type = 'image/png';
        } elseif ($ext === 'webp' && substr($header, 0, 4) === 'RIFF' && substr($header, 8, 4) === 'WEBP') {
            $is_valid_magic = true;
            $mime_type = 'image/webp';
        } elseif ($ext === 'pdf' && strpos($header, '%PDF-') === 0) {
            $is_valid_magic = true;
            $mime_type = 'application/pdf';
        } elseif (in_array($ext, array('zip', 'docx', 'xlsx', 'pptx'), true) && substr($header, 0, 2) === "PK") {
            $is_valid_magic = true;
            $mime_type = 'application/zip';
        } else {
            // CAD formats have vendor-specific/binary headers. Keep them as
            // opaque octet streams; downloads are authenticated and nosniff.
            $is_valid_magic = strlen($header) > 0;
            $mime_type = 'application/octet-stream';
        }

        if (!$is_valid_magic) {
            return new WP_REST_Response(array('error' => 'File content signature does not match the file extension.'), 400);
        }

        $clean_stem = sanitize_file_name(pathinfo($orig_name, PATHINFO_FILENAME));
        $unique_name = time() . '_' . wp_generate_password(8, false) . '_' . ($clean_stem ?: 'attachment') . '.' . $ext;
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

            $headers = array(
                'Content-Type' => 'multipart/form-data; boundary=' . $boundary,
            );
            $nas_jwt = $client->get_nas_token();
            if (!empty($nas_jwt)) {
                $headers['Authorization'] = 'Bearer ' . trim($nas_jwt);
            }
            $cf_id = $client->get_cf_id();
            $cf_secret = $client->get_cf_secret();
            if (!empty($cf_id)) {
                $headers['CF-Access-Client-Id'] = $cf_id;
            }
            if (!empty($cf_secret)) {
                $headers['CF-Access-Client-Secret'] = $cf_secret;
            }

            $res = wp_remote_post(rtrim($nas_storage, '/') . '/upload', array(
                'method'    => 'POST',
                'timeout'   => 30,
                'headers'   => $headers,
                'body'      => $body,
                'sslverify' => true
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

        // Private local buffer; never place pending customer files under the
        // publicly served WordPress uploads directory.
        $target_dir = $client->get_private_staging_dir();
        if (!$target_dir) {
            return new WP_REST_Response(array('error' => 'Private upload staging is unavailable.'), 503);
        }
        $encrypted_payload = $client->encrypt_private_staging_payload($file_content);
        if (is_wp_error($encrypted_payload)) return new WP_REST_Response(array('error' => $encrypted_payload->get_error_message()), 503);
        $target_file = $target_dir . DIRECTORY_SEPARATOR . $unique_name . '.enc';
        if (file_put_contents($target_file, $encrypted_payload, LOCK_EX) === false) {
            return new WP_REST_Response(array('error' => 'Could not safely stage the encrypted attachment.'), 500);
        }
        @chmod($target_file, 0600);

        // Stable reference served only through the signed portal media proxy.
        $nas_storage = get_option('le_make_nas_storage_url', LEMakeNasDbClient::DEFAULT_TUNNEL_STORAGE);
        $primary_url = (!is_wp_error($sb_url) && !empty($sb_url)) ? $sb_url : rtrim($nas_storage, '/') . '/files/' . rawurlencode($unique_name);

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
            'Color Ongoing (oven)',
            'QC Final',
            'Packaging',
            'Ready to Ship',
            'Delivered'
        );

        $client = LEMakeNasDbClient::get_instance();

        // Normalize stage and current status for oven variant compatibility
        if ($stage === 'Color Ongoing') {
            $stage = 'Color Ongoing (oven)';
        }

        // Sequential stage verification
        $order_res = $client->request('make_orders?id=eq.' . $order_id . '&select=id,status', 'GET');
        $current_status = (!is_wp_error($order_res) && !empty($order_res)) ? ($order_res[0]['status'] ?? '') : '';
        if ($current_status === 'Color Ongoing') {
            $current_status = 'Color Ongoing (oven)';
        }

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

        // A logged-in portal role is necessary but not sufficient: require a
        // short-lived server signature so clients cannot probe arbitrary files.
        $expires = absint($request->get_param('exp'));
        $signature = strtolower((string) $request->get_param('sig'));
        $expected_signature = self::sign_media_reference($file_param, $expires);
        if ($expires < time() || $expires > time() + HOUR_IN_SECONDS || $expected_signature === '' || !preg_match('/^[a-f0-9]{64}$/', $signature) || !hash_equals($expected_signature, $signature)) {
            return new WP_REST_Response(array('error' => 'Media link is invalid or expired. Reload the portal and try again.'), 403);
        }

        $clean_file_path = parse_url($file_param, PHP_URL_PATH);
        if (empty($clean_file_path)) {
            $clean_file_path = $file_param;
        }

        // Extract subpath under /files/
        if (strpos($clean_file_path, '/files/') !== false) {
            $subpath = substr($clean_file_path, strpos($clean_file_path, '/files/') + 7);
        } elseif (preg_match('#/storage/v1/object/(?:public/)?make-portal-files/(.+)$#', $clean_file_path, $matches)) {
            // Legacy Supabase URLs encode bucket and endpoint in the path;
            // the storage API request must receive only the object key.
            $subpath = $matches[1];
        } else {
            $subpath = ltrim($clean_file_path, '/');
        }

        $file_name = basename($clean_file_path);

        // Prevent path traversal
        if (strpos($clean_file_path, '..') !== false || strpos($subpath, '..') !== false) {
            status_header(400);
            echo 'Invalid file path';
            exit;
        }

        $client = LEMakeNasDbClient::get_instance();
        $body = null;
        $content_type = null;

        // 1. PRIMARY: Try reading from TrueNAS Storage if reported online
        if ($client->is_nas_online()) {
            $nas_storage = get_option('le_make_nas_storage_url', LEMakeNasDbClient::DEFAULT_TUNNEL_STORAGE);
            $target_nas_url = rtrim($nas_storage, '/') . '/files/' . $subpath;

            $cf_id = $client->get_cf_id();
            $cf_secret = $client->get_cf_secret();
            $headers = array();
            $nas_token = $client->get_nas_token();
            if (!empty($nas_token)) $headers['Authorization'] = 'Bearer ' . $nas_token;
            if (!empty($cf_id)) $headers['CF-Access-Client-Id'] = trim($cf_id);
            if (!empty($cf_secret)) $headers['CF-Access-Client-Secret'] = trim($cf_secret);

            $response = wp_remote_get($target_nas_url, array(
                'headers'     => $headers,
                'timeout'     => 8,
                'redirection' => 5,
                'sslverify'   => true,
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
            $target_sb_url = $supabase_url . '/storage/v1/object/' . $bucket . '/' . $subpath;
            $service_key = $client->get_service_key();

            if (empty($service_key)) {
                return new WP_REST_Response(array('error' => 'Private cloud media is unavailable: configure the Supabase service credential on the WordPress server.'), 503);
            }

            $sb_res = wp_remote_get($target_sb_url, array(
                'headers'     => array(
                    'Authorization' => 'Bearer ' . $service_key,
                    'apikey' => $service_key,
                ),
                'timeout'     => 15,
                'redirection' => 5,
                'sslverify'   => true
            ));

            if (!is_wp_error($sb_res) && wp_remote_retrieve_response_code($sb_res) === 200) {
                $body = wp_remote_retrieve_body($sb_res);
                $content_type = wp_remote_retrieve_header($sb_res, 'content-type');
            }
        }

        // 3. Fallback: check local staging directory if file was buffered during upload
        if (empty($body)) {
            $real_temp_dir = $client->get_private_staging_dir();
            $local_path = $real_temp_dir ? $real_temp_dir . DIRECTORY_SEPARATOR . sanitize_file_name($file_name) : '';
            $real_local_path = realpath($local_path);
            $encrypted_path = $local_path . '.enc';
            $real_encrypted_path = realpath($encrypted_path);
            $candidate_path = $real_local_path ?: $real_encrypted_path;
            if ($real_temp_dir && $candidate_path && strpos($candidate_path, rtrim($real_temp_dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR) === 0 && is_file($candidate_path)) {
                $stored_body = file_get_contents($candidate_path);
                $body = $client->decrypt_private_staging_payload($stored_body);
                if (is_wp_error($body)) return new WP_REST_Response(array('error' => 'Private staged file could not be decrypted.'), 500);
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
        // These files can contain internal production drawings; never make
        // authenticated media cacheable as public CDN content.
        header('Cache-Control: private, no-store, max-age=0');
        header('X-Content-Type-Options: nosniff');

        echo $body;
        exit;
    }

    public function request_production_approval(WP_REST_Request $request) {
        if (!current_user_can('request_make_production_approval') && !current_user_can('manage_options')) return new WP_REST_Response(array('error' => 'You do not have permission to request production approval with an outstanding balance.'), 403);
        $order_id = intval($request->get_param('id'));
        $body = $request->get_json_params() ?: $request->get_body_params();
        $notes = sanitize_textarea_field($body['notes'] ?? '');

        $client = LEMakeNasDbClient::get_instance();
        $res = $client->request_production_approval($order_id, $notes, wp_get_current_user());
        if (is_wp_error($res)) {
            return new WP_REST_Response(array('error' => $res->get_error_message()), 400);
        }
        return new WP_REST_Response($res, 200);
    }

    public function decide_production_approval(WP_REST_Request $request) {
        $order_id = intval($request->get_param('id'));
        $body = $request->get_json_params() ?: $request->get_body_params();
        $decision = sanitize_text_field($body['decision'] ?? '');
        $notes = sanitize_textarea_field($body['notes'] ?? '');

        if (!in_array($decision, array('approved', 'rejected'), true)) {
            return new WP_REST_Response(array('error' => 'Decision must be approved or rejected'), 400);
        }

        $client = LEMakeNasDbClient::get_instance();
        $res = $client->decide_production_approval($order_id, $decision, $notes, wp_get_current_user());
        if (is_wp_error($res)) {
            return new WP_REST_Response(array('error' => $res->get_error_message()), 400);
        }
        return new WP_REST_Response($res, 200);
    }

    public function record_order_payment(WP_REST_Request $request) {
        if (!current_user_can('make_record_payment') && !current_user_can('manage_options')) return new WP_REST_Response(array('error' => 'You do not have permission to record order payments.'), 403);
        $order_id = intval($request->get_param('id'));
        $body = $request->get_json_params() ?: $request->get_body_params();
        $amount = floatval($body['amount'] ?? 0);
        $method = sanitize_text_field($body['payment_method'] ?? 'CASH');
        $ref = sanitize_text_field($body['reference'] ?? '');
        $notes = sanitize_textarea_field($body['notes'] ?? '');

        if ($amount <= 0) {
            return new WP_REST_Response(array('error' => 'Payment amount must be greater than zero'), 400);
        }

        $client = LEMakeNasDbClient::get_instance();
        $res = $client->record_order_payment($order_id, $amount, $method, $ref, $notes, wp_get_current_user());
        if (is_wp_error($res)) {
            return new WP_REST_Response(array('error' => $res->get_error_message()), 400);
        }
        return new WP_REST_Response($res, 200);
    }

    public function get_order_payments(WP_REST_Request $request) {
        $order_id = intval($request->get_param('id'));
        $client = LEMakeNasDbClient::get_instance();
        $res = $client->get_order_payments($order_id);
        return new WP_REST_Response($res, 200);
    }
}


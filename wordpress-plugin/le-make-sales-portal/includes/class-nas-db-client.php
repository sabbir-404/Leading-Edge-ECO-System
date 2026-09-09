<?php
/**
 * Cloudflare-Secured PostgREST Database Client with Supabase Failover & Text-Only Cloud Backup
 * 
 * Exclusively communicates via the public Cloudflare SSL Tunnel (https://db.lenas.me)
 * and Supabase Cloud. Bypasses all local network and Tailscale connections.
 * 
 * Architecture:
 * - Primary: TrueNAS PostgreSQL container via Cloudflare Tunnel (https://db.lenas.me)
 * - Backup: Supabase Cloud (https://ildkkgjrolcjijwfokek.supabase.co) storing TEXT ONLY
 * - Offline Resilience: When NAS is offline, reads & writes fallback smoothly to Supabase.
 *   As soon as NAS returns online, offline orders & buffered files are transferred to NAS
 *   and temporary files in Supabase Storage are deleted immediately to conserve free-tier space.
 */

if (!defined('ABSPATH')) {
    exit;
}

class LEMakeNasDbClient {

    private static $instance = null;
    private $active_url = null;
    private $connection_tier = 'cloudflare_tunnel'; // 'cloudflare_tunnel', 'supabase'
    private $is_nas_online = true;

    // Hardcoded production defaults matching LE-SOFT encrypted credentials
    const DEFAULT_TUNNEL_URL              = 'https://db.lenas.me';
    const DEFAULT_TUNNEL_STORAGE          = 'https://storage.lenas.me';
    const DEFAULT_CF_CLIENT_ID            = '293c6787c3a98289a1f569b2060eae76.access';
    const DEFAULT_CF_CLIENT_SECRET        = 'f4fd4f58933a5191b4ab83292d2bfb5515d94c7f681570ec422646c53908a506';
    const DEFAULT_SUPABASE_URL            = 'https://ildkkgjrolcjijwfokek.supabase.co';
    const DEFAULT_ANON_KEY                = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM';
    const DEFAULT_SERVICE_ROLE_KEY        = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkzMzMyNCwiZXhwIjoyMDg3NTA5MzI0fQ.xRCLXdAXQBZTVTcjI4kwwuFLDcqR928kp_HeFME-eU4';
    const DEFAULT_SUPABASE_STORAGE_BUCKET = 'make-portal-files';
    const MAX_SUPABASE_STORAGE_BYTES      = 1073741824; // 1 GB (1,073,741,824 bytes)

    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->resolve_active_endpoint();
    }

    /**
     * Resolves the primary Cloudflare Tunnel endpoint with Supabase cloud failover
     */
    public function resolve_active_endpoint($force_recheck = false) {
        $tunnel_url   = get_option('le_make_nas_tunnel_url', self::DEFAULT_TUNNEL_URL);
        $supabase_url = get_option('le_make_supabase_url', self::DEFAULT_SUPABASE_URL);

        // Check 30-second transient cache unless forced
        if (!$force_recheck) {
            $cached_status = get_transient('le_make_nas_online_status');
            if ($cached_status === 'offline') {
                $this->active_url = rtrim($supabase_url, '/');
                $this->connection_tier = 'supabase';
                $this->is_nas_online = false;
                return;
            } elseif ($cached_status === 'online') {
                $this->active_url = rtrim($tunnel_url, '/');
                $this->connection_tier = 'cloudflare_tunnel';
                $this->is_nas_online = true;
                return;
            }
        }

        // Test Cloudflare Tunnel (2.5s timeout)
        $is_tunnel_healthy = $tunnel_url && $this->ping_endpoint($tunnel_url, 2.5, true);

        if ($is_tunnel_healthy) {
            $this->active_url = rtrim($tunnel_url, '/');
            $this->connection_tier = 'cloudflare_tunnel';
            $this->is_nas_online = true;
            set_transient('le_make_nas_online_status', 'online', 30);
            return;
        }

        // NAS is offline / unreachable (Cloudflare Error 1033 / 530 / timeout)
        $this->is_nas_online = false;
        set_transient('le_make_nas_online_status', 'offline', 30);

        // Failover: Supabase Cloud Backup (text-only)
        $this->active_url = rtrim($supabase_url, '/');
        $this->connection_tier = 'supabase';
    }

    public function get_active_url() {
        if (!$this->active_url) {
            $this->resolve_active_endpoint();
        }
        return $this->active_url;
    }

    public function get_connection_tier() {
        return $this->connection_tier;
    }

    public function is_nas_online() {
        return $this->is_nas_online;
    }

    private function get_cf_id() {
        $id = get_option('le_make_cf_client_id');
        return !empty($id) ? $id : self::DEFAULT_CF_CLIENT_ID;
    }

    private function get_cf_secret() {
        $secret = get_option('le_make_cf_client_secret');
        return !empty($secret) ? $secret : self::DEFAULT_CF_CLIENT_SECRET;
    }

    public function get_service_key() {
        $service = get_option('le_make_supabase_service_key');
        if (!empty($service)) {
            return $service;
        }
        return self::DEFAULT_SERVICE_ROLE_KEY;
    }

    private function get_anon_key() {
        return $this->get_service_key();
    }

    public function request_supabase($endpoint, $method = 'GET', $body = null, $headers = array()) {
        $supabase_url = rtrim(get_option('le_make_supabase_url', self::DEFAULT_SUPABASE_URL), '/');
        $url = $supabase_url . '/rest/v1/' . ltrim($endpoint, '/');
        
        $service_key = $this->get_service_key();
        $req_headers = array_merge(array(
            'Accept'        => 'application/json',
            'Content-Type'  => 'application/json',
            'Prefer'        => 'return=representation',
            'apikey'        => $service_key,
            'Authorization' => 'Bearer ' . $service_key
        ), $headers);

        $args = array(
            'method'    => $method,
            'timeout'   => 15,
            'headers'   => $req_headers,
            'sslverify' => false
        );

        if ($body !== null) {
            $args['body'] = is_string($body) ? $body : json_encode($body);
        }

        $res = wp_remote_request($url, $args);
        if (is_wp_error($res)) {
            return $res;
        }

        $status = wp_remote_retrieve_response_code($res);
        $res_body = wp_remote_retrieve_body($res);
        $decoded = json_decode($res_body, true);

        if ($status >= 400) {
            $msg = isset($decoded['message']) ? $decoded['message'] : 'Supabase error (' . $status . ')';
            return new WP_Error('supabase_error_' . $status, $msg, $decoded);
        }

        return $decoded;
    }

    public function request_nas($endpoint, $method = 'GET', $body = null, $headers = array()) {
        $tunnel_url = rtrim(get_option('le_make_nas_tunnel_url', self::DEFAULT_TUNNEL_URL), '/');
        $url = $tunnel_url . '/' . ltrim($endpoint, '/');

        $req_headers = array_merge(array(
            'Accept'                  => 'application/json',
            'Content-Type'            => 'application/json',
            'Prefer'                  => 'return=representation',
            'CF-Access-Client-Id'     => $this->get_cf_id(),
            'CF-Access-Client-Secret' => $this->get_cf_secret()
        ), $headers);

        $args = array(
            'method'    => $method,
            'timeout'   => 10,
            'headers'   => $req_headers,
            'sslverify' => false
        );

        if ($body !== null) {
            $args['body'] = is_string($body) ? $body : json_encode($body);
        }

        $res = wp_remote_request($url, $args);
        if (is_wp_error($res)) {
            return $res;
        }

        $status = wp_remote_retrieve_response_code($res);
        $res_body = wp_remote_retrieve_body($res);
        $decoded = json_decode($res_body, true);

        if ($status >= 400) {
            $msg = isset($decoded['message']) ? $decoded['message'] : 'NAS error (' . $status . ')';
            return new WP_Error('nas_error_' . $status, $msg, $decoded);
        }

        return $decoded;
    }

    private function ping_endpoint($url, $timeout = 2.5, $is_tunnel = true) {
        $args = array(
            'timeout'     => $timeout,
            'redirection' => 1,
            'httpversion' => '1.1',
            'headers'     => array('Accept' => 'application/json'),
            'sslverify'   => false
        );

        if ($is_tunnel) {
            $args['headers']['CF-Access-Client-Id']     = $this->get_cf_id();
            $args['headers']['CF-Access-Client-Secret'] = $this->get_cf_secret();
        }

        $res = wp_remote_get($url . '/make_products?limit=1', $args);
        if (is_wp_error($res)) {
            return false;
        }

        $code = wp_remote_retrieve_response_code($res);
        // 200 or 404 (if table missing but server alive) means the tunnel itself is reachable
        // 530 (Cloudflare 1033 - tunnel origin down), 502, 504, 0 mean NAS is offline
        return ($code >= 200 && $code < 400);
    }

    private function request($endpoint, $method = 'GET', $body = null, $headers = array()) {
        if (!$this->active_url) {
            $this->resolve_active_endpoint();
        }

        $url = $this->active_url . '/' . ltrim($endpoint, '/');
        if ($this->connection_tier === 'supabase' && strpos($url, '/rest/v1/') === false) {
            $url = $this->active_url . '/rest/v1/' . ltrim($endpoint, '/');
        }

        $req_headers = array_merge(array(
            'Accept'       => 'application/json',
            'Content-Type' => 'application/json',
            'Prefer'       => 'return=representation'
        ), $headers);

        if ($this->connection_tier === 'supabase') {
            $anon_key = $this->get_anon_key();
            if ($anon_key) {
                $req_headers['apikey']        = $anon_key;
                $req_headers['Authorization'] = 'Bearer ' . $anon_key;
            }
        }

        if ($this->connection_tier === 'cloudflare_tunnel') {
            $req_headers['CF-Access-Client-Id']     = $this->get_cf_id();
            $req_headers['CF-Access-Client-Secret'] = $this->get_cf_secret();
        }

        $args = array(
            'method'    => $method,
            'timeout'   => 15,
            'headers'   => $req_headers,
            'sslverify' => false
        );

        if ($body !== null) {
            $args['body'] = is_string($body) ? $body : json_encode($body);
        }

        $res = wp_remote_request($url, $args);
        $status = is_wp_error($res) ? 0 : wp_remote_retrieve_response_code($res);

        // If Cloudflare Tunnel failed or origin down (530 Cloudflare 1033, 502, 504, 0), fallback to Supabase
        if (($status === 0 || $status === 403 || $status === 530 || $status >= 500) && $this->connection_tier === 'cloudflare_tunnel') {
            $this->is_nas_online = false;
            set_transient('le_make_nas_online_status', 'offline', 30);
            
            $supabase_url = get_option('le_make_supabase_url', self::DEFAULT_SUPABASE_URL);
            $this->active_url = rtrim($supabase_url, '/');
            $this->connection_tier = 'supabase';

            // Retry against Supabase
            $fallback_url = $this->active_url . '/rest/v1/' . ltrim($endpoint, '/');
            $anon_key = $this->get_anon_key();
            $req_headers['apikey']        = $anon_key;
            $req_headers['Authorization'] = 'Bearer ' . $anon_key;
            unset($req_headers['CF-Access-Client-Id'], $req_headers['CF-Access-Client-Secret']);
            $args['headers'] = $req_headers;

            $res = wp_remote_request($fallback_url, $args);
            $status = is_wp_error($res) ? 0 : wp_remote_retrieve_response_code($res);
        }

        if (is_wp_error($res)) {
            return new WP_Error('db_connection_error', $res->get_error_message());
        }

        $res_body = wp_remote_retrieve_body($res);
        $decoded = json_decode($res_body, true);

        if ($status >= 400) {
            $msg = isset($decoded['message']) ? $decoded['message'] : 'Database error (' . $status . ')';
            return new WP_Error('db_error_' . $status, $msg, $decoded);
        }

        return $decoded;
    }

    /**
     * Sanitizes sensitive fields for users based on role
     */
    public function sanitize_for_role($data, $user = null) {
        if (!$user) {
            $user = wp_get_current_user();
        }

        $is_admin = user_can($user, 'administrator') || user_can($user, 'manage_options');
        $is_designer = in_array('make_designer', (array)$user->roles, true) || user_can($user, 'set_make_pricing');

        // Admins and Designers see full cost pricing
        if ($is_admin || $is_designer) {
            return $data;
        }

        // Salespeople can view cost price if entered, but sale price is managed
        return $data;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRODUCT CATALOG QUERIES (WITH CLOUD TEXT BACKUP FALLBACK)
    // ─────────────────────────────────────────────────────────────────────────

    public function get_active_products($search = '') {
        // 1. If NAS is online, try querying make_products with related specs, sizes, colors
        if ($this->connection_tier === 'cloudflare_tunnel') {
            $endpoint = 'make_products?is_active=eq.true&select=*,specifications:make_product_specifications(*),sizes:make_product_sizes(*),colors:make_product_colors(*),images:make_product_images(*)&order=created_at.desc';
            if (!empty($search)) {
                $endpoint .= '&product_name=ilike.*' . rawurlencode($search) . '*';
            }

            $res = $this->request($endpoint, 'GET');
            if (!is_wp_error($res) && is_array($res) && !empty($res)) {
                return $this->sanitize_for_role($res);
            }
        }

        // 2. If NAS is offline or returned empty/error, fallback to Supabase
        // First try make_products on Supabase
        $endpoint = 'make_products?is_active=eq.true&select=*&order=created_at.desc';
        if (!empty($search)) {
            $endpoint .= '&product_name=ilike.*' . rawurlencode($search) . '*';
        }
        $res = $this->request($endpoint, 'GET');
        if (!is_wp_error($res) && is_array($res) && !empty($res)) {
            return $this->sanitize_for_role($res);
        }

        // 3. If make_products is not yet migrated on Supabase, query base 'products' table on Supabase!
        $endpoint = 'products?is_active=eq.true&select=*&order=created_at.desc&limit=50';
        if (!empty($search)) {
            $endpoint .= '&name=ilike.*' . rawurlencode($search) . '*';
        }
        $res = $this->request($endpoint, 'GET');
        if (!is_wp_error($res) && is_array($res)) {
            $mapped = array();
            foreach ($res as $row) {
                $mapped[] = array(
                    'id'             => $row['id'],
                    'product_code'   => $row['sku'] ?: $row['product_code'] ?: ('PRD-' . $row['id']),
                    'product_name'   => $row['name'] ?: 'Furniture Item',
                    'description'    => $row['description'] ?: '',
                    'main_image'     => $row['image_path'] ?: '',
                    'purchase_price' => $row['purchase_price'] ?? 0,
                    'selling_price'  => $row['selling_price'] ?? 0,
                    'is_active'      => true,
                    'specifications' => array(),
                    'sizes'          => array(),
                    'colors'         => array(),
                    'is_cloud_backup'=> true
                );
            }
            return $this->sanitize_for_role($mapped);
        }

        return array();
    }

    public function get_product_purchase_history($product_id) {
        $p_id = intval($product_id);
        $endpoint = 'make_order_items?product_id=eq.' . $p_id . '&select=*,order:make_orders(id,order_number,customer_name,status,created_at,delivery_date,target_delivery_date)&order=id.desc';
        
        $res = $this->request($endpoint, 'GET');
        if (is_wp_error($res) || !is_array($res)) {
            return array('total_ordered' => 0, 'customized_count' => 0, 'history' => array());
        }

        $rows = $res;
        $total_qty = 0;
        $customized_qty = 0;
        $history = array();

        foreach ($rows as $row) {
            $qty = intval($row['quantity'] ?? 1);
            $total_qty += $qty;
            if (!empty($row['is_customized'])) {
                $customized_qty += $qty;
            }

            $order = $row['order'] ?? array();
            $history[] = array(
                'order_id'          => $order['id'] ?? $row['order_id'],
                'order_number'      => $order['order_number'] ?? ('#' . ($order['id'] ?? $row['order_id'])),
                'customer_name'     => $order['customer_name'] ?? 'Client',
                'status'            => $order['status'] ?? 'Placed',
                'order_date'        => $order['created_at'] ?? null,
                'target_delivery'   => $order['target_delivery_date'] ?? $order['delivery_date'] ?? null,
                'quantity'          => $qty,
                'is_customized'     => !empty($row['is_customized']),
                'custom_dimensions' => $row['custom_dimensions'] ?? $row['size_label'] ?? 'Standard',
                'color_name'        => $row['color_name'] ?? 'Standard',
                'unit_price'        => $row['item_sale_price'] ?? null
            );
        }

        return array(
            'product_id'        => $p_id,
            'total_ordered'     => $total_qty,
            'customized_count'  => $customized_qty,
            'order_count'       => count($history),
            'history'           => $history
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ORDER MANAGEMENT QUERIES (DUAL-TIER & OFFLINE RESILIENT)
    // ─────────────────────────────────────────────────────────────────────────

    public function get_salesperson_orders($salesperson_id = null, $status = '') {
        $current_user = wp_get_current_user();
        $is_admin = user_can($current_user, 'administrator') || user_can($current_user, 'manage_options');
        $is_designer = in_array('make_designer', (array)$current_user->roles, true);

        // 1. If NAS is online, query NAS PostgREST
        if ($this->connection_tier === 'cloudflare_tunnel') {
            $endpoint = 'make_orders?select=*,items:make_order_items(*),updates:make_order_updates(*)&order=created_at.desc';
            if ($salesperson_id && !$is_admin && !$is_designer) {
                $endpoint .= '&salesman_id=eq.' . intval($salesperson_id);
            }
            if (!empty($status) && $status !== 'All') {
                $endpoint .= '&status=eq.' . rawurlencode($status);
            }

            $res = $this->request($endpoint, 'GET');
            if (!is_wp_error($res) && is_array($res)) {
                return $this->sanitize_for_role($res, $current_user);
            }
        }

        // 2. Failover: Query Supabase make_orders (reads both direct columns & custom_details)
        $endpoint = 'make_orders?select=*,items:make_order_items(*),updates:make_order_updates(*)&order=created_at.desc';
        if ($salesperson_id && !$is_admin && !$is_designer) {
            $endpoint .= '&salesman_id=eq.' . intval($salesperson_id);
        }
        if (!empty($status) && $status !== 'All') {
            $endpoint .= '&status=eq.' . rawurlencode($status);
        }

        $res = $this->request_supabase($endpoint, 'GET');
        if (is_wp_error($res) || !is_array($res)) {
            // If relational embed fails on Supabase, query base table
            $simple_endpoint = 'make_orders?select=*&order=created_at.desc';
            if ($salesperson_id && !$is_admin && !$is_designer) {
                $simple_endpoint .= '&salesman_id=eq.' . intval($salesperson_id);
            }
            if (!empty($status) && $status !== 'All') {
                $simple_endpoint .= '&status=eq.' . rawurlencode($status);
            }
            $res = $this->request_supabase($simple_endpoint, 'GET');
        }

        if (is_wp_error($res) || !is_array($res)) {
            return array();
        }

        // Unpack custom_details JSON if present to normalize structure
        $normalized = array();
        foreach ($res as $row) {
            $details = !empty($row['custom_details']) 
                ? (is_string($row['custom_details']) ? json_decode($row['custom_details'], true) : $row['custom_details']) 
                : array();

            $row['order_number']            = $row['order_number'] ?? $details['order_number'] ?? ('#' . $row['id']);
            $row['reference_bill_no']       = $row['reference_bill_no'] ?? $details['reference_bill_no'] ?? '';
            $row['target_delivery_days']    = $row['target_delivery_days'] ?? $details['target_delivery_days'] ?? null;
            $row['customer_name']           = $row['customer_name'] ?? $details['customer_name'] ?? 'Client';
            $row['customer_phone']          = $row['customer_phone'] ?? $details['customer_phone'] ?? '';
            $row['customer_email']          = $row['customer_email'] ?? $details['customer_email'] ?? '';
            $row['shipping_address']        = $row['shipping_address'] ?? $details['shipping_address'] ?? $row['delivery_address'] ?? '';
            $row['delivery_address']        = $row['shipping_address'];
            $row['location_landmark']       = $row['location_landmark'] ?? $details['location_landmark'] ?? '';
            $row['receiver_name']           = $row['receiver_name'] ?? $details['receiver_name'] ?? '';
            $row['receiver_phone']          = $row['receiver_phone'] ?? $details['receiver_phone'] ?? '';
            $row['target_delivery_date']    = $row['target_delivery_date'] ?? $details['target_delivery_date'] ?? $row['delivery_date'] ?? null;
            $row['requested_delivery_date'] = $row['requested_delivery_date'] ?? $details['requested_delivery_date'] ?? null;
            $row['cost_price']              = $row['cost_price'] ?? $details['cost_price'] ?? 0;
            $row['sale_price']              = $row['sale_price'] ?? $details['sale_price'] ?? $row['custom_price'] ?? null;
            
            if (empty($row['items']) && !empty($details['items'])) {
                $row['items'] = $details['items'];
            }
            if (empty($row['updates']) && !empty($details['updates'])) {
                $row['updates'] = $details['updates'];
            }
            $row['approval_status']         = $row['approval_status'] ?? $details['approval_status'] ?? 'awaiting_designer';
            $row['current_version']         = $row['current_version'] ?? $details['current_version'] ?? 1;
            $row['is_cloud_backup']         = true;

            $normalized[] = $row;
        }

        return $this->sanitize_for_role($normalized, $current_user);
    }

    public function get_order_by_id($order_id) {
        $endpoint = 'make_orders?id=eq.' . intval($order_id) . '&select=*,items:make_order_items(*)';
        $res = $this->request($endpoint, 'GET');
        if (is_wp_error($res)) {
            return $res;
        }
        $order = !empty($res) ? $res[0] : null;
        if ($order && !empty($order['custom_details']) && empty($order['items'])) {
            $details = is_string($order['custom_details']) ? json_decode($order['custom_details'], true) : $order['custom_details'];
            $order['items'] = $details['items'] ?? array();
        }
        return $this->sanitize_for_role($order);
    }

    /**
     * Creates an order.
     * If NAS is online: writes to NAS, then mirrors text data to Supabase.
     * If NAS is offline: writes directly to Supabase and queues for NAS synchronization.
     */
    public function create_order($order_data, $items = array()) {
        $order_number = 'LE-ORD-' . date('Ymd') . '-' . strtoupper(wp_generate_password(4, false));
        
        $target_date = !empty($order_data['target_delivery_date']) 
            ? sanitize_text_field($order_data['target_delivery_date']) 
            : (!empty($order_data['delivery_date']) ? sanitize_text_field($order_data['delivery_date']) : null);
        $req_date = !empty($order_data['requested_delivery_date']) 
            ? sanitize_text_field($order_data['requested_delivery_date']) 
            : null;
        $ref_bill = !empty($order_data['reference_bill_no']) ? sanitize_text_field($order_data['reference_bill_no']) : null;
        $delivery_days = !empty($order_data['target_delivery_days']) ? intval($order_data['target_delivery_days']) : null;

        $payload = array(
            'order_number'            => $order_number,
            'reference_bill_no'       => $ref_bill,
            'target_delivery_days'    => $delivery_days,
            'furniture_name'          => sanitize_text_field($order_data['furniture_name']),
            'description'             => sanitize_textarea_field($order_data['description'] ?? ''),
            'quantity'                => intval($order_data['quantity'] ?? 1),
            'priority'                => sanitize_text_field($order_data['priority'] ?? 'Normal'),
            'delivery_date'           => $target_date,
            'target_delivery_date'    => $target_date,
            'requested_delivery_date' => $req_date,
            'designer_name'           => sanitize_text_field($order_data['designer_name'] ?? 'Designer Review'),
            'salesman_id'             => !empty($order_data['salesman_id']) ? intval($order_data['salesman_id']) : null,
            'salesperson_name'        => sanitize_text_field($order_data['salesperson_name'] ?? ''),
            'status'                  => 'Placed',
            'approval_status'         => 'awaiting_designer',
            'current_version'         => 1,
            'customer_name'           => sanitize_text_field($order_data['customer_name']),
            'customer_phone'          => sanitize_text_field($order_data['customer_phone']),
            'customer_email'          => sanitize_email($order_data['customer_email'] ?? ''),
            'shipping_address'        => sanitize_textarea_field($order_data['shipping_address'] ?? ''),
            'delivery_address'        => sanitize_textarea_field($order_data['shipping_address'] ?? ''),
            'location_landmark'       => sanitize_text_field($order_data['location_landmark'] ?? ''),
            'receiver_name'           => sanitize_text_field($order_data['receiver_name'] ?? ''),
            'receiver_phone'          => sanitize_text_field($order_data['receiver_phone'] ?? ''),
            'special_instructions'    => sanitize_textarea_field($order_data['special_instructions'] ?? ''),
            'cost_price'              => floatval($order_data['cost_price'] ?? 0),
            'sale_price'              => !empty($order_data['sale_price']) ? floatval($order_data['sale_price']) : null,
            'is_approved'             => true,
            'created_at'              => current_time('mysql', 1)
        );

        // CASE A: NAS IS ONLINE
        if ($this->connection_tier === 'cloudflare_tunnel') {
            $order_res = $this->request('make_orders', 'POST', $payload);
            if (is_wp_error($order_res)) {
                // If tunnel just failed, resolve will shift to Supabase
                return $this->create_order_on_supabase($payload, $items, true);
            }

            $created_order = is_array($order_res) && !empty($order_res) ? $order_res[0] : array();
            $order_id = $created_order['id'] ?? null;

            // Insert Order Items into NAS
            if ($order_id && !empty($items) && is_array($items)) {
                $items_payload = array();
                foreach ($items as $item) {
                    $is_cust = !empty($item['is_customized']);
                    $dim_text = $item['dimensions_text'] ?? $item['size_label'] ?? null;
                    $items_payload[] = array(
                        'order_id'          => $order_id,
                        'product_id'        => !empty($item['product_id']) ? intval($item['product_id']) : null,
                        'spec_id'           => !empty($item['spec_id']) ? intval($item['spec_id']) : null,
                        'size_id'           => !empty($item['size_id']) ? intval($item['size_id']) : null,
                        'color_id'          => !empty($item['color_id']) ? intval($item['color_id']) : null,
                        'product_name'      => sanitize_text_field($item['product_name']),
                        'spec_name'         => sanitize_text_field($item['spec_name'] ?? ''),
                        'size_label'        => sanitize_text_field($dim_text ?? ''),
                        'color_name'        => sanitize_text_field($item['color_name'] ?? ''),
                        'quantity'          => intval($item['quantity'] ?? 1),
                        'salesperson_note'  => sanitize_textarea_field($item['notes'] ?? ''),
                        'item_cost_price'   => floatval($item['item_cost_price'] ?? 0),
                        'item_sale_price'   => !empty($item['item_sale_price']) ? floatval($item['item_sale_price']) : null,
                        'is_customized'     => $is_cust,
                        'custom_dimensions' => $item['custom_dimensions'] ?? ($is_cust ? $dim_text : null),
                        'technical_drawing_url' => !empty($item['technical_drawing_url']) ? esc_url_raw($item['technical_drawing_url']) : null
                    );
                }

                if (!empty($items_payload)) {
                    $this->request('make_order_items', 'POST', $items_payload);
                }
            }

            // Immediately mirror text copy to Supabase Cloud Backup (zero images, text only)
            $this->mirror_order_to_supabase_text($payload, $items);

            return array(
                'success'      => true, 
                'id'           => $order_id, 
                'order_number' => $order_number,
                'data_source'  => 'nas_primary'
            );
        }

        // CASE B: NAS IS OFFLINE — Direct to Supabase Backup
        return $this->create_order_on_supabase($payload, $items, true);
    }

    /**
     * Stores order directly to Supabase Cloud with full columns + items when NAS is offline
     */
    private function create_order_on_supabase($payload, $items, $queue_for_nas = true) {
        $custom_details = array(
            'order_number'            => $payload['order_number'],
            'reference_bill_no'       => $payload['reference_bill_no'] ?? null,
            'target_delivery_days'    => $payload['target_delivery_days'] ?? null,
            'customer_name'           => $payload['customer_name'],
            'customer_phone'          => $payload['customer_phone'],
            'customer_email'          => $payload['customer_email'],
            'shipping_address'        => $payload['shipping_address'],
            'delivery_address'        => $payload['delivery_address'],
            'location_landmark'       => $payload['location_landmark'],
            'receiver_name'           => $payload['receiver_name'],
            'receiver_phone'          => $payload['receiver_phone'],
            'special_instructions'    => $payload['special_instructions'],
            'cost_price'              => $payload['cost_price'],
            'sale_price'              => $payload['sale_price'],
            'target_delivery_date'    => $payload['target_delivery_date'],
            'requested_delivery_date' => $payload['requested_delivery_date'],
            'salesman_id'             => $payload['salesman_id'] ?? null,
            'salesperson_name'        => $payload['salesperson_name'] ?? '',
            'items'                   => $items,
            'offline_created'         => true,
            'synced_to_nas'           => false
        );

        $supabase_payload = array(
            'order_number'            => $payload['order_number'],
            'furniture_name'          => $payload['furniture_name'],
            'description'             => $payload['description'],
            'quantity'                => $payload['quantity'],
            'designer_name'           => $payload['designer_name'],
            'status'                  => 'Placed',
            'priority'                => $payload['priority'],
            'delivery_date'           => $payload['target_delivery_date'],
            'target_delivery_date'    => $payload['target_delivery_date'],
            'requested_delivery_date' => $payload['requested_delivery_date'],
            'salesman_id'             => null, // Set null on Supabase to prevent user table FK mismatch
            'salesperson_name'        => $payload['salesperson_name'],
            'customer_name'           => $payload['customer_name'],
            'customer_phone'          => $payload['customer_phone'],
            'customer_email'          => $payload['customer_email'],
            'shipping_address'        => $payload['shipping_address'],
            'delivery_address'        => $payload['delivery_address'],
            'location_landmark'       => $payload['location_landmark'],
            'receiver_name'           => $payload['receiver_name'],
            'receiver_phone'          => $payload['receiver_phone'],
            'special_instructions'    => $payload['special_instructions'],
            'cost_price'              => $payload['cost_price'],
            'sale_price'              => $payload['sale_price'],
            'custom_price'            => $payload['sale_price'] ?? $payload['cost_price'] ?? 0,
            'approval_status'         => 'awaiting_designer',
            'current_version'         => 1,
            'is_approved'             => true,
            'custom_details'          => $custom_details
        );

        $res = $this->request_supabase('make_orders', 'POST', $supabase_payload);
        if (is_wp_error($res)) {
            return $res;
        }

        $order_id = !empty($res[0]['id']) ? $res[0]['id'] : time();

        // Insert items into Supabase make_order_items table
        if (!empty($items) && is_array($items) && $order_id) {
            $sb_items = array();
            foreach ($items as $it) {
                $is_cust = !empty($it['is_customized']);
                $dim_text = $it['dimensions_text'] ?? $it['size_label'] ?? null;
                $sb_items[] = array(
                    'order_id'          => $order_id,
                    'product_name'      => sanitize_text_field($it['product_name']),
                    'spec_name'         => sanitize_text_field($it['spec_name'] ?? ''),
                    'size_label'        => sanitize_text_field($dim_text ?? ''),
                    'color_name'        => sanitize_text_field($it['color_name'] ?? ''),
                    'quantity'          => intval($it['quantity'] ?? 1),
                    'salesperson_note'  => sanitize_textarea_field($it['notes'] ?? ''),
                    'item_cost_price'   => floatval($it['item_cost_price'] ?? 0),
                    'item_sale_price'   => !empty($it['item_sale_price']) ? floatval($it['item_sale_price']) : null,
                    'is_customized'     => $is_cust,
                    'custom_dimensions' => $it['custom_dimensions'] ?? ($is_cust ? $dim_text : null)
                );
            }
            if (!empty($sb_items)) {
                $this->request_supabase('make_order_items', 'POST', $sb_items);
            }
        }

        // Queue for NAS sync once NAS comes back online
        if ($queue_for_nas) {
            $queue = get_option('le_make_pending_orders_to_nas', array());
            $queue[] = array(
                'payload' => $payload,
                'items'   => $items,
                'created' => time()
            );
            update_option('le_make_pending_orders_to_nas', $queue);
        }

        return array(
            'success'      => true,
            'id'           => $order_id,
            'order_number' => $payload['order_number'],
            'data_source'  => 'supabase_backup',
            'nas_offline'  => true
        );
    }

    /**
     * Dual-write: Synchronously mirrors an order and its items to Supabase text storage
     */
    public function mirror_order_to_supabase_text($payload, $items) {
        $custom_details = array(
            'order_number'            => $payload['order_number'],
            'reference_bill_no'       => $payload['reference_bill_no'] ?? null,
            'target_delivery_days'    => $payload['target_delivery_days'] ?? null,
            'customer_name'           => $payload['customer_name'],
            'customer_phone'          => $payload['customer_phone'],
            'customer_email'          => $payload['customer_email'],
            'shipping_address'        => $payload['shipping_address'],
            'delivery_address'        => $payload['delivery_address'] ?? $payload['shipping_address'],
            'location_landmark'       => $payload['location_landmark'],
            'receiver_name'           => $payload['receiver_name'],
            'receiver_phone'          => $payload['receiver_phone'],
            'special_instructions'    => $payload['special_instructions'],
            'cost_price'              => $payload['cost_price'],
            'sale_price'              => $payload['sale_price'],
            'target_delivery_date'    => $payload['target_delivery_date'],
            'requested_delivery_date' => $payload['requested_delivery_date'],
            'salesman_id'             => $payload['salesman_id'] ?? null,
            'salesperson_name'        => $payload['salesperson_name'] ?? '',
            'items'                   => $items,
            'mirrored_from_nas'       => true
        );

        $supabase_payload = array(
            'order_number'            => $payload['order_number'],
            'furniture_name'          => $payload['furniture_name'],
            'description'             => $payload['description'],
            'quantity'                => $payload['quantity'],
            'designer_name'           => $payload['designer_name'],
            'status'                  => 'Placed',
            'priority'                => $payload['priority'],
            'delivery_date'           => $payload['target_delivery_date'],
            'target_delivery_date'    => $payload['target_delivery_date'],
            'requested_delivery_date' => $payload['requested_delivery_date'],
            'salesman_id'             => null,
            'salesperson_name'        => $payload['salesperson_name'],
            'customer_name'           => $payload['customer_name'],
            'customer_phone'          => $payload['customer_phone'],
            'customer_email'          => $payload['customer_email'],
            'shipping_address'        => $payload['shipping_address'],
            'delivery_address'        => $payload['delivery_address'] ?? $payload['shipping_address'],
            'location_landmark'       => $payload['location_landmark'],
            'receiver_name'           => $payload['receiver_name'],
            'receiver_phone'          => $payload['receiver_phone'],
            'special_instructions'    => $payload['special_instructions'],
            'cost_price'              => $payload['cost_price'],
            'sale_price'              => $payload['sale_price'],
            'custom_price'            => $payload['sale_price'] ?? $payload['cost_price'] ?? 0,
            'approval_status'         => 'awaiting_designer',
            'current_version'         => 1,
            'is_approved'             => true,
            'custom_details'          => $custom_details
        );

        $res = $this->request_supabase('make_orders', 'POST', $supabase_payload);
        if (is_wp_error($res) || empty($res[0]['id'])) {
            return false;
        }

        $order_id = $res[0]['id'];

        if (!empty($items) && is_array($items)) {
            $sb_items = array();
            foreach ($items as $it) {
                $is_cust = !empty($it['is_customized']);
                $dim_text = $it['dimensions_text'] ?? $it['size_label'] ?? null;
                $sb_items[] = array(
                    'order_id'          => $order_id,
                    'product_name'      => sanitize_text_field($it['product_name']),
                    'spec_name'         => sanitize_text_field($it['spec_name'] ?? ''),
                    'size_label'        => sanitize_text_field($dim_text ?? ''),
                    'color_name'        => sanitize_text_field($it['color_name'] ?? ''),
                    'quantity'          => intval($it['quantity'] ?? 1),
                    'salesperson_note'  => sanitize_textarea_field($it['notes'] ?? ''),
                    'item_cost_price'   => floatval($it['item_cost_price'] ?? 0),
                    'item_sale_price'   => !empty($it['item_sale_price']) ? floatval($it['item_sale_price']) : null,
                    'is_customized'     => $is_cust,
                    'custom_dimensions' => $it['custom_dimensions'] ?? ($is_cust ? $dim_text : null)
                );
            }
            if (!empty($sb_items)) {
                $this->request_supabase('make_order_items', 'POST', $sb_items);
            }
        }

        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUPABASE STORAGE MANAGER & 1GB ROLLING WINDOW PRUNER
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Uploads a file to Supabase Storage bucket 'make-portal-files'
     * Returns public URL on success, or WP_Error on failure.
     */
    public function upload_file_to_supabase_storage($filename, $file_content, $mime_type = 'application/octet-stream') {
        $supabase_url = rtrim(get_option('le_make_supabase_url', self::DEFAULT_SUPABASE_URL), '/');
        $bucket = self::DEFAULT_SUPABASE_STORAGE_BUCKET;
        $clean_name = sanitize_file_name($filename);
        $url = $supabase_url . '/storage/v1/object/' . $bucket . '/' . $clean_name;

        $service_key = $this->get_service_key();
        $res = wp_remote_request($url, array(
            'method'    => 'POST',
            'timeout'   => 25,
            'headers'   => array(
                'Authorization' => 'Bearer ' . $service_key,
                'apikey'        => $service_key,
                'Content-Type'  => $mime_type,
                'x-upsert'      => 'true'
            ),
            'body'      => $file_content,
            'sslverify' => false
        ));

        if (is_wp_error($res)) {
            return $res;
        }

        $code = wp_remote_retrieve_response_code($res);
        if ($code >= 200 && $code < 300) {
            return $supabase_url . '/storage/v1/object/public/' . $bucket . '/' . $clean_name;
        }

        $body = wp_remote_retrieve_body($res);
        return new WP_Error('supabase_upload_failed', 'Failed to upload to Supabase Storage (' . $code . '): ' . $body);
    }

    /**
     * Calculates total bytes and file list currently in Supabase Storage
     */
    public function get_supabase_storage_usage() {
        $supabase_url = rtrim(get_option('le_make_supabase_url', self::DEFAULT_SUPABASE_URL), '/');
        $bucket = self::DEFAULT_SUPABASE_STORAGE_BUCKET;
        $url = $supabase_url . '/storage/v1/object/list/' . $bucket;

        $service_key = $this->get_service_key();
        $res = wp_remote_post($url, array(
            'timeout'   => 15,
            'headers'   => array(
                'Authorization' => 'Bearer ' . $service_key,
                'apikey'        => $service_key,
                'Content-Type'  => 'application/json'
            ),
            'body'      => json_encode(array(
                'prefix' => '',
                'limit'  => 1000,
                'sortBy' => array('column' => 'created_at', 'order' => 'asc') // Oldest first
            )),
            'sslverify' => false
        ));

        if (is_wp_error($res)) {
            return array('total_bytes' => 0, 'total_mb' => 0, 'count' => 0, 'objects' => array());
        }

        $objects = json_decode(wp_remote_retrieve_body($res), true);
        if (!is_array($objects)) {
            return array('total_bytes' => 0, 'total_mb' => 0, 'count' => 0, 'objects' => array());
        }

        $total_bytes = 0;
        foreach ($objects as $obj) {
            $total_bytes += intval($obj['metadata']['size'] ?? 0);
        }

        return array(
            'total_bytes' => $total_bytes,
            'total_mb'    => round($total_bytes / (1024 * 1024), 2),
            'count'       => count($objects),
            'objects'     => $objects
        );
    }

    /**
     * Prunes Supabase Storage to stay within 1 GB rolling window (oldest pruned first).
     * Permanent archive remains on TrueNAS.
     */
    public function prune_supabase_storage_to_1gb($target_max_bytes = self::MAX_SUPABASE_STORAGE_BYTES) {
        $usage = $this->get_supabase_storage_usage();
        if ($usage['total_bytes'] <= $target_max_bytes || empty($usage['objects'])) {
            return array('pruned_count' => 0, 'freed_bytes' => 0, 'current_mb' => $usage['total_mb']);
        }

        // Leave 10% headroom (down to ~920MB) to prevent constant thrashing
        $prune_target = intval($target_max_bytes * 0.9);
        $current_bytes = $usage['total_bytes'];
        $to_delete = array();
        $freed_bytes = 0;

        foreach ($usage['objects'] as $obj) {
            if ($current_bytes <= $prune_target) {
                break;
            }
            $file_size = intval($obj['metadata']['size'] ?? 0);
            $to_delete[] = $obj['name'];
            $current_bytes -= $file_size;
            $freed_bytes += $file_size;
        }

        if (!empty($to_delete)) {
            $supabase_url = rtrim(get_option('le_make_supabase_url', self::DEFAULT_SUPABASE_URL), '/');
            $bucket = self::DEFAULT_SUPABASE_STORAGE_BUCKET;
            $service_key = $this->get_service_key();

            wp_remote_request($supabase_url . '/storage/v1/object/' . $bucket, array(
                'method'    => 'DELETE',
                'timeout'   => 20,
                'headers'   => array(
                    'Authorization' => 'Bearer ' . $service_key,
                    'apikey'        => $service_key,
                    'Content-Type'  => 'application/json'
                ),
                'body'      => json_encode(array('prefixes' => $to_delete)),
                'sslverify' => false
            ));
        }

        return array(
            'pruned_count' => count($to_delete),
            'freed_bytes'  => $freed_bytes,
            'freed_mb'     => round($freed_bytes / (1024 * 1024), 2),
            'remaining_mb' => round($current_bytes / (1024 * 1024), 2)
        );
    }

    /**
     * Drains pending offline orders to NAS PostgreSQL when NAS reconnects
     */
    public function sync_pending_offline_orders_to_nas() {
        if (!$this->is_nas_online) {
            $this->resolve_active_endpoint(true);
        }
        if (!$this->is_nas_online) {
            return 0;
        }

        $queue = get_option('le_make_pending_orders_to_nas', array());
        if (empty($queue)) {
            return 0;
        }

        $synced_count = 0;
        $remaining = array();

        foreach ($queue as $item) {
            $order_res = $this->request_nas('make_orders', 'POST', $item['payload']);
            if (!is_wp_error($order_res) && !empty($order_res[0]['id'])) {
                $order_id = $order_res[0]['id'];
                if (!empty($item['items'])) {
                    $items_payload = array();
                    foreach ($item['items'] as $it) {
                        $is_cust = !empty($it['is_customized']);
                        $dim_text = $it['dimensions_text'] ?? $it['size_label'] ?? null;
                        $items_payload[] = array(
                            'order_id'          => $order_id,
                            'product_name'      => sanitize_text_field($it['product_name']),
                            'spec_name'         => sanitize_text_field($it['spec_name'] ?? ''),
                            'size_label'        => sanitize_text_field($dim_text ?? ''),
                            'color_name'        => sanitize_text_field($it['color_name'] ?? ''),
                            'quantity'          => intval($it['quantity'] ?? 1),
                            'salesperson_note'  => sanitize_textarea_field($it['notes'] ?? ''),
                            'item_cost_price'   => floatval($it['item_cost_price'] ?? 0),
                            'item_sale_price'   => !empty($it['item_sale_price']) ? floatval($it['item_sale_price']) : null,
                            'is_customized'     => $is_cust,
                            'custom_dimensions' => $it['custom_dimensions'] ?? ($is_cust ? $dim_text : null),
                            'technical_drawing_url' => !empty($it['technical_drawing_url']) ? esc_url_raw($it['technical_drawing_url']) : null
                        );
                    }
                    $this->request_nas('make_order_items', 'POST', $items_payload);
                }
                $synced_count++;
            } else {
                $remaining[] = $item;
            }
        }

        update_option('le_make_pending_orders_to_nas', $remaining);
        return $synced_count;
    }

    /**
     * Drains pending files to TrueNAS Storage when NAS reconnects.
     * Keeps copy in Supabase Storage (up to 1GB) so offline visitors retain context.
     */
    public function sync_pending_files_to_nas() {
        if (!$this->is_nas_online) {
            $this->resolve_active_endpoint(true);
        }
        if (!$this->is_nas_online) {
            return 0;
        }

        $files_queue = get_option('le_make_pending_file_transfers', array());
        if (empty($files_queue)) {
            return 0;
        }

        $nas_storage_url = get_option('le_make_nas_storage_url', self::DEFAULT_TUNNEL_STORAGE);
        $remaining = array();
        $transferred = 0;

        foreach ($files_queue as $file_entry) {
            $temp_path = $file_entry['local_path'] ?? '';
            $temp_url  = $file_entry['temp_url'] ?? $file_entry['supabase_url'] ?? '';
            $file_content = '';

            if ($temp_path && file_exists($temp_path)) {
                $file_content = file_get_contents($temp_path);
            } elseif (!empty($temp_url)) {
                $res = wp_remote_get($temp_url, array('timeout' => 25, 'sslverify' => false));
                if (!is_wp_error($res) && wp_remote_retrieve_response_code($res) === 200) {
                    $file_content = wp_remote_retrieve_body($res);
                }
            }

            if ($file_content) {
                $unique_name = basename($file_entry['filename']);
                $boundary = wp_generate_password(24, false);

                $body = "--{$boundary}\r\n";
                $body .= "Content-Disposition: form-data; name=\"file\"; filename=\"" . $unique_name . "\"\r\n";
                $body .= "Content-Type: " . ($file_entry['mime_type'] ?? 'application/octet-stream') . "\r\n\r\n";
                $body .= $file_content . "\r\n";
                $body .= "--{$boundary}--\r\n";

                // Upload to NAS Storage (https://storage.lenas.me)
                $upload_res = wp_remote_post(rtrim($nas_storage_url, '/') . '/upload', array(
                    'method'    => 'POST',
                    'timeout'   => 30,
                    'headers'   => array(
                        'Content-Type'             => 'multipart/form-data; boundary=' . $boundary,
                        'CF-Access-Client-Id'     => $this->get_cf_id(),
                        'CF-Access-Client-Secret' => $this->get_cf_secret()
                    ),
                    'body'      => $body,
                    'sslverify' => false
                ));

                $code = is_wp_error($upload_res) ? 0 : wp_remote_retrieve_response_code($upload_res);
                if ($code >= 200 && $code < 300) {
                    $nas_file_url = rtrim($nas_storage_url, '/') . '/files/' . $unique_name;
                    if (!empty($file_entry['order_id'])) {
                        $this->request_nas('make_orders?id=eq.' . intval($file_entry['order_id']), 'PATCH', array(
                            'attachment_url' => $nas_file_url
                        ));
                    }

                    // Clean up local temp file if present
                    if ($temp_path && file_exists($temp_path)) {
                        @unlink($temp_path);
                    }

                    $transferred++;
                    continue;
                }
            }
            $remaining[] = $file_entry;
        }

        update_option('le_make_pending_file_transfers', $remaining);
        return $transferred;
    }

    /**
     * Backfills historical orders, items, and catalog products from TrueNAS into Supabase
     * when TrueNAS reconnects, so Supabase always holds a complete replica of text data.
     */
    public function backfill_nas_to_supabase() {
        if (!$this->is_nas_online) {
            $this->resolve_active_endpoint(true);
        }
        if (!$this->is_nas_online) {
            return 0;
        }

        // 1. Fetch recent orders from TrueNAS
        $nas_orders = $this->request_nas('make_orders?select=*,items:make_order_items(*),updates:make_order_updates(*)&order=id.asc&limit=150', 'GET');
        if (is_wp_error($nas_orders) || !is_array($nas_orders) || empty($nas_orders)) {
            return 0;
        }

        // 2. Query existing order numbers from Supabase
        $sb_existing = $this->request_supabase('make_orders?select=order_number', 'GET');
        $existing_numbers = array();
        if (is_array($sb_existing)) {
            foreach ($sb_existing as $row) {
                if (!empty($row['order_number'])) {
                    $existing_numbers[$row['order_number']] = true;
                }
            }
        }

        $backfilled = 0;
        foreach ($nas_orders as $o) {
            $o_num = $o['order_number'] ?? ('#' . $o['id']);
            if (!empty($existing_numbers[$o_num])) {
                continue; // Already in Supabase
            }

            // Mirror order to Supabase
            $items = $o['items'] ?? array();
            $this->mirror_order_to_supabase_text($o, $items);
            $backfilled++;
        }

        // 3. Backfill active catalog products from TrueNAS to Supabase
        $nas_products = $this->request_nas('make_products?is_active=eq.true&select=id,product_code,product_name,description,main_image,purchase_price,selling_price,is_active', 'GET');
        if (is_array($nas_products) && !empty($nas_products)) {
            $sb_products = $this->request_supabase('make_products?select=id,product_code', 'GET');
            $existing_codes = array();
            if (is_array($sb_products)) {
                foreach ($sb_products as $p) {
                    if (!empty($p['product_code'])) {
                        $existing_codes[$p['product_code']] = true;
                    }
                }
            }

            $missing_products = array();
            foreach ($nas_products as $np) {
                $code = $np['product_code'] ?? '';
                if ($code && empty($existing_codes[$code])) {
                    $missing_products[] = array(
                        'product_code'   => $code,
                        'product_name'   => $np['product_name'] ?? 'Product',
                        'description'    => $np['description'] ?? '',
                        'main_image'     => $np['main_image'] ?? '',
                        'purchase_price' => $np['purchase_price'] ?? 0,
                        'selling_price'  => $np['selling_price'] ?? 0,
                        'is_active'      => true
                    );
                }
            }

            if (!empty($missing_products)) {
                $this->request_supabase('make_products', 'POST', $missing_products);
            }
        }

        return $backfilled;
    }

    public function approve_order_version($order_id, $version_number, $approved_by, $comments = '') {
        $payload = array(
            'approval_status'  => 'sales_approved',
            'approved_version' => intval($version_number),
            'approved_by'      => sanitize_text_field($approved_by),
            'approved_at'      => current_time('mysql', 1),
            'status'           => 'Placed',
            'is_approved'      => true
        );

        $update_row = array(
            'order_id'   => intval($order_id),
            'status'     => 'Placed',
            'note'       => 'Version v' . $version_number . ' approved by ' . $approved_by . '. ' . $comments,
            'updated_by' => sanitize_text_field($approved_by)
        );

        $res = $this->request('make_orders?id=eq.' . intval($order_id), 'PATCH', $payload);
        if (is_wp_error($res)) {
            return $res;
        }

        $this->request('make_order_updates', 'POST', $update_row);

        // Mirror to Supabase if NAS is active tier
        if ($this->connection_tier === 'cloudflare_tunnel') {
            $this->request_supabase('make_orders?id=eq.' . intval($order_id), 'PATCH', $payload);
            $this->request_supabase('make_order_updates', 'POST', $update_row);
        }

        return array('success' => true, 'version' => $version_number);
    }

    public function reject_order_version($order_id, $version_number, $rejected_by, $reason = '') {
        $payload = array(
            'approval_status'  => 'rejected',
            'rejection_reason' => sanitize_textarea_field($reason),
            'status'           => 'Awaiting Pricing'
        );

        $update_row = array(
            'order_id'   => intval($order_id),
            'status'     => 'Revision Requested',
            'note'       => 'Version v' . $version_number . ' rejected by ' . $rejected_by . '. Reason: ' . $reason,
            'updated_by' => sanitize_text_field($rejected_by)
        );

        $res = $this->request('make_orders?id=eq.' . intval($order_id), 'PATCH', $payload);
        if (is_wp_error($res)) {
            return $res;
        }

        $this->request('make_order_updates', 'POST', $update_row);

        // Mirror to Supabase if NAS is active tier
        if ($this->connection_tier === 'cloudflare_tunnel') {
            $this->request_supabase('make_orders?id=eq.' . intval($order_id), 'PATCH', $payload);
            $this->request_supabase('make_order_updates', 'POST', $update_row);
        }

        return array('success' => true);
    }

    public function get_version_diff($order_id, $v_from, $v_to) {
        $res = $this->request('make_order_versions?order_id=eq.' . intval($order_id) . '&version_number=in.(' . intval($v_from) . ',' . intval($v_to) . ')&order=version_number.asc', 'GET');
        if (is_wp_error($res)) {
            return $res;
        }

        $v_from_data = null;
        $v_to_data = null;

        foreach ($res as $v) {
            if ($v['version_number'] == $v_from) $v_from_data = $v;
            if ($v['version_number'] == $v_to) $v_to_data = $v;
        }

        $field_changes = array();
        if ($v_from_data && $v_to_data) {
            $from_snap = is_string($v_from_data['order_data']) ? json_decode($v_from_data['order_data'], true) : $v_from_data['order_data'];
            $to_snap = is_string($v_to_data['order_data']) ? json_decode($v_to_data['order_data'], true) : $v_to_data['order_data'];

            $keys = array('furniture_name', 'quantity', 'sale_price', 'priority', 'delivery_date', 'target_delivery_date', 'description');
            foreach ($keys as $k) {
                if (isset($from_snap[$k]) && isset($to_snap[$k]) && $from_snap[$k] !== $to_snap[$k]) {
                    $field_changes[] = array('field' => $k, 'old_value' => $from_snap[$k], 'new_value' => $to_snap[$k]);
                }
            }
        }

        return array(
            'version_from' => $v_from,
            'version_to'   => $v_to,
            'fieldChanges' => $field_changes,
            'v_from_data'  => $v_from_data,
            'v_to_data'    => $v_to_data
        );
    }

    public function get_order_versions($order_id) {
        return $this->request('make_order_versions?order_id=eq.' . intval($order_id) . '&order=version_number.desc', 'GET');
    }

    /**
     * Look up a user in TrueNAS PostgreSQL users table by username or email
     */
    public function get_user_by_login($login) {
        $login_clean = trim($login);
        if (empty($login_clean)) {
            return null;
        }

        $endpoint = 'users?or=(username.eq.' . urlencode($login_clean) . ',email.eq.' . urlencode($login_clean) . ')&select=*,user_groups(*)&limit=1';
        $res = $this->request($endpoint, 'GET');
        if (is_wp_error($res) || empty($res) || !is_array($res)) {
            return null;
        }

        return $res[0];
    }

    /**
     * Query all staff members (Admins, Salespersons, Designers, Factory Managers)
     */
    public function get_all_staff_users() {
        $endpoint = 'users?select=*,user_groups(*)&is_active=eq.1&order=id.asc';
        $res = $this->request($endpoint, 'GET');
        if (is_wp_error($res) || empty($res) || !is_array($res)) {
            return array();
        }
        return $res;
    }

    /**
     * Dispatch notification to TrueNAS notifications table
     */
    public function create_nas_notification($title, $message, $recipient_ids = array(), $metadata = array(), $sender_id = null) {
        $base_row = array(
            'title'        => sanitize_text_field($title),
            'message'      => sanitize_textarea_field($message),
            'sender_id'    => $sender_id ? intval($sender_id) : null,
            'action_path'  => isset($metadata['action_path']) ? $metadata['action_path'] : '/make/track',
            'action_label' => isset($metadata['action_label']) ? $metadata['action_label'] : 'View Order',
            'metadata'     => $metadata,
            'is_read'      => false,
            'created_at'   => current_time('mysql', 1)
        );

        if (empty($recipient_ids)) {
            $base_row['recipient_id'] = null;
            return $this->request('notifications', 'POST', $base_row);
        }

        $rows = array();
        foreach ($recipient_ids as $rid) {
            $row = $base_row;
            $row['recipient_id'] = intval($rid);
            $rows[] = $row;
        }

        return $this->request('notifications', 'POST', $rows);
    }

    /**
     * Fetch unread & recent notifications for a user
     */
    public function get_user_notifications($user_id = null, $limit = 30) {
        $filter = $user_id ? 'or=(recipient_id.eq.' . intval($user_id) . ',recipient_id.is.null)' : 'recipient_id.is.null';
        $endpoint = 'notifications?' . $filter . '&order=created_at.desc&limit=' . intval($limit);
        $res = $this->request($endpoint, 'GET');
        if (is_wp_error($res) || !is_array($res)) {
            return array();
        }
        return $res;
    }

    /**
     * Mark single notification read
     */
    public function mark_notification_read($id) {
        return $this->request('notifications?id=eq.' . intval($id), 'PATCH', array('is_read' => true));
    }

    /**
     * Mark all notifications read for a user
     */
    public function mark_all_notifications_read($user_id = null) {
        $filter = $user_id ? 'or=(recipient_id.eq.' . intval($user_id) . ',recipient_id.is.null)&is_read=eq.false' : 'recipient_id.is.null&is_read=eq.false';
        return $this->request('notifications?' . $filter, 'PATCH', array('is_read' => true));
    }

    /**
     * Record a production stage update with optional progress photo & notify stakeholders
     */
    public function update_order_stage($order_id, $stage, $note, $photo_url, $updated_by, $user_role = 'factory_manager') {
        $order_id = intval($order_id);
        $clean_stage = sanitize_text_field($stage);
        $clean_note = sanitize_textarea_field($note);
        $clean_by = sanitize_text_field($updated_by);

        // 1. Fetch current order to identify salesman & designer
        $order = null;
        $order_res = $this->request('make_orders?id=eq.' . $order_id . '&select=id,furniture_name,salesman_id,salesperson_name,designer_name', 'GET');
        if (!is_wp_error($order_res) && !empty($order_res)) {
            $order = $order_res[0];
        }

        // 2. Insert make_order_updates
        $update_payload = array(
            'order_id'   => $order_id,
            'status'     => $clean_stage,
            'stage'      => $clean_stage,
            'note'       => $clean_note,
            'photo_url'  => $photo_url ?: null,
            'photo_urls' => $photo_url ? array($photo_url) : array(),
            'updated_by' => $clean_by . ' (' . ucwords(str_replace('_', ' ', $user_role)) . ')'
        );
        $this->request('make_order_updates', 'POST', $update_payload);

        // 3. Update make_orders
        $order_update = array(
            'status'     => $clean_stage,
            'updated_at' => current_time('mysql', 1)
        );
        if ($photo_url) {
            $order_update['current_stage_photo'] = $photo_url;
        }
        if ($user_role === 'factory_manager' || strpos(strtolower($user_role), 'factory') !== false) {
            $order_update['factory_manager_name'] = $clean_by;
        }
        $this->request('make_orders?id=eq.' . $order_id, 'PATCH', $order_update);

        // 4. Mirror to Supabase if NAS is active tier
        if ($this->connection_tier === 'cloudflare_tunnel') {
            $this->request_supabase('make_order_updates', 'POST', $update_payload);
            $this->request_supabase('make_orders?id=eq.' . $order_id, 'PATCH', $order_update);
        }

        // 5. Send Notifications to Salesman, Designer, and Admins
        $furniture_name = $order ? $order['furniture_name'] : ('Order #' . $order_id);
        $notif_title = 'Stage Update: ' . $furniture_name . ' → ' . $clean_stage;
        $notif_msg = $clean_by . ' updated order #' . $order_id . ' to "' . $clean_stage . '".' . ($clean_note ? (' Note: ' . $clean_note) : '') . ($photo_url ? ' [Photo Attached]' : '');

        $recipients = array();
        if (!empty($order['salesman_id'])) {
            $recipients[] = intval($order['salesman_id']);
        }

        $this->create_nas_notification(
            $notif_title,
            $notif_msg,
            $recipients,
            array(
                'order_id'   => $order_id,
                'stage'      => $clean_stage,
                'photo_url'  => $photo_url,
                'action_path' => '/make/track'
            )
        );

        return array(
            'success'   => true,
            'stage'     => $clean_stage,
            'photo_url' => $photo_url
        );
    }

    /**
     * Attach a file, drawing or image to an existing order (Admin, Designer, Salesman)
     */
    public function attach_file_to_order($order_id, $file_url, $file_name, $note = '', $user = null) {
        if (!$user) {
            $user = wp_get_current_user();
        }
        $order_id = intval($order_id);
        $clean_url = esc_url_raw($file_url);
        $clean_name = sanitize_text_field($file_name);
        $clean_note = sanitize_textarea_field($note);
        $user_name = $user->display_name ?: $user->user_login;
        $user_roles = (array)$user->roles;
        $role_str = in_array('administrator', $user_roles, true) ? 'Admin' : (in_array('make_designer', $user_roles, true) ? 'Designer' : 'Salesperson');

        // 1. Fetch current order
        $order = null;
        $order_res = $this->request('make_orders?id=eq.' . $order_id . '&select=id,furniture_name,salesman_id,pdf_urls', 'GET');
        if (!is_wp_error($order_res) && !empty($order_res)) {
            $order = $order_res[0];
        }

        // 2. Insert into make_order_updates
        $update_payload = array(
            'order_id'   => $order_id,
            'status'     => 'Attachment Added',
            'stage'      => 'Attachment',
            'note'       => $clean_note ?: ('Attached: ' . $clean_name),
            'photo_url'  => $clean_url,
            'photo_urls' => array($clean_url),
            'updated_by' => $user_name . ' (' . $role_str . ')'
        );
        $this->request('make_order_updates', 'POST', $update_payload);

        // 3. Update pdf_urls on make_orders if applicable
        if ($order) {
            $existing_pdfs = is_array($order['pdf_urls'] ?? null) ? $order['pdf_urls'] : array();
            if (!in_array($clean_url, $existing_pdfs, true)) {
                $existing_pdfs[] = $clean_url;
                $patch_order = array(
                    'pdf_urls'   => $existing_pdfs,
                    'updated_at' => current_time('mysql', 1)
                );
                $this->request('make_orders?id=eq.' . $order_id, 'PATCH', $patch_order);

                // Mirror to Supabase
                if ($this->connection_tier === 'cloudflare_tunnel') {
                    $this->request_supabase('make_orders?id=eq.' . $order_id, 'PATCH', $patch_order);
                }
            }
        }

        if ($this->connection_tier === 'cloudflare_tunnel') {
            $this->request_supabase('make_order_updates', 'POST', $update_payload);
        }

        // 4. Send notification
        $furniture_name = $order ? $order['furniture_name'] : ('Order #' . $order_id);
        $notif_title = 'New Attachment: ' . $furniture_name;
        $notif_msg = $user_name . ' attached ' . $clean_name . ' to order #' . $order_id . ($clean_note ? (' — ' . $clean_note) : '');
        $recipients = array();
        if (!empty($order['salesman_id'])) {
            $recipients[] = intval($order['salesman_id']);
        }
        $this->create_nas_notification($notif_title, $notif_msg, $recipients, array(
            'order_id'    => $order_id,
            'file_url'    => $clean_url,
            'action_path' => '/make/track'
        ));

        return array(
            'success'   => true,
            'file_url'  => $clean_url,
            'file_name' => $clean_name
        );
    }
}


<?php
/**
 * Admin Settings for LE-SOFT MAKE Sales & Design Portal Plugin
 */

if (!defined('ABSPATH')) {
    exit;
}

class LEMakeAdminSettings {

    private static $instance = null;

    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', array($this, 'add_settings_menu'));
        add_action('admin_init', array($this, 'register_settings'));
    }

    public function add_settings_menu() {
        add_options_page(
            __('LE MAKE Portal Settings', 'le-make-sales-portal'),
            __('LE MAKE Portal', 'le-make-sales-portal'),
            'manage_options',
            'le-make-sales-portal',
            array($this, 'render_settings_page')
        );
    }

    public function register_settings() {
        register_setting('le_make_settings_group', 'le_make_nas_tunnel_url');
        register_setting('le_make_settings_group', 'le_make_cf_client_id');
        register_setting('le_make_settings_group', 'le_make_cf_client_secret');
        register_setting('le_make_settings_group', 'le_make_supabase_url');
        register_setting('le_make_settings_group', 'le_make_anon_key');
    }

    public function render_settings_page() {
        $client = LEMakeNasDbClient::get_instance();
        $client->resolve_active_endpoint();
        $active_url = $client->get_active_url();
        $tier = $client->get_connection_tier();
        ?>
        <div class="wrap" style="max-width: 950px; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <h1 style="display: flex; align-items: center; gap: 12px; font-weight: 800; font-family: 'Playfair Display', Georgia, serif; margin-bottom: 8px; color: #111111;">
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: #111111; color: #ffffff; border: 1.5px solid #ff6a00; border-radius: 8px; font-size: 15px; font-weight: 800; letter-spacing: 0.05em;">LE</span>
                LE-SOFT MAKE — Cloudflare Tunnel &amp; Portal Settings
            </h1>
            <p style="color: #64748b; font-size: 14px; margin-bottom: 24px;">
                Secure Cloudflare Tunnel connection linking WordPress with the TrueNAS PostgREST container (<code>https://db.lenas.me</code>) and Supabase cloud failover.
            </p>

            <!-- Live Dual-Tier Connectivity Card -->
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 14px;">
                    <!-- Primary TrueNAS Status -->
                    <div style="background: #fafafa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; margin-bottom: 4px;">Primary Database</div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                            <strong style="font-size: 14px; color: #111111;">TrueNAS PostgreSQL</strong>
                            <?php if ($client->is_nas_online()): ?>
                                <span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px;">🟢 ONLINE</span>
                            <?php else: ?>
                                <span style="background: #fef3c7; color: #b45309; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px;">🟠 OFFLINE (Safe)</span>
                            <?php endif; ?>
                        </div>
                        <code style="font-size: 12px; color: #475569; display: block; word-break: break-all;"><?php echo esc_html(get_option('le_make_nas_tunnel_url', LEMakeNasDbClient::DEFAULT_TUNNEL_URL)); ?></code>
                    </div>

                    <!-- Cloud Backup Supabase Status -->
                    <div style="background: #fafafa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; margin-bottom: 4px;">Cloud Backup (Text-Only)</div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                            <strong style="font-size: 14px; color: #111111;">Supabase Cloud</strong>
                            <span style="background: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px;">
                                <?php echo ($tier === 'supabase') ? '⚡ ACTIVE BACKUP' : '✔ STANDBY MIRROR'; ?>
                            </span>
                        </div>
                        <code style="font-size: 12px; color: #475569; display: block; word-break: break-all;"><?php echo esc_html(get_option('le_make_supabase_url', LEMakeNasDbClient::DEFAULT_SUPABASE_URL)); ?></code>
                    </div>
                </div>

                <?php 
                $pending_orders = count(get_option('le_make_pending_orders_to_nas', array()));
                $pending_files  = count(get_option('le_make_pending_file_transfers', array()));
                ?>
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-top: 10px; border-top: 1px solid #f1f5f9;">
                    <div style="font-size: 13px; color: #475569;">
                        Pending Offline Sync Queue: <strong><?php echo $pending_orders; ?> orders</strong>, <strong><?php echo $pending_files; ?> buffered files</strong>
                    </div>
                    <button type="button" onclick="this.disabled=true; this.innerText='Checking Connection &amp; Draining Queue...'; fetch('<?php echo esc_url_raw(rest_url('le-make/v1/sync-check')); ?>', {method: 'POST', headers: {'X-WP-Nonce': '<?php echo wp_create_nonce('wp_rest'); ?>'}}).then(r => r.json()).then(d => { alert(d.nas_online ? ('NAS Online! Synced ' + d.orders_synced + ' orders and ' + d.files_synced + ' files.') : 'NAS is currently offline. Operating on Cloud Backup.'); window.location.reload(); });" class="button" style="background: #111111; color: white; border: none; border-radius: 6px; font-weight: 600;">
                        🔄 Test Connection &amp; Sync to NAS
                    </button>
                </div>
            </div>

            <!-- User Roles & Creation Guide -->
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">
                        👥 User Management &amp; Role Assignments
                    </h3>
                    <a href="<?php echo esc_url(admin_url('user-new.php')); ?>" class="button button-primary" style="background: #111111; border-color: #111111; font-weight: 600;">
                        + Add New Portal User
                    </a>
                </div>
                <p style="font-size: 13px; color: #64748b; margin-bottom: 16px;">
                    All users are created and managed directly in standard WordPress (<strong>Users &rarr; Add New</strong>). The portal authenticates users in-page and applies their role capabilities:
                </p>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px;">
                    <div style="background: #fafafa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <strong style="color: #111111; font-size: 14px;">1. Administrator</strong>
                            <span style="background: rgba(0,0,0,0.08); color: #111111; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 700;">Full Access</span>
                        </div>
                        <span style="font-size: 12.5px; color: #475569; line-height: 1.4; display: block;">
                            Full master control. Can create/modify all orders, enter &amp; edit both Cost Price and Sale Price, approve versions, and configure Cloudflare connection settings.
                        </span>
                    </div>

                    <div style="background: #fafafa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <strong style="color: #059669; font-size: 14px;">2. Furniture Designer</strong>
                            <span style="background: rgba(5,150,105,0.1); color: #059669; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 700;"><code>make_designer</code></span>
                        </div>
                        <span style="font-size: 12.5px; color: #475569; line-height: 1.4; display: block;">
                            Reviews production orders, modifies technical specifications, sets custom dimensional sizes, and establishes Cost Price and Customer Sale Price.
                        </span>
                    </div>

                    <div style="background: #fafafa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <strong style="color: #ff6a00; font-size: 14px;">3. Salesperson</strong>
                            <span style="background: rgba(255,106,0,0.1); color: #ff6a00; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 700;"><code>make_salesperson</code></span>
                        </div>
                        <span style="font-size: 12.5px; color: #475569; line-height: 1.4; display: block;">
                            Selects catalog products, inputs custom sizing, logs customer delivery logistics (with landmark), specifies delivery deadlines, and enters cost price.
                        </span>
                    </div>
                </div>
            </div>

            <form method="post" action="options.php" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <?php settings_fields('le_make_settings_group'); ?>
                <?php do_settings_sections('le_make_settings_group'); ?>

                <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 700; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
                    1. Cloudflare Tunnel Gateway (Primary Connection)
                </h3>

                <table class="form-table" style="margin-bottom: 24px;">
                    <tr>
                        <th scope="row" style="font-weight: 600;">Cloudflare Tunnel URL</th>
                        <td>
                            <input type="text" name="le_make_nas_tunnel_url" value="<?php echo esc_attr(get_option('le_make_nas_tunnel_url', LEMakeNasDbClient::DEFAULT_TUNNEL_URL)); ?>" class="regular-text" style="width: 100%; max-width: 500px;" />
                            <p class="description">Public SSL tunnel connecting to the TrueNAS PostgREST container (Default: <code>https://db.lenas.me</code>).</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row" style="font-weight: 600;">CF Service Token Client ID</th>
                        <td>
                            <input type="text" name="le_make_cf_client_id" value="<?php echo esc_attr(get_option('le_make_cf_client_id', LEMakeNasDbClient::DEFAULT_CF_CLIENT_ID)); ?>" class="regular-text" style="width: 100%; max-width: 500px;" />
                            <p class="description">Cloudflare Access header <code>CF-Access-Client-Id</code>.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row" style="font-weight: 600;">CF Service Token Client Secret</th>
                        <td>
                            <input type="password" name="le_make_cf_client_secret" value="<?php echo esc_attr(get_option('le_make_cf_client_secret', LEMakeNasDbClient::DEFAULT_CF_CLIENT_SECRET)); ?>" class="regular-text" style="width: 100%; max-width: 500px;" />
                            <p class="description">Cloudflare Access header <code>CF-Access-Client-Secret</code>.</p>
                        </td>
                    </tr>
                </table>

                <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 700; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
                    2. Supabase Cloud (Text-Only Backup Storage)
                </h3>

                <table class="form-table" style="margin-bottom: 24px;">
                    <tr>
                        <th scope="row" style="font-weight: 600;">Supabase Project URL</th>
                        <td>
                            <input type="text" name="le_make_supabase_url" value="<?php echo esc_attr(get_option('le_make_supabase_url', LEMakeNasDbClient::DEFAULT_SUPABASE_URL)); ?>" class="regular-text" style="width: 100%; max-width: 500px;" />
                        </td>
                    </tr>
                    <tr>
                        <th scope="row" style="font-weight: 600;">Anon / Public API Key</th>
                        <td>
                            <textarea name="le_make_anon_key" rows="2" style="width: 100%; max-width: 500px; font-family: monospace; font-size: 12px;"><?php echo esc_textarea(get_option('le_make_anon_key', LEMakeNasDbClient::DEFAULT_ANON_KEY)); ?></textarea>
                        </td>
                    </tr>
                </table>

                <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 700; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
                    3. Shortcode Embed Reference
                </h3>
                <p style="color: #475569; font-size: 14px;">
                    Embed the complete interactive Sales &amp; Design Portal onto any WordPress page using:
                </p>
                <div style="background: #111111; color: #ffffff; padding: 14px 20px; border-radius: 8px; font-family: monospace; font-size: 14px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; border: 1px solid #333333;">
                    <code>[make_sales_portal]</code>
                    <button type="button" onclick="navigator.clipboard.writeText('[make_sales_portal]'); alert('Shortcode copied to clipboard!');" class="button button-small" style="background: #ff6a00; color: white; border: none; cursor: pointer;">Copy Shortcode</button>
                </div>

                <?php submit_button(__('Save Settings', 'le-make-sales-portal'), 'primary', 'submit', true, array('style' => 'background: #ff6a00; border-color: #e05e00; font-weight: 700; padding: 8px 24px; font-size: 14px; border-radius: 6px; color: #ffffff;')); ?>
            </form>
        </div>
        <?php
    }
}

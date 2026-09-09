<?php
/**
 * Frontend Template for [make_sales_portal] Shortcode
 */

if (!defined('ABSPATH')) {
    exit;
}

$is_logged_in = is_user_logged_in();
$user_payload = null;

if ($is_logged_in) {
    $current_user = wp_get_current_user();
    $user_roles = (array)$current_user->roles;

    $is_admin = current_user_can('administrator') || current_user_can('manage_options');
    $is_designer = in_array('make_designer', $user_roles, true) || current_user_can('set_make_pricing');
    $is_salesperson = in_array('make_salesperson', $user_roles, true) || (!$is_admin && !$is_designer);

    $display_role = 'Salesperson';
    if ($is_admin) {
        $display_role = 'Administrator';
    } elseif ($is_designer) {
        $display_role = 'Furniture Designer';
    }

    $user_payload = array(
        'id'            => $current_user->ID,
        'name'          => $current_user->display_name ?: $current_user->user_login,
        'email'         => $current_user->user_email,
        'roleName'      => $display_role,
        'isAdmin'       => $is_admin,
        'isDesigner'    => $is_designer,
        'isSalesperson' => $is_salesperson,
        'canApprove'    => current_user_can('approve_make_orders') || $is_admin,
        'canCreate'     => current_user_can('create_make_orders') || $is_admin || $is_designer,
        'canSetPricing' => current_user_can('set_make_pricing') || $is_admin || $is_designer,
        'canEditCost'   => $is_admin || $is_designer || $is_salesperson,
        'canEditSale'   => $is_admin || $is_designer,
    );
}

$portal_config = array(
    'apiUrl'     => esc_url_raw(rest_url('le-make/v1/')),
    'nonce'      => wp_create_nonce('wp_rest'),
    'isLoggedIn' => $is_logged_in,
    'user'       => $user_payload,
    'loginUrl'   => wp_login_url(get_permalink()),
    'version'    => LE_MAKE_PLUGIN_VERSION,
);
?>
<!-- Leading Edge Architectural Typography: Playfair Display (Serif Headings) + Plus Jakarta Sans (UI Body) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet" data-no-optimize="1" data-cfasync="false">

<!-- Synchronously inject configuration so LiteSpeed Cache cannot defer or delay it -->
<script data-no-optimize="1" data-cfasync="false" type="text/javascript">
/* <![CDATA[ */
window.LE_MAKE_CONFIG = <?php echo wp_json_encode($portal_config); ?>;
/* ]]> */
</script>

<div id="le-make-sales-portal-app" class="le-make-portal-root">
    <!-- Loading skeleton until Vanilla JS mounts -->
    <div class="le-make-loading-screen">
        <div class="le-make-spinner"></div>
        <p>Connecting to LE-SOFT Production Database...</p>
    </div>
</div>

<!-- Trigger immediate render if portal.js is already evaluated -->
<script data-no-optimize="1" data-cfasync="false" type="text/javascript">
if (window.LE_MAKE && typeof window.LE_MAKE.render === 'function') {
    window.LE_MAKE.render();
}
</script>


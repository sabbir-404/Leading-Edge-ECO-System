-- Migration 032: Purchase requisition workflow roles and permissions
-- Seeds the user groups required by the Store -> Accounts -> Audit -> Director flow.

INSERT INTO user_groups (name, description, permissions)
VALUES
(
    'Store Department',
    'Creates purchase requisitions and tracks store-side requisition status.',
    '{
        "read_purchase_requisition": true,
        "create_purchase_requisition": true
    }'::jsonb
),
(
    'Store Head',
    'Reviews store requisitions, adjusts them when needed, and approves them for accounts estimate collection.',
    '{
        "read_purchase_requisition": true,
        "create_purchase_requisition": true,
        "approve_store_requisition": true,
        "view_purchase_requisition_audit": true
    }'::jsonb
),
(
    'Accounts Department',
    'Adds vendor/supplier estimates and forwards requisitions to audit.',
    '{
        "read_purchase_requisition": true,
        "add_purchase_estimates": true,
        "view_purchase_requisition_pricing": true,
        "view_purchase_requisition_audit": true
    }'::jsonb
),
(
    'Audit Department',
    'Reviews supplier estimates, records audit justification, and forwards accepted requisitions to the director.',
    '{
        "read_purchase_requisition": true,
        "audit_purchase_requisition": true,
        "view_purchase_requisition_pricing": true,
        "view_purchase_requisition_audit": true
    }'::jsonb
),
(
    'Director Department',
    'Final purchase requisition approval or rejection after audit.',
    '{
        "read_purchase_requisition": true,
        "director_approve_purchase_requisition": true,
        "view_purchase_requisition_pricing": true,
        "view_purchase_requisition_audit": true
    }'::jsonb
),
(
    'Purchase Department',
    'Prints approved requisitions, records purchase details, and tracks goods receipt.',
    '{
        "read_purchase_requisition": true,
        "purchase_requisition": true,
        "receive_purchase_requisition": true,
        "view_purchase_requisition_pricing": true,
        "view_purchase_requisition_audit": true
    }'::jsonb
),
(
    'Inventory Department',
    'Receives completed purchase flow and posts purchased quantities into stock.',
    '{
        "read_purchase_requisition": true,
        "complete_purchase_requisition": true,
        "view_purchase_requisition_audit": true
    }'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    permissions = user_groups.permissions || EXCLUDED.permissions;

UPDATE user_groups
SET permissions = permissions || '{
    "read_purchase_requisition": true,
    "create_purchase_requisition": true,
    "approve_store_requisition": true,
    "add_purchase_estimates": true,
    "audit_purchase_requisition": true,
    "director_approve_purchase_requisition": true,
    "purchase_requisition": true,
    "receive_purchase_requisition": true,
    "complete_purchase_requisition": true,
    "view_purchase_requisition_pricing": true,
    "view_purchase_requisition_audit": true
}'::jsonb
WHERE name IN ('Admin Full Access', 'Super Admin');

NOTIFY pgrst, 'reload schema';

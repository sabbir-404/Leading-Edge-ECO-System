-- Migration 033: Purchase requisition permission-level approval steps
-- Stores the ordered PR approval workflow in Supabase permission_levels.

ALTER TABLE permission_levels
    ADD COLUMN IF NOT EXISTS workflow_key TEXT,
    ADD COLUMN IF NOT EXISTS workflow_step INTEGER;

CREATE INDEX IF NOT EXISTS idx_permission_levels_workflow
    ON permission_levels(workflow_key, workflow_step);

INSERT INTO permission_levels (
    feature_name,
    feature_key,
    description,
    approver_role,
    workflow_key,
    workflow_step,
    is_active
)
VALUES
    (
        'PR Store Head Approval',
        'purchase_requisition_store_head',
        'Store Head reviews and approves store-created purchase requisitions.',
        'manager',
        'purchase_requisition',
        1,
        TRUE
    ),
    (
        'PR Accounts Estimate',
        'purchase_requisition_accounts_estimate',
        'Accounts adds supplier/vendor details and approximate purchase amount.',
        'manager',
        'purchase_requisition',
        2,
        TRUE
    ),
    (
        'PR Audit Review',
        'purchase_requisition_audit_review',
        'Audit reviews supplier estimates and records justification.',
        'manager',
        'purchase_requisition',
        3,
        TRUE
    ),
    (
        'PR Director Approval',
        'purchase_requisition_director_approval',
        'Director approves or rejects requisitions after audit justification.',
        'admin',
        'purchase_requisition',
        4,
        TRUE
    ),
    (
        'PR Purchase Recording',
        'purchase_requisition_purchase_recording',
        'Purchase department records invoice, vendor, and purchase details.',
        'manager',
        'purchase_requisition',
        5,
        TRUE
    ),
    (
        'PR Goods Receipt',
        'purchase_requisition_goods_receipt',
        'Receiving team confirms purchased goods were received.',
        'manager',
        'purchase_requisition',
        6,
        TRUE
    ),
    (
        'PR Stock Completion',
        'purchase_requisition_stock_completion',
        'Inventory/store completes the requisition and posts product quantities into stock.',
        'manager',
        'purchase_requisition',
        7,
        TRUE
    )
ON CONFLICT (feature_key) DO UPDATE SET
    feature_name = EXCLUDED.feature_name,
    description = EXCLUDED.description,
    approver_role = EXCLUDED.approver_role,
    workflow_key = EXCLUDED.workflow_key,
    workflow_step = EXCLUDED.workflow_step,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

NOTIFY pgrst, 'reload schema';

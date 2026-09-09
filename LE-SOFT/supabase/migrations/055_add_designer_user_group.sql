-- ═══════════════════════════════════════════════════════════════
-- Migration 055 — Add Furniture Designer User Group & Permissions
-- ═══════════════════════════════════════════════════════════════

-- 1. Ensure 'Furniture Designer' (and 'Designer') user group exists
INSERT INTO user_groups (name, description, permissions)
VALUES (
    'Furniture Designer', 
    'Responsible for furniture technical design, 3D modeling, technical drawings, CAD specifications, and cost/sale pricing review.', 
    '{"masters":true,"vouchers":false,"inventory":true,"users":false,"settings":false,"website":false,"reports":true,"make":true,"set_make_cost_price":true,"approve_make_order":true}'
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions;

-- Also ensure alias 'Designer' is present for legacy role mappings
INSERT INTO user_groups (name, description, permissions)
VALUES (
    'Designer', 
    'Furniture Design & Production Specifications Specialist', 
    '{"masters":true,"vouchers":false,"inventory":true,"users":false,"settings":false,"website":false,"reports":true,"make":true,"set_make_cost_price":true,"approve_make_order":true}'
)
ON CONFLICT (name) DO NOTHING;

-- 2. Ensure Admin and Super Admin have all MAKE permissions
UPDATE user_groups 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb), 
    '{set_make_cost_price}', 'true'::jsonb, true
)
WHERE name IN ('Super Admin', 'Admin', 'administrator');

-- 3. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';

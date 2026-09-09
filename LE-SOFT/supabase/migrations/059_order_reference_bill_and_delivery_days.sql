-- Migration 059: Add reference_bill_no and target_delivery_days to make_orders
-- Allows salesman and furniture designers to record bill references and turnaround in days

ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS reference_bill_no text;
ALTER TABLE make_orders ADD COLUMN IF NOT EXISTS target_delivery_days integer;

COMMENT ON COLUMN make_orders.reference_bill_no IS 'External reference bill number entered during order creation';
COMMENT ON COLUMN make_orders.target_delivery_days IS 'Number of turnaround days requested for delivery by salesperson or designer';

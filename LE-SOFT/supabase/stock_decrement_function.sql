-- PostgreSQL stored procedures for atomic product stock decrement and increment in Supabase

CREATE OR REPLACE FUNCTION decrement_product_qty(p_id bigint, qty numeric)
RETURNS void AS $$
BEGIN
  UPDATE products 
  SET quantity = GREATEST(COALESCE(quantity, 0) - qty, 0)
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_product_qty(p_id bigint, qty numeric)
RETURNS void AS $$
BEGIN
  UPDATE products 
  SET quantity = COALESCE(quantity, 0) + qty
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

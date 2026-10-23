-- Keep TrueNAS and Supabase MAKE metadata aligned for API schema introspection.
ALTER TABLE public.make_order_updates
  ALTER COLUMN stage TYPE varchar USING stage::varchar;

ALTER TABLE public.make_orders
  ALTER COLUMN designer_name SET NOT NULL;

NOTIFY pgrst, 'reload schema';

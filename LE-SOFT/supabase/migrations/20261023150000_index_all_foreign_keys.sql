-- FK indexes prevent parent updates/deletes from degrading as child tables grow.
-- This database is currently small; index creation is intentionally synchronous.
DROP INDEX IF EXISTS public.idx_moal_order_id;
DROP INDEX IF EXISTS public.idx_mop_order_id;

DO $index_missing_fks$
DECLARE
  fk record;
  index_name text;
  column_list text;
BEGIN
  FOR fk IN
    SELECT c.oid AS constraint_oid, c.conrelid AS table_oid, c.conkey,
           n.nspname AS schema_name, t.relname AS table_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = fk.table_oid AND i.indisvalid AND i.indisready
        AND i.indpred IS NULL AND i.indnkeyatts >= cardinality(fk.conkey)
        AND ARRAY(
          SELECT k.attnum::smallint
          FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum, ord)
          WHERE k.ord <= cardinality(fk.conkey)
          ORDER BY k.ord
        ) = fk.conkey
    ) THEN
      SELECT string_agg(format('%I', a.attname), ', ' ORDER BY keys.ord),
             string_agg(a.attname, '_' ORDER BY keys.ord)
        INTO column_list, index_name
      FROM unnest(fk.conkey) WITH ORDINALITY keys(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = fk.table_oid AND a.attnum = keys.attnum;
      index_name := left('idx_fk_' || fk.table_name || '_' || index_name || '_' || substr(md5(fk.constraint_oid::text), 1, 8), 63);
      EXECUTE format('CREATE INDEX %I ON %I.%I USING btree (%s)', index_name, fk.schema_name, fk.table_name, column_list);
    END IF;
  END LOOP;
END;
$index_missing_fks$;

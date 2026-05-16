-- Migration 043: Godown dimension schema repair
-- Older databases may have the base godowns table without warehouse grid columns.
-- Keep this idempotent and reload PostgREST so create-godown sees the columns.

ALTER TABLE godowns
    ADD COLUMN IF NOT EXISTS total_rows INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS racks_per_row INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bins_per_rack INTEGER DEFAULT 0;

UPDATE godowns
SET
    total_rows = COALESCE(total_rows, 0),
    racks_per_row = COALESCE(racks_per_row, 0),
    bins_per_rack = COALESCE(bins_per_rack, 0);

ALTER TABLE godowns
    ALTER COLUMN total_rows SET DEFAULT 0,
    ALTER COLUMN racks_per_row SET DEFAULT 0,
    ALTER COLUMN bins_per_rack SET DEFAULT 0;

NOTIFY pgrst, 'reload schema';

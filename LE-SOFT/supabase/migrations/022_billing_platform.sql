-- Adding platform tracking column to bills table
ALTER TABLE bills ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'desktop';

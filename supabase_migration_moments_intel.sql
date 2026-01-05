-- Migration to add intel field to moments table
-- Run this SQL in your Supabase SQL Editor

-- Add intel column to moments table (if it doesn't exist)
ALTER TABLE moments 
ADD COLUMN IF NOT EXISTS intel TEXT;

-- Update existing moments to copy caption to intel if intel is null
UPDATE moments 
SET intel = caption 
WHERE intel IS NULL AND caption IS NOT NULL;

-- Create index on intel for faster searches (optional)
CREATE INDEX IF NOT EXISTS moments_intel_idx ON moments(intel) WHERE intel IS NOT NULL;

SELECT 'Moments intel field migration completed successfully!' as status;

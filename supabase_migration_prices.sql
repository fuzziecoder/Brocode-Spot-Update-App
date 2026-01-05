-- Migration to add price fields to foods and cigarettes tables
-- Run this SQL in your Supabase SQL Editor

-- ============================================================================
-- 1. CREATE FOODS TABLE (if it doesn't exist)
-- ============================================================================

CREATE TABLE IF NOT EXISTS foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  added_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  price NUMERIC DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS foods_spot_id_idx ON foods(spot_id);
CREATE INDEX IF NOT EXISTS foods_added_by_idx ON foods(added_by);
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Everyone can read foods" ON foods;
  DROP POLICY IF EXISTS "Users can create foods" ON foods;
  DROP POLICY IF EXISTS "Users can update foods" ON foods;
  DROP POLICY IF EXISTS "Users can delete foods" ON foods;
  DROP POLICY IF EXISTS "Admins can update food prices" ON foods;
END $$;

CREATE POLICY "Everyone can read foods" ON foods FOR SELECT USING (true);
CREATE POLICY "Users can create foods" ON foods FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own foods" ON foods FOR UPDATE USING (added_by = auth.uid()::text OR EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id::text = auth.uid()::text AND profiles.role = 'admin'
));
CREATE POLICY "Users can delete own foods" ON foods FOR DELETE USING (added_by = auth.uid()::text OR EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id::text = auth.uid()::text AND profiles.role = 'admin'
));

-- ============================================================================
-- 2. ADD PRICE AND NAME FIELDS TO CIGARETTES TABLE
-- ============================================================================

ALTER TABLE cigarettes 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT NULL;

-- Update existing cigarettes to have a default name if null
UPDATE cigarettes SET name = 'Cigarette Pack' WHERE name IS NULL;

-- Make name NOT NULL for new entries (but allow existing NULLs)
-- We'll handle this in application code

-- Drop existing policies
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Everyone can read cigarettes" ON cigarettes;
  DROP POLICY IF EXISTS "Users can create cigarettes" ON cigarettes;
  DROP POLICY IF EXISTS "Users can update cigarettes" ON cigarettes;
  DROP POLICY IF EXISTS "Users can delete cigarettes" ON cigarettes;
END $$;

CREATE POLICY "Everyone can read cigarettes" ON cigarettes FOR SELECT USING (true);
CREATE POLICY "Users can create cigarettes" ON cigarettes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own cigarettes" ON cigarettes FOR UPDATE USING (added_by = auth.uid()::text OR EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id::text = auth.uid()::text AND profiles.role = 'admin'
));
CREATE POLICY "Users can delete own cigarettes" ON cigarettes FOR DELETE USING (added_by = auth.uid()::text OR EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id::text = auth.uid()::text AND profiles.role = 'admin'
));

-- ============================================================================
-- 3. ADD PRICE FIELD TO DRINKS TABLE (for user-suggested drinks)
-- ============================================================================

ALTER TABLE drinks 
ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT NULL;

SELECT 'Price migration completed successfully! Foods, cigarettes, and drinks now support prices.' as status;

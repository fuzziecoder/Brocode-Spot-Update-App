-- Migration for Drink Selection and Payment Features
-- Run this SQL in your Supabase SQL Editor

-- ============================================================================
-- 1. CREATE DRINK_BRANDS TABLE (Catalog of available drinks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS drink_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('beer', 'whiskey', 'vodka', 'rum', 'wine', 'cocktail', 'soft_drink', 'other')),
  image_url TEXT,
  base_price NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drink_brands_category_idx ON drink_brands(category);
CREATE INDEX IF NOT EXISTS drink_brands_available_idx ON drink_brands(is_available);
ALTER TABLE drink_brands ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Everyone can read drink brands" ON drink_brands;
  DROP POLICY IF EXISTS "Admins can manage drink brands" ON drink_brands;
END $$;

CREATE POLICY "Everyone can read drink brands" ON drink_brands FOR SELECT USING (true);
CREATE POLICY "Admins can manage drink brands" ON drink_brands FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================================================
-- 2. CREATE USER_DRINK_SELECTIONS TABLE (User's selected drinks for a spot)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_drink_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  drink_brand_id UUID NOT NULL REFERENCES drink_brands(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(spot_id, user_id, drink_brand_id)
);

CREATE INDEX IF NOT EXISTS user_drink_selections_spot_id_idx ON user_drink_selections(spot_id);
CREATE INDEX IF NOT EXISTS user_drink_selections_user_id_idx ON user_drink_selections(user_id);
CREATE INDEX IF NOT EXISTS user_drink_selections_drink_brand_id_idx ON user_drink_selections(drink_brand_id);
ALTER TABLE user_drink_selections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can read own selections" ON user_drink_selections;
  DROP POLICY IF EXISTS "Users can manage own selections" ON user_drink_selections;
  DROP POLICY IF EXISTS "Everyone can read selections" ON user_drink_selections;
END $$;

CREATE POLICY "Everyone can read selections" ON user_drink_selections FOR SELECT USING (true);
CREATE POLICY "Users can manage own selections" ON user_drink_selections FOR ALL USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================================================
-- 3. ADD drink_total_amount TO PAYMENTS TABLE
-- ============================================================================

ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS drink_total_amount NUMERIC DEFAULT 0;

-- ============================================================================
-- 4. INSERT DEFAULT DRINK BRANDS
-- ============================================================================

-- No default drink brands - users will add their own drinks
-- INSERT INTO drink_brands (name, category, base_price, description, image_url) VALUES
--   ...
-- ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. FUNCTION TO UPDATE PAYMENT DRINK TOTAL
-- ============================================================================

CREATE OR REPLACE FUNCTION update_payment_drink_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE payments
  SET drink_total_amount = (
    SELECT COALESCE(SUM(total_price), 0)
    FROM user_drink_selections
    WHERE spot_id = NEW.spot_id AND user_id = NEW.user_id
  )
  WHERE spot_id = NEW.spot_id AND user_id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_payment_drink_total ON user_drink_selections;
CREATE TRIGGER trigger_update_payment_drink_total
  AFTER INSERT OR UPDATE OR DELETE ON user_drink_selections
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_drink_total();

SELECT 'Drink selection migration completed successfully!' as status;

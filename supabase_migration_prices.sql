-- Enable UUID generation (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. FOODS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  added_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS foods_spot_id_idx ON public.foods(spot_id);
CREATE INDEX IF NOT EXISTS foods_added_by_idx ON public.foods(added_by);

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;

-- Drop old policies safely
DROP POLICY IF EXISTS "foods_read" ON public.foods;
DROP POLICY IF EXISTS "foods_insert" ON public.foods;
DROP POLICY IF EXISTS "foods_update" ON public.foods;
DROP POLICY IF EXISTS "foods_delete" ON public.foods;

-- Read: everyone
CREATE POLICY "foods_read"
ON public.foods
FOR SELECT
USING (true);

-- Insert: any authenticated user
CREATE POLICY "foods_insert"
ON public.foods
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Update: owner or admin
CREATE POLICY "foods_update"
ON public.foods
FOR UPDATE
USING (
  added_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- Delete: owner or admin
CREATE POLICY "foods_delete"
ON public.foods
FOR DELETE
USING (
  added_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- ============================================================================
-- 2. CIGARETTES TABLE UPDATES
-- ============================================================================

ALTER TABLE public.cigarettes
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS price NUMERIC;

UPDATE public.cigarettes
SET name = 'Cigarette Pack'
WHERE name IS NULL;

ALTER TABLE public.cigarettes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cigarettes_read" ON public.cigarettes;
DROP POLICY IF EXISTS "cigarettes_insert" ON public.cigarettes;
DROP POLICY IF EXISTS "cigarettes_update" ON public.cigarettes;
DROP POLICY IF EXISTS "cigarettes_delete" ON public.cigarettes;

CREATE POLICY "cigarettes_read"
ON public.cigarettes
FOR SELECT
USING (true);

CREATE POLICY "cigarettes_insert"
ON public.cigarettes
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "cigarettes_update"
ON public.cigarettes
FOR UPDATE
USING (
  added_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

CREATE POLICY "cigarettes_delete"
ON public.cigarettes
FOR DELETE
USING (
  added_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- ============================================================================
-- 3. DRINKS TABLE PRICE FIELD
-- ============================================================================

ALTER TABLE public.drinks
ADD COLUMN IF NOT EXISTS price NUMERIC;

-- ============================================================================
-- DONE
-- ============================================================================

SELECT 'Migration completed successfully. UUID issues fixed.' AS status;

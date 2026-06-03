ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS delivered_by_name text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cover_charge numeric;
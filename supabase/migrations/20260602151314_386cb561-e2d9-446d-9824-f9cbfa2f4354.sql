ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS service_fee numeric NOT NULL DEFAULT 0;
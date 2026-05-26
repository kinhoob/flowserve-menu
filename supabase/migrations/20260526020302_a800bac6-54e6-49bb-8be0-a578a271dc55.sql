
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'food';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_kind_check'
  ) THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_kind_check CHECK (kind IN ('food','drink'));
  END IF;
END $$;

ALTER TABLE public.waiter_calls
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'call';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waiter_calls_kind_check'
  ) THEN
    ALTER TABLE public.waiter_calls
      ADD CONSTRAINT waiter_calls_kind_check CHECK (kind IN ('call','bill'));
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

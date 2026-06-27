ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS brand_text_color text,
  ADD COLUMN IF NOT EXISTS brand_accent_color text;
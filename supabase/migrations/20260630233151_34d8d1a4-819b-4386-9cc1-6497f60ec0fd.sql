
-- Brand color extras
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS brand_card_color text,
  ADD COLUMN IF NOT EXISTS brand_header_color text,
  ADD COLUMN IF NOT EXISTS brand_button_color text;

-- Promotional banner (single per restaurant)
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS banner_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banner_title text,
  ADD COLUMN IF NOT EXISTS banner_description text,
  ADD COLUMN IF NOT EXISTS banner_image_url text,
  ADD COLUMN IF NOT EXISTS banner_cta_label text;

-- Per-item promotion flags
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_promo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_price numeric,
  ADD COLUMN IF NOT EXISTS promo_label text;

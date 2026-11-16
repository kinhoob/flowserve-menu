-- New restaurants start in black, gold and white. Explicit custom palettes remain untouched.
ALTER TABLE public.restaurants ALTER COLUMN brand_color SET DEFAULT '#0a0a0a';
ALTER TABLE public.restaurants ALTER COLUMN brand_text_color SET DEFAULT '#ffffff';
ALTER TABLE public.restaurants ALTER COLUMN brand_accent_color SET DEFAULT '#d7b56d';
ALTER TABLE public.restaurants ALTER COLUMN brand_card_color SET DEFAULT '#151515';
ALTER TABLE public.restaurants ALTER COLUMN brand_header_color SET DEFAULT '#0d0d0d';
ALTER TABLE public.restaurants ALTER COLUMN brand_button_color SET DEFAULT '#d7b56d';
UPDATE public.restaurants SET brand_color='#0a0a0a',brand_text_color='#ffffff',brand_accent_color='#d7b56d',brand_card_color='#151515',brand_header_color='#0d0d0d',brand_button_color='#d7b56d'
WHERE lower(brand_color)='#d4af37' AND brand_text_color IS NULL AND brand_accent_color IS NULL AND brand_card_color IS NULL AND brand_header_color IS NULL AND brand_button_color IS NULL;
NOTIFY pgrst, 'reload schema';

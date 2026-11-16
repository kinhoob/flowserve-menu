-- Additive settings for the restaurant-owned menu editor. Existing palettes are preserved.
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS menu_appearance jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_menu_appearance_valid CHECK (
 jsonb_typeof(menu_appearance)='object'
 AND menu_appearance - ARRAY['layout','font','corners','photos','imageFit','headerAlign','buttonStyle','buttonLabel','showDescription','showPortion']::text[] = '{}'::jsonb
 AND (NOT menu_appearance ? 'layout' OR (jsonb_typeof(menu_appearance->'layout')='string' AND menu_appearance->>'layout' IN ('list','grid','compact')))
 AND (NOT menu_appearance ? 'font' OR (jsonb_typeof(menu_appearance->'font')='string' AND menu_appearance->>'font' IN ('modern','clean','classic')))
 AND (NOT menu_appearance ? 'corners' OR (jsonb_typeof(menu_appearance->'corners')='string' AND menu_appearance->>'corners' IN ('square','rounded','soft')))
 AND (NOT menu_appearance ? 'photos' OR (jsonb_typeof(menu_appearance->'photos')='string' AND menu_appearance->>'photos' IN ('square','cover','hidden')))
 AND (NOT menu_appearance ? 'imageFit' OR (jsonb_typeof(menu_appearance->'imageFit')='string' AND menu_appearance->>'imageFit' IN ('cover','contain')))
 AND (NOT menu_appearance ? 'headerAlign' OR (jsonb_typeof(menu_appearance->'headerAlign')='string' AND menu_appearance->>'headerAlign' IN ('left','center')))
 AND (NOT menu_appearance ? 'buttonStyle' OR (jsonb_typeof(menu_appearance->'buttonStyle')='string' AND menu_appearance->>'buttonStyle' IN ('solid','outline')))
 AND (NOT menu_appearance ? 'buttonLabel' OR (jsonb_typeof(menu_appearance->'buttonLabel')='string' AND char_length(btrim(menu_appearance->>'buttonLabel')) BETWEEN 1 AND 24))
 AND (NOT menu_appearance ? 'showDescription' OR jsonb_typeof(menu_appearance->'showDescription')='boolean')
 AND (NOT menu_appearance ? 'showPortion' OR jsonb_typeof(menu_appearance->'showPortion')='boolean')
);
COMMENT ON COLUMN public.restaurants.menu_appearance IS 'Validated menu display preferences. Palette remains in the brand color columns; owner RLS continues to control updates.';
NOTIFY pgrst, 'reload schema';

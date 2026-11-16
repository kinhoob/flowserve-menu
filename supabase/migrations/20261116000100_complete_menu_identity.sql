-- Extend the owner-controlled appearance without resetting restaurants or their palettes.
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS menu_appearance jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_menu_appearance_valid;
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_menu_appearance_valid CHECK (
 jsonb_typeof(menu_appearance)='object'
 AND menu_appearance - ARRAY['layout','font','corners','photos','imageFit','headerAlign','buttonStyle','buttonLabel','showDescription','showPortion','coverUrl','showFluxBrand','coverHeight','categoryStyle','cardStyle','logoShape','logoSize','textSize','spacing','headingStyle','backgroundPattern','tagline','welcome','footerText']::text[] = '{}'::jsonb
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
 AND (NOT menu_appearance ? 'coverHeight' OR (jsonb_typeof(menu_appearance->'coverHeight')='string' AND menu_appearance->>'coverHeight' IN ('short','tall')))
 AND (NOT menu_appearance ? 'categoryStyle' OR (jsonb_typeof(menu_appearance->'categoryStyle')='string' AND menu_appearance->>'categoryStyle' IN ('pills','underline','blocks')))
 AND (NOT menu_appearance ? 'cardStyle' OR (jsonb_typeof(menu_appearance->'cardStyle')='string' AND menu_appearance->>'cardStyle' IN ('outlined','flat','elevated')))
 AND (NOT menu_appearance ? 'logoShape' OR (jsonb_typeof(menu_appearance->'logoShape')='string' AND menu_appearance->>'logoShape' IN ('rounded','circle','square')))
 AND (NOT menu_appearance ? 'logoSize' OR (jsonb_typeof(menu_appearance->'logoSize')='string' AND menu_appearance->>'logoSize' IN ('small','large')))
 AND (NOT menu_appearance ? 'textSize' OR (jsonb_typeof(menu_appearance->'textSize')='string' AND menu_appearance->>'textSize' IN ('small','regular','large')))
 AND (NOT menu_appearance ? 'spacing' OR (jsonb_typeof(menu_appearance->'spacing')='string' AND menu_appearance->>'spacing' IN ('comfortable','airy')))
 AND (NOT menu_appearance ? 'headingStyle' OR (jsonb_typeof(menu_appearance->'headingStyle')='string' AND menu_appearance->>'headingStyle' IN ('plain','accent','centered')))
 AND (NOT menu_appearance ? 'backgroundPattern' OR (jsonb_typeof(menu_appearance->'backgroundPattern')='string' AND menu_appearance->>'backgroundPattern' IN ('none','dots','lines')))
 AND (NOT menu_appearance ? 'tagline' OR (jsonb_typeof(menu_appearance->'tagline')='string' AND char_length(menu_appearance->>'tagline') <= 60))
 AND (NOT menu_appearance ? 'welcome' OR (jsonb_typeof(menu_appearance->'welcome')='string' AND char_length(menu_appearance->>'welcome') <= 180))
 AND (NOT menu_appearance ? 'footerText' OR (jsonb_typeof(menu_appearance->'footerText')='string' AND char_length(menu_appearance->>'footerText') <= 180))
 AND (NOT menu_appearance ? 'showFluxBrand' OR jsonb_typeof(menu_appearance->'showFluxBrand')='boolean')
 AND (NOT menu_appearance ? 'coverUrl' OR (jsonb_typeof(menu_appearance->'coverUrl')='string' AND char_length(menu_appearance->>'coverUrl') <= 2048 AND (menu_appearance->>'coverUrl'='' OR menu_appearance->>'coverUrl' ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')))
);
COMMENT ON COLUMN public.restaurants.menu_appearance IS 'Owner-controlled complete menu identity with validated options.';
NOTIFY pgrst, 'reload schema';

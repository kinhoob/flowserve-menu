-- Optional AR assets. Models must be authored in metres with their origin at the plate base.
ALTER TABLE public.menu_items
 ADD COLUMN model_3d_url text,
 ADD COLUMN model_usdz_url text,
 ADD COLUMN portion_description text,
 ADD COLUMN ar_scale_verified boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT menu_item_glb_url CHECK (model_3d_url IS NULL OR model_3d_url ~* '^https://[^[:space:]]+\.glb([?#].*)?$'),
 ADD CONSTRAINT menu_item_usdz_url CHECK (model_usdz_url IS NULL OR model_usdz_url ~* '^https://[^[:space:]]+\.usdz([?#].*)?$'),
 ADD CONSTRAINT menu_item_ar_requires_model CHECK (NOT ar_scale_verified OR model_3d_url IS NOT NULL),
 ADD CONSTRAINT menu_item_portion_length CHECK (char_length(portion_description) <= 160);
COMMENT ON COLUMN public.menu_items.ar_scale_verified IS 'Owner confirmed model dimensions against the real dish; fixed scale is enabled in AR. Device tracking remains approximate.';

-- Preserve classification for future reporting. Existing rows keep NULL snapshots;
-- the UI identifies their current-catalog fallback instead of fabricating history.
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS category_id_snapshot uuid;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_id_snapshot uuid;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS category_name_snapshot text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS department_snapshot text CHECK(department_snapshot IN ('food','drink'));
CREATE OR REPLACE FUNCTION public.capture_order_item_classification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE product record;
BEGIN
 IF TG_OP='UPDATE' THEN
 NEW.product_id_snapshot:=OLD.product_id_snapshot;
 NEW.category_id_snapshot:=OLD.category_id_snapshot;
 NEW.category_name_snapshot:=OLD.category_name_snapshot;
 NEW.department_snapshot:=OLD.department_snapshot;
 RETURN NEW;
 END IF;
 SELECT c.id,c.name,c.kind INTO product FROM menu_items m JOIN categories c ON c.id=m.category_id JOIN orders o ON o.id=NEW.order_id
 WHERE m.id=NEW.menu_item_id AND m.restaurant_id=o.restaurant_id AND c.restaurant_id=o.restaurant_id;
 IF NEW.menu_item_id IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'Produto ou categoria incompatível com o restaurante do pedido'; END IF;
 NEW.category_id_snapshot:=product.id;
 NEW.product_id_snapshot:=NEW.menu_item_id;
 NEW.category_name_snapshot:=product.name;
 NEW.department_snapshot:=product.kind;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS capture_order_item_classification ON public.order_items;
CREATE TRIGGER capture_order_item_classification BEFORE INSERT OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.capture_order_item_classification();
REVOKE ALL ON FUNCTION public.capture_order_item_classification() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';

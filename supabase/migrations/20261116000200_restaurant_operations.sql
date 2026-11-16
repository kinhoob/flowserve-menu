-- Additive operations upgrade. Apply after the existing Flux migrations.
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS promo_starts_at timestamptz;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS promo_ends_at timestamptz;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_promotion_window CHECK (
 (promo_starts_at IS NULL AND promo_ends_at IS NULL) OR
 (promo_starts_at IS NOT NULL AND promo_ends_at IS NOT NULL AND promo_ends_at>promo_starts_at AND is_promo AND original_price IS NOT NULL AND original_price>=price)
);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preparing_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason text CHECK (char_length(cancellation_reason)<=280);
CREATE OR REPLACE FUNCTION public.track_order_progress() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
  IF TG_OP='UPDATE' AND OLD.status IN ('served','cancelled') THEN RAISE EXCEPTION 'Pedido encerrado não pode mudar de status'; END IF;
  IF NEW.status='preparing' THEN NEW.preparing_at:=coalesce(OLD.preparing_at,now()); END IF;
  IF NEW.status='ready' THEN NEW.ready_at:=coalesce(OLD.ready_at,now()); END IF;
  IF NEW.status='cancelled' THEN NEW.cancelled_at:=now(); END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN NEW.preparing_at:=OLD.preparing_at;NEW.ready_at:=OLD.ready_at;NEW.cancelled_at:=OLD.cancelled_at; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER track_order_progress BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.track_order_progress();
CREATE OR REPLACE FUNCTION public.menu_effective_price(p_price numeric,p_original numeric,p_promo boolean,p_start timestamptz,p_end timestamptz) RETURNS numeric LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE WHEN p_promo AND p_start IS NOT NULL AND (now()<p_start OR now()>=p_end) THEN coalesce(p_original,p_price) ELSE p_price END;
$$;
CREATE OR REPLACE FUNCTION public.menu_live_prices(p_restaurant_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_object_agg(m.id,jsonb_build_object('price',public.menu_effective_price(m.price,m.original_price,m.is_promo,m.promo_starts_at,m.promo_ends_at),'is_promo',m.is_promo AND (m.promo_starts_at IS NULL OR (now()>=m.promo_starts_at AND now()<m.promo_ends_at)))),'{}') FROM menu_items m JOIN categories c ON c.id=m.category_id AND c.restaurant_id=m.restaurant_id WHERE m.restaurant_id=p_restaurant_id AND m.is_available AND c.is_active;
$$;
GRANT EXECUTE ON FUNCTION public.menu_live_prices(uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.manage_menu_items(p_restaurant_id uuid,p_action text,p_rows jsonb,p_patch jsonb DEFAULT '{}') RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE x jsonb; cid uuid; affected integer:=0; n integer; product_id uuid; category_name text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=p_restaurant_id AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Selecione entre 1 e 500 itens'; END IF;
 IF p_action='import' THEN
  FOR x IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR length(btrim(coalesce(x->>'name',''))) NOT BETWEEN 1 AND 80 OR length(btrim(coalesce(x->>'category',''))) NOT BETWEEN 1 AND 80 OR length(coalesce(x->>'description',''))>280 OR (x->>'price')::numeric NOT BETWEEN 0 AND 99999 OR x->>'price' IS NULL THEN RAISE EXCEPTION 'Linha inválida'; END IF;
   IF coalesce(x->>'image_url','')<>'' AND x->>'image_url' !~ '^https://' THEN RAISE EXCEPTION 'Imagem deve usar HTTPS'; END IF;
   category_name:=btrim(x->>'category');
   SELECT id INTO cid FROM categories WHERE restaurant_id=p_restaurant_id AND lower(name)=lower(category_name) ORDER BY created_at LIMIT 1;
   IF cid IS NULL THEN INSERT INTO categories(restaurant_id,name) VALUES(p_restaurant_id,category_name) RETURNING id INTO cid; END IF;
   IF EXISTS(SELECT 1 FROM menu_items WHERE restaurant_id=p_restaurant_id AND category_id=cid AND lower(name)=lower(btrim(x->>'name'))) THEN RAISE EXCEPTION 'Item já existe: %',x->>'name'; END IF;
   INSERT INTO menu_items(restaurant_id,category_id,name,description,price,image_url,is_available) VALUES(p_restaurant_id,cid,btrim(x->>'name'),nullif(btrim(x->>'description'),''),round((x->>'price')::numeric,2),nullif(x->>'image_url',''),coalesce((x->>'is_available')::boolean,true));
   affected:=affected+1;
  END LOOP;
 ELSIF p_action='update' THEN
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch='{}' OR p_patch-ARRAY['category_id','is_available','price_percent']::text[]<>'{}' THEN RAISE EXCEPTION 'Alteração inválida'; END IF;
  IF p_patch ? 'category_id' AND NOT EXISTS(SELECT 1 FROM categories WHERE id=(p_patch->>'category_id')::uuid AND restaurant_id=p_restaurant_id) THEN RAISE EXCEPTION 'Categoria inválida'; END IF;
  IF p_patch ? 'is_available' AND jsonb_typeof(p_patch->'is_available')<>'boolean' THEN RAISE EXCEPTION 'Disponibilidade inválida'; END IF;
  IF p_patch ? 'price_percent' AND ((p_patch->>'price_percent')::numeric NOT BETWEEN -100 AND 1000 OR jsonb_typeof(p_patch->'price_percent')<>'number') THEN RAISE EXCEPTION 'Percentual inválido'; END IF;
  IF (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_rows))<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Itens duplicados'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   product_id:=(x#>>'{}')::uuid;
   IF EXISTS(SELECT 1 FROM menu_items WHERE id=product_id AND restaurant_id=p_restaurant_id AND is_promo) AND p_patch ? 'price_percent' THEN RAISE EXCEPTION 'Edite o preço dos itens em promoção individualmente'; END IF;
   UPDATE menu_items SET category_id=CASE WHEN p_patch ? 'category_id' THEN (p_patch->>'category_id')::uuid ELSE category_id END,is_available=CASE WHEN p_patch ? 'is_available' THEN (p_patch->>'is_available')::boolean ELSE is_available END,price=CASE WHEN p_patch ? 'price_percent' THEN round(price*(1+(p_patch->>'price_percent')::numeric/100),2) ELSE price END WHERE id=product_id AND restaurant_id=p_restaurant_id AND (NOT(p_patch ? 'price_percent') OR round(price*(1+(p_patch->>'price_percent')::numeric/100),2)<=99999);
   GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Item inválido ou preço fora do limite'; END IF;affected:=affected+1;
  END LOOP;
 ELSE RAISE EXCEPTION 'Ação inválida'; END IF;
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.manage_menu_items(uuid,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_menu_items(uuid,text,jsonb,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.validated_order_items(p_restaurant_id uuid, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  x jsonb; product record; g record; option_ids uuid[]; qty integer;
  selection_count integer; option_total numeric; snapshots jsonb; result jsonb := '[]';
  kitchen boolean; plan text;
BEGIN
  SELECT kitchen_open INTO kitchen FROM restaurants WHERE id = p_restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante inválido' USING ERRCODE='22023'; END IF;
  SELECT public.get_restaurant_plan(r.slug) INTO plan FROM restaurants r WHERE r.id=p_restaurant_id;
  IF plan IS NULL OR plan NOT IN ('trial','essential','pro','enterprise') THEN
    RAISE EXCEPTION 'O plano atual não permite pedidos' USING ERRCODE='22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Itens inválidos' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Adicione entre 1 e 50 itens' USING ERRCODE='22023';
  END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF coalesce(x->>'quantity','') !~ '^[0-9]{1,2}$' THEN
      RAISE EXCEPTION 'Quantidade inválida' USING ERRCODE='22023';
    END IF;
    qty := (x->>'quantity')::integer;
    IF qty NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'Quantidade inválida' USING ERRCODE='22023'; END IF;
    SELECT m.*, c.kind, c.is_active INTO product FROM menu_items m
      JOIN categories c ON c.id = m.category_id AND c.restaurant_id = m.restaurant_id
      WHERE m.id = (x->>'menu_item_id')::uuid AND m.restaurant_id = p_restaurant_id;
    IF NOT FOUND OR NOT product.is_available OR NOT product.is_active THEN
      RAISE EXCEPTION 'Produto indisponível. Atualize o cardápio.' USING ERRCODE='22023';
    END IF;
    IF kitchen = false AND product.kind <> 'drink' THEN
      RAISE EXCEPTION 'A cozinha está fechada' USING ERRCODE='22023';
    END IF;
    IF length(coalesce(x->>'notes','')) > 1000 THEN RAISE EXCEPTION 'Observação muito longa' USING ERRCODE='22023'; END IF;
    IF x ? 'modifier_option_ids' AND jsonb_typeof(x->'modifier_option_ids') <> 'array' THEN
      RAISE EXCEPTION 'Adicionais inválidos' USING ERRCODE='22023';
    END IF;
    SELECT coalesce(array_agg(v::uuid), '{}'::uuid[]) INTO option_ids
      FROM jsonb_array_elements_text(coalesce(x->'modifier_option_ids','[]')) v;
    IF cardinality(option_ids) > 50 OR cardinality(option_ids) <> (SELECT count(DISTINCT v) FROM unnest(option_ids) v) THEN
      RAISE EXCEPTION 'Adicionais duplicados ou em excesso' USING ERRCODE='22023';
    END IF;
    SELECT count(*), coalesce(sum(o.price_delta),0), coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'group', mg.name, 'name', o.name, 'price_delta', o.price_delta
    )), '[]') INTO selection_count, option_total, snapshots
      FROM modifier_options o JOIN modifier_groups mg ON mg.id = o.group_id
      WHERE o.id = ANY(option_ids) AND mg.menu_item_id = product.id AND mg.restaurant_id = p_restaurant_id;
    IF selection_count <> cardinality(option_ids) THEN RAISE EXCEPTION 'Adicional inválido' USING ERRCODE='22023'; END IF;
    FOR g IN SELECT * FROM modifier_groups WHERE menu_item_id = product.id AND restaurant_id = p_restaurant_id LOOP
      SELECT count(*) INTO selection_count FROM modifier_options WHERE group_id = g.id AND id = ANY(option_ids);
      IF selection_count < greatest(g.min_select, CASE WHEN g.is_required THEN 1 ELSE 0 END)
        OR selection_count > g.max_select THEN
        RAISE EXCEPTION 'Confira as opções de %', g.name USING ERRCODE='22023';
      END IF;
    END LOOP;
    product.price := public.menu_effective_price(product.price,product.original_price,product.is_promo,product.promo_starts_at,product.promo_ends_at);
    IF x ? 'expected_unit_price' AND ((x->>'expected_unit_price')::numeric IS NULL OR round((x->>'expected_unit_price')::numeric,2)<>round(product.price+option_total,2)) THEN RAISE EXCEPTION 'O preço mudou. Atualize os valores e revise o carrinho antes de enviar.' USING ERRCODE='22023'; END IF;
    IF product.price + option_total < 0 THEN RAISE EXCEPTION 'Preço inválido' USING ERRCODE='22023'; END IF;
    result := result || jsonb_build_array(jsonb_build_object(
      'menu_item_id', product.id, 'name_snapshot', product.name,
      'price_snapshot', round(product.price + option_total,2), 'quantity', qty,
      'notes', nullif(btrim(x->>'notes'),''), 'modifiers_snapshot', snapshots));
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.validated_order_items(uuid,jsonb) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.place_order(uuid,text,text,text,text,jsonb);

NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.staff_list_orders(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE='P0001'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT o.*,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', oi.id,
          'name', oi.name_snapshot,
          'price', oi.price_snapshot,
          'quantity', oi.quantity,
          'notes', oi.notes, 'modifiers',oi.modifiers_snapshot
        ) ORDER BY oi.created_at)
        FROM public.order_items oi WHERE oi.order_id = o.id
      ), '[]'::jsonb) AS items,
      (COALESCE(o.subtotal,0) + COALESCE(o.service_fee,0) + COALESCE(o.cover_charge,0)) AS total
    FROM public.orders o
    WHERE o.restaurant_id = v_rest AND COALESCE(o.archived,false) = false
  ) o;
  RETURN v_result;
END; $$;

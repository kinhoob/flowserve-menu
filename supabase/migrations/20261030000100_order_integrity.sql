-- Deploy with the application in this change. No customer data is deleted.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_token_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_unique
  ON public.orders(tracking_token_hash) WHERE tracking_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_restaurant_plan(p_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN p.plan_type='trial' AND p.trial_ends_at < now() THEN 'basic' ELSE p.plan_type END
  FROM restaurants r JOIN profiles p ON p.id=r.owner_id WHERE r.slug=p_slug LIMIT 1;
$$;

-- A browser must never read other customers' names/phones or bypass place_order.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('orders', 'order_items')
      AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
  LOOP EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename); END LOOP;
END $$;
REVOKE ALL ON public.orders, public.order_items FROM anon;
-- Owner policies remain for the authenticated administration screens.

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
CREATE OR REPLACE FUNCTION public.place_order(
  p_restaurant_id uuid, p_table_label text, p_customer_name text, p_customer_phone text,
  p_currency text, p_items jsonb, p_tracking_token text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  items jsonb; total numeric; phone text; order_id uuid; v_table_id uuid;
  token_hash text; restaurant_currency text; plan text; slug text;
BEGIN
  IF p_tracking_token IS NULL OR p_tracking_token !~ '^[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'Identificação do pedido inválida' USING ERRCODE='22023';
  END IF;
  token_hash := encode(extensions.digest(p_tracking_token,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text,0));
  SELECT id INTO order_id FROM orders WHERE tracking_token_hash = token_hash AND restaurant_id = p_restaurant_id;
  IF FOUND THEN RETURN order_id; END IF; -- safe retry after a network timeout
  SELECT r.currency, r.slug INTO restaurant_currency, slug FROM restaurants r WHERE r.id = p_restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante inválido' USING ERRCODE='22023'; END IF;
  plan := public.get_restaurant_plan(slug);
  IF plan = 'basic' THEN RAISE EXCEPTION 'Este cardápio permite apenas visualização' USING ERRCODE='22023'; END IF;
  IF length(btrim(coalesce(p_customer_name,''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Informe seu nome (2 a 80 caracteres)' USING ERRCODE='22023';
  END IF;
  SELECT t.id INTO v_table_id FROM venue_tables t WHERE t.restaurant_id = p_restaurant_id
    AND lower(btrim(regexp_replace(t.label,'^(Mesa\s*)+','','i'))) = lower(btrim(regexp_replace(coalesce(p_table_label,''),'^(Mesa\s*)+','','i')));
  IF v_table_id IS NULL THEN RAISE EXCEPTION 'Mesa inválida. Escaneie um QR Code atualizado.' USING ERRCODE='22023'; END IF;
  phone := regexp_replace(coalesce(p_customer_phone,''),'\D','','g');
  IF length(phone) IN (12,13) AND left(phone,2) = '55' THEN phone := substring(phone FROM 3); END IF;
  -- The existing validate_order_phone_br trigger validates DDD/mobile and normalizes again.
  IF length(phone) NOT IN (10,11) THEN RAISE EXCEPTION 'Telefone inválido' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM orders WHERE restaurant_id = p_restaurant_id AND customer_phone = phone AND created_at > now()-interval '2 minutes') >= 5
    OR (SELECT count(*) FROM orders WHERE restaurant_id = p_restaurant_id AND orders.table_id = v_table_id AND created_at > now()-interval '10 minutes') >= 20 THEN
    RAISE EXCEPTION 'Muitos pedidos recentes. Aguarde alguns minutos.' USING ERRCODE='P0001';
  END IF;
  items := public.validated_order_items(p_restaurant_id,p_items);
  SELECT sum((v->>'price_snapshot')::numeric * (v->>'quantity')::integer) INTO total FROM jsonb_array_elements(items) v;
  IF total > 5000 THEN RAISE EXCEPTION 'Máximo de R$ 5.000,00 por pedido' USING ERRCODE='22023'; END IF;
  INSERT INTO orders(restaurant_id,table_id,table_label,customer_name,customer_phone,subtotal,currency,status,tracking_token_hash)
    SELECT p_restaurant_id,t.id,t.label,btrim(p_customer_name),phone,total,restaurant_currency,'pending',token_hash FROM venue_tables t WHERE t.id = v_table_id
    RETURNING id INTO order_id;
  INSERT INTO order_items(order_id,menu_item_id,name_snapshot,price_snapshot,quantity,notes,modifiers_snapshot)
    SELECT order_id,(v->>'menu_item_id')::uuid,v->>'name_snapshot',(v->>'price_snapshot')::numeric,
      (v->>'quantity')::integer,v->>'notes',v->'modifiers_snapshot' FROM jsonb_array_elements(items) v;
  RETURN order_id;
END $$;
REVOKE ALL ON FUNCTION public.place_order(uuid,text,text,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid,text,text,text,text,jsonb,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_order_status(p_order_id uuid,p_token text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT status::text FROM orders WHERE id = p_order_id
    AND tracking_token_hash = encode(extensions.digest(p_token,'sha256'),'hex');
$$;
REVOKE ALL ON FUNCTION public.get_order_status(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_status(uuid,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.staff_place_order(p_token text,p_table_id uuid,p_items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE staff record; t record; items jsonb; total numeric; order_id uuid;
BEGIN
  SELECT * INTO staff FROM public.staff_session_info(p_token);
  IF staff.restaurant_id IS NULL OR staff.role NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT vt.*,r.currency INTO t FROM venue_tables vt JOIN restaurants r ON r.id=vt.restaurant_id
    WHERE vt.id=p_table_id AND vt.restaurant_id=staff.restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
  items := public.validated_order_items(staff.restaurant_id,p_items);
  SELECT sum((v->>'price_snapshot')::numeric*(v->>'quantity')::integer) INTO total FROM jsonb_array_elements(items) v;
  IF total > 5000 THEN RAISE EXCEPTION 'Máximo de R$ 5.000,00 por pedido'; END IF;
  INSERT INTO orders(restaurant_id,table_id,table_label,subtotal,currency,status,created_by_name)
    VALUES(staff.restaurant_id,t.id,t.label,total,t.currency,'pending',staff.name) RETURNING id INTO order_id;
  INSERT INTO order_items(order_id,menu_item_id,name_snapshot,price_snapshot,quantity,notes,modifiers_snapshot)
    SELECT order_id,(v->>'menu_item_id')::uuid,v->>'name_snapshot',(v->>'price_snapshot')::numeric,
      (v->>'quantity')::integer,v->>'notes',v->'modifiers_snapshot' FROM jsonb_array_elements(items) v;
  RETURN order_id;
END $$;
REVOKE ALL ON FUNCTION public.staff_place_order(text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_place_order(text,uuid,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.owner_place_order(p_restaurant_id uuid,p_table_id uuid,p_items jsonb,p_created_by_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; items jsonb; total numeric; order_id uuid;
BEGIN
  SELECT vt.*,r.currency INTO t FROM venue_tables vt JOIN restaurants r ON r.id=vt.restaurant_id
    WHERE vt.id=p_table_id AND vt.restaurant_id=p_restaurant_id AND r.owner_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Mesa inválida ou acesso negado'; END IF;
  items:=public.validated_order_items(p_restaurant_id,p_items);
  SELECT sum((v->>'price_snapshot')::numeric*(v->>'quantity')::integer) INTO total FROM jsonb_array_elements(items) v;
  IF total>5000 THEN RAISE EXCEPTION 'Máximo de R$ 5.000,00 por pedido'; END IF;
  INSERT INTO orders(restaurant_id,table_id,table_label,subtotal,currency,status,created_by_name)
    VALUES(p_restaurant_id,t.id,t.label,total,t.currency,'pending',left(p_created_by_name,80)) RETURNING id INTO order_id;
  INSERT INTO order_items(order_id,menu_item_id,name_snapshot,price_snapshot,quantity,notes,modifiers_snapshot)
    SELECT order_id,(v->>'menu_item_id')::uuid,v->>'name_snapshot',(v->>'price_snapshot')::numeric,
      (v->>'quantity')::integer,v->>'notes',v->'modifiers_snapshot' FROM jsonb_array_elements(items) v;
  RETURN order_id;
END $$;
REVOKE ALL ON FUNCTION public.owner_place_order(uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_place_order(uuid,uuid,jsonb,text) TO authenticated;

ALTER TABLE public.waiter_calls ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
-- Preserve historical diagnostics while removing them from operational queues.
UPDATE public.waiter_calls SET is_test=true WHERE table_label ~ '^(RT-CALL|TEST-)';

CREATE OR REPLACE FUNCTION public.validate_waiter_call()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.is_test OR NOT EXISTS(SELECT 1 FROM venue_tables t WHERE t.restaurant_id=NEW.restaurant_id AND
      lower(btrim(regexp_replace(t.label,'^(Mesa\s*)+','','i'))) = lower(btrim(regexp_replace(NEW.table_label,'^(Mesa\s*)+','','i')))) THEN
      RAISE EXCEPTION 'Mesa inválida';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.restaurant_id::text || NEW.table_label,1));
    IF EXISTS(SELECT 1 FROM waiter_calls WHERE restaurant_id=NEW.restaurant_id AND table_label=NEW.table_label
      AND created_at > now()-interval '30 seconds' AND NOT resolved) THEN RAISE EXCEPTION 'Chamado já enviado. Aguarde o atendimento.'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_waiter_call BEFORE INSERT ON public.waiter_calls FOR EACH ROW EXECUTE FUNCTION public.validate_waiter_call();
REVOKE ALL ON FUNCTION public.validate_waiter_call() FROM PUBLIC,anon,authenticated;

-- A profile owner may edit presentation fields, never grant themselves a paid plan.
REVOKE UPDATE,INSERT ON public.profiles FROM authenticated;
GRANT UPDATE(display_name,avatar_url), INSERT(id,display_name,avatar_url) ON public.profiles TO authenticated;
ALTER TABLE public.restaurants ALTER COLUMN timezone SET DEFAULT 'America/Sao_Paulo';
-- Existing restaurants keep their configured timezone; the settings screen now allows changing it.

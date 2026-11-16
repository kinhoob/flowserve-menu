-- Horários e proteção de mesas. Nunca altere o relógio do cliente para autorizar pedidos.
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS bar_open boolean NOT NULL DEFAULT true;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS operating_hours jsonb;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS require_table_code boolean NOT NULL DEFAULT true;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS hours_enabled_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.validate_service_hours() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE department text; d jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN RAISE EXCEPTION 'Fuso horário inválido'; END IF;
  IF NEW.operating_hours IS DISTINCT FROM OLD.operating_hours THEN NEW.hours_enabled_at:=now(); END IF;
  IF NEW.operating_hours IS NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.operating_hours)<>'object' THEN RAISE EXCEPTION 'Horários inválidos'; END IF;
  FOREACH department IN ARRAY ARRAY['kitchen','bar'] LOOP
    IF jsonb_typeof(NEW.operating_hours->department) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.operating_hours->department)<>7 THEN RAISE EXCEPTION 'Preencha os sete dias da cozinha e do bar'; END IF;
    FOR d IN SELECT value FROM jsonb_array_elements(NEW.operating_hours->department) LOOP
      IF jsonb_typeof(d->'enabled') IS DISTINCT FROM 'boolean' OR coalesce(d->>'open','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(d->>'close','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR d->>'open'=d->>'close' THEN RAISE EXCEPTION 'Use horários válidos e diferentes de abertura e fechamento'; END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_service_hours ON public.restaurants;
CREATE TRIGGER validate_service_hours BEFORE INSERT OR UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.validate_service_hours();
REVOKE ALL ON FUNCTION public.validate_service_hours() FROM PUBLIC,anon,authenticated;

-- Segunda = 0. Intervalos são [abertura, fechamento), inclusive ao atravessar a meia-noite.
CREATE OR REPLACE FUNCTION public.service_is_open(p_restaurant_id uuid,p_department text,p_at timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; local_now timestamp; day_start date; day_rule jsonb; opens timestamptz; closes timestamptz; n integer;
BEGIN
  SELECT * INTO r FROM restaurants WHERE id=p_restaurant_id;
  IF NOT FOUND OR p_department NOT IN ('kitchen','bar') THEN RETURN false; END IF;
  IF (p_department='kitchen' AND NOT r.kitchen_open) OR (p_department='bar' AND NOT r.bar_open) THEN RETURN false; END IF;
  IF r.operating_hours IS NULL THEN RETURN true; END IF;
  local_now:=p_at AT TIME ZONE r.timezone;
  FOR n IN 0..1 LOOP
    day_start:=local_now::date-n;
    day_rule:=r.operating_hours->p_department->(extract(isodow FROM day_start)::integer-1);
    IF (day_rule->>'enabled')::boolean THEN
      opens:=(day_start+(day_rule->>'open')::time) AT TIME ZONE r.timezone;
      closes:=((day_start+CASE WHEN day_rule->>'close'<day_rule->>'open' THEN 1 ELSE 0 END)+(day_rule->>'close')::time) AT TIME ZONE r.timezone;
      IF p_at>=opens AND p_at<closes THEN RETURN true; END IF;
    END IF;
  END LOOP;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.service_is_open(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_service_status(p_restaurant_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('kitchen_open',public.service_is_open(id,'kitchen'),'bar_open',public.service_is_open(id,'bar'),'require_table_code',require_table_code,'schedule_configured',operating_hours IS NOT NULL,'timezone',timezone) FROM restaurants WHERE id=p_restaurant_id;
$$;
REVOKE ALL ON FUNCTION public.get_service_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_service_status(uuid) TO anon,authenticated;

CREATE TABLE IF NOT EXISTS public.table_order_codes(
 table_id uuid PRIMARY KEY REFERENCES public.venue_tables(id) ON DELETE CASCADE,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 code text NOT NULL, expires_at timestamptz NOT NULL
);
ALTER TABLE public.table_order_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.table_order_codes FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.table_order_code(p_table_id uuid,p_staff_token text DEFAULT NULL,p_rotate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE rid uuid; s record; c record;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   SELECT * INTO s FROM public.staff_session_info(p_staff_token);
   IF s.restaurant_id IS DISTINCT FROM rid OR s.role NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text,4));
 SELECT * INTO c FROM table_order_codes WHERE table_id=p_table_id;
 IF c.table_id IS NULL OR c.expires_at<=now() OR p_rotate THEN
   INSERT INTO table_order_codes(table_id,restaurant_id,code,expires_at)
   VALUES(p_table_id,rid,encode(extensions.gen_random_bytes(6),'hex'),now()+interval '2 hours')
   ON CONFLICT(table_id) DO UPDATE SET code=EXCLUDED.code,expires_at=EXCLUDED.expires_at RETURNING * INTO c;
 END IF;
 RETURN jsonb_build_object('code',c.code,'expires_at',c.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.table_order_code(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.table_order_code(uuid,text,boolean) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.check_table_order_code(p_table_id uuid,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM venue_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.id=p_table_id AND r.require_table_code)
 AND NOT EXISTS(SELECT 1 FROM table_order_codes WHERE table_id=p_table_id AND code=p_code AND expires_at>now()) THEN
 RAISE EXCEPTION 'Código da mesa inválido ou expirado. Peça o código atual ao garçom.' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.check_table_order_code(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.expire_table_order_code() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (NEW.archived OR NEW.status::text='cancelled') AND NOT EXISTS(SELECT 1 FROM orders WHERE table_id=NEW.table_id AND NOT coalesce(archived,false) AND status::text<>'cancelled') THEN
 DELETE FROM table_order_codes WHERE table_id=NEW.table_id;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS expire_table_order_code ON public.orders;
CREATE TRIGGER expire_table_order_code AFTER UPDATE OF archived,status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.expire_table_order_code();
REVOKE ALL ON FUNCTION public.expire_table_order_code() FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.restaurant_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(restaurant_id,period_end)
);
ALTER TABLE public.restaurant_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_notifications FROM anon,authenticated;
GRANT SELECT ON public.restaurant_notifications TO authenticated;
DROP POLICY IF EXISTS owner_notifications ON public.restaurant_notifications;
CREATE POLICY owner_notifications ON public.restaurant_notifications FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM restaurants r WHERE r.id=restaurant_id AND r.owner_id=auth.uid()));
CREATE OR REPLACE FUNCTION public.generate_closing_notifications(p_only uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; d date; rule jsonb; opens timestamptz; closes timestamptz; n integer;
 previous_rule jsonb; previous_day date; previous_close timestamptz; previous_boundary timestamptz; j integer;
BEGIN
 FOR r IN SELECT * FROM restaurants WHERE operating_hours IS NOT NULL AND (p_only IS NULL OR id=p_only) LOOP
 FOR n IN REVERSE 7..0 LOOP
 d:=(now() AT TIME ZONE r.timezone)::date-n;
 rule:=r.operating_hours->'bar'->(extract(isodow FROM d)::integer-1);
 IF (rule->>'enabled')::boolean THEN
 opens:=(d+(rule->>'open')::time) AT TIME ZONE r.timezone;
 closes:=((d+CASE WHEN rule->>'close'<rule->>'open' THEN 1 ELSE 0 END)+(rule->>'close')::time) AT TIME ZONE r.timezone;
 -- Consecutive closing boundaries include kitchen sales before the bar opens.
 previous_boundary:=NULL;
 FOR j IN 1..7 LOOP
 previous_day:=d-j;
 previous_rule:=r.operating_hours->'bar'->(extract(isodow FROM previous_day)::integer-1);
 IF (previous_rule->>'enabled')::boolean THEN
 previous_close:=((previous_day+CASE WHEN previous_rule->>'close'<previous_rule->>'open' THEN 1 ELSE 0 END)+(previous_rule->>'close')::time) AT TIME ZONE r.timezone;
 IF previous_close<closes THEN previous_boundary:=greatest(previous_boundary,previous_close); END IF;
 END IF;
 END LOOP;
 opens:=coalesce(previous_boundary,opens);
 -- Keep actual historical boundaries when the owner changes the weekly schedule.
 SELECT coalesce(max(period_end),opens) INTO opens FROM restaurant_notifications WHERE restaurant_id=r.id AND period_end<closes;
 IF closes<=now() AND closes>=r.hours_enabled_at THEN
 INSERT INTO restaurant_notifications(restaurant_id,period_start,period_end) VALUES(r.id,opens,closes) ON CONFLICT DO NOTHING;
 END IF;
 END IF;
 END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.generate_closing_notifications(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.sync_closing_notifications() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
 FOR rid IN SELECT id FROM restaurants WHERE owner_id=auth.uid() LOOP PERFORM public.generate_closing_notifications(rid); END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.sync_closing_notifications() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_closing_notifications() TO authenticated;
CREATE OR REPLACE FUNCTION public.closing_summary(p_notification_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n record; result jsonb;
BEGIN
 SELECT x.*,r.currency,r.timezone INTO n FROM restaurant_notifications x JOIN restaurants r ON r.id=x.restaurant_id WHERE x.id=p_notification_id AND r.owner_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT jsonb_build_object('currency',n.currency,'timezone',n.timezone,'period_start',n.period_start,'period_end',n.period_end,
 'revenue',coalesce(sum(coalesce(subtotal,0)+coalesce(service_fee,0)+coalesce(cover_charge,0)) FILTER(WHERE status::text='served'),0),
 'delivered',count(*) FILTER(WHERE status::text='served'),
 'pending',count(*) FILTER(WHERE status::text NOT IN ('served','cancelled')),
 'cancelled',count(*) FILTER(WHERE status::text='cancelled')) INTO result FROM orders WHERE restaurant_id=n.restaurant_id AND created_at>=n.period_start AND created_at<n.period_end;
 UPDATE restaurant_notifications SET read_at=coalesce(read_at,now()) WHERE id=n.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.closing_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.closing_summary(uuid) TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='restaurant_notifications') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_notifications; END IF;
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') THEN
   CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
   PERFORM cron.schedule('flux-closing-notifications','* * * * *','SELECT public.generate_closing_notifications();');
 END IF;
END $$;

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
    IF NOT public.service_is_open(p_restaurant_id,CASE WHEN product.kind='drink' THEN 'bar' ELSE 'kitchen' END) THEN
      RAISE EXCEPTION 'Este setor está fechado. Revise o carrinho e os horários de atendimento.' USING ERRCODE='22023';
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


CREATE OR REPLACE FUNCTION public.place_order(
  p_restaurant_id uuid, p_table_label text, p_customer_name text, p_customer_phone text,
  p_currency text, p_items jsonb, p_tracking_token text, p_table_code text
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
  PERFORM public.check_table_order_code(v_table_id,p_table_code);
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
REVOKE ALL ON FUNCTION public.place_order(uuid,text,text,text,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid,text,text,text,text,jsonb,text,text) TO anon,authenticated;


-- Legacy clients cannot bypass table verification by choosing the older signature.
CREATE OR REPLACE FUNCTION public.place_order(p_restaurant_id uuid,p_table_label text,p_customer_name text,p_customer_phone text,p_currency text,p_items jsonb,p_tracking_token text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT public.place_order(p_restaurant_id,p_table_label,p_customer_name,p_customer_phone,p_currency,p_items,p_tracking_token,NULL);
$$;
REVOKE ALL ON FUNCTION public.place_order(uuid,text,text,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid,text,text,text,text,jsonb,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.public_waiter_call(p_restaurant_id uuid,p_table_label text,p_customer_name text,p_message text,p_kind text,p_table_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid;
BEGIN
 SELECT id INTO tid FROM venue_tables WHERE restaurant_id=p_restaurant_id AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(p_table_label,'^(Mesa\s*)+','','i')));
 IF tid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 PERFORM public.check_table_order_code(tid,p_table_code);
 -- Existing customers can request their bill after closing, but cannot place new orders.
 IF p_kind NOT IN ('call','bill') OR p_kind IS NULL THEN RAISE EXCEPTION 'Chamado inválido'; END IF;
 IF NOT public.service_is_open(p_restaurant_id,'bar') AND NOT public.service_is_open(p_restaurant_id,'kitchen') AND NOT EXISTS(SELECT 1 FROM orders WHERE restaurant_id=p_restaurant_id AND table_id=tid AND NOT coalesce(archived,false) AND status::text<>'cancelled') THEN RAISE EXCEPTION 'Atendimento encerrado'; END IF;
 INSERT INTO waiter_calls(restaurant_id,table_label,customer_name,message,kind) VALUES(p_restaurant_id,p_table_label,left(p_customer_name,80),left(p_message,500),p_kind);
END $$;
REVOKE INSERT ON public.waiter_calls FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.public_waiter_call(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_waiter_call(uuid,text,text,text,text,text) TO anon,authenticated;
GRANT UPDATE(has_seen_onboarding) ON public.profiles TO authenticated;
CREATE OR REPLACE FUNCTION public.list_closing_notifications() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(row_to_json(n)),'[]'::jsonb) FROM (
 SELECT x.id,x.period_start,x.period_end,x.read_at,r.timezone FROM restaurant_notifications x JOIN restaurants r ON r.id=x.restaurant_id WHERE r.owner_id=auth.uid() ORDER BY x.period_end DESC LIMIT 60
 ) n;
$$;
REVOKE ALL ON FUNCTION public.list_closing_notifications() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_closing_notifications() TO authenticated;
NOTIFY pgrst,'reload schema';

-- Flux: atualização do banco EXISTENTE, preservando restaurantes, produtos e pedidos.
-- Execute o arquivo completo no SQL Editor, no projeto FluxQr, com o papel postgres.
-- Inclui personalização, links, horários, códigos, notificações e a central de gestão.
-- Após sucesso, atualize a página do Flux e configure a agenda em Configurações > Operação.
BEGIN;
SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF to_regprocedure('public.menu_effective_price(numeric,numeric,boolean,timestamp with time zone,timestamp with time zone)') IS NULL THEN
 RAISE EXCEPTION 'Falta a atualização anterior de operações. Este arquivo exige o banco Flux já inicializado e atualizado.';
 END IF;
END $guard$;
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

DO $links$ BEGIN
 IF to_regclass('public.restaurant_slug_aliases') IS NULL OR to_regprocedure('public.resolve_restaurant_slug(text)') IS NULL THEN
 EXECUTE $pending_links$-- Human-readable menu addresses with permanent aliases for existing QR codes.
CREATE TABLE IF NOT EXISTS public.restaurant_slug_aliases (
 slug text PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE
);
ALTER TABLE public.restaurant_slug_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_slug_aliases FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.restaurant_name_slug(p_name text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 WITH normalized AS (
  SELECT rtrim(left(trim(both '-' from regexp_replace(lower(regexp_replace(normalize(coalesce(p_name,''),NFKD),U&'[\0300-\036f]','','g')),'[^a-z0-9]+','-','g')),64),'-') AS slug
 ) SELECT CASE WHEN slug='' THEN 'restaurante' WHEN char_length(slug)<3 THEN slug||'-restaurante' ELSE slug END FROM normalized;
$$;
CREATE OR REPLACE FUNCTION public.preserve_restaurant_slug() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE base text; candidate text; suffix integer:=1; automatic boolean; old_slug text;
BEGIN
 old_slug:=CASE WHEN TG_OP='UPDATE' THEN OLD.slug ELSE '' END;
 automatic:=TG_OP='INSERT' OR (NEW.slug=old_slug AND NEW.slug ~ '^r-[0-9a-f]{10}(-[0-9]+)?$') OR (TG_OP='UPDATE' AND NEW.name IS DISTINCT FROM OLD.name AND NEW.slug=public.restaurant_name_slug(NEW.name));
 IF TG_OP='INSERT' AND (NEW.slug IS NULL OR NEW.slug ~ '^r-[0-9a-f]{10}(-[0-9]+)?$') OR (TG_OP='UPDATE' AND automatic) THEN base:=public.restaurant_name_slug(NEW.name); ELSE base:=NEW.slug; END IF;
 IF base IS NULL OR char_length(base) NOT BETWEEN 3 AND 80 OR base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Use um endereço de 3 a 80 caracteres, com letras minúsculas, números e hífens.' USING ERRCODE='22023'; END IF;
 -- A global namespace lock avoids cross-table alias races and rename deadlocks.
 PERFORM pg_advisory_xact_lock(774416160004::bigint);
 candidate:=base;
 WHILE EXISTS(SELECT 1 FROM restaurants WHERE slug=candidate AND id<>NEW.id) OR EXISTS(SELECT 1 FROM restaurant_slug_aliases WHERE slug=candidate AND restaurant_id<>NEW.id) LOOP
  IF NOT automatic THEN RAISE EXCEPTION 'Este endereço já está em uso. Escolha outro.' USING ERRCODE='23505'; END IF;
  suffix:=suffix+1;candidate:=left(base,79-char_length(suffix::text))||'-'||suffix::text;
 END LOOP;
 IF TG_OP='UPDATE' AND old_slug<>candidate THEN
  INSERT INTO restaurant_slug_aliases(slug,restaurant_id) VALUES(old_slug,NEW.id) ON CONFLICT(slug) DO NOTHING;
 END IF;
 NEW.slug:=candidate;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.preserve_restaurant_slug() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS preserve_restaurant_slug ON public.restaurants;
CREATE TRIGGER preserve_restaurant_slug BEFORE INSERT OR UPDATE OF name,slug ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.preserve_restaurant_slug();
CREATE OR REPLACE FUNCTION public.resolve_restaurant_slug(p_slug text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT r.slug FROM restaurants r WHERE r.slug=p_slug
 UNION ALL SELECT r.slug FROM restaurant_slug_aliases a JOIN restaurants r ON r.id=a.restaurant_id WHERE a.slug=p_slug LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.resolve_restaurant_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_restaurant_slug(text) TO anon,authenticated;
UPDATE public.restaurants SET slug=slug WHERE slug ~ '^r-[0-9a-f]{10}(-[0-9]+)?$';

CREATE OR REPLACE FUNCTION public.staff_login(p_slug text,p_pin text)
RETURNS TABLE(token text,staff_id uuid,name text,role text,restaurant_slug text,restaurant_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r record; s record; n integer; v_token text;
BEGIN
  SELECT id,restaurants.name INTO r FROM restaurants WHERE slug=public.resolve_restaurant_slug(p_slug);
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO staff_login_attempts VALUES(r.id,now(),1)
    ON CONFLICT(restaurant_id) DO UPDATE SET
      attempts=CASE WHEN staff_login_attempts.window_started<now()-interval '5 minutes' THEN 1 ELSE staff_login_attempts.attempts+1 END,
      window_started=CASE WHEN staff_login_attempts.window_started<now()-interval '5 minutes' THEN now() ELSE staff_login_attempts.window_started END
    RETURNING attempts INTO n;
  -- Return an empty result on failure: raising would roll back the attempt counter.
  IF n>30 OR p_pin IS NULL OR p_pin !~ '^\d{4}$' THEN RETURN; END IF;
  SELECT sm.* INTO s FROM staff_members sm WHERE sm.restaurant_id=r.id AND sm.active AND sm.pin_hash IS NOT NULL
    AND extensions.crypt(p_pin,sm.pin_hash)=sm.pin_hash LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO staff_sessions(token,staff_id,restaurant_id,expires_at) VALUES(v_token,s.id,r.id,now()+interval '12 hours');
  RETURN QUERY SELECT v_token,s.id,s.name,s.role,p_slug,r.name;
END $$;


NOTIFY pgrst, 'reload schema';
$pending_links$;
 END IF;
END $links$;
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

-- Platform privileges are granted by database administrators, never by profile metadata.
CREATE TABLE IF NOT EXISTS public.platform_admins(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_entitlements(
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true,
 plan_type text NOT NULL CHECK(plan_type IN ('trial','basic','essential','pro','enterprise')),
 trial_ends_at timestamptz NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_audit_log(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 actor_email text NOT NULL, target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
 action text NOT NULL CHECK(action IN ('set_plan','extend_trial','restore_billing')),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 500),
 before_state jsonb NOT NULL, after_state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_target_date ON public.platform_audit_log(target_user_id,created_at DESC);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins,public.platform_entitlements,public.platform_audit_log FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM platform_admins WHERE user_id=auth.uid() AND active);
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_require_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Acesso exclusivo da gestão Flux' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.platform_require_admin() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.effective_entitlement(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('plan_type',CASE WHEN e.enabled THEN e.plan_type ELSE p.plan_type END,
 'trial_ends_at',CASE WHEN e.enabled THEN e.trial_ends_at ELSE p.trial_ends_at END,
 'plan_source',CASE WHEN e.enabled THEN 'manual' ELSE 'billing' END,
 'version',coalesce(e.version,0)) FROM profiles p LEFT JOIN platform_entitlements e ON e.user_id=p.id WHERE p.id=p_user_id;
$$;
REVOKE ALL ON FUNCTION public.effective_entitlement(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_my_entitlement() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.effective_entitlement(auth.uid()); $$;
REVOKE ALL ON FUNCTION public.get_my_entitlement() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlement() TO authenticated;
CREATE OR REPLACE FUNCTION public.get_restaurant_plan(p_slug text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN e->>'plan_type'='trial' AND (e->>'trial_ends_at')::timestamptz<now() THEN 'basic' ELSE e->>'plan_type' END
 FROM restaurants r CROSS JOIN LATERAL public.effective_entitlement(r.owner_id) e WHERE r.slug=p_slug LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_restaurant_plan(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_plan(text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.platform_list_restaurants(p_search text DEFAULT '',p_status text DEFAULT 'all',p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; term text;
BEGIN
 PERFORM public.platform_require_admin();
 IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 100000 OR p_status IS NULL OR p_status NOT IN ('all','trial','expired','paid','manual') THEN RAISE EXCEPTION 'Filtro inválido'; END IF;
 term:='%'||replace(replace(replace(left(coalesce(p_search,''),120),'\','\\'),'%','\%'),'_','\_')||'%';
 WITH base AS (
 SELECT r.id,r.name,r.slug,r.created_at,r.currency,r.owner_id,u.email AS owner_email,p.display_name AS owner_name,
 public.effective_entitlement(r.owner_id) AS entitlement
 FROM restaurants r JOIN profiles p ON p.id=r.owner_id JOIN auth.users u ON u.id=r.owner_id
 ), filtered AS (
 SELECT * FROM base WHERE (name ILIKE term OR slug ILIKE term OR owner_email ILIKE term OR owner_name ILIKE term)
 AND (p_status='all' OR (p_status='manual' AND entitlement->>'plan_source'='manual')
 OR (p_status='trial' AND entitlement->>'plan_type'='trial' AND (entitlement->>'trial_ends_at')::timestamptz>=now())
 OR (p_status='expired' AND entitlement->>'plan_type'='trial' AND (entitlement->>'trial_ends_at')::timestamptz<now())
 OR (p_status='paid' AND entitlement->>'plan_type'<>'trial'))
 ), page AS (
 SELECT f.*,coalesce(o.orders_30d,0) AS orders_30d,coalesce(o.sales_30d,0) AS sales_30d,o.last_order_at
 FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET p_page*25) f
 LEFT JOIN LATERAL(SELECT count(*) FILTER(WHERE created_at>=now()-interval '30 days') AS orders_30d,
 sum(coalesce(subtotal,0)+coalesce(service_fee,0)+coalesce(cover_charge,0)) FILTER(WHERE created_at>=now()-interval '30 days' AND status::text='served') AS sales_30d,max(created_at) AS last_order_at
 FROM orders WHERE restaurant_id=f.id) o ON true
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'page',p_page,'items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb),
 'stats',jsonb_build_object('restaurants',(SELECT count(*) FROM base),
 'trial',(SELECT count(*) FROM base WHERE entitlement->>'plan_type'='trial' AND (entitlement->>'trial_ends_at')::timestamptz>=now()),
 'expired',(SELECT count(*) FROM base WHERE entitlement->>'plan_type'='trial' AND (entitlement->>'trial_ends_at')::timestamptz<now()),
 'paid',(SELECT count(*) FROM base WHERE entitlement->>'plan_type'<>'trial'),
 'manual',(SELECT count(*) FROM base WHERE entitlement->>'plan_source'='manual'))) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.platform_list_restaurants(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_list_restaurants(text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_restaurant_detail(p_restaurant_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; result jsonb;
BEGIN
 PERFORM public.platform_require_admin();
 SELECT * INTO r FROM restaurants WHERE id=p_restaurant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante não encontrado'; END IF;
 SELECT jsonb_build_object('restaurant',to_jsonb(r),'entitlement',public.effective_entitlement(r.owner_id),
 'owner',jsonb_build_object('id',u.id,'email',u.email,'name',p.display_name,'created_at',p.created_at,'last_sign_in_at',to_jsonb(u)->>'last_sign_in_at','phone',to_jsonb(u)->>'phone','billing_plan',p.plan_type,'billing_trial_ends_at',p.trial_ends_at),
 'counts',jsonb_build_object('restaurants',(SELECT count(*) FROM restaurants WHERE owner_id=r.owner_id),'products',(SELECT count(*) FROM menu_items WHERE restaurant_id=r.id),'available_products',(SELECT count(*) FROM menu_items WHERE restaurant_id=r.id AND is_available),'categories',(SELECT count(*) FROM categories WHERE restaurant_id=r.id),'tables',(SELECT count(*) FROM venue_tables WHERE restaurant_id=r.id),'staff',(SELECT count(*) FROM staff_members WHERE restaurant_id=r.id AND active)),
 'orders',(SELECT jsonb_build_object('total',count(*),'open',count(*) FILTER(WHERE NOT coalesce(archived,false) AND status::text<>'cancelled'),'cancelled',count(*) FILTER(WHERE status::text='cancelled'),'delivered',count(*) FILTER(WHERE status::text='served'),'sales',coalesce(sum(coalesce(subtotal,0)+coalesce(service_fee,0)+coalesce(cover_charge,0)) FILTER(WHERE status::text='served'),0),'last_at',max(created_at)) FROM orders WHERE restaurant_id=r.id),
 'subscriptions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY created_at DESC) FROM (
 SELECT stripe_subscription_id,status,plan_type,environment,current_period_end,cancel_at_period_end,created_at FROM subscriptions WHERE user_id=r.owner_id ORDER BY created_at DESC LIMIT 20) s),'[]'::jsonb),
 'audit',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at DESC,id DESC) FROM (
 SELECT id,actor_email,action,reason,before_state,after_state,created_at FROM platform_audit_log WHERE target_user_id=r.owner_id ORDER BY created_at DESC,id DESC LIMIT 50) a),'[]'::jsonb)) INTO result
 FROM profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=r.owner_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.platform_restaurant_detail(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_restaurant_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_change_entitlement(p_restaurant_id uuid,p_action text,p_plan text,p_days integer,p_reason text,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; before_value jsonb; after_value jsonb; next_plan text; next_trial timestamptz; v bigint; actor text;
BEGIN
 PERFORM public.platform_require_admin();
 IF p_action IS NULL OR p_action NOT IN ('set_plan','extend_trial','restore_billing') OR char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Informe uma ação e um motivo de 5 a 500 caracteres'; END IF;
 SELECT * INTO r FROM restaurants WHERE id=p_restaurant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante não encontrado'; END IF;
 -- Account-level lock also protects the first override from concurrent administrators.
 PERFORM 1 FROM profiles WHERE id=r.owner_id FOR UPDATE;
 before_value:=public.effective_entitlement(r.owner_id);
 v:=(before_value->>'version')::bigint;
 IF p_expected_version IS DISTINCT FROM v THEN RAISE EXCEPTION 'Este cliente foi atualizado por outra ação. Recarregue os dados antes de confirmar.' USING ERRCODE='40001'; END IF;
 next_plan:=before_value->>'plan_type';next_trial:=(before_value->>'trial_ends_at')::timestamptz;
 IF p_action='set_plan' THEN
 IF p_plan IS NULL OR p_plan NOT IN ('trial','basic','essential','pro','enterprise') THEN RAISE EXCEPTION 'Plano inválido'; END IF;
 next_plan:=p_plan;
 IF p_plan='trial' THEN
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Informe de 1 a 365 dias de teste'; END IF;
 next_trial:=now()+make_interval(days=>p_days);
 ELSIF p_days IS NOT NULL THEN RAISE EXCEPTION 'Dias extras só se aplicam ao trial'; END IF;
 ELSIF p_action='extend_trial' THEN
 IF next_plan<>'trial' OR p_days IS NULL OR p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'A extensão exige um cliente em trial e de 1 a 365 dias'; END IF;
 next_trial:=greatest(next_trial,now())+make_interval(days=>p_days);
 END IF;
 INSERT INTO platform_entitlements(user_id,enabled,plan_type,trial_ends_at,version,updated_by)
 VALUES(r.owner_id,p_action<>'restore_billing',next_plan,next_trial,v+1,auth.uid())
 ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,plan_type=EXCLUDED.plan_type,trial_ends_at=EXCLUDED.trial_ends_at,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=now();
 after_value:=public.effective_entitlement(r.owner_id);
 SELECT email INTO actor FROM auth.users WHERE id=auth.uid();
 INSERT INTO platform_audit_log(actor_id,actor_email,target_user_id,restaurant_id,action,reason,before_state,after_state)
 VALUES(auth.uid(),coalesce(actor,'Conta removida'),r.owner_id,r.id,p_action,btrim(p_reason),before_value,after_value);
 RETURN after_value;
END $$;
REVOKE ALL ON FUNCTION public.platform_change_entitlement(uuid,text,text,integer,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_change_entitlement(uuid,text,text,integer,text,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';

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

-- Keep trusted relations ahead of temporary schemas in every platform authorization path.
ALTER FUNCTION public.is_platform_admin() SET search_path=public,pg_temp;
ALTER FUNCTION public.platform_require_admin() SET search_path=public,pg_temp;
ALTER FUNCTION public.effective_entitlement(uuid) SET search_path=public,pg_temp;
ALTER FUNCTION public.get_my_entitlement() SET search_path=public,pg_temp;
ALTER FUNCTION public.get_restaurant_plan(text) SET search_path=public,pg_temp;
ALTER FUNCTION public.platform_change_entitlement(uuid,text,text,integer,text,bigint) SET search_path=public,pg_temp;
-- Private operational health. No customer can query this view directly.
CREATE OR REPLACE VIEW public.platform_restaurant_health WITH(security_barrier=true) AS
WITH raw AS (
 SELECT r.id,r.name,r.slug,r.owner_id,r.created_at,r.currency,p.created_at AS account_created_at,
 u.email AS owner_email,p.display_name AS owner_name,public.effective_entitlement(r.owner_id) AS entitlement,
 coalesce(m.products,0) AS products,coalesce(m.available_products,0) AS available_products,
 coalesce(t.tables,0) AS tables,r.operating_hours IS NOT NULL AS hours_ready,
 o.first_order_at,o.last_order_at,coalesce(o.orders_30d,0) AS orders_30d,coalesce(o.sales_30d,0) AS sales_30d,
 coalesce(b.subscription_active,false) AS subscription_active,
 coalesce(b.subscription_attention,false) AND NOT coalesce(b.subscription_active,false) AS subscription_attention
 FROM public.restaurants r JOIN public.profiles p ON p.id=r.owner_id JOIN auth.users u ON u.id=r.owner_id
 LEFT JOIN LATERAL(SELECT count(*) AS products,count(*) FILTER(WHERE m.is_available AND c.is_active) AS available_products FROM menu_items m JOIN categories c ON c.id=m.category_id AND c.restaurant_id=r.id WHERE m.restaurant_id=r.id) m ON true
 LEFT JOIN LATERAL(SELECT count(*) AS tables FROM venue_tables WHERE restaurant_id=r.id) t ON true
 LEFT JOIN LATERAL(SELECT
 min(created_at) FILTER(WHERE status::text<>'cancelled') AS first_order_at,
 max(created_at) FILTER(WHERE status::text<>'cancelled') AS last_order_at,
 count(*) FILTER(WHERE created_at>=now()-interval '30 days') AS orders_30d,
 sum(coalesce(subtotal,0)+coalesce(service_fee,0)+coalesce(cover_charge,0)) FILTER(WHERE status::text='served' AND created_at>=now()-interval '30 days') AS sales_30d
 FROM orders WHERE restaurant_id=r.id AND created_at<=now()) o ON true
 LEFT JOIN LATERAL(SELECT
 bool_or(environment='live' AND status='active') AS subscription_active,
 bool_or(environment='live' AND status IN ('past_due','unpaid','paused')) AS subscription_attention
 FROM subscriptions WHERE user_id=r.owner_id) b ON true
), progress AS (
 SELECT *,available_products>0 AS menu_ready,tables>0 AS tables_ready,first_order_at IS NOT NULL AS first_order_ready,
 (available_products>0)::integer+(tables>0)::integer+hours_ready::integer+(first_order_at IS NOT NULL)::integer AS completed_steps,
 entitlement->>'plan_type'='trial' AND (entitlement->>'trial_ends_at')::timestamptz>now() AS trial_active,
 entitlement->>'plan_type'='trial' AND (entitlement->>'trial_ends_at')::timestamptz<=now() AND (entitlement->>'trial_ends_at')::timestamptz>to_timestamp(0) AS trial_expired,
 entitlement->>'plan_type'='trial' AND (entitlement->>'trial_ends_at')::timestamptz>now() AND (entitlement->>'trial_ends_at')::timestamptz<=now()+interval '3 days' AS trial_ending,
 entitlement->>'plan_source'='manual' AND entitlement->>'plan_type'<>'trial' AS manual_plan
 FROM raw
), flags AS (
 SELECT *,completed_steps<4 AND created_at<=now()-interval '2 days' AS setup_attention,
 last_order_at IS NOT NULL AND last_order_at<=now()-interval '10 days' AS inactive_attention
 FROM progress
)
SELECT *,trial_ending OR trial_expired OR setup_attention OR inactive_attention OR subscription_attention AS needs_attention,
 CASE WHEN trial_ending THEN 1 WHEN subscription_attention THEN 2 WHEN trial_expired THEN 3 WHEN setup_attention THEN 4 WHEN inactive_attention THEN 5 ELSE 6 END AS attention_priority
FROM flags;
REVOKE ALL ON public.platform_restaurant_health FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.platform_growth_overview(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE start_at timestamptz; previous_start timestamptz; previous_end timestamptz; local_now timestamp; result jsonb;
BEGIN
 PERFORM public.platform_require_admin();
 IF p_days IS NULL OR p_days NOT IN (7,30,90) THEN RAISE EXCEPTION 'Escolha 7, 30 ou 90 dias'; END IF;
 local_now:=now() AT TIME ZONE 'America/Sao_Paulo';
 start_at:=(local_now::date-(p_days-1))::timestamp AT TIME ZONE 'America/Sao_Paulo';
 previous_start:=(local_now::date-(2*p_days-1))::timestamp AT TIME ZONE 'America/Sao_Paulo';
 previous_end:=((local_now::date-p_days)+local_now::time) AT TIME ZONE 'America/Sao_Paulo';
 WITH health AS MATERIALIZED(SELECT * FROM platform_restaurant_health),
 cohort AS(SELECT owner_id,bool_or(subscription_active) AS converted,bool_or(manual_plan AND NOT subscription_active) AS manual_only FROM health WHERE account_created_at>=start_at AND account_created_at<=now() GROUP BY owner_id),
 days AS(SELECT generate_series(local_now::date-(p_days-1),local_now::date,interval '1 day')::date AS day),
 registrations AS(SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,count(*) AS n FROM health WHERE created_at>=start_at AND created_at<=now() GROUP BY 1),
 queue AS(SELECT * FROM health WHERE needs_attention ORDER BY attention_priority,(CASE WHEN trial_ending THEN (entitlement->>'trial_ends_at')::timestamptz END),created_at DESC,id LIMIT 20)
 SELECT jsonb_build_object('generated_at',now(),'timezone','America/Sao_Paulo','days',p_days,'period_start',start_at,'previous_start',previous_start,'previous_end',previous_end,
 'totals',jsonb_build_object('restaurants',(SELECT count(*) FROM health),'new_restaurants',(SELECT count(*) FROM health WHERE created_at>=start_at AND created_at<=now()),'previous_new',(SELECT count(*) FROM health WHERE created_at>=previous_start AND created_at<=previous_end),
 'active_7d',(SELECT count(*) FROM health WHERE last_order_at>=now()-interval '7 days'),'active_30d',(SELECT count(*) FROM health WHERE last_order_at>=now()-interval '30 days'),
 'ready',(SELECT count(*) FROM health WHERE completed_steps=4),'attention',(SELECT count(*) FROM health WHERE needs_attention),
 'trial_active',(SELECT count(*) FROM health WHERE trial_active),'trial_ending',(SELECT count(*) FROM health WHERE trial_ending),'trial_expired',(SELECT count(*) FROM health WHERE trial_expired),
 'manual_plans',(SELECT count(DISTINCT owner_id) FROM health WHERE manual_plan),'subscriptions_active',(SELECT count(DISTINCT owner_id) FROM health WHERE subscription_active)),
 'cohort',jsonb_build_object('accounts',(SELECT count(*) FROM cohort),'converted',(SELECT count(*) FROM cohort WHERE converted),'manual_only',(SELECT count(*) FROM cohort WHERE manual_only)),
 'onboarding',jsonb_build_object('menu',(SELECT count(*) FROM health WHERE menu_ready),'tables',(SELECT count(*) FROM health WHERE tables_ready),'hours',(SELECT count(*) FROM health WHERE hours_ready),'first_order',(SELECT count(*) FROM health WHERE first_order_ready)),
 'registrations',coalesce((SELECT jsonb_agg(jsonb_build_object('date',d.day,'count',coalesce(r.n,0)) ORDER BY d.day) FROM days d LEFT JOIN registrations r USING(day)),'[]'::jsonb),
 'attention',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY attention_priority,(CASE WHEN trial_ending THEN (entitlement->>'trial_ends_at')::timestamptz END),created_at DESC,id) FROM queue q),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.platform_growth_overview(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_growth_overview(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_list_restaurants(p_search text DEFAULT '',p_status text DEFAULT 'all',p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; term text;
BEGIN
 PERFORM public.platform_require_admin();
 IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 100000 OR p_status IS NULL OR p_status NOT IN ('all','trial','expired','paid','manual','manual_plan','ending','new7','new30','new90','active7','active','inactive','setup','never_ordered','attention','subscribed') THEN RAISE EXCEPTION 'Filtro inválido'; END IF;
 term:='%'||replace(replace(replace(left(coalesce(p_search,''),120),'\','\\'),'%','\%'),'_','\_')||'%';
 WITH health AS MATERIALIZED(SELECT * FROM platform_restaurant_health), filtered AS(
 SELECT * FROM health WHERE (name ILIKE term OR slug ILIKE term OR owner_email ILIKE term OR owner_name ILIKE term)
 AND (p_status='all' OR (p_status='trial' AND trial_active) OR (p_status='expired' AND trial_expired)
 OR(p_status='paid' AND entitlement->>'plan_type'<>'trial') OR(p_status='manual' AND entitlement->>'plan_source'='manual') OR(p_status='manual_plan' AND manual_plan)
 OR(p_status='ending' AND trial_ending) OR(p_status IN ('new7','new30','new90') AND created_at>=(((now() AT TIME ZONE 'America/Sao_Paulo')::date-(CASE p_status WHEN 'new7' THEN 6 WHEN 'new30' THEN 29 ELSE 89 END))::timestamp AT TIME ZONE 'America/Sao_Paulo') AND created_at<=now())
 OR(p_status='active7' AND last_order_at>=now()-interval '7 days')
 OR(p_status='active' AND last_order_at>=now()-interval '30 days') OR(p_status='inactive' AND inactive_attention)
 OR(p_status='setup' AND completed_steps<4) OR(p_status='never_ordered' AND NOT first_order_ready)
 OR(p_status='attention' AND needs_attention) OR(p_status='subscribed' AND subscription_active))
 ), page AS(SELECT h.*,to_jsonb(h) AS health FROM filtered h ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET p_page*25)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'page',p_page,'items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY created_at DESC,id DESC) FROM page p),'[]'::jsonb),
 'stats',jsonb_build_object('restaurants',(SELECT count(*) FROM health),'trial',(SELECT count(*) FROM health WHERE trial_active),'expired',(SELECT count(*) FROM health WHERE trial_expired),'paid',(SELECT count(*) FROM health WHERE entitlement->>'plan_type'<>'trial'),'manual',(SELECT count(*) FROM health WHERE entitlement->>'plan_source'='manual'))) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.platform_list_restaurants(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_list_restaurants(text,text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_restaurant_detail(p_restaurant_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; result jsonb;
BEGIN
 PERFORM public.platform_require_admin();
 SELECT * INTO r FROM restaurants WHERE id=p_restaurant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante não encontrado'; END IF;
 SELECT jsonb_build_object('restaurant',to_jsonb(r),'entitlement',public.effective_entitlement(r.owner_id),
 'owner',jsonb_build_object('id',u.id,'email',u.email,'name',p.display_name,'created_at',p.created_at,'last_sign_in_at',to_jsonb(u)->>'last_sign_in_at','phone',to_jsonb(u)->>'phone','billing_plan',p.plan_type,'billing_trial_ends_at',p.trial_ends_at),
 'counts',jsonb_build_object('restaurants',(SELECT count(*) FROM restaurants WHERE owner_id=r.owner_id),'products',(SELECT count(*) FROM menu_items WHERE restaurant_id=r.id),'available_products',(SELECT count(*) FROM menu_items WHERE restaurant_id=r.id AND is_available),'categories',(SELECT count(*) FROM categories WHERE restaurant_id=r.id),'tables',(SELECT count(*) FROM venue_tables WHERE restaurant_id=r.id),'staff',(SELECT count(*) FROM staff_members WHERE restaurant_id=r.id AND active)),
 'orders',(SELECT jsonb_build_object('total',count(*),'open',count(*) FILTER(WHERE NOT coalesce(archived,false) AND status::text<>'cancelled'),'cancelled',count(*) FILTER(WHERE status::text='cancelled'),'delivered',count(*) FILTER(WHERE status::text='served'),'sales',coalesce(sum(coalesce(subtotal,0)+coalesce(service_fee,0)+coalesce(cover_charge,0)) FILTER(WHERE status::text='served'),0),'last_at',max(created_at)) FROM orders WHERE restaurant_id=r.id),
 'subscriptions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY created_at DESC) FROM (
 SELECT stripe_subscription_id,status,plan_type,environment,current_period_end,cancel_at_period_end,created_at FROM subscriptions WHERE user_id=r.owner_id ORDER BY created_at DESC LIMIT 20) s),'[]'::jsonb),
 'audit',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at DESC,id DESC) FROM (
 SELECT id,actor_email,action,reason,before_state,after_state,created_at FROM platform_audit_log WHERE target_user_id=r.owner_id ORDER BY created_at DESC,id DESC LIMIT 50) a),'[]'::jsonb)) INTO result
 FROM profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=r.owner_id;
 RETURN result || jsonb_build_object('health',(SELECT to_jsonb(h) FROM public.platform_restaurant_health h WHERE h.id=p_restaurant_id));
END $$;
REVOKE ALL ON FUNCTION public.platform_restaurant_detail(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_restaurant_detail(uuid) TO authenticated;


NOTIFY pgrst,'reload schema';

-- Four-digit codes are explicitly issued by staff, never recreated by polling.
CREATE OR REPLACE FUNCTION public.table_order_code(p_table_id uuid,p_staff_token text DEFAULT NULL,p_rotate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE rid uuid; s record; c record; next_code text;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   SELECT * INTO s FROM public.staff_session_info(p_staff_token);
   IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text,4));
 SELECT * INTO c FROM table_order_codes WHERE table_id=p_table_id;
 IF p_rotate THEN
   LOOP
     -- 16 random bits, rejection sampling avoids modulo bias.
     next_code:=encode(extensions.gen_random_bytes(2),'hex');
     EXIT WHEN ('x'||next_code)::bit(16)::integer < 60000
       AND lpad((('x'||next_code)::bit(16)::integer % 10000)::text,4,'0') IS DISTINCT FROM c.code;
   END LOOP;
   next_code:=lpad((('x'||next_code)::bit(16)::integer % 10000)::text,4,'0');
   INSERT INTO table_order_codes(table_id,restaurant_id,code,expires_at)
   VALUES(p_table_id,rid,next_code,now()+interval '24 hours')
   ON CONFLICT(table_id) DO UPDATE SET code=EXCLUDED.code,expires_at=EXCLUDED.expires_at RETURNING * INTO c;
 END IF;
 IF c.table_id IS NULL OR c.expires_at<=now() OR c.code !~ '^[0-9]{4}$' THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('code',c.code,'expires_at',c.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.table_order_code(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.table_order_code(uuid,text,boolean) TO anon,authenticated;
-- Old long codes cannot remain valid after the upgrade.
DELETE FROM public.table_order_codes WHERE code !~ '^[0-9]{4}$';

CREATE OR REPLACE FUNCTION public.check_table_order_code(p_table_id uuid,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text,4));
 IF EXISTS(SELECT 1 FROM venue_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.id=p_table_id AND r.require_table_code)
 AND (coalesce(p_code,'') !~ '^[0-9]{4}$' OR NOT EXISTS(SELECT 1 FROM table_order_codes WHERE table_id=p_table_id AND code=p_code AND expires_at>now())) THEN
 RAISE EXCEPTION 'Código da mesa inválido ou expirado. Peça os quatro dígitos ao garçom.' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.check_table_order_code(uuid,text) FROM PUBLIC,anon,authenticated;

-- Closing a table, its calls and its code is one transaction, including empty tables.
CREATE OR REPLACE FUNCTION public.release_table(
 p_restaurant_id uuid,p_table_label text,p_staff_token text DEFAULT NULL,
 p_service_fee numeric DEFAULT 0,p_cover_charge numeric DEFAULT 0
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid:=p_restaurant_id; s record; tid uuid; canonical text; ids uuid[]; primary_id uuid;
BEGIN
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO s FROM public.staff_session_info(p_staff_token);
   IF s.restaurant_id IS NULL OR coalesce(s.role,'') NOT IN ('waiter','both') OR (rid IS NOT NULL AND rid<>s.restaurant_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   rid:=s.restaurant_id;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado';
 END IF;
 IF p_service_fee IS NULL OR p_cover_charge IS NULL OR p_service_fee<0 OR p_cover_charge<0 OR p_service_fee>1000000 OR p_cover_charge>1000000 THEN RAISE EXCEPTION 'Taxas inválidas'; END IF;
 SELECT id,label INTO tid,canonical FROM venue_tables WHERE restaurant_id=rid
 AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(p_table_label,'^(Mesa\s*)+','','i')));
 IF tid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(tid::text,4));
 SELECT coalesce(array_agg(id ORDER BY created_at,id),'{}'::uuid[]) INTO ids FROM orders
 WHERE restaurant_id=rid AND NOT coalesce(archived,false) AND status::text<>'cancelled'
 AND (table_id=tid OR (table_id IS NULL AND lower(btrim(regexp_replace(table_label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(canonical,'^(Mesa\s*)+','','i')))));
 primary_id:=ids[1];
 IF primary_id IS NOT NULL AND (p_service_fee>0 OR p_cover_charge>0) THEN
 UPDATE orders SET service_fee=p_service_fee,cover_charge=p_cover_charge WHERE id=primary_id;
 END IF;
 UPDATE orders SET archived=true,status='served',updated_at=now() WHERE id=ANY(ids);
 UPDATE waiter_calls SET resolved=true,resolved_at=now() WHERE restaurant_id=rid AND NOT resolved
 AND lower(btrim(regexp_replace(table_label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(canonical,'^(Mesa\s*)+','','i')));
 DELETE FROM table_order_codes WHERE table_id=tid;
 RETURN ids;
END $$;
REVOKE ALL ON FUNCTION public.release_table(uuid,text,text,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_table(uuid,text,text,numeric,numeric) TO anon,authenticated;

-- Operation hardening: kitchen visibility is independent from table checkout.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kitchen_hidden boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.guard_order_direction() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT NEW.archived AND NOT (
   (OLD.status='pending' AND NEW.status IN ('accepted','preparing','cancelled')) OR
   (OLD.status='accepted' AND NEW.status IN ('preparing','cancelled')) OR
   (OLD.status='preparing' AND NEW.status IN ('ready','cancelled')) OR
   (OLD.status='ready' AND NEW.status IN ('served','cancelled'))
 ) THEN RAISE EXCEPTION 'Este pedido já foi atualizado. Atualize a fila antes de continuar.' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_order_direction ON public.orders;
CREATE TRIGGER guard_order_direction BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_direction();
REVOKE ALL ON FUNCTION public.guard_order_direction() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.hide_completed_orders(p_restaurant_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=p_restaurant_id AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 UPDATE orders SET kitchen_hidden=true WHERE restaurant_id=p_restaurant_id AND status IN ('served','cancelled') AND NOT kitchen_hidden;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.hide_completed_orders(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hide_completed_orders(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.transition_order(p_order_id uuid,p_expected_status text,p_next_status text,p_staff_token text DEFAULT NULL,p_delivered_by text DEFAULT NULL,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid; s record; staff_name text;
BEGIN
 SELECT restaurant_id INTO rid FROM orders WHERE id=p_order_id;
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO s FROM staff_session_info(p_staff_token);
   IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','kitchen','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   IF (p_next_status IN ('accepted','preparing','ready') AND s.role NOT IN ('kitchen','both')) OR (p_next_status IN ('served','cancelled') AND s.role NOT IN ('waiter','both')) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   staff_name:=s.name;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Acesso negado';
 ELSE staff_name:=left(nullif(btrim(p_delivered_by),''),80); END IF;
 IF p_next_status NOT IN ('accepted','preparing','ready','served','cancelled') OR p_next_status IS NULL OR p_expected_status IS NULL THEN RAISE EXCEPTION 'Etapa inválida'; END IF;
 UPDATE orders SET status=p_next_status::public.order_status,
 delivered_by_name=CASE WHEN p_next_status='served' THEN staff_name ELSE delivered_by_name END,
 delivered_at=CASE WHEN p_next_status='served' THEN coalesce(delivered_at,now()) ELSE delivered_at END,
 cancellation_reason=CASE WHEN p_next_status='cancelled' THEN left(p_reason,280) ELSE cancellation_reason END
 WHERE id=p_order_id AND restaurant_id=rid AND NOT archived AND status::text=p_expected_status;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outra pessoa já atualizou este pedido. A fila será recarregada.' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.transition_order(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_order(uuid,text,text,text,text,text) TO anon,authenticated;
-- Legacy clients cannot overwrite a newer status without an expected version.
REVOKE EXECUTE ON FUNCTION public.staff_update_order_status(text,uuid,text,text) FROM anon,authenticated;

-- Budgets commit even when the inner validation fails. No IP or client identity is trusted.
CREATE TABLE IF NOT EXISTS public.public_action_budgets(
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 table_id uuid NOT NULL, action text NOT NULL, window_start timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0, failures integer NOT NULL DEFAULT 0,
 PRIMARY KEY(restaurant_id,table_id,action)
);
ALTER TABLE public.public_action_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_action_budgets FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.public_request_budget(p_rid uuid,p_tid uuid,p_action text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE total integer; n integer; bad integer; minute timestamptz:=date_trunc('minute',clock_timestamp());
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_rid::text,0));
 INSERT INTO public_action_budgets AS b VALUES(p_rid,'00000000-0000-0000-0000-000000000000','all',minute,1,0)
 ON CONFLICT(restaurant_id,table_id,action) DO UPDATE SET window_start=EXCLUDED.window_start,attempts=CASE WHEN b.window_start=minute THEN b.attempts+1 ELSE 1 END RETURNING attempts INTO total;
 IF total>120 THEN RETURN false; END IF;
 INSERT INTO public_action_budgets AS b VALUES(p_rid,p_tid,p_action,minute,1,0)
 ON CONFLICT(restaurant_id,table_id,action) DO UPDATE SET window_start=EXCLUDED.window_start,attempts=CASE WHEN b.window_start=minute THEN b.attempts+1 ELSE 1 END,failures=CASE WHEN b.window_start=minute THEN b.failures ELSE 0 END RETURNING attempts,failures INTO n,bad;
 RETURN n<=CASE WHEN p_action='order' THEN 20 ELSE 6 END AND bad<5;
END $$;
REVOKE ALL ON FUNCTION public.public_request_budget(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.submit_public_order(p_restaurant_id uuid,p_table_label text,p_customer_name text,p_customer_phone text,p_currency text,p_items jsonb,p_tracking_token text,p_table_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE tid uuid; result uuid; msg text; state text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text,0));
 -- A committed retry must not consume budget or create another order.
 SELECT id INTO result FROM orders WHERE restaurant_id=p_restaurant_id AND tracking_token_hash=encode(extensions.digest(p_tracking_token,'sha256'),'hex');
 IF result IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'order_id',result); END IF;
 SELECT id INTO tid FROM venue_tables WHERE restaurant_id=p_restaurant_id AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(p_table_label,'^(Mesa\s*)+','','i')));
 IF tid IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Mesa inválida','code','22023'); END IF;
 IF NOT public_request_budget(p_restaurant_id,tid,'order') THEN RETURN jsonb_build_object('ok',false,'message','Muitas tentativas nesta mesa. Aguarde um minuto ou procure o garçom.','code','RATE_LIMIT'); END IF;
 BEGIN
 result:=public.place_order(p_restaurant_id,p_table_label,p_customer_name,p_customer_phone,p_currency,p_items,p_tracking_token,p_table_code);
 RETURN jsonb_build_object('ok',true,'order_id',result);
 EXCEPTION WHEN OTHERS THEN
 GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
 UPDATE public_action_budgets SET failures=failures+1 WHERE restaurant_id=p_restaurant_id AND table_id=tid AND action='order';
 RETURN jsonb_build_object('ok',false,'message',CASE WHEN state IN ('22023','P0001') THEN msg ELSE 'Não foi possível enviar. Confira o carrinho e tente novamente.' END,'code',state);
 END;
END $$;
REVOKE ALL ON FUNCTION public.submit_public_order(uuid,text,text,text,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_order(uuid,text,text,text,text,jsonb,text,text) TO anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.place_order(uuid,text,text,text,text,jsonb,text,text),public.place_order(uuid,text,text,text,text,jsonb,text) FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.submit_public_call(p_restaurant_id uuid,p_table_label text,p_customer_name text,p_message text,p_kind text,p_table_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tid uuid; msg text; state text;
BEGIN
 SELECT id INTO tid FROM venue_tables WHERE restaurant_id=p_restaurant_id AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(p_table_label,'^(Mesa\s*)+','','i')));
 IF tid IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Mesa inválida'); END IF;
 IF NOT public_request_budget(p_restaurant_id,tid,'call') THEN RETURN jsonb_build_object('ok',false,'message','Aguarde um minuto antes de chamar novamente.','code','RATE_LIMIT'); END IF;
 BEGIN
 PERFORM public.public_waiter_call(p_restaurant_id,p_table_label,p_customer_name,p_message,p_kind,p_table_code);
 RETURN jsonb_build_object('ok',true);
 EXCEPTION WHEN OTHERS THEN
 GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
 UPDATE public_action_budgets SET failures=failures+1 WHERE restaurant_id=p_restaurant_id AND table_id=tid AND action='call';
 RETURN jsonb_build_object('ok',false,'message',CASE WHEN state IN ('22023','P0001') THEN msg ELSE 'Não foi possível chamar. Tente novamente.' END,'code',state);
 END;
END $$;
REVOKE ALL ON FUNCTION public.submit_public_call(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_call(uuid,text,text,text,text,text) TO anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.public_waiter_call(uuid,text,text,text,text,text) FROM anon,authenticated;

-- Retrying a staff/owner send after a network timeout must not duplicate the order.
CREATE TABLE IF NOT EXISTS public.internal_order_requests(
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 request_token uuid NOT NULL, table_id uuid NOT NULL REFERENCES venue_tables(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 PRIMARY KEY(restaurant_id,request_token)
);
ALTER TABLE public.internal_order_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_order_requests FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.submit_internal_order(p_table_id uuid,p_request_token uuid,p_items jsonb,p_staff_token text DEFAULT NULL,p_created_by text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid; result uuid; s record;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF rid IS NULL OR p_request_token IS NULL THEN RAISE EXCEPTION 'Mesa ou identificação inválida'; END IF;
 IF p_staff_token IS NOT NULL THEN
 SELECT * INTO s FROM staff_session_info(p_staff_token);
 IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 SELECT order_id INTO result FROM internal_order_requests WHERE restaurant_id=rid AND request_token=p_request_token;
 IF result IS NOT NULL THEN
 IF EXISTS(SELECT 1 FROM internal_order_requests WHERE restaurant_id=rid AND request_token=p_request_token AND table_id<>p_table_id) THEN RAISE EXCEPTION 'Este envio pertence a outra mesa'; END IF;
 RETURN result; END IF;
 IF p_staff_token IS NOT NULL THEN result:=staff_place_order(p_staff_token,p_table_id,p_items);
 ELSE result:=owner_place_order(rid,p_table_id,p_items,p_created_by); END IF;
 INSERT INTO internal_order_requests VALUES(rid,p_request_token,p_table_id,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.submit_internal_order(uuid,uuid,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_internal_order(uuid,uuid,jsonb,text,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.release_table(
 p_restaurant_id uuid,p_table_label text,p_staff_token text DEFAULT NULL,
 p_service_fee numeric DEFAULT 0,p_cover_charge numeric DEFAULT 0
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid:=p_restaurant_id; s record; tid uuid; canonical text; ids uuid[]; primary_id uuid;
BEGIN
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO s FROM public.staff_session_info(p_staff_token);
   IF s.restaurant_id IS NULL OR coalesce(s.role,'') NOT IN ('waiter','both') OR (rid IS NOT NULL AND rid<>s.restaurant_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   rid:=s.restaurant_id;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado';
 END IF;
 IF p_service_fee IS NULL OR p_cover_charge IS NULL OR p_service_fee<0 OR p_cover_charge<0 OR p_service_fee>1000000 OR p_cover_charge>1000000 THEN RAISE EXCEPTION 'Taxas inválidas'; END IF;
 SELECT id,label INTO tid,canonical FROM venue_tables WHERE restaurant_id=rid
 AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(p_table_label,'^(Mesa\s*)+','','i')));
 IF tid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(tid::text,4));
 SELECT coalesce(array_agg(id ORDER BY created_at,id),'{}'::uuid[]) INTO ids FROM orders
 WHERE restaurant_id=rid AND NOT coalesce(archived,false) AND status::text<>'cancelled'
 AND (table_id=tid OR (table_id IS NULL AND lower(btrim(regexp_replace(table_label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(canonical,'^(Mesa\s*)+','','i')))));
 IF EXISTS(SELECT 1 FROM orders WHERE id=ANY(ids) AND status<>'served') THEN RAISE EXCEPTION 'Há pedidos ainda não entregues. Entregue ou cancele antes de encerrar a mesa.'; END IF;
 primary_id:=ids[1];
 IF primary_id IS NOT NULL AND (p_service_fee>0 OR p_cover_charge>0) THEN
 UPDATE orders SET service_fee=p_service_fee,cover_charge=p_cover_charge WHERE id=primary_id;
 END IF;
 UPDATE orders SET archived=true,status='served',updated_at=now() WHERE id=ANY(ids);
 UPDATE waiter_calls SET resolved=true,resolved_at=now() WHERE restaurant_id=rid AND NOT resolved
 AND lower(btrim(regexp_replace(table_label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(canonical,'^(Mesa\s*)+','','i')));
 DELETE FROM table_order_codes WHERE table_id=tid;
 RETURN ids;
END $$;
REVOKE ALL ON FUNCTION public.release_table(uuid,text,text,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_table(uuid,text,text,numeric,numeric) TO anon,authenticated;

-- Cancelling an item is not confirmation that the guests have left the table.
CREATE OR REPLACE FUNCTION public.expire_table_order_code() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.archived AND NOT EXISTS(SELECT 1 FROM orders WHERE table_id=NEW.table_id AND NOT coalesce(archived,false) AND status::text<>'cancelled') THEN
 DELETE FROM table_order_codes WHERE table_id=NEW.table_id;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.expire_table_order_code() FROM PUBLIC,anon,authenticated;

COMMIT;
NOTIFY pgrst,'reload schema';
SELECT 'Flux atualizado: gestão de clientes, horários, códigos, notificações e links prontos' AS resultado,
 EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS agendador_automatico_ativo,
 (SELECT count(*) FROM public.platform_admins WHERE active) AS administradores_ativos;

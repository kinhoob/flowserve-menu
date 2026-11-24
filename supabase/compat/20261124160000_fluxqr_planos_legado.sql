-- FluxQr: pacote intermediário exclusivo para o app 8c04778.
-- Gerado por node scripts/build-legacy-plan-upgrade.mjs. Consulte docs/DEPLOYMENT.md.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL statement_timeout = '120s';
DO $commercial_preflight$
DECLARE missing text;
BEGIN
  SELECT string_agg(name, ', ') INTO missing FROM unnest(ARRAY[
    'public.venue_tables','public.orders','public.order_items','public.restaurants','public.profiles',
    'public.categories','public.menu_items','public.modifier_groups','public.modifier_options',
    'public.platform_admins','public.platform_entitlements','public.platform_audit_log',
    'public.subscriptions','public.billing_events','public.table_services','public.operation_events',
    'public.waiter_calls','public.table_order_codes','public.internal_order_requests','public.staff_members'
  ]) AS expected(name) WHERE to_regclass(name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Objetos de base ausentes: %', missing; END IF;
  SELECT string_agg(signature, ', ') INTO missing FROM unnest(ARRAY[
    'public.effective_entitlement(uuid)','public.get_my_entitlement()','public.get_restaurant_plan(text)',
    'public.platform_change_entitlement(uuid,text,text,integer,text,bigint)',
    'public.apply_billing_event(text,bigint,text,jsonb)','public.staff_session_info(text)',
    'public.staff_list_orders(text)','public.staff_list_tables(text)','public.staff_list_calls(text)',
    'public.place_order(uuid,text,text,text,text,jsonb,text,text)',
    'public.staff_place_order(text,uuid,jsonb)','public.owner_place_order(uuid,uuid,jsonb,text)',
    'public.ensure_table_service(uuid,boolean)','public.start_table_service(uuid,text)',
    'public.release_table(uuid,text,text,numeric,numeric)','public.table_order_code(uuid,text,boolean)',
    'public.submit_internal_order(uuid,uuid,jsonb,text,text)',
    'public.submit_public_order(uuid,text,text,text,text,jsonb,text,text)',
    'public.submit_public_call(uuid,text,text,text,text,text)','public.mark_service_bill()',
    'public.validated_order_items(uuid,jsonb)','public.check_table_order_code(uuid,text)'
  ]) AS expected(signature) WHERE to_regprocedure(signature) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Funções de base ausentes: %', missing; END IF;
  SELECT string_agg(relation || '.' || column_name, ', ') INTO missing FROM (VALUES
    ('venue_tables','active_service_id'),('orders','service_id'),('orders','tracking_token_hash'),
    ('subscriptions','last_event_created'),('subscriptions','plan_type'),('waiter_calls','is_test')
  ) AS required(relation,column_name) WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.' || relation)
      AND a.attname=required.column_name AND a.attnum>0 AND NOT a.attisdropped
  );
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Colunas de base ausentes: %', missing; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.oid IN (
    'public.venue_tables'::regclass,'public.orders'::regclass,'public.order_items'::regclass,
    'public.profiles'::regclass,'public.categories'::regclass,'public.menu_items'::regclass,
    'public.modifier_groups'::regclass,'public.modifier_options'::regclass,'public.staff_members'::regclass
  ) AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'RLS desabilitado em tabela de base.'; END IF;
END $commercial_preflight$;
DO $legacy_plan_upgrade$
DECLARE legacy_before jsonb; legacy_after jsonb;
BEGIN
  IF to_regclass('public.billing_reconciliation') IS NOT NULL
    OR to_regclass('public.billing_checkout_attempts') IS NOT NULL
    OR to_regprocedure('public.release_table_service(uuid,uuid,uuid,text,numeric,numeric)') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)')
      AND (prosrc LIKE '%reconciliation_generation%' OR prosrc LIKE '%snapshot_requested_at%'))
    OR NOT coalesce(has_function_privilege('service_role',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'execute'),false)
    OR has_function_privilege('anon',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'execute')
    OR has_function_privilege('authenticated',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'execute')
  THEN RAISE EXCEPTION 'Contrato de cobrança não corresponde ao app legado.'; END IF;
  IF to_regprocedure('public.flux_legacy_plan_bridge_v1()') IS NULL THEN
    IF to_regclass('public.restaurant_qr_locks') IS NOT NULL
      OR to_regprocedure('public.select_operational_tables(uuid,uuid[])') IS NOT NULL
      OR to_regprocedure('public.is_platform_owner()') IS NOT NULL
      OR to_regprocedure('public.get_staff_entitlement(text)') IS NOT NULL
      OR to_regprocedure('public.can_edit_catalog(uuid)') IS NOT NULL
      OR to_regprocedure('public.require_waiter_plan(uuid)') IS NOT NULL
      OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.venue_tables'::regclass AND attname='operational' AND NOT attisdropped)
    THEN RAISE EXCEPTION 'Etapa comercial parcial encontrada. Pare e confira a instalação.'; END IF;
    legacy_before := (SELECT jsonb_object_agg(signature,jsonb_build_object('body',CASE WHEN signature NOT IN ('public.start_table_service(uuid,text)','public.table_order_code(uuid,text,boolean)','public.release_table(uuid,text,text,numeric,numeric)') THEN md5(pg_get_functiondef(p.oid)) END,'args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'acl',p.proacl,'owner',p.proowner)) FROM (VALUES ('public.apply_billing_event(text,bigint,text,jsonb)'),
  ('public.release_table(uuid,text,text,numeric,numeric)'),
  ('public.staff_list_orders(text)'),
  ('public.staff_list_tables(text)'),
  ('public.staff_list_calls(text)'),
  ('public.platform_change_entitlement(uuid,text,text,integer,text,bigint)'),
  ('public.submit_public_order(uuid,text,text,text,text,jsonb,text,text)'),
  ('public.submit_public_call(uuid,text,text,text,text,text)'),
  ('public.submit_internal_order(uuid,uuid,jsonb,text,text)'),
  ('public.start_table_service(uuid,text)'),
  ('public.table_order_code(uuid,text,boolean)'),
  ('public.owner_place_order(uuid,uuid,jsonb,text)'),
  ('public.staff_place_order(text,uuid,jsonb)')) required(signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(required.signature));
    EXECUTE $plan_rules$
-- Commercial access. Existing manually granted plans and service history stay in place.
ALTER TABLE public.venue_tables ADD COLUMN operational boolean NOT NULL DEFAULT true;
CREATE INDEX venue_tables_operational_restaurant_idx ON public.venue_tables (restaurant_id) WHERE operational;

-- One row per venue serializes quota changes even under repeatable read.
CREATE TABLE public.restaurant_qr_locks (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE
);
ALTER TABLE public.restaurant_qr_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_qr_locks FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.lock_restaurant_qrs(p_restaurant_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text, 0));
  INSERT INTO restaurant_qr_locks AS q (restaurant_id) VALUES (p_restaurant_id)
  ON CONFLICT (restaurant_id) DO UPDATE SET restaurant_id = EXCLUDED.restaurant_id;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_restaurant_qrs(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_restaurant_plan(p_slug text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN e->>'plan_type' = 'trial' AND (e->>'trial_ends_at')::timestamptz > now() THEN 'trial'
    WHEN e->>'plan_type' IN ('basic','essential','pro','enterprise') THEN e->>'plan_type'
    ELSE 'basic'
  END
  FROM restaurants r CROSS JOIN LATERAL public.effective_entitlement(r.owner_id) e
  WHERE r.slug = p_slug LIMIT 1;
$$;

-- NULL means unlimited only for plans that include table operation.
CREATE FUNCTION public.restaurant_has_operations(p_plan text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(p_plan IN ('essential','trial','pro','enterprise'), false);
$$;

CREATE FUNCTION public.restaurant_has_waiter(p_plan text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(p_plan IN ('trial','pro','enterprise'), false);
$$;

CREATE FUNCTION public.essential_qr_limit() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 10; $$;

CREATE FUNCTION public.operational_table_label(p_label text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower(btrim(regexp_replace(p_label, '^(Mesa\s*)+', '', 'i')));
$$;

CREATE OR REPLACE FUNCTION public.get_my_entitlement() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.effective_entitlement(auth.uid()) || jsonb_build_object(
    'service_wind_down', EXISTS (
      SELECT 1 FROM restaurants r WHERE r.owner_id = auth.uid()
      AND NOT public.restaurant_has_operations(public.get_restaurant_plan(r.slug))
      AND (
        EXISTS (SELECT 1 FROM table_services s WHERE s.restaurant_id = r.id AND s.ended_at IS NULL)
        OR EXISTS (SELECT 1 FROM orders o WHERE o.restaurant_id = r.id AND NOT o.archived AND o.status <> 'cancelled')
      )
    )
  );
$$;

CREATE FUNCTION public.guard_operational_qr() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE plan text;
BEGIN
  IF NOT NEW.operational THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.operational AND OLD.label = NEW.label
      AND OLD.restaurant_id = NEW.restaurant_id THEN RETURN NEW; END IF;
  PERFORM public.lock_restaurant_qrs(NEW.restaurant_id);
  SELECT public.get_restaurant_plan(r.slug) INTO plan FROM restaurants r WHERE r.id = NEW.restaurant_id;
  IF NOT public.restaurant_has_operations(plan) THEN
    RAISE EXCEPTION 'QR Codes operacionais estão disponíveis a partir do plano Essential.' USING ERRCODE = '22023';
  END IF;
  IF public.operational_table_label(NEW.label) = '' OR EXISTS (
    SELECT 1 FROM venue_tables t WHERE t.restaurant_id = NEW.restaurant_id
    AND t.id <> NEW.id AND t.operational
    AND public.operational_table_label(t.label) = public.operational_table_label(NEW.label)
  ) THEN
    RAISE EXCEPTION 'Já existe um QR operacional com esse nome, ou o nome é inválido.' USING ERRCODE = '22023';
  END IF;
  IF plan = 'essential' AND (
    SELECT count(*) FROM venue_tables t WHERE t.restaurant_id = NEW.restaurant_id
    AND t.id <> NEW.id AND t.operational
  ) >= public.essential_qr_limit() THEN
    RAISE EXCEPTION 'O plano Essential permite até 10 QR Codes operacionais.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_operational_qr() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_operational_qr BEFORE INSERT OR UPDATE OF operational, label, restaurant_id
ON public.venue_tables FOR EACH ROW EXECUTE FUNCTION public.guard_operational_qr();

-- Existing clients can create tables, but cannot edit service or quota state directly.
REVOKE INSERT, UPDATE ON public.venue_tables FROM PUBLIC, anon, authenticated;
GRANT INSERT (restaurant_id, label, short_code, position) ON public.venue_tables TO authenticated;

CREATE FUNCTION public.select_operational_tables(p_restaurant_id uuid, p_table_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE plan text; selected integer; distinct_labels integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  PERFORM public.lock_restaurant_qrs(p_restaurant_id);
  SELECT public.get_restaurant_plan(r.slug) INTO plan FROM restaurants r WHERE r.id = p_restaurant_id;
  IF NOT public.restaurant_has_operations(plan) THEN
    RAISE EXCEPTION 'Gestão de QR Codes operacionais está disponível a partir do Essential.' USING ERRCODE = '22023';
  END IF;
  IF p_table_ids IS NULL OR (plan = 'essential' AND cardinality(p_table_ids) > public.essential_qr_limit()) THEN
    RAISE EXCEPTION 'Seleção de mesas acima do limite do plano ou inválida.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*), count(DISTINCT public.operational_table_label(t.label))
    INTO selected, distinct_labels FROM venue_tables t
    WHERE t.restaurant_id = p_restaurant_id AND t.id = ANY(p_table_ids);
  IF selected <> cardinality(p_table_ids) OR selected <> distinct_labels THEN
    RAISE EXCEPTION 'Selecione mesas deste restaurante com nomes distintos.' USING ERRCODE = '22023';
  END IF;
  UPDATE venue_tables SET operational = false
    WHERE restaurant_id = p_restaurant_id AND operational AND NOT (id = ANY(p_table_ids));
  UPDATE venue_tables SET operational = true
    WHERE restaurant_id = p_restaurant_id AND NOT operational AND id = ANY(p_table_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.select_operational_tables(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_operational_tables(uuid, uuid[]) TO authenticated;

CREATE FUNCTION public.restaurant_table_is_operational(p_restaurant_id uuid, p_table_label text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM restaurants r
    CROSS JOIN LATERAL public.get_restaurant_plan(r.slug) AS plan(value)
    WHERE r.id = p_restaurant_id AND public.restaurant_has_operations(plan.value)
    AND (plan.value <> 'essential' OR (
      SELECT count(*) FROM venue_tables q WHERE q.restaurant_id = r.id AND q.operational
    ) <= public.essential_qr_limit())
    AND (
      SELECT count(*) FROM venue_tables t WHERE t.restaurant_id = r.id AND t.operational
      AND public.operational_table_label(t.label) = public.operational_table_label(p_table_label)
    ) = 1
  );
$$;
REVOKE ALL ON FUNCTION public.restaurant_table_is_operational(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_table_is_operational(uuid, text) TO anon, authenticated;

CREATE FUNCTION public.require_operational_table(p_restaurant_id uuid, p_table_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM venue_tables t WHERE t.id = p_table_id AND t.restaurant_id = p_restaurant_id
    AND t.operational AND public.restaurant_table_is_operational(p_restaurant_id, t.label)
  ) THEN
    RAISE EXCEPTION 'Mesa fora da operação. Confira o plano e a seleção de QR Codes.' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.require_operational_table(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_new_order_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE plan text;
BEGIN
  PERFORM public.require_operational_table(NEW.restaurant_id, NEW.table_id);
  IF NEW.tracking_token_hash IS NULL THEN
    SELECT public.get_restaurant_plan(r.slug) INTO plan FROM restaurants r WHERE r.id = NEW.restaurant_id;
    IF NOT public.restaurant_has_waiter(plan) THEN
      RAISE EXCEPTION 'Lançamento pelo garçom está disponível a partir do plano Pro.' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_new_order_plan() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_guard_order BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_new_order_plan();
REVOKE INSERT ON public.orders, public.order_items FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_new_call_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE plan text; tid uuid;
BEGIN
  SELECT public.get_restaurant_plan(r.slug) INTO plan FROM restaurants r WHERE r.id = NEW.restaurant_id;
  IF NOT public.restaurant_has_operations(plan)
    OR (NEW.kind <> 'bill' AND NOT public.restaurant_has_waiter(plan)) THEN
    RAISE EXCEPTION 'Chamado indisponível no plano atual.' USING ERRCODE = '22023';
  END IF;
  SELECT t.id INTO tid FROM venue_tables t WHERE t.restaurant_id = NEW.restaurant_id AND t.operational
    AND public.operational_table_label(t.label) = public.operational_table_label(NEW.table_label);
  PERFORM public.require_operational_table(NEW.restaurant_id, tid);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_new_call_plan() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_guard_call BEFORE INSERT ON public.waiter_calls
FOR EACH ROW EXECUTE FUNCTION public.guard_new_call_plan();

CREATE OR REPLACE FUNCTION public.ensure_table_service(p_table_id uuid,p_backfill boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t record; sid uuid;
BEGIN
 SELECT restaurant_id INTO t FROM venue_tables WHERE id=p_table_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t.restaurant_id::text,0));
 IF NOT p_backfill THEN PERFORM public.require_operational_table(t.restaurant_id, p_table_id); END IF;
 SELECT * INTO t FROM venue_tables WHERE id=p_table_id FOR UPDATE;
 IF t.active_service_id IS NOT NULL AND EXISTS(SELECT 1 FROM table_services WHERE id=t.active_service_id AND ended_at IS NULL) THEN RETURN t.active_service_id; END IF;
 INSERT INTO table_services(restaurant_id,table_id) VALUES(t.restaurant_id,t.id) RETURNING id INTO sid;
 UPDATE venue_tables SET active_service_id=sid,service_started_at=now(),service_state='active' WHERE id=t.id;
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.ensure_table_service(uuid,boolean) FROM PUBLIC,anon,authenticated;

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
  SELECT t.id INTO v_table_id FROM venue_tables t WHERE t.restaurant_id = p_restaurant_id AND t.operational
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

CREATE OR REPLACE FUNCTION public.public_waiter_call(p_restaurant_id uuid,p_table_label text,p_customer_name text,p_message text,p_kind text,p_table_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid;
BEGIN
 SELECT id INTO tid FROM venue_tables WHERE restaurant_id=p_restaurant_id AND operational AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(p_table_label,'^(Mesa\s*)+','','i')));
 IF tid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 PERFORM public.check_table_order_code(tid,p_table_code);
 -- Existing customers can request their bill after closing, but cannot place new orders.
 IF p_kind NOT IN ('call','bill') OR p_kind IS NULL THEN RAISE EXCEPTION 'Chamado inválido'; END IF;
 IF NOT public.service_is_open(p_restaurant_id,'bar') AND NOT public.service_is_open(p_restaurant_id,'kitchen') AND NOT EXISTS(SELECT 1 FROM orders WHERE restaurant_id=p_restaurant_id AND table_id=tid AND NOT coalesce(archived,false) AND status::text<>'cancelled') THEN RAISE EXCEPTION 'Atendimento encerrado'; END IF;
 INSERT INTO waiter_calls(restaurant_id,table_label,customer_name,message,kind) VALUES(p_restaurant_id,p_table_label,left(p_customer_name,80),left(p_message,500),p_kind);
END $$;
CREATE FUNCTION public.can_edit_catalog(p_restaurant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM restaurants r CROSS JOIN LATERAL public.get_my_entitlement() e
    WHERE r.id = p_restaurant_id AND r.owner_id = auth.uid()
      AND (e->>'plan_type' IN ('basic','essential','pro','enterprise')
        OR (e->>'plan_type' = 'trial' AND (e->>'trial_ends_at')::timestamptz > now()))
  );
$$;
REVOKE ALL ON FUNCTION public.can_edit_catalog(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_catalog(uuid) TO authenticated;

-- Restrictive policies keep existing ownership requirements and public read policies.
DO $catalog$
DECLARE relation text; predicate text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['categories', 'menu_items', 'modifier_groups', 'modifier_options']
  LOOP
    predicate := CASE WHEN relation = 'modifier_options' THEN
      'EXISTS (SELECT 1 FROM public.modifier_groups g WHERE g.id = group_id AND public.can_edit_catalog(g.restaurant_id))'
      ELSE 'public.can_edit_catalog(restaurant_id)' END;
    EXECUTE format('CREATE POLICY active_plan_catalog_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', relation, predicate);
    EXECUTE format('CREATE POLICY active_plan_catalog_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', relation, predicate, predicate);
    EXECUTE format('CREATE POLICY active_plan_catalog_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)', relation, predicate);
  END LOOP;
END;
$catalog$;

NOTIFY pgrst, 'reload schema';
-- Owner management uses the current entitlement, including audited manual grants.
CREATE FUNCTION public.can_manage_restaurant_operation(p_restaurant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.id = p_restaurant_id AND r.owner_id = auth.uid()
      AND public.restaurant_has_operations(public.get_restaurant_plan(r.slug))
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_restaurant_operation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_restaurant_operation(uuid) TO authenticated;

CREATE POLICY operation_plan_staff_insert ON public.staff_members AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_restaurant_operation(restaurant_id));
CREATE POLICY operation_plan_staff_update ON public.staff_members AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.can_manage_restaurant_operation(restaurant_id))
  WITH CHECK (public.can_manage_restaurant_operation(restaurant_id));
CREATE POLICY operation_plan_staff_delete ON public.staff_members AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.can_manage_restaurant_operation(restaurant_id));
CREATE POLICY operation_plan_table_delete ON public.venue_tables AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.can_manage_restaurant_operation(restaurant_id));

-- Keep token-scoped waiter actions separate from the authenticated owner path.
CREATE FUNCTION public.require_waiter_plan(p_restaurant_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM restaurants r WHERE r.id = p_restaurant_id
      AND public.restaurant_has_waiter(public.get_restaurant_plan(r.slug))
  ) THEN
    RAISE EXCEPTION 'A operação do garçom está disponível a partir do plano Pro.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.require_waiter_plan(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_table_service(p_table_id uuid,p_staff_token text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid;s record;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF p_staff_token IS NOT NULL THEN
 SELECT * INTO s FROM staff_session_info(p_staff_token);
 IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 IF p_staff_token IS NOT NULL THEN PERFORM public.require_waiter_plan(rid); END IF;
 PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
 RETURN ensure_table_service(p_table_id);
END $$;

CREATE OR REPLACE FUNCTION public.table_order_code(p_table_id uuid,p_staff_token text DEFAULT NULL,p_rotate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE rid uuid; s record; c record; next_code text;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO s FROM public.staff_session_info(p_staff_token);
   IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text,4));
 IF p_staff_token IS NOT NULL THEN PERFORM public.require_waiter_plan(rid); END IF;
 SELECT * INTO c FROM table_order_codes WHERE table_id=p_table_id;
 IF p_rotate THEN
   PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
   PERFORM ensure_table_service(p_table_id);
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
 IF p_rotate THEN
 INSERT INTO operation_events(restaurant_id,table_id,service_id,event,actor_user_id,actor_staff_id,actor_name,details)
 VALUES(rid,p_table_id,(SELECT active_service_id FROM venue_tables WHERE id=p_table_id),'code_issued',auth.uid(),(SELECT staff_id FROM staff_session_info(p_staff_token)),coalesce((SELECT name FROM staff_session_info(p_staff_token)),'Responsável'),jsonb_build_object('expires_at',c.expires_at));
 END IF;
 RETURN jsonb_build_object('code',c.code,'expires_at',c.expires_at);
END $$;

NOTIFY pgrst, 'reload schema';
CREATE FUNCTION public.flux_legacy_guard_table_label() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.restaurant_id = OLD.restaurant_id
    AND public.operational_table_label(NEW.label) = public.operational_table_label(OLD.label)
  THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.restaurant_id::text,0));
  IF EXISTS (SELECT 1 FROM venue_tables t WHERE t.restaurant_id=NEW.restaurant_id AND t.id<>NEW.id
    AND public.operational_table_label(t.label)=public.operational_table_label(NEW.label)) THEN
    RAISE EXCEPTION 'Já existe uma mesa com esse nome, inclusive entre as pausadas.' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.flux_legacy_guard_table_label() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER flux_legacy_guard_table_label BEFORE INSERT OR UPDATE OF label,restaurant_id
  ON public.venue_tables FOR EACH ROW EXECUTE FUNCTION public.flux_legacy_guard_table_label();
CREATE OR REPLACE FUNCTION public.restaurant_table_is_operational(p_restaurant_id uuid, p_table_label text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM restaurants r
    CROSS JOIN LATERAL public.get_restaurant_plan(r.slug) AS plan(value)
    WHERE r.id = p_restaurant_id AND public.restaurant_has_operations(plan.value)
    AND (plan.value <> 'essential' OR (
      SELECT count(*) FROM venue_tables q WHERE q.restaurant_id = r.id AND q.operational
    ) <= public.essential_qr_limit())
    AND (SELECT count(*) FROM venue_tables all_tables WHERE all_tables.restaurant_id=r.id
      AND public.operational_table_label(all_tables.label)=public.operational_table_label(p_table_label)) = 1
    AND (
      SELECT count(*) FROM venue_tables t WHERE t.restaurant_id = r.id AND t.operational
      AND public.operational_table_label(t.label) = public.operational_table_label(p_table_label)
    ) = 1
  );
$$;
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
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 SELECT id,label INTO STRICT tid,canonical FROM venue_tables WHERE restaurant_id=rid
 AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(p_table_label,'^(Mesa\s*)+','','i')));
 IF tid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
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
 UPDATE orders SET archived=true WHERE table_id=tid AND status='cancelled' AND NOT archived;
 UPDATE table_services SET ended_at=now(),state='closed' WHERE id=(SELECT active_service_id FROM venue_tables WHERE id=tid) AND ended_at IS NULL;
 UPDATE venue_tables SET active_service_id=NULL,service_started_at=NULL,service_state='free' WHERE id=tid;
 DELETE FROM table_order_codes WHERE table_id=tid;
 RETURN ids;
EXCEPTION WHEN no_data_found OR too_many_rows THEN
 RAISE EXCEPTION 'Mesa inválida ou ambígua. Confira o cadastro antes de encerrar.';
END $$;
    $plan_rules$;
    legacy_after := (SELECT jsonb_object_agg(signature,jsonb_build_object('body',CASE WHEN signature NOT IN ('public.start_table_service(uuid,text)','public.table_order_code(uuid,text,boolean)','public.release_table(uuid,text,text,numeric,numeric)') THEN md5(pg_get_functiondef(p.oid)) END,'args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'acl',p.proacl,'owner',p.proowner)) FROM (VALUES ('public.apply_billing_event(text,bigint,text,jsonb)'),
  ('public.release_table(uuid,text,text,numeric,numeric)'),
  ('public.staff_list_orders(text)'),
  ('public.staff_list_tables(text)'),
  ('public.staff_list_calls(text)'),
  ('public.platform_change_entitlement(uuid,text,text,integer,text,bigint)'),
  ('public.submit_public_order(uuid,text,text,text,text,jsonb,text,text)'),
  ('public.submit_public_call(uuid,text,text,text,text,text)'),
  ('public.submit_internal_order(uuid,uuid,jsonb,text,text)'),
  ('public.start_table_service(uuid,text)'),
  ('public.table_order_code(uuid,text,boolean)'),
  ('public.owner_place_order(uuid,uuid,jsonb,text)'),
  ('public.staff_place_order(text,uuid,jsonb)')) required(signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(required.signature));
    IF legacy_after IS DISTINCT FROM legacy_before THEN
      RAISE EXCEPTION 'Contrato legado de RPCs ou cobrança alterado. Nenhuma etapa foi aplicada.';
    END IF;
    CREATE FUNCTION public.flux_legacy_plan_bridge_v1() RETURNS boolean
      LANGUAGE sql IMMUTABLE SET search_path='' AS $bridge_marker$ SELECT true; $bridge_marker$;
    REVOKE ALL ON FUNCTION public.flux_legacy_plan_bridge_v1() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.select_operational_tables(uuid,uuid[])') IS NULL
    OR to_regprocedure('public.require_waiter_plan(uuid)') IS NULL
    OR to_regprocedure('public.can_edit_catalog(uuid)') IS NULL
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND permissive='RESTRICTIVE'
      AND (policyname LIKE 'active_plan_catalog_%' OR policyname LIKE 'operation_plan_%')
      AND tablename IN ('staff_members','venue_tables','categories','menu_items','modifier_groups','modifier_options')) <> 16
    OR EXISTS (SELECT 1 FROM (VALUES
      ('venue_tables','guard_operational_qr'),('venue_tables','flux_legacy_guard_table_label'),('orders','commercial_guard_order'),('waiter_calls','commercial_guard_call')
    ) required(relation,trigger_name) WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||relation)
      AND t.tgname=trigger_name AND t.tgenabled IN ('O','A')
    ))
  THEN RAISE EXCEPTION 'Subconjunto de planos incompleto ou alterado.'; END IF;
END $legacy_plan_upgrade$;
NOTIFY pgrst, 'reload schema';
COMMIT;

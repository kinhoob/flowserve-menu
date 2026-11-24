-- Gerado por node scripts/build-commercial-plan-upgrade.mjs.
-- Apenas para uma base Flux existente. Use os passos em docs/DEPLOYMENT.md.
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public, pg_catalog;
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
    , ('order_items','product_id_snapshot'),('order_items','category_id_snapshot'),
    ('order_items','category_name_snapshot'),('order_items','department_snapshot')
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
DO $commercial_stage_0$ BEGIN
  IF (to_regclass('public.restaurant_qr_locks') IS NOT NULL) AND
     (to_regprocedure('public.select_operational_tables(uuid,uuid[])') IS NOT NULL) AND
     (to_regprocedure('public.is_platform_owner()') IS NOT NULL) AND
     (EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.venue_tables'::regclass AND tgname='guard_operational_qr' AND tgenabled IN ('O','A'))) THEN
    RAISE NOTICE 'Etapa já instalada: 20261124063416_commercial_beta_entitlements.sql';
  ELSIF to_regprocedure('public.flux_legacy_plan_bridge_v1()') IS NOT NULL THEN
    EXECUTE $commercial_sql_0$
-- Authoritative Stripe snapshots outrank delivery timestamps.
ALTER TABLE public.subscriptions ADD COLUMN last_snapshot_requested_at bigint;
CREATE OR REPLACE FUNCTION public.apply_billing_event(p_event_id text,p_created bigint,p_environment text,p_subscription jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid; active_plan text; plan text; observed bigint;
BEGIN
  IF p_environment NOT IN ('live','sandbox') OR p_created IS NULL OR p_event_id IS NULL THEN RAISE EXCEPTION 'Invalid event'; END IF;
  uid := (p_subscription->>'user_id')::uuid;
  plan := p_subscription->>'plan_type';
  observed := (p_subscription->>'snapshot_requested_at')::bigint;
  IF plan IS NOT NULL AND plan NOT IN ('basic','essential','pro') THEN RAISE EXCEPTION 'Invalid plan'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,3));
  INSERT INTO billing_events(event_id,environment,created) VALUES(p_event_id,p_environment,p_created) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO subscriptions(user_id,stripe_subscription_id,stripe_customer_id,price_id,product_id,status,
    current_period_start,current_period_end,cancel_at_period_end,environment,last_event_created,plan_type,last_snapshot_requested_at)
  VALUES(uid,p_subscription->>'stripe_subscription_id',p_subscription->>'stripe_customer_id',p_subscription->>'price_id',
    p_subscription->>'product_id',p_subscription->>'status',(p_subscription->>'current_period_start')::timestamptz,
    (p_subscription->>'current_period_end')::timestamptz,(p_subscription->>'cancel_at_period_end')::boolean,p_environment,p_created,plan,observed)
  ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=EXCLUDED.status,price_id=EXCLUDED.price_id,
    product_id=EXCLUDED.product_id,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,
    cancel_at_period_end=EXCLUDED.cancel_at_period_end,last_event_created=greatest(subscriptions.last_event_created, EXCLUDED.last_event_created),
    last_snapshot_requested_at=EXCLUDED.last_snapshot_requested_at,
    plan_type=coalesce(EXCLUDED.plan_type,subscriptions.plan_type),updated_at=now()
  WHERE (
      (observed IS NOT NULL AND observed >= coalesce(subscriptions.last_snapshot_requested_at, 0))
      OR (observed IS NULL AND subscriptions.last_snapshot_requested_at IS NULL
          AND subscriptions.last_event_created <= EXCLUDED.last_event_created)
    )
    AND subscriptions.user_id=EXCLUDED.user_id AND subscriptions.environment=EXCLUDED.environment;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_environment <> 'live' THEN RETURN; END IF;
  SELECT s.plan_type INTO active_plan FROM subscriptions s WHERE s.user_id=uid AND s.environment='live'
    AND s.status IN ('active','trialing') AND s.plan_type IS NOT NULL ORDER BY s.last_snapshot_requested_at DESC NULLS LAST, s.last_event_created DESC, s.stripe_subscription_id LIMIT 1;
  IF active_plan IS NOT NULL THEN
    UPDATE profiles SET plan_type=active_plan WHERE id=uid;
  ELSIF (p_subscription->>'status') IN ('past_due','unpaid','incomplete_expired','paused','canceled') THEN
    UPDATE profiles SET plan_type='trial',trial_ends_at=to_timestamp(0) WHERE id=uid;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.apply_billing_event(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_event(text,bigint,text,jsonb) TO service_role;


-- The database administrator explicitly designates the platform owner.
-- Existing administrators retain access to read and audit the management console.
ALTER TABLE public.platform_admins ADD COLUMN owns_platform boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX platform_single_owner ON public.platform_admins (owns_platform) WHERE owns_platform;

CREATE FUNCTION public.is_platform_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins WHERE user_id = auth.uid() AND active AND owns_platform
  );
$$;
REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_change_entitlement(p_restaurant_id uuid,p_action text,p_plan text,p_days integer,p_reason text,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; before_value jsonb; after_value jsonb; next_plan text; next_trial timestamptz; v bigint; actor text;
BEGIN
 IF NOT public.is_platform_owner() THEN
   RAISE EXCEPTION 'Acesso exclusivo do proprietário do Flux.' USING ERRCODE='42501';
 END IF;
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
CREATE OR REPLACE FUNCTION public.restaurant_table_is_operational(p_restaurant_id uuid, p_table_label text)
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
$commercial_sql_0$;
  ELSIF (to_regclass('public.restaurant_qr_locks') IS NOT NULL) OR
        (to_regprocedure('public.select_operational_tables(uuid,uuid[])') IS NOT NULL) OR
        (to_regprocedure('public.is_platform_owner()') IS NOT NULL) OR
        (EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.venue_tables'::regclass AND tgname='guard_operational_qr' AND tgenabled IN ('O','A'))) THEN
    RAISE EXCEPTION 'Etapa parcial: 20261124063416_commercial_beta_entitlements.sql. Confira o schema antes de repetir.';
  ELSE
    EXECUTE $commercial_sql_0$
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

-- Authoritative Stripe snapshots outrank delivery timestamps.
ALTER TABLE public.subscriptions ADD COLUMN last_snapshot_requested_at bigint;
CREATE OR REPLACE FUNCTION public.apply_billing_event(p_event_id text,p_created bigint,p_environment text,p_subscription jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid; active_plan text; plan text; observed bigint;
BEGIN
  IF p_environment NOT IN ('live','sandbox') OR p_created IS NULL OR p_event_id IS NULL THEN RAISE EXCEPTION 'Invalid event'; END IF;
  uid := (p_subscription->>'user_id')::uuid;
  plan := p_subscription->>'plan_type';
  observed := (p_subscription->>'snapshot_requested_at')::bigint;
  IF plan IS NOT NULL AND plan NOT IN ('basic','essential','pro') THEN RAISE EXCEPTION 'Invalid plan'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,3));
  INSERT INTO billing_events(event_id,environment,created) VALUES(p_event_id,p_environment,p_created) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO subscriptions(user_id,stripe_subscription_id,stripe_customer_id,price_id,product_id,status,
    current_period_start,current_period_end,cancel_at_period_end,environment,last_event_created,plan_type,last_snapshot_requested_at)
  VALUES(uid,p_subscription->>'stripe_subscription_id',p_subscription->>'stripe_customer_id',p_subscription->>'price_id',
    p_subscription->>'product_id',p_subscription->>'status',(p_subscription->>'current_period_start')::timestamptz,
    (p_subscription->>'current_period_end')::timestamptz,(p_subscription->>'cancel_at_period_end')::boolean,p_environment,p_created,plan,observed)
  ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=EXCLUDED.status,price_id=EXCLUDED.price_id,
    product_id=EXCLUDED.product_id,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,
    cancel_at_period_end=EXCLUDED.cancel_at_period_end,last_event_created=greatest(subscriptions.last_event_created, EXCLUDED.last_event_created),
    last_snapshot_requested_at=EXCLUDED.last_snapshot_requested_at,
    plan_type=coalesce(EXCLUDED.plan_type,subscriptions.plan_type),updated_at=now()
  WHERE (
      (observed IS NOT NULL AND observed >= coalesce(subscriptions.last_snapshot_requested_at, 0))
      OR (observed IS NULL AND subscriptions.last_snapshot_requested_at IS NULL
          AND subscriptions.last_event_created <= EXCLUDED.last_event_created)
    )
    AND subscriptions.user_id=EXCLUDED.user_id AND subscriptions.environment=EXCLUDED.environment;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_environment <> 'live' THEN RETURN; END IF;
  SELECT s.plan_type INTO active_plan FROM subscriptions s WHERE s.user_id=uid AND s.environment='live'
    AND s.status IN ('active','trialing') AND s.plan_type IS NOT NULL ORDER BY s.last_snapshot_requested_at DESC NULLS LAST, s.last_event_created DESC, s.stripe_subscription_id LIMIT 1;
  IF active_plan IS NOT NULL THEN
    UPDATE profiles SET plan_type=active_plan WHERE id=uid;
  ELSIF (p_subscription->>'status') IN ('past_due','unpaid','incomplete_expired','paused','canceled') THEN
    UPDATE profiles SET plan_type='trial',trial_ends_at=to_timestamp(0) WHERE id=uid;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.apply_billing_event(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_event(text,bigint,text,jsonb) TO service_role;


-- The database administrator explicitly designates the platform owner.
-- Existing administrators retain access to read and audit the management console.
ALTER TABLE public.platform_admins ADD COLUMN owns_platform boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX platform_single_owner ON public.platform_admins (owns_platform) WHERE owns_platform;

CREATE FUNCTION public.is_platform_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins WHERE user_id = auth.uid() AND active AND owns_platform
  );
$$;
REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_change_entitlement(p_restaurant_id uuid,p_action text,p_plan text,p_days integer,p_reason text,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; before_value jsonb; after_value jsonb; next_plan text; next_trial timestamptz; v bigint; actor text;
BEGIN
 IF NOT public.is_platform_owner() THEN
   RAISE EXCEPTION 'Acesso exclusivo do proprietário do Flux.' USING ERRCODE='42501';
 END IF;
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
$commercial_sql_0$;
  END IF;
END $commercial_stage_0$;
DO $commercial_stage_1$ BEGIN
  IF (to_regclass('public.billing_reconciliation') IS NOT NULL) AND
     (to_regclass('public.billing_checkout_attempts') IS NOT NULL) AND
     (to_regprocedure('public.release_table_service(uuid,uuid,uuid,text,numeric,numeric)') IS NOT NULL) AND
     (to_regprocedure('public.reserve_billing_checkout(uuid,text,text,text,text)') IS NOT NULL) THEN
    RAISE NOTICE 'Etapa já instalada: 20261124065754_commercial_beta_review.sql';
  ELSIF (to_regclass('public.billing_reconciliation') IS NOT NULL) OR
        (to_regclass('public.billing_checkout_attempts') IS NOT NULL) OR
        (to_regprocedure('public.release_table_service(uuid,uuid,uuid,text,numeric,numeric)') IS NOT NULL) OR
        (to_regprocedure('public.reserve_billing_checkout(uuid,text,text,text,text)') IS NOT NULL) THEN
    RAISE EXCEPTION 'Etapa parcial: 20261124065754_commercial_beta_review.sql. Confira o schema antes de repetir.';
  ELSE
    EXECUTE $commercial_sql_1$
-- Stripe requests run outside PostgreSQL. A generation allocated before retrieval
-- fences out responses from earlier requests across workers.
CREATE TABLE public.billing_reconciliation (
  environment text NOT NULL CHECK (environment IN ('live','sandbox')),
  subscription_id text NOT NULL,
  generation bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (environment, subscription_id)
);
ALTER TABLE public.billing_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_reconciliation FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.begin_billing_reconciliation(p_environment text, p_subscription_id text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO billing_reconciliation AS r(environment,subscription_id)
  VALUES (p_environment,p_subscription_id)
  ON CONFLICT (environment,subscription_id) DO UPDATE SET generation = r.generation + 1
  RETURNING generation::text;
$$;
REVOKE ALL ON FUNCTION public.begin_billing_reconciliation(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_billing_reconciliation(text,text) TO service_role;

-- Keep identical Stripe creation parameters and idempotency key across retries.
CREATE TABLE public.billing_checkout_attempts (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  environment text CHECK (environment IN ('live','sandbox')),
  attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  stripe_price_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  return_url text NOT NULL,
  expires_at bigint NOT NULL,
  PRIMARY KEY (user_id, environment)
);
ALTER TABLE public.billing_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_checkout_attempts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.reserve_billing_checkout(
  p_user_id uuid, p_environment text, p_price_id text, p_customer_id text, p_return_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE slot billing_checkout_attempts; now_epoch bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_environment, 11));
  now_epoch := floor(extract(epoch FROM clock_timestamp()));
  SELECT * INTO slot FROM billing_checkout_attempts WHERE user_id = p_user_id AND environment = p_environment;
  IF NOT FOUND OR slot.expires_at <= now_epoch THEN
    INSERT INTO billing_checkout_attempts(user_id,environment,stripe_price_id,stripe_customer_id,return_url,expires_at)
    VALUES (p_user_id,p_environment,p_price_id,p_customer_id,p_return_url,now_epoch + 7200)
    ON CONFLICT (user_id,environment) DO UPDATE SET
      attempt_id = EXCLUDED.attempt_id, stripe_price_id = EXCLUDED.stripe_price_id,
      stripe_customer_id = EXCLUDED.stripe_customer_id, return_url = EXCLUDED.return_url, expires_at = EXCLUDED.expires_at
    RETURNING * INTO slot;
  END IF;
  RETURN jsonb_build_object('attempt_id',slot.attempt_id,'price_id',slot.stripe_price_id,
    'customer_id',slot.stripe_customer_id,'return_url',slot.return_url,'expires_at',slot.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_billing_checkout(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_billing_checkout(uuid,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_billing_event(p_event_id text,p_created bigint,p_environment text,p_subscription jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid; active_plan text; plan text; generation bigint; current_generation bigint;
BEGIN
  IF p_environment NOT IN ('live','sandbox') OR p_created IS NULL OR p_event_id IS NULL THEN RAISE EXCEPTION 'Invalid event'; END IF;
  uid := (p_subscription->>'user_id')::uuid;
  plan := p_subscription->>'plan_type';
  generation := (p_subscription->>'reconciliation_generation')::bigint;
  SELECT r.generation INTO current_generation FROM billing_reconciliation r
    WHERE r.environment=p_environment AND r.subscription_id=p_subscription->>'stripe_subscription_id' FOR UPDATE;
  IF generation IS NULL OR current_generation IS NULL THEN RAISE EXCEPTION 'Missing billing reconciliation'; END IF;
  IF generation <> current_generation THEN RETURN; END IF;
  IF plan IS NOT NULL AND plan NOT IN ('basic','essential','pro') THEN RAISE EXCEPTION 'Invalid plan'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,3));
  INSERT INTO billing_events(event_id,environment,created) VALUES(p_event_id,p_environment,p_created) ON CONFLICT DO NOTHING;
  -- A signed retry still reconciles the current Stripe state.
  INSERT INTO subscriptions(user_id,stripe_subscription_id,stripe_customer_id,price_id,product_id,status,
    current_period_start,current_period_end,cancel_at_period_end,environment,last_event_created,plan_type)
  VALUES(uid,p_subscription->>'stripe_subscription_id',p_subscription->>'stripe_customer_id',p_subscription->>'price_id',
    p_subscription->>'product_id',p_subscription->>'status',(p_subscription->>'current_period_start')::timestamptz,
    (p_subscription->>'current_period_end')::timestamptz,(p_subscription->>'cancel_at_period_end')::boolean,p_environment,p_created,plan)
  ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=EXCLUDED.status,price_id=EXCLUDED.price_id,
    product_id=EXCLUDED.product_id,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,
    cancel_at_period_end=EXCLUDED.cancel_at_period_end,last_event_created=greatest(subscriptions.last_event_created, EXCLUDED.last_event_created),
    plan_type=coalesce(EXCLUDED.plan_type,subscriptions.plan_type),updated_at=now()
  WHERE subscriptions.user_id=EXCLUDED.user_id AND subscriptions.environment=EXCLUDED.environment
    AND (subscriptions.status <> 'canceled' OR EXCLUDED.status = 'canceled');
  IF NOT FOUND THEN RETURN; END IF;
  IF p_environment <> 'live' THEN RETURN; END IF;
  SELECT s.plan_type INTO active_plan FROM subscriptions s WHERE s.user_id=uid AND s.environment='live'
    AND s.status IN ('active','trialing') AND s.plan_type IS NOT NULL ORDER BY s.updated_at DESC, s.last_event_created DESC, s.stripe_subscription_id LIMIT 1;
  IF active_plan IS NOT NULL THEN
    UPDATE profiles SET plan_type=active_plan WHERE id=uid;
  ELSIF (p_subscription->>'status') IN ('past_due','unpaid','incomplete_expired','paused','canceled') THEN
    UPDATE profiles SET plan_type='trial',trial_ends_at=to_timestamp(0) WHERE id=uid;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.apply_billing_event(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_event(text,bigint,text,jsonb) TO service_role;



ALTER TABLE public.waiter_calls ADD COLUMN table_id uuid REFERENCES public.venue_tables(id) ON DELETE SET NULL;
REVOKE UPDATE ON public.waiter_calls FROM authenticated;
GRANT UPDATE (resolved,resolved_at) ON public.waiter_calls TO authenticated;
CREATE INDEX waiter_calls_open_table_idx ON public.waiter_calls(restaurant_id,table_id) WHERE NOT resolved;
CREATE OR REPLACE FUNCTION public.guard_new_call_plan() RETURNS trigger
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
  NEW.table_id := tid;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_new_call_plan() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_service_bill() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tid uuid;
BEGIN
 IF NEW.kind='bill' THEN
 tid := NEW.table_id;
 UPDATE table_services SET state='bill_requested' WHERE id=(SELECT active_service_id FROM venue_tables WHERE id=tid) AND ended_at IS NULL;
 UPDATE venue_tables SET service_state='bill_requested' WHERE id=tid AND active_service_id IS NOT NULL;
 END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.release_table_service(
 p_restaurant_id uuid,p_table_id uuid,p_service_id uuid,p_staff_token text DEFAULT NULL,
 p_service_fee numeric DEFAULT 0,p_cover_charge numeric DEFAULT 0
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid:=p_restaurant_id; s record; tid uuid:=p_table_id; canonical text; current_service uuid; unambiguous boolean; ids uuid[]; primary_id uuid;
BEGIN
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO s FROM public.staff_session_info(p_staff_token);
   IF s.restaurant_id IS NULL OR coalesce(s.role,'') NOT IN ('waiter','both') OR (rid IS NOT NULL AND rid<>s.restaurant_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   rid:=s.restaurant_id;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado';
 END IF;
 IF p_service_fee IS NULL OR p_cover_charge IS NULL OR p_service_fee<0 OR p_cover_charge<0 OR p_service_fee>1000000 OR p_cover_charge>1000000 THEN RAISE EXCEPTION 'Taxas inválidas'; END IF;
 IF tid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(tid::text,4));
 SELECT label, active_service_id INTO canonical, current_service FROM venue_tables
 WHERE id=tid AND restaurant_id=rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 IF current_service IS DISTINCT FROM p_service_id OR (current_service IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM table_services WHERE id=current_service AND table_id=tid AND restaurant_id=rid AND ended_at IS NULL
 )) THEN RAISE EXCEPTION 'O atendimento mudou. Atualize a mesa antes de encerrar.' USING ERRCODE='40001'; END IF;
 SELECT count(*)=1 INTO unambiguous FROM venue_tables WHERE restaurant_id=rid
   AND public.operational_table_label(label)=public.operational_table_label(canonical);
 PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
 SELECT coalesce(array_agg(id ORDER BY created_at,id),'{}'::uuid[]) INTO ids FROM orders
 WHERE restaurant_id=rid AND NOT coalesce(archived,false) AND status::text<>'cancelled'
 AND ((service_id=current_service AND table_id=tid) OR (service_id IS NULL AND
   (table_id=tid OR (table_id IS NULL AND unambiguous
     AND public.operational_table_label(table_label)=public.operational_table_label(canonical)))));

 IF EXISTS(SELECT 1 FROM orders WHERE id=ANY(ids) AND status<>'served') THEN RAISE EXCEPTION 'Há pedidos ainda não entregues. Entregue ou cancele antes de encerrar a mesa.'; END IF;
 primary_id:=ids[1];
 IF primary_id IS NOT NULL AND (p_service_fee>0 OR p_cover_charge>0) THEN
 UPDATE orders SET service_fee=p_service_fee,cover_charge=p_cover_charge WHERE id=primary_id;
 END IF;
 UPDATE orders SET archived=true,status='served',updated_at=now() WHERE id=ANY(ids);
 UPDATE waiter_calls SET resolved=true,resolved_at=now() WHERE restaurant_id=rid AND NOT resolved
 AND (table_id=tid OR (table_id IS NULL AND unambiguous
   AND public.operational_table_label(table_label)=public.operational_table_label(canonical)));
 UPDATE orders SET archived=true WHERE restaurant_id=rid AND table_id=tid AND status='cancelled'
   AND (service_id=current_service OR service_id IS NULL) AND NOT archived;
 UPDATE table_services SET ended_at=now(),state='closed' WHERE id=(SELECT active_service_id FROM venue_tables WHERE id=tid) AND ended_at IS NULL;
 UPDATE venue_tables SET active_service_id=NULL,service_started_at=NULL,service_state='free' WHERE id=tid;
 DELETE FROM table_order_codes WHERE table_id=tid;
 RETURN ids;
END $$;
REVOKE ALL ON FUNCTION public.release_table_service(uuid,uuid,uuid,text,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_table_service(uuid,uuid,uuid,text,numeric,numeric) TO anon,authenticated;




-- Preserve compatibility for older clients only when the label identifies one table.
CREATE OR REPLACE FUNCTION public.release_table(
 p_restaurant_id uuid,p_table_label text,p_staff_token text DEFAULT NULL,
 p_service_fee numeric DEFAULT 0,p_cover_charge numeric DEFAULT 0
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid := p_restaurant_id; staff record; target record;
BEGIN
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO staff FROM public.staff_session_info(p_staff_token);
   IF staff.restaurant_id IS NULL OR coalesce(staff.role,'') NOT IN ('waiter','both')
     OR (rid IS NOT NULL AND rid<>staff.restaurant_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   rid := staff.restaurant_id;
 ELSIF NOT EXISTS (SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 SELECT id, active_service_id INTO STRICT target FROM venue_tables
 WHERE restaurant_id=rid AND public.operational_table_label(label)=public.operational_table_label(p_table_label);
 RETURN public.release_table_service(rid,target.id,target.active_service_id,p_staff_token,p_service_fee,p_cover_charge);
EXCEPTION WHEN no_data_found OR too_many_rows THEN
 RAISE EXCEPTION 'Mesa inválida ou ambígua. Atualize a aplicação e selecione a mesa.';
END $$;
NOTIFY pgrst,'reload schema';
$commercial_sql_1$;
  END IF;
END $commercial_stage_1$;
DO $commercial_stage_2$ BEGIN
  IF (to_regprocedure('public.get_staff_entitlement(text)') IS NOT NULL) AND
     (to_regprocedure('public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)') IS NOT NULL) AND
     (to_regprocedure('public.can_edit_catalog(uuid)') IS NOT NULL) AND
     ((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('categories','menu_items','modifier_groups','modifier_options') AND policyname IN ('active_plan_catalog_insert','active_plan_catalog_update','active_plan_catalog_delete') AND permissive='RESTRICTIVE') = 12) THEN
    RAISE NOTICE 'Etapa já instalada: 20261124150718_plan_enforcement_audit.sql';
  ELSIF to_regprocedure('public.flux_legacy_plan_bridge_v1()') IS NOT NULL THEN
    EXECUTE $commercial_sql_2$
-- Authorize staff screens against the restaurant in the live staff session.
CREATE FUNCTION public.get_staff_entitlement(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE staff record; venue record; entitlement jsonb; plan text;
BEGIN
  SELECT * INTO staff FROM public.staff_session_info(p_token);
  IF staff.restaurant_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = '42501'; END IF;
  SELECT id, slug, owner_id INTO STRICT venue FROM restaurants WHERE id = staff.restaurant_id;
  entitlement := public.effective_entitlement(venue.owner_id);
  IF entitlement->>'plan_type' NOT IN ('basic','essential','pro','trial','enterprise')
    OR entitlement->>'plan_type' IS NULL THEN
    RAISE EXCEPTION 'Plano indisponível' USING ERRCODE = '42501';
  END IF;
  plan := public.get_restaurant_plan(venue.slug);
  RETURN jsonb_build_object(
    'plan', plan,
    'role', staff.role,
    'service_wind_down', NOT public.restaurant_has_operations(plan) AND (
      EXISTS (SELECT 1 FROM table_services s WHERE s.restaurant_id = venue.id AND s.ended_at IS NULL)
      OR EXISTS (SELECT 1 FROM orders o WHERE o.restaurant_id = venue.id AND NOT o.archived AND o.status <> 'cancelled')
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_staff_entitlement(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_entitlement(text) TO anon, authenticated;


CREATE FUNCTION public.staff_can_view_operation(p_token text, p_waiter_panel boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE access jsonb;
BEGIN
  access := public.get_staff_entitlement(p_token);
  IF access->>'role' IN ('waiter','both') AND (
    public.restaurant_has_waiter(access->>'plan') OR (access->>'service_wind_down')::boolean
  ) THEN RETURN true; END IF;
  RETURN NOT p_waiter_panel AND access->>'role' IN ('kitchen','both') AND (
    public.restaurant_has_operations(access->>'plan') OR (access->>'service_wind_down')::boolean
  );
END;
$$;
REVOKE ALL ON FUNCTION public.staff_can_view_operation(text,boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_list_orders(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
  IF NOT public.staff_can_view_operation(p_token, false) THEN
    RAISE EXCEPTION 'Operação indisponível para esta sessão e plano.' USING ERRCODE='42501';
  END IF;
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

CREATE OR REPLACE FUNCTION public.staff_list_tables(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
  IF NOT public.staff_can_view_operation(p_token, true) THEN
    RAISE EXCEPTION 'Operação indisponível para esta sessão e plano.' USING ERRCODE='42501';
  END IF;
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.label), '[]'::jsonb) INTO v_result
  FROM public.venue_tables t WHERE t.restaurant_id = v_rest;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_list_calls(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s record; result jsonb;
BEGIN
  IF NOT public.staff_can_view_operation(p_token, true) THEN
    RAISE EXCEPTION 'Operação indisponível para esta sessão e plano.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM staff_session_info(p_token);
  IF s.restaurant_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF s.role NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT coalesce(jsonb_agg(row_to_json(c) ORDER BY c.created_at DESC),'[]') INTO result FROM waiter_calls c
    WHERE restaurant_id=s.restaurant_id AND NOT resolved AND NOT is_test;
  RETURN result;
END $$;

-- The report is read-only and keeps its history available after an expired trial.
-- Raw owner order access remains subject to existing RLS for operations.
CREATE FUNCTION public.get_restaurant_analytics(
  p_restaurant_id uuid, p_from timestamptz, p_until timestamptz, p_offset integer
) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE entitlement jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  entitlement := public.get_my_entitlement();
  IF coalesce(entitlement->>'plan_type', '') NOT IN ('trial','pro','enterprise') THEN
    RAISE EXCEPTION 'Análises avançadas estão disponíveis a partir do plano Pro.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_until IS NULL OR p_until <= p_from
    OR p_until - p_from > interval '200 days' OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT to_jsonb(o) || jsonb_build_object('order_items', coalesce((
      SELECT jsonb_agg(to_jsonb(i) || jsonb_build_object(
        'menu_items', CASE WHEN m.id IS NOT NULL THEN jsonb_build_object(
          'category_id', m.category_id, 'categories', CASE WHEN c.id IS NOT NULL THEN
            jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind) END
        ) END
      ) ORDER BY i.id)
      FROM order_items i
      LEFT JOIN menu_items m ON m.id = i.menu_item_id AND m.restaurant_id = p_restaurant_id
      LEFT JOIN categories c ON c.id = m.category_id AND c.restaurant_id = p_restaurant_id
      WHERE i.order_id = o.id
    ), '[]'::jsonb))
    FROM orders o
    WHERE o.restaurant_id = p_restaurant_id AND o.created_at >= p_from AND o.created_at < p_until
    ORDER BY o.created_at DESC, o.id LIMIT 500 OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)
  TO authenticated;

-- Authenticated callers submit new manual orders through the scoped, retry-safe RPC.
REVOKE EXECUTE ON FUNCTION public.staff_place_order(text,uuid,jsonb),
  public.owner_place_order(uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
$commercial_sql_2$;
  ELSIF (to_regprocedure('public.get_staff_entitlement(text)') IS NOT NULL) OR
        (to_regprocedure('public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)') IS NOT NULL) OR
        (to_regprocedure('public.can_edit_catalog(uuid)') IS NOT NULL) OR
        ((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('categories','menu_items','modifier_groups','modifier_options') AND policyname IN ('active_plan_catalog_insert','active_plan_catalog_update','active_plan_catalog_delete') AND permissive='RESTRICTIVE') = 12) THEN
    RAISE EXCEPTION 'Etapa parcial: 20261124150718_plan_enforcement_audit.sql. Confira o schema antes de repetir.';
  ELSE
    EXECUTE $commercial_sql_2$
-- Authorize staff screens against the restaurant in the live staff session.
CREATE FUNCTION public.get_staff_entitlement(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE staff record; venue record; entitlement jsonb; plan text;
BEGIN
  SELECT * INTO staff FROM public.staff_session_info(p_token);
  IF staff.restaurant_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = '42501'; END IF;
  SELECT id, slug, owner_id INTO STRICT venue FROM restaurants WHERE id = staff.restaurant_id;
  entitlement := public.effective_entitlement(venue.owner_id);
  IF entitlement->>'plan_type' NOT IN ('basic','essential','pro','trial','enterprise')
    OR entitlement->>'plan_type' IS NULL THEN
    RAISE EXCEPTION 'Plano indisponível' USING ERRCODE = '42501';
  END IF;
  plan := public.get_restaurant_plan(venue.slug);
  RETURN jsonb_build_object(
    'plan', plan,
    'role', staff.role,
    'service_wind_down', NOT public.restaurant_has_operations(plan) AND (
      EXISTS (SELECT 1 FROM table_services s WHERE s.restaurant_id = venue.id AND s.ended_at IS NULL)
      OR EXISTS (SELECT 1 FROM orders o WHERE o.restaurant_id = venue.id AND NOT o.archived AND o.status <> 'cancelled')
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_staff_entitlement(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_entitlement(text) TO anon, authenticated;


CREATE FUNCTION public.staff_can_view_operation(p_token text, p_waiter_panel boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE access jsonb;
BEGIN
  access := public.get_staff_entitlement(p_token);
  IF access->>'role' IN ('waiter','both') AND (
    public.restaurant_has_waiter(access->>'plan') OR (access->>'service_wind_down')::boolean
  ) THEN RETURN true; END IF;
  RETURN NOT p_waiter_panel AND access->>'role' IN ('kitchen','both') AND (
    public.restaurant_has_operations(access->>'plan') OR (access->>'service_wind_down')::boolean
  );
END;
$$;
REVOKE ALL ON FUNCTION public.staff_can_view_operation(text,boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_list_orders(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
  IF NOT public.staff_can_view_operation(p_token, false) THEN
    RAISE EXCEPTION 'Operação indisponível para esta sessão e plano.' USING ERRCODE='42501';
  END IF;
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

CREATE OR REPLACE FUNCTION public.staff_list_tables(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
  IF NOT public.staff_can_view_operation(p_token, true) THEN
    RAISE EXCEPTION 'Operação indisponível para esta sessão e plano.' USING ERRCODE='42501';
  END IF;
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.label), '[]'::jsonb) INTO v_result
  FROM public.venue_tables t WHERE t.restaurant_id = v_rest;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_list_calls(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s record; result jsonb;
BEGIN
  IF NOT public.staff_can_view_operation(p_token, true) THEN
    RAISE EXCEPTION 'Operação indisponível para esta sessão e plano.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM staff_session_info(p_token);
  IF s.restaurant_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF s.role NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT coalesce(jsonb_agg(row_to_json(c) ORDER BY c.created_at DESC),'[]') INTO result FROM waiter_calls c
    WHERE restaurant_id=s.restaurant_id AND NOT resolved AND NOT is_test;
  RETURN result;
END $$;

-- The report is read-only and keeps its history available after an expired trial.
-- Raw owner order access remains subject to existing RLS for operations.
CREATE FUNCTION public.get_restaurant_analytics(
  p_restaurant_id uuid, p_from timestamptz, p_until timestamptz, p_offset integer
) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE entitlement jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  entitlement := public.get_my_entitlement();
  IF coalesce(entitlement->>'plan_type', '') NOT IN ('trial','pro','enterprise') THEN
    RAISE EXCEPTION 'Análises avançadas estão disponíveis a partir do plano Pro.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_until IS NULL OR p_until <= p_from
    OR p_until - p_from > interval '200 days' OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT to_jsonb(o) || jsonb_build_object('order_items', coalesce((
      SELECT jsonb_agg(to_jsonb(i) || jsonb_build_object(
        'menu_items', CASE WHEN m.id IS NOT NULL THEN jsonb_build_object(
          'category_id', m.category_id, 'categories', CASE WHEN c.id IS NOT NULL THEN
            jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind) END
        ) END
      ) ORDER BY i.id)
      FROM order_items i
      LEFT JOIN menu_items m ON m.id = i.menu_item_id AND m.restaurant_id = p_restaurant_id
      LEFT JOIN categories c ON c.id = m.category_id AND c.restaurant_id = p_restaurant_id
      WHERE i.order_id = o.id
    ), '[]'::jsonb))
    FROM orders o
    WHERE o.restaurant_id = p_restaurant_id AND o.created_at >= p_from AND o.created_at < p_until
    ORDER BY o.created_at DESC, o.id LIMIT 500 OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)
  TO authenticated;

-- Authenticated callers submit new manual orders through the scoped, retry-safe RPC.
REVOKE EXECUTE ON FUNCTION public.staff_place_order(text,uuid,jsonb),
  public.owner_place_order(uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;

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
$commercial_sql_2$;
  END IF;
END $commercial_stage_2$;
DO $commercial_stage_3$ BEGIN
  IF (to_regprocedure('public.can_manage_restaurant_operation(uuid)') IS NOT NULL) AND
     (to_regprocedure('public.require_waiter_plan(uuid)') IS NOT NULL) AND
     (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname IN ('operation_plan_staff_insert','operation_plan_staff_update','operation_plan_staff_delete','operation_plan_table_delete'))) THEN
    RAISE NOTICE 'Etapa já instalada: 20261124152106_guard_staff_operations.sql';
  ELSIF (to_regprocedure('public.can_manage_restaurant_operation(uuid)') IS NOT NULL) OR
        (to_regprocedure('public.require_waiter_plan(uuid)') IS NOT NULL) OR
        (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname IN ('operation_plan_staff_insert','operation_plan_staff_update','operation_plan_staff_delete','operation_plan_table_delete'))) THEN
    RAISE EXCEPTION 'Etapa parcial: 20261124152106_guard_staff_operations.sql. Confira o schema antes de repetir.';
  ELSE
    EXECUTE $commercial_sql_3$
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
$commercial_sql_3$;
  END IF;
END $commercial_stage_3$;
DO $commercial_contract$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.guard_operational_qr()') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_0$
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
$commercial_body_0$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.guard_operational_qr()'),'EXECUTE') IS FALSE AND has_function_privilege('authenticated',to_regprocedure('public.guard_operational_qr()'),'EXECUTE') IS FALSE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.guard_operational_qr()';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.restaurant_table_is_operational(uuid,text)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_1$
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
$commercial_body_1$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.restaurant_table_is_operational(uuid,text)'),'EXECUTE') IS TRUE AND has_function_privilege('authenticated',to_regprocedure('public.restaurant_table_is_operational(uuid,text)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.restaurant_table_is_operational(uuid,text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.ensure_table_service(uuid,boolean)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_2$
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
END $commercial_body_2$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.ensure_table_service(uuid,boolean)'),'EXECUTE') IS FALSE AND has_function_privilege('authenticated',to_regprocedure('public.ensure_table_service(uuid,boolean)'),'EXECUTE') IS FALSE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.ensure_table_service(uuid,boolean)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.select_operational_tables(uuid,uuid[])') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_3$
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
$commercial_body_3$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.select_operational_tables(uuid,uuid[])'),'EXECUTE') IS FALSE AND has_function_privilege('authenticated',to_regprocedure('public.select_operational_tables(uuid,uuid[])'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.select_operational_tables(uuid,uuid[])';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.platform_change_entitlement(uuid,text,text,integer,text,bigint)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_4$
DECLARE r record; before_value jsonb; after_value jsonb; next_plan text; next_trial timestamptz; v bigint; actor text;
BEGIN
 IF NOT public.is_platform_owner() THEN
   RAISE EXCEPTION 'Acesso exclusivo do proprietário do Flux.' USING ERRCODE='42501';
 END IF;
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
END $commercial_body_4$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.platform_change_entitlement(uuid,text,text,integer,text,bigint)'),'EXECUTE') IS FALSE AND has_function_privilege('authenticated',to_regprocedure('public.platform_change_entitlement(uuid,text,text,integer,text,bigint)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.platform_change_entitlement(uuid,text,text,integer,text,bigint)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_5$
DECLARE uid uuid; active_plan text; plan text; generation bigint; current_generation bigint;
BEGIN
  IF p_environment NOT IN ('live','sandbox') OR p_created IS NULL OR p_event_id IS NULL THEN RAISE EXCEPTION 'Invalid event'; END IF;
  uid := (p_subscription->>'user_id')::uuid;
  plan := p_subscription->>'plan_type';
  generation := (p_subscription->>'reconciliation_generation')::bigint;
  SELECT r.generation INTO current_generation FROM billing_reconciliation r
    WHERE r.environment=p_environment AND r.subscription_id=p_subscription->>'stripe_subscription_id' FOR UPDATE;
  IF generation IS NULL OR current_generation IS NULL THEN RAISE EXCEPTION 'Missing billing reconciliation'; END IF;
  IF generation <> current_generation THEN RETURN; END IF;
  IF plan IS NOT NULL AND plan NOT IN ('basic','essential','pro') THEN RAISE EXCEPTION 'Invalid plan'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,3));
  INSERT INTO billing_events(event_id,environment,created) VALUES(p_event_id,p_environment,p_created) ON CONFLICT DO NOTHING;
  -- A signed retry still reconciles the current Stripe state.
  INSERT INTO subscriptions(user_id,stripe_subscription_id,stripe_customer_id,price_id,product_id,status,
    current_period_start,current_period_end,cancel_at_period_end,environment,last_event_created,plan_type)
  VALUES(uid,p_subscription->>'stripe_subscription_id',p_subscription->>'stripe_customer_id',p_subscription->>'price_id',
    p_subscription->>'product_id',p_subscription->>'status',(p_subscription->>'current_period_start')::timestamptz,
    (p_subscription->>'current_period_end')::timestamptz,(p_subscription->>'cancel_at_period_end')::boolean,p_environment,p_created,plan)
  ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=EXCLUDED.status,price_id=EXCLUDED.price_id,
    product_id=EXCLUDED.product_id,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,
    cancel_at_period_end=EXCLUDED.cancel_at_period_end,last_event_created=greatest(subscriptions.last_event_created, EXCLUDED.last_event_created),
    plan_type=coalesce(EXCLUDED.plan_type,subscriptions.plan_type),updated_at=now()
  WHERE subscriptions.user_id=EXCLUDED.user_id AND subscriptions.environment=EXCLUDED.environment
    AND (subscriptions.status <> 'canceled' OR EXCLUDED.status = 'canceled');
  IF NOT FOUND THEN RETURN; END IF;
  IF p_environment <> 'live' THEN RETURN; END IF;
  SELECT s.plan_type INTO active_plan FROM subscriptions s WHERE s.user_id=uid AND s.environment='live'
    AND s.status IN ('active','trialing') AND s.plan_type IS NOT NULL ORDER BY s.updated_at DESC, s.last_event_created DESC, s.stripe_subscription_id LIMIT 1;
  IF active_plan IS NOT NULL THEN
    UPDATE profiles SET plan_type=active_plan WHERE id=uid;
  ELSIF (p_subscription->>'status') IN ('past_due','unpaid','incomplete_expired','paused','canceled') THEN
    UPDATE profiles SET plan_type='trial',trial_ends_at=to_timestamp(0) WHERE id=uid;
  END IF;
END $commercial_body_5$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'EXECUTE') IS FALSE AND has_function_privilege('authenticated',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'EXECUTE') IS FALSE AND has_function_privilege('service_role',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.apply_billing_event(text,bigint,text,jsonb)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.begin_billing_reconciliation(text,text)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_6$
  INSERT INTO billing_reconciliation AS r(environment,subscription_id)
  VALUES (p_environment,p_subscription_id)
  ON CONFLICT (environment,subscription_id) DO UPDATE SET generation = r.generation + 1
  RETURNING generation::text;
$commercial_body_6$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.begin_billing_reconciliation(text,text)'),'EXECUTE') IS FALSE AND has_function_privilege('authenticated',to_regprocedure('public.begin_billing_reconciliation(text,text)'),'EXECUTE') IS FALSE AND has_function_privilege('service_role',to_regprocedure('public.begin_billing_reconciliation(text,text)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.begin_billing_reconciliation(text,text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.reserve_billing_checkout(uuid,text,text,text,text)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_7$
DECLARE slot billing_checkout_attempts; now_epoch bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_environment, 11));
  now_epoch := floor(extract(epoch FROM clock_timestamp()));
  SELECT * INTO slot FROM billing_checkout_attempts WHERE user_id = p_user_id AND environment = p_environment;
  IF NOT FOUND OR slot.expires_at <= now_epoch THEN
    INSERT INTO billing_checkout_attempts(user_id,environment,stripe_price_id,stripe_customer_id,return_url,expires_at)
    VALUES (p_user_id,p_environment,p_price_id,p_customer_id,p_return_url,now_epoch + 7200)
    ON CONFLICT (user_id,environment) DO UPDATE SET
      attempt_id = EXCLUDED.attempt_id, stripe_price_id = EXCLUDED.stripe_price_id,
      stripe_customer_id = EXCLUDED.stripe_customer_id, return_url = EXCLUDED.return_url, expires_at = EXCLUDED.expires_at
    RETURNING * INTO slot;
  END IF;
  RETURN jsonb_build_object('attempt_id',slot.attempt_id,'price_id',slot.stripe_price_id,
    'customer_id',slot.stripe_customer_id,'return_url',slot.return_url,'expires_at',slot.expires_at);
END;
$commercial_body_7$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.reserve_billing_checkout(uuid,text,text,text,text)'),'EXECUTE') IS FALSE AND has_function_privilege('authenticated',to_regprocedure('public.reserve_billing_checkout(uuid,text,text,text,text)'),'EXECUTE') IS FALSE AND has_function_privilege('service_role',to_regprocedure('public.reserve_billing_checkout(uuid,text,text,text,text)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.reserve_billing_checkout(uuid,text,text,text,text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.release_table_service(uuid,uuid,uuid,text,numeric,numeric)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_8$
DECLARE rid uuid:=p_restaurant_id; s record; tid uuid:=p_table_id; canonical text; current_service uuid; unambiguous boolean; ids uuid[]; primary_id uuid;
BEGIN
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO s FROM public.staff_session_info(p_staff_token);
   IF s.restaurant_id IS NULL OR coalesce(s.role,'') NOT IN ('waiter','both') OR (rid IS NOT NULL AND rid<>s.restaurant_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   rid:=s.restaurant_id;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado';
 END IF;
 IF p_service_fee IS NULL OR p_cover_charge IS NULL OR p_service_fee<0 OR p_cover_charge<0 OR p_service_fee>1000000 OR p_cover_charge>1000000 THEN RAISE EXCEPTION 'Taxas inválidas'; END IF;
 IF tid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(tid::text,4));
 SELECT label, active_service_id INTO canonical, current_service FROM venue_tables
 WHERE id=tid AND restaurant_id=rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 IF current_service IS DISTINCT FROM p_service_id OR (current_service IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM table_services WHERE id=current_service AND table_id=tid AND restaurant_id=rid AND ended_at IS NULL
 )) THEN RAISE EXCEPTION 'O atendimento mudou. Atualize a mesa antes de encerrar.' USING ERRCODE='40001'; END IF;
 SELECT count(*)=1 INTO unambiguous FROM venue_tables WHERE restaurant_id=rid
   AND public.operational_table_label(label)=public.operational_table_label(canonical);
 PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
 SELECT coalesce(array_agg(id ORDER BY created_at,id),'{}'::uuid[]) INTO ids FROM orders
 WHERE restaurant_id=rid AND NOT coalesce(archived,false) AND status::text<>'cancelled'
 AND ((service_id=current_service AND table_id=tid) OR (service_id IS NULL AND
   (table_id=tid OR (table_id IS NULL AND unambiguous
     AND public.operational_table_label(table_label)=public.operational_table_label(canonical)))));

 IF EXISTS(SELECT 1 FROM orders WHERE id=ANY(ids) AND status<>'served') THEN RAISE EXCEPTION 'Há pedidos ainda não entregues. Entregue ou cancele antes de encerrar a mesa.'; END IF;
 primary_id:=ids[1];
 IF primary_id IS NOT NULL AND (p_service_fee>0 OR p_cover_charge>0) THEN
 UPDATE orders SET service_fee=p_service_fee,cover_charge=p_cover_charge WHERE id=primary_id;
 END IF;
 UPDATE orders SET archived=true,status='served',updated_at=now() WHERE id=ANY(ids);
 UPDATE waiter_calls SET resolved=true,resolved_at=now() WHERE restaurant_id=rid AND NOT resolved
 AND (table_id=tid OR (table_id IS NULL AND unambiguous
   AND public.operational_table_label(table_label)=public.operational_table_label(canonical)));
 UPDATE orders SET archived=true WHERE restaurant_id=rid AND table_id=tid AND status='cancelled'
   AND (service_id=current_service OR service_id IS NULL) AND NOT archived;
 UPDATE table_services SET ended_at=now(),state='closed' WHERE id=(SELECT active_service_id FROM venue_tables WHERE id=tid) AND ended_at IS NULL;
 UPDATE venue_tables SET active_service_id=NULL,service_started_at=NULL,service_state='free' WHERE id=tid;
 DELETE FROM table_order_codes WHERE table_id=tid;
 RETURN ids;
END $commercial_body_8$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.release_table_service(uuid,uuid,uuid,text,numeric,numeric)'),'EXECUTE') IS TRUE AND has_function_privilege('authenticated',to_regprocedure('public.release_table_service(uuid,uuid,uuid,text,numeric,numeric)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.release_table_service(uuid,uuid,uuid,text,numeric,numeric)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.release_table(uuid,text,text,numeric,numeric)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_9$
DECLARE rid uuid := p_restaurant_id; staff record; target record;
BEGIN
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO staff FROM public.staff_session_info(p_staff_token);
   IF staff.restaurant_id IS NULL OR coalesce(staff.role,'') NOT IN ('waiter','both')
     OR (rid IS NOT NULL AND rid<>staff.restaurant_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   rid := staff.restaurant_id;
 ELSIF NOT EXISTS (SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 SELECT id, active_service_id INTO STRICT target FROM venue_tables
 WHERE restaurant_id=rid AND public.operational_table_label(label)=public.operational_table_label(p_table_label);
 RETURN public.release_table_service(rid,target.id,target.active_service_id,p_staff_token,p_service_fee,p_cover_charge);
EXCEPTION WHEN no_data_found OR too_many_rows THEN
 RAISE EXCEPTION 'Mesa inválida ou ambígua. Atualize a aplicação e selecione a mesa.';
END $commercial_body_9$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.release_table(uuid,text,text,numeric,numeric)'),'EXECUTE') IS TRUE AND has_function_privilege('authenticated',to_regprocedure('public.release_table(uuid,text,text,numeric,numeric)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.release_table(uuid,text,text,numeric,numeric)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_staff_entitlement(text)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_10$
DECLARE staff record; venue record; entitlement jsonb; plan text;
BEGIN
  SELECT * INTO staff FROM public.staff_session_info(p_token);
  IF staff.restaurant_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = '42501'; END IF;
  SELECT id, slug, owner_id INTO STRICT venue FROM restaurants WHERE id = staff.restaurant_id;
  entitlement := public.effective_entitlement(venue.owner_id);
  IF entitlement->>'plan_type' NOT IN ('basic','essential','pro','trial','enterprise')
    OR entitlement->>'plan_type' IS NULL THEN
    RAISE EXCEPTION 'Plano indisponível' USING ERRCODE = '42501';
  END IF;
  plan := public.get_restaurant_plan(venue.slug);
  RETURN jsonb_build_object(
    'plan', plan,
    'role', staff.role,
    'service_wind_down', NOT public.restaurant_has_operations(plan) AND (
      EXISTS (SELECT 1 FROM table_services s WHERE s.restaurant_id = venue.id AND s.ended_at IS NULL)
      OR EXISTS (SELECT 1 FROM orders o WHERE o.restaurant_id = venue.id AND NOT o.archived AND o.status <> 'cancelled')
    )
  );
END;
$commercial_body_10$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.get_staff_entitlement(text)'),'EXECUTE') IS TRUE AND has_function_privilege('authenticated',to_regprocedure('public.get_staff_entitlement(text)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.get_staff_entitlement(text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_11$
DECLARE entitlement jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  entitlement := public.get_my_entitlement();
  IF coalesce(entitlement->>'plan_type', '') NOT IN ('trial','pro','enterprise') THEN
    RAISE EXCEPTION 'Análises avançadas estão disponíveis a partir do plano Pro.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_until IS NULL OR p_until <= p_from
    OR p_until - p_from > interval '200 days' OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT to_jsonb(o) || jsonb_build_object('order_items', coalesce((
      SELECT jsonb_agg(to_jsonb(i) || jsonb_build_object(
        'menu_items', CASE WHEN m.id IS NOT NULL THEN jsonb_build_object(
          'category_id', m.category_id, 'categories', CASE WHEN c.id IS NOT NULL THEN
            jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind) END
        ) END
      ) ORDER BY i.id)
      FROM order_items i
      LEFT JOIN menu_items m ON m.id = i.menu_item_id AND m.restaurant_id = p_restaurant_id
      LEFT JOIN categories c ON c.id = m.category_id AND c.restaurant_id = p_restaurant_id
      WHERE i.order_id = o.id
    ), '[]'::jsonb))
    FROM orders o
    WHERE o.restaurant_id = p_restaurant_id AND o.created_at >= p_from AND o.created_at < p_until
    ORDER BY o.created_at DESC, o.id LIMIT 500 OFFSET p_offset;
END;
$commercial_body_11$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)'),'EXECUTE') IS FALSE AND has_function_privilege('authenticated',to_regprocedure('public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.start_table_service(uuid,text)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_12$
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
END $commercial_body_12$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.start_table_service(uuid,text)'),'EXECUTE') IS TRUE AND has_function_privilege('authenticated',to_regprocedure('public.start_table_service(uuid,text)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.start_table_service(uuid,text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.table_order_code(uuid,text,boolean)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_13$
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
END $commercial_body_13$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.table_order_code(uuid,text,boolean)'),'EXECUTE') IS TRUE AND has_function_privilege('authenticated',to_regprocedure('public.table_order_code(uuid,text,boolean)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.table_order_code(uuid,text,boolean)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.can_manage_restaurant_operation(uuid)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_14$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.id = p_restaurant_id AND r.owner_id = auth.uid()
      AND public.restaurant_has_operations(public.get_restaurant_plan(r.slug))
  );
$commercial_body_14$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.can_manage_restaurant_operation(uuid)'),'EXECUTE') IS FALSE AND has_function_privilege('authenticated',to_regprocedure('public.can_manage_restaurant_operation(uuid)'),'EXECUTE') IS TRUE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.can_manage_restaurant_operation(uuid)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.require_waiter_plan(uuid)') AND btrim(replace(prosrc,chr(13),''))=btrim(
$commercial_body_15$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM restaurants r WHERE r.id = p_restaurant_id
      AND public.restaurant_has_waiter(public.get_restaurant_plan(r.slug))
  ) THEN
    RAISE EXCEPTION 'A operação do garçom está disponível a partir do plano Pro.' USING ERRCODE = '42501';
  END IF;
END;
$commercial_body_15$)) OR NOT (has_function_privilege('anon',to_regprocedure('public.require_waiter_plan(uuid)'),'EXECUTE') IS FALSE AND has_function_privilege('authenticated',to_regprocedure('public.require_waiter_plan(uuid)'),'EXECUTE') IS FALSE) THEN
    RAISE EXCEPTION 'Corpo ou grants divergentes em public.require_waiter_plan(uuid)';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) AS role_name WHERE
    has_function_privilege(role_name,'public.staff_place_order(text,uuid,jsonb)','EXECUTE')
    OR has_function_privilege(role_name,'public.owner_place_order(uuid,uuid,jsonb,text)','EXECUTE')) THEN
    RAISE EXCEPTION 'RPC legada de pedido manual ainda exposta.'; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES
    ('venue_tables','guard_operational_qr','guard_operational_qr',23),
    ('venue_tables','guard_active_table_delete','guard_active_table_delete',11),
    ('orders','commercial_guard_order','guard_new_order_plan',7),
    ('orders','attach_table_service','attach_table_service',7),
    ('waiter_calls','commercial_guard_call','guard_new_call_plan',7),
    ('waiter_calls','mark_service_bill','mark_service_bill',5)
  ) expected(relation,trigger_name,function_name,kind) WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.' || relation)
      AND t.tgname=trigger_name AND t.tgfoid=to_regprocedure('public.' || function_name || '()')
      AND t.tgtype=kind AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal
  )) THEN RAISE EXCEPTION 'Gatilhos comerciais ausentes, desabilitados ou divergentes.'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND permissive='RESTRICTIVE'
    AND roles=ARRAY['authenticated']::name[] AND (
      (tablename='staff_members' AND policyname='operation_plan_staff_insert' AND cmd='INSERT' AND with_check='can_manage_restaurant_operation(restaurant_id)')
      OR (tablename='staff_members' AND policyname='operation_plan_staff_update' AND cmd='UPDATE' AND qual='can_manage_restaurant_operation(restaurant_id)' AND with_check=qual)
      OR (tablename='staff_members' AND policyname='operation_plan_staff_delete' AND cmd='DELETE' AND qual='can_manage_restaurant_operation(restaurant_id)')
      OR (tablename='venue_tables' AND policyname='operation_plan_table_delete' AND cmd='DELETE' AND qual='can_manage_restaurant_operation(restaurant_id)')
    )) <> 4 THEN RAISE EXCEPTION 'Políticas operacionais divergentes.'; END IF;
END $commercial_contract$;
DROP TRIGGER IF EXISTS flux_legacy_guard_table_label ON public.venue_tables;
DROP FUNCTION IF EXISTS public.flux_legacy_guard_table_label();
DROP FUNCTION IF EXISTS public.flux_legacy_plan_bridge_v1();
NOTIFY pgrst, 'reload schema';
COMMIT;

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

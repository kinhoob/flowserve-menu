
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

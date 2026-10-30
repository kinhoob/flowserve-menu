CREATE TABLE public.billing_events (
  event_id text NOT NULL, environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  created bigint NOT NULL, processed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(event_id,environment)
);
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_events FROM PUBLIC,anon,authenticated;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_event_created bigint NOT NULL DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_type text;
UPDATE public.subscriptions SET plan_type=CASE price_id
  WHEN 'basic_monthly' THEN 'basic' WHEN 'essential_monthly' THEN 'essential' WHEN 'pro_monthly' THEN 'pro' END
WHERE plan_type IS NULL;

CREATE OR REPLACE FUNCTION public.apply_billing_event(p_event_id text,p_created bigint,p_environment text,p_subscription jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid; active_plan text; plan text;
BEGIN
  IF p_environment NOT IN ('live','sandbox') OR p_created IS NULL OR p_event_id IS NULL THEN RAISE EXCEPTION 'Invalid event'; END IF;
  uid := (p_subscription->>'user_id')::uuid;
  plan := p_subscription->>'plan_type';
  IF plan IS NOT NULL AND plan NOT IN ('basic','essential','pro') THEN RAISE EXCEPTION 'Invalid plan'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,3));
  INSERT INTO billing_events(event_id,environment,created) VALUES(p_event_id,p_environment,p_created) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO subscriptions(user_id,stripe_subscription_id,stripe_customer_id,price_id,product_id,status,
    current_period_start,current_period_end,cancel_at_period_end,environment,last_event_created,plan_type)
  VALUES(uid,p_subscription->>'stripe_subscription_id',p_subscription->>'stripe_customer_id',p_subscription->>'price_id',
    p_subscription->>'product_id',p_subscription->>'status',(p_subscription->>'current_period_start')::timestamptz,
    (p_subscription->>'current_period_end')::timestamptz,(p_subscription->>'cancel_at_period_end')::boolean,p_environment,p_created,plan)
  ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=EXCLUDED.status,price_id=EXCLUDED.price_id,
    product_id=EXCLUDED.product_id,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,
    cancel_at_period_end=EXCLUDED.cancel_at_period_end,last_event_created=EXCLUDED.last_event_created,
    plan_type=coalesce(EXCLUDED.plan_type,subscriptions.plan_type),updated_at=now()
  WHERE subscriptions.last_event_created <= EXCLUDED.last_event_created
    AND subscriptions.user_id=EXCLUDED.user_id AND subscriptions.environment=EXCLUDED.environment;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_environment <> 'live' THEN RETURN; END IF;
  SELECT s.plan_type INTO active_plan FROM subscriptions s WHERE s.user_id=uid AND s.environment='live'
    AND s.status IN ('active','trialing') AND s.plan_type IS NOT NULL ORDER BY s.last_event_created DESC LIMIT 1;
  IF active_plan IS NOT NULL THEN
    UPDATE profiles SET plan_type=active_plan WHERE id=uid;
  ELSIF (p_subscription->>'status') IN ('past_due','unpaid','incomplete_expired','paused','canceled') THEN
    UPDATE profiles SET plan_type='trial',trial_ends_at=to_timestamp(0) WHERE id=uid;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.apply_billing_event(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_event(text,bigint,text,jsonb) TO service_role;

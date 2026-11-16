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

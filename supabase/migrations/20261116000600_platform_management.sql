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

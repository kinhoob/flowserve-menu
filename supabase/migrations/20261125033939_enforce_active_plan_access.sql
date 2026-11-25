-- For the coordinated commercial release. Keep the separate legacy bridge unchanged.
-- Restrictive policies preserve ownership and grants while hiding private data during suspension.
DO $operation_access$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'venue_tables','orders','waiter_calls','staff_members','table_services','operation_events'
  ]
  LOOP
    EXECUTE format('CREATE POLICY entitled_operation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_manage_restaurant_operation(restaurant_id)) WITH CHECK (public.can_manage_restaurant_operation(restaurant_id))', relation);
  END LOOP;
END $operation_access$;

CREATE POLICY entitled_operation ON public.order_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id));

CREATE POLICY active_venue_insert ON public.restaurants AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM (SELECT public.get_my_entitlement() AS value) e
    WHERE e.value->>'plan_type' IN ('basic','essential','pro','enterprise')
      OR (e.value->>'plan_type' = 'trial' AND (e.value->>'trial_ends_at')::timestamptz > now())
  ));
CREATE POLICY active_venue_update ON public.restaurants AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_edit_catalog(id)) WITH CHECK (public.can_edit_catalog(id));
CREATE POLICY active_venue_delete ON public.restaurants AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_edit_catalog(id));

-- Public menu and media remain readable. Only the internal writes require active access.
CREATE POLICY active_menu_media_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'menu-images' OR EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.owner_id = (SELECT auth.uid()) AND public.can_edit_catalog(r.id)
  ));
CREATE POLICY active_menu_media_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'menu-images' OR EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.owner_id = (SELECT auth.uid()) AND public.can_edit_catalog(r.id)
  ))
  WITH CHECK (bucket_id <> 'menu-images' OR EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.owner_id = (SELECT auth.uid()) AND public.can_edit_catalog(r.id)
  ));
CREATE POLICY active_menu_media_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'menu-images' OR EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.owner_id = (SELECT auth.uid()) AND public.can_edit_catalog(r.id)
  ));

CREATE OR REPLACE FUNCTION public.get_staff_entitlement(p_token text) RETURNS jsonb
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
    'service_wind_down', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_can_view_operation(p_token text, p_waiter_panel boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE access jsonb;
BEGIN
  access := public.get_staff_entitlement(p_token);
  RETURN (
    access->>'role' IN ('waiter','both') AND public.restaurant_has_waiter(access->>'plan')
  ) OR (
    NOT p_waiter_panel AND access->>'role' IN ('kitchen','both')
    AND public.restaurant_has_operations(access->>'plan')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_analytics(
  p_restaurant_id uuid, p_from timestamptz, p_until timestamptz, p_offset integer
) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE entitlement jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  entitlement := public.get_my_entitlement();
  IF NOT public.can_edit_catalog(p_restaurant_id)
    OR coalesce(entitlement->>'plan_type', '') NOT IN ('trial','pro','enterprise') THEN
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
 IF NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id=rid
   AND public.restaurant_has_operations(public.get_restaurant_plan(r.slug))) THEN
   RAISE EXCEPTION 'A operação está disponível a partir do plano Essential.' USING ERRCODE='42501';
 END IF;
 IF p_staff_token IS NOT NULL THEN
  PERFORM public.require_waiter_plan(rid);
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

CREATE OR REPLACE FUNCTION public.get_table_events(p_table_id uuid,p_staff_token text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid;s record;result jsonb;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
 SELECT * INTO s FROM staff_session_info(p_staff_token);
 IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  PERFORM public.require_waiter_plan(rid);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id=rid
   AND public.restaurant_has_operations(public.get_restaurant_plan(r.slug))) THEN
   RAISE EXCEPTION 'A operação está disponível a partir do plano Essential.' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(row_to_json(e)),'[]') INTO result FROM (SELECT occurred_at,event,actor_name,details FROM operation_events WHERE restaurant_id=rid AND table_id=p_table_id ORDER BY occurred_at DESC,id DESC LIMIT 40)e;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.transition_order(p_order_id uuid,p_expected_status text,p_next_status text,p_staff_token text DEFAULT NULL,p_delivered_by text DEFAULT NULL,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid; s record; staff_name text;
BEGIN
 SELECT restaurant_id INTO rid FROM orders WHERE id=p_order_id;
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO s FROM staff_session_info(p_staff_token);
   IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','kitchen','both') THEN
     RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
   END IF;
   IF p_next_status IN ('served','cancelled') THEN
     IF s.role NOT IN ('waiter','both') THEN
       RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
     END IF;
     PERFORM public.require_waiter_plan(rid);
   ELSIF p_next_status IN ('accepted','preparing','ready') AND s.role NOT IN ('kitchen','both') THEN
     RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
   END IF;
   staff_name:=s.name;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
 ELSE
   staff_name:=left(nullif(btrim(p_delivered_by),''),80);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id=rid
   AND public.restaurant_has_operations(public.get_restaurant_plan(r.slug))) THEN
   RAISE EXCEPTION 'A operação está disponível a partir do plano Essential.' USING ERRCODE='42501';
 END IF;
 IF p_next_status NOT IN ('accepted','preparing','ready','served','cancelled') OR p_next_status IS NULL OR p_expected_status IS NULL THEN RAISE EXCEPTION 'Etapa inválida'; END IF;
 PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
 UPDATE orders SET status=p_next_status::public.order_status,
 delivered_by_name=CASE WHEN p_next_status='served' THEN staff_name ELSE delivered_by_name END,
 delivered_at=CASE WHEN p_next_status='served' THEN coalesce(delivered_at,now()) ELSE delivered_at END,
 cancellation_reason=CASE WHEN p_next_status='cancelled' THEN left(p_reason,280) ELSE cancellation_reason END
 WHERE id=p_order_id AND restaurant_id=rid AND NOT archived AND status::text=p_expected_status;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outra pessoa já atualizou este pedido. A fila será recarregada.' USING ERRCODE='40001'; END IF;
END $$;

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
 PERFORM public.require_waiter_plan(rid);
 PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
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

CREATE OR REPLACE FUNCTION public.recover_internal_order(p_table_id uuid,p_request_token uuid,p_staff_token text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid;s record;result uuid;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
 SELECT * INTO s FROM staff_session_info(p_staff_token);
 IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 END IF;
 PERFORM public.require_waiter_plan(rid);
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 SELECT order_id INTO result FROM internal_order_requests WHERE restaurant_id=rid AND table_id=p_table_id AND request_token=p_request_token;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.hide_completed_orders(p_restaurant_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=p_restaurant_id AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.id=p_restaurant_id
   AND public.restaurant_has_operations(public.get_restaurant_plan(r.slug))) THEN
   RAISE EXCEPTION 'A operação está disponível a partir do plano Essential.' USING ERRCODE='42501';
 END IF;
 UPDATE orders SET kitchen_hidden=true WHERE restaurant_id=p_restaurant_id AND status IN ('served','cancelled') AND NOT kitchen_hidden;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.staff_resolve_call(p_token text,p_call_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM staff_session_info(p_token);
  IF s.restaurant_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF s.role NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM public.require_waiter_plan(s.restaurant_id);
  UPDATE waiter_calls SET resolved=true,resolved_at=now() WHERE id=p_call_id AND restaurant_id=s.restaurant_id;
END $$;

-- Retire unused RPCs that expose team lists or archive orders outside the supported flow.
REVOKE EXECUTE ON FUNCTION public.staff_list_members(text), public.staff_archive_orders(text,uuid[])
  FROM PUBLIC, anon, authenticated;

-- The plan-only bridge still calls the original billing routines.
CREATE OR REPLACE FUNCTION public.reserve_billing_checkout(
  p_user_id uuid, p_environment text, p_price_id text, p_customer_id text, p_return_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE slot billing_checkout_attempts; now_epoch bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_environment, 11));
  -- Use the webhook's account lock before checking the materialized subscription.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,3));
  IF EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.user_id=p_user_id AND s.environment=p_environment
    AND s.status IN ('active','trialing','past_due','unpaid','incomplete','paused')
  ) THEN
    RAISE EXCEPTION 'Já existe uma assinatura. Gerencie-a na aba Assinatura.' USING ERRCODE='22023';
  END IF;
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

CREATE FUNCTION public.guard_basic_operation_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT public.can_manage_restaurant_operation(OLD.id)
    AND (NEW.kitchen_open, NEW.bar_open, NEW.operating_hours, NEW.require_table_code)
      IS DISTINCT FROM (OLD.kitchen_open, OLD.bar_open, OLD.operating_hours, OLD.require_table_code)
  THEN
    RAISE EXCEPTION 'As configurações de operação estão disponíveis a partir do plano Essential.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_basic_operation_settings() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_basic_operation_settings
  BEFORE UPDATE OF kitchen_open, bar_open, operating_hours, require_table_code ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.guard_basic_operation_settings();

NOTIFY pgrst, 'reload schema';

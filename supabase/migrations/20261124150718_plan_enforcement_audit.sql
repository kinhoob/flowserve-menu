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

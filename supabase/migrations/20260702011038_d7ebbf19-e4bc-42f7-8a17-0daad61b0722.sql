
CREATE OR REPLACE FUNCTION public.staff_list_orders(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
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
          'notes', oi.notes
        ) ORDER BY oi.created_at)
        FROM public.order_items oi WHERE oi.order_id = o.id
      ), '[]'::jsonb) AS items,
      (COALESCE(o.subtotal,0) + COALESCE(o.service_fee,0) + COALESCE(o.cover_charge,0)) AS total
    FROM public.orders o
    WHERE o.restaurant_id = v_rest AND COALESCE(o.archived,false) = false
  ) o;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.staff_archive_orders(p_token text, p_order_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE='P0001'; END IF;
  UPDATE public.orders SET archived = true, updated_at = now()
  WHERE id = ANY(p_order_ids) AND restaurant_id = v_rest;
END; $$;

CREATE OR REPLACE FUNCTION public.staff_update_order_status(p_token text, p_order_id uuid, p_status text, p_staff_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE='P0001'; END IF;
  UPDATE public.orders
     SET status = p_status,
         delivered_by_name = CASE WHEN p_status = 'served' THEN COALESCE(p_staff_name, delivered_by_name) ELSE delivered_by_name END,
         delivered_at = CASE WHEN p_status = 'served' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
         updated_at = now()
   WHERE id = p_order_id AND restaurant_id = v_rest;
END; $$;

CREATE OR REPLACE FUNCTION public.staff_list_calls(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE='P0001'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.created_at DESC), '[]'::jsonb) INTO v_result
  FROM public.waiter_calls c
  WHERE c.restaurant_id = v_rest AND COALESCE(c.resolved,false) = false;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.staff_resolve_call(p_token text, p_call_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE='P0001'; END IF;
  UPDATE public.waiter_calls SET resolved = true, resolved_at = now()
  WHERE id = p_call_id AND restaurant_id = v_rest;
END; $$;

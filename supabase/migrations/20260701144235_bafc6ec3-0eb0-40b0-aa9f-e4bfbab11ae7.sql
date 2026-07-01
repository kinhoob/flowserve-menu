
-- 1) Extend staff_members with pin + role
ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS pin text,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'both' CHECK (role IN ('waiter','kitchen','both'));

-- Unique PIN per restaurant (when set)
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_pin_per_restaurant
  ON public.staff_members(restaurant_id, pin) WHERE pin IS NOT NULL;

-- 2) Staff sessions table
CREATE TABLE IF NOT EXISTS public.staff_sessions (
  token text PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_sessions_restaurant_idx ON public.staff_sessions(restaurant_id);

GRANT SELECT ON public.staff_sessions TO anon, authenticated;
GRANT ALL ON public.staff_sessions TO service_role;

ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;
-- No direct client access; only through security-definer RPCs
CREATE POLICY "no direct access" ON public.staff_sessions FOR SELECT USING (false);

-- 3) Helper: resolve a valid staff session token → restaurant + role
CREATE OR REPLACE FUNCTION public.staff_session_info(p_token text)
RETURNS TABLE (staff_id uuid, restaurant_id uuid, name text, role text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.restaurant_id, s.name, s.role
  FROM public.staff_sessions ss
  JOIN public.staff_members s ON s.id = ss.staff_id
  WHERE ss.token = p_token AND ss.expires_at > now();
$$;

-- 4) staff_login(slug, pin) — validate + issue token
CREATE OR REPLACE FUNCTION public.staff_login(p_slug text, p_pin text)
RETURNS TABLE (token text, staff_id uuid, name text, role text, restaurant_slug text, restaurant_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rest_id uuid;
  v_rest_name text;
  v_staff record;
  v_token text;
BEGIN
  SELECT id, name INTO v_rest_id, v_rest_name FROM public.restaurants WHERE slug = p_slug;
  IF v_rest_id IS NULL THEN
    RAISE EXCEPTION 'Restaurante não encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_staff FROM public.staff_members
   WHERE restaurant_id = v_rest_id AND pin = p_pin AND active = true
   LIMIT 1;

  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'PIN inválido' USING ERRCODE = 'P0001';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.staff_sessions(token, staff_id, restaurant_id, expires_at)
  VALUES (v_token, v_staff.id, v_rest_id, now() + interval '12 hours');

  RETURN QUERY SELECT v_token, v_staff.id, v_staff.name, v_staff.role, p_slug, v_rest_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_logout(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.staff_sessions WHERE token = p_token;
$$;

-- 5) Grants for RPCs (anon can call login; others use session token)
GRANT EXECUTE ON FUNCTION public.staff_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_session_info(text) TO anon, authenticated;

-- 6) Data RPCs (all take token; enforce restaurant scope)

-- List active orders + items
CREATE OR REPLACE FUNCTION public.staff_list_orders(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001'; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT o.*,
      COALESCE((
        SELECT jsonb_agg(row_to_json(oi))
        FROM public.order_items oi WHERE oi.order_id = o.id
      ), '[]'::jsonb) AS items
    FROM public.orders o
    WHERE o.restaurant_id = v_rest AND o.archived_at IS NULL
  ) o;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_update_order_status(p_token text, p_order_id uuid, p_status text, p_staff_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.orders SET status = p_status,
    served_by = COALESCE(p_staff_name, served_by),
    updated_at = now()
  WHERE id = p_order_id AND restaurant_id = v_rest;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_archive_orders(p_token text, p_order_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.orders SET archived_at = now(), updated_at = now()
  WHERE id = ANY(p_order_ids) AND restaurant_id = v_rest;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_list_tables(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.label), '[]'::jsonb) INTO v_result
  FROM public.venue_tables t WHERE t.restaurant_id = v_rest;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_list_calls(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.created_at DESC), '[]'::jsonb) INTO v_result
  FROM public.waiter_calls c
  WHERE c.restaurant_id = v_rest AND c.resolved_at IS NULL;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_resolve_call(p_token text, p_call_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.waiter_calls SET resolved_at = now()
  WHERE id = p_call_id AND restaurant_id = v_rest;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_list_members(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rest uuid; v_result jsonb;
BEGIN
  SELECT restaurant_id INTO v_rest FROM public.staff_session_info(p_token);
  IF v_rest IS NULL THEN RAISE EXCEPTION 'Sessão inválida' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name), '[]'::jsonb) INTO v_result
  FROM public.staff_members WHERE restaurant_id = v_rest AND active = true;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_list_orders(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_update_order_status(text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_archive_orders(text, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_tables(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_calls(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_resolve_call(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_members(text) TO anon, authenticated;

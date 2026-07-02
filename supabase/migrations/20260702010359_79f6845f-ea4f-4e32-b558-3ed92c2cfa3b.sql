CREATE OR REPLACE FUNCTION public.staff_login(p_slug text, p_pin text)
 RETURNS TABLE(token text, staff_id uuid, name text, role text, restaurant_slug text, restaurant_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_rest_id uuid;
  v_rest_name text;
  v_staff_id uuid;
  v_staff_name text;
  v_staff_role text;
  v_token text;
BEGIN
  SELECT r.id, r.name INTO v_rest_id, v_rest_name FROM public.restaurants r WHERE r.slug = p_slug;
  IF v_rest_id IS NULL THEN
    RAISE EXCEPTION 'Restaurante não encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT sm.id, sm.name, sm.role
    INTO v_staff_id, v_staff_name, v_staff_role
    FROM public.staff_members sm
   WHERE sm.restaurant_id = v_rest_id AND sm.pin = p_pin AND sm.active = true
   LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'PIN inválido' USING ERRCODE = 'P0001';
  END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.staff_sessions(token, staff_id, restaurant_id, expires_at)
  VALUES (v_token, v_staff_id, v_rest_id, now() + interval '12 hours');

  RETURN QUERY SELECT v_token, v_staff_id, v_staff_name, v_staff_role, p_slug, v_rest_name;
END;
$function$;
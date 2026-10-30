ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS pin_hash text;
UPDATE public.staff_members SET pin_hash=extensions.crypt(pin,extensions.gen_salt('bf',10)), pin=NULL WHERE pin IS NOT NULL;
REVOKE SELECT ON public.staff_members FROM authenticated,anon;
GRANT SELECT(id,restaurant_id,name,active,pin,role,created_at,updated_at) ON public.staff_members TO authenticated;

CREATE OR REPLACE FUNCTION public.hash_staff_pin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF NEW.pin IS NOT NULL THEN
    IF NEW.pin !~ '^\d{4}$' THEN RAISE EXCEPTION 'O PIN deve ter 4 dígitos'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.restaurant_id::text,2));
    IF EXISTS(SELECT 1 FROM staff_members sm WHERE sm.restaurant_id=NEW.restaurant_id AND sm.id<>NEW.id
      AND sm.pin_hash IS NOT NULL AND extensions.crypt(NEW.pin,sm.pin_hash)=sm.pin_hash) THEN
      RAISE EXCEPTION 'Este PIN já está em uso';
    END IF;
    NEW.pin_hash := extensions.crypt(NEW.pin,extensions.gen_salt('bf',10));
    NEW.pin := NULL;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.pin_hash IS DISTINCT FROM OLD.pin_hash OR NEW.role IS DISTINCT FROM OLD.role OR NOT NEW.active) THEN
    DELETE FROM staff_sessions WHERE staff_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hash_staff_pin BEFORE INSERT OR UPDATE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION public.hash_staff_pin();
REVOKE ALL ON FUNCTION public.hash_staff_pin() FROM PUBLIC,anon,authenticated;
-- Never allow an API caller to supply their own credential hash.
REVOKE INSERT,UPDATE ON public.staff_members FROM authenticated;
GRANT INSERT(restaurant_id,name,active,pin,role),UPDATE(name,active,pin,role) ON public.staff_members TO authenticated;

CREATE TABLE public.staff_login_attempts(restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  window_started timestamptz NOT NULL, attempts integer NOT NULL);
ALTER TABLE public.staff_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_login_attempts FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.staff_login(p_slug text,p_pin text)
RETURNS TABLE(token text,staff_id uuid,name text,role text,restaurant_slug text,restaurant_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r record; s record; n integer; v_token text;
BEGIN
  SELECT id,restaurants.name INTO r FROM restaurants WHERE slug=p_slug;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO staff_login_attempts VALUES(r.id,now(),1)
    ON CONFLICT(restaurant_id) DO UPDATE SET
      attempts=CASE WHEN staff_login_attempts.window_started<now()-interval '5 minutes' THEN 1 ELSE staff_login_attempts.attempts+1 END,
      window_started=CASE WHEN staff_login_attempts.window_started<now()-interval '5 minutes' THEN now() ELSE staff_login_attempts.window_started END
    RETURNING attempts INTO n;
  -- Return an empty result on failure: raising would roll back the attempt counter.
  IF n>30 OR p_pin IS NULL OR p_pin !~ '^\d{4}$' THEN RETURN; END IF;
  SELECT sm.* INTO s FROM staff_members sm WHERE sm.restaurant_id=r.id AND sm.active AND sm.pin_hash IS NOT NULL
    AND extensions.crypt(p_pin,sm.pin_hash)=sm.pin_hash LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO staff_sessions(token,staff_id,restaurant_id,expires_at) VALUES(v_token,s.id,r.id,now()+interval '12 hours');
  RETURN QUERY SELECT v_token,s.id,s.name,s.role,p_slug,r.name;
END $$;

CREATE OR REPLACE FUNCTION public.staff_session_info(p_token text)
RETURNS TABLE(staff_id uuid,restaurant_id uuid,name text,role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT sm.id,sm.restaurant_id,sm.name,sm.role FROM staff_sessions ss JOIN staff_members sm ON sm.id=ss.staff_id
    WHERE ss.token=p_token AND ss.expires_at>now() AND sm.active AND ss.restaurant_id=sm.restaurant_id;
$$;

CREATE OR REPLACE FUNCTION public.staff_update_order_status(p_token text,p_order_id uuid,p_status text,p_staff_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM staff_session_info(p_token);
  IF s.restaurant_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF (p_status IN ('accepted','preparing','ready') AND s.role NOT IN ('kitchen','both'))
    OR (p_status IN ('served','cancelled') AND s.role NOT IN ('waiter','both'))
    OR p_status NOT IN ('accepted','preparing','ready','served','cancelled') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  UPDATE orders SET status=p_status::public.order_status,
    delivered_by_name=CASE WHEN p_status='served' THEN s.name ELSE delivered_by_name END,
    delivered_at=CASE WHEN p_status='served' THEN coalesce(delivered_at,now()) ELSE delivered_at END
    WHERE id=p_order_id AND restaurant_id=s.restaurant_id AND NOT archived;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.staff_archive_orders(p_token text,p_order_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM staff_session_info(p_token);
  IF s.restaurant_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF s.role NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  UPDATE orders SET archived=true,updated_at=now() WHERE id=ANY(p_order_ids) AND restaurant_id=s.restaurant_id;
END $$;

CREATE OR REPLACE FUNCTION public.staff_list_calls(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; result jsonb;
BEGIN
  SELECT * INTO s FROM staff_session_info(p_token);
  IF s.restaurant_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF s.role NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT coalesce(jsonb_agg(row_to_json(c) ORDER BY c.created_at DESC),'[]') INTO result FROM waiter_calls c
    WHERE restaurant_id=s.restaurant_id AND NOT resolved AND NOT is_test;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.staff_resolve_call(p_token text,p_call_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM staff_session_info(p_token);
  IF s.restaurant_id IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF s.role NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  UPDATE waiter_calls SET resolved=true,resolved_at=now() WHERE id=p_call_id AND restaurant_id=s.restaurant_id;
END $$;
-- Only revoke the known historical debug credential, preserving real sessions.
DELETE FROM public.staff_sessions WHERE token='test_token_debug_1234';

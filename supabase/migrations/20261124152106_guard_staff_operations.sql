-- Owner management uses the current entitlement, including audited manual grants.
CREATE FUNCTION public.can_manage_restaurant_operation(p_restaurant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.id = p_restaurant_id AND r.owner_id = auth.uid()
      AND public.restaurant_has_operations(public.get_restaurant_plan(r.slug))
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_restaurant_operation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_restaurant_operation(uuid) TO authenticated;

CREATE POLICY operation_plan_staff_insert ON public.staff_members AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_restaurant_operation(restaurant_id));
CREATE POLICY operation_plan_staff_update ON public.staff_members AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.can_manage_restaurant_operation(restaurant_id))
  WITH CHECK (public.can_manage_restaurant_operation(restaurant_id));
CREATE POLICY operation_plan_staff_delete ON public.staff_members AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.can_manage_restaurant_operation(restaurant_id));
CREATE POLICY operation_plan_table_delete ON public.venue_tables AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.can_manage_restaurant_operation(restaurant_id));

-- Keep token-scoped waiter actions separate from the authenticated owner path.
CREATE FUNCTION public.require_waiter_plan(p_restaurant_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM restaurants r WHERE r.id = p_restaurant_id
      AND public.restaurant_has_waiter(public.get_restaurant_plan(r.slug))
  ) THEN
    RAISE EXCEPTION 'A operação do garçom está disponível a partir do plano Pro.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.require_waiter_plan(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_table_service(p_table_id uuid,p_staff_token text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid;s record;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF p_staff_token IS NOT NULL THEN
 SELECT * INTO s FROM staff_session_info(p_staff_token);
 IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 IF p_staff_token IS NOT NULL THEN PERFORM public.require_waiter_plan(rid); END IF;
 PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
 RETURN ensure_table_service(p_table_id);
END $$;

CREATE OR REPLACE FUNCTION public.table_order_code(p_table_id uuid,p_staff_token text DEFAULT NULL,p_rotate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE rid uuid; s record; c record; next_code text;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO s FROM public.staff_session_info(p_staff_token);
   IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text,4));
 IF p_staff_token IS NOT NULL THEN PERFORM public.require_waiter_plan(rid); END IF;
 SELECT * INTO c FROM table_order_codes WHERE table_id=p_table_id;
 IF p_rotate THEN
   PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
   PERFORM ensure_table_service(p_table_id);
   LOOP
     -- 16 random bits, rejection sampling avoids modulo bias.
     next_code:=encode(extensions.gen_random_bytes(2),'hex');
     EXIT WHEN ('x'||next_code)::bit(16)::integer < 60000
       AND lpad((('x'||next_code)::bit(16)::integer % 10000)::text,4,'0') IS DISTINCT FROM c.code;
   END LOOP;
   next_code:=lpad((('x'||next_code)::bit(16)::integer % 10000)::text,4,'0');
   INSERT INTO table_order_codes(table_id,restaurant_id,code,expires_at)
   VALUES(p_table_id,rid,next_code,now()+interval '24 hours')
   ON CONFLICT(table_id) DO UPDATE SET code=EXCLUDED.code,expires_at=EXCLUDED.expires_at RETURNING * INTO c;
 END IF;
 IF c.table_id IS NULL OR c.expires_at<=now() OR c.code !~ '^[0-9]{4}$' THEN RETURN NULL; END IF;
 IF p_rotate THEN
 INSERT INTO operation_events(restaurant_id,table_id,service_id,event,actor_user_id,actor_staff_id,actor_name,details)
 VALUES(rid,p_table_id,(SELECT active_service_id FROM venue_tables WHERE id=p_table_id),'code_issued',auth.uid(),(SELECT staff_id FROM staff_session_info(p_staff_token)),coalesce((SELECT name FROM staff_session_info(p_staff_token)),'Responsável'),jsonb_build_object('expires_at',c.expires_at));
 END IF;
 RETURN jsonb_build_object('code',c.code,'expires_at',c.expires_at);
END $$;

NOTIFY pgrst, 'reload schema';

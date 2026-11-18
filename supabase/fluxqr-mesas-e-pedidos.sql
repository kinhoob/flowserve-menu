-- Execute inteiro no SQL Editor do Supabase FluxQr. Preserva pedidos e mesas.
-- Exige a atualização anterior de horários e códigos.
BEGIN;
-- Four-digit codes are explicitly issued by staff, never recreated by polling.
CREATE OR REPLACE FUNCTION public.table_order_code(p_table_id uuid,p_staff_token text DEFAULT NULL,p_rotate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE rid uuid; s record; c record; next_code text;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   SELECT * INTO s FROM public.staff_session_info(p_staff_token);
   IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text,4));
 SELECT * INTO c FROM table_order_codes WHERE table_id=p_table_id;
 IF p_rotate THEN
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
 RETURN jsonb_build_object('code',c.code,'expires_at',c.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.table_order_code(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.table_order_code(uuid,text,boolean) TO anon,authenticated;
-- Old long codes cannot remain valid after the upgrade.
DELETE FROM public.table_order_codes WHERE code !~ '^[0-9]{4}$';

CREATE OR REPLACE FUNCTION public.check_table_order_code(p_table_id uuid,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text,4));
 IF EXISTS(SELECT 1 FROM venue_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.id=p_table_id AND r.require_table_code)
 AND (coalesce(p_code,'') !~ '^[0-9]{4}$' OR NOT EXISTS(SELECT 1 FROM table_order_codes WHERE table_id=p_table_id AND code=p_code AND expires_at>now())) THEN
 RAISE EXCEPTION 'Código da mesa inválido ou expirado. Peça os quatro dígitos ao garçom.' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.check_table_order_code(uuid,text) FROM PUBLIC,anon,authenticated;

-- Closing a table, its calls and its code is one transaction, including empty tables.
CREATE OR REPLACE FUNCTION public.release_table(
 p_restaurant_id uuid,p_table_label text,p_staff_token text DEFAULT NULL,
 p_service_fee numeric DEFAULT 0,p_cover_charge numeric DEFAULT 0
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid:=p_restaurant_id; s record; tid uuid; canonical text; ids uuid[]; primary_id uuid;
BEGIN
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO s FROM public.staff_session_info(p_staff_token);
   IF s.restaurant_id IS NULL OR coalesce(s.role,'') NOT IN ('waiter','both') OR (rid IS NOT NULL AND rid<>s.restaurant_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   rid:=s.restaurant_id;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
   RAISE EXCEPTION 'Acesso negado';
 END IF;
 IF p_service_fee IS NULL OR p_cover_charge IS NULL OR p_service_fee<0 OR p_cover_charge<0 OR p_service_fee>1000000 OR p_cover_charge>1000000 THEN RAISE EXCEPTION 'Taxas inválidas'; END IF;
 SELECT id,label INTO tid,canonical FROM venue_tables WHERE restaurant_id=rid
 AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(p_table_label,'^(Mesa\s*)+','','i')));
 IF tid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(tid::text,4));
 SELECT coalesce(array_agg(id ORDER BY created_at,id),'{}'::uuid[]) INTO ids FROM orders
 WHERE restaurant_id=rid AND NOT coalesce(archived,false) AND status::text<>'cancelled'
 AND (table_id=tid OR (table_id IS NULL AND lower(btrim(regexp_replace(table_label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(canonical,'^(Mesa\s*)+','','i')))));
 primary_id:=ids[1];
 IF primary_id IS NOT NULL AND (p_service_fee>0 OR p_cover_charge>0) THEN
 UPDATE orders SET service_fee=p_service_fee,cover_charge=p_cover_charge WHERE id=primary_id;
 END IF;
 UPDATE orders SET archived=true,status='served',updated_at=now() WHERE id=ANY(ids);
 UPDATE waiter_calls SET resolved=true,resolved_at=now() WHERE restaurant_id=rid AND NOT resolved
 AND lower(btrim(regexp_replace(table_label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(canonical,'^(Mesa\s*)+','','i')));
 DELETE FROM table_order_codes WHERE table_id=tid;
 RETURN ids;
END $$;
REVOKE ALL ON FUNCTION public.release_table(uuid,text,text,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_table(uuid,text,text,numeric,numeric) TO anon,authenticated;

COMMIT;
NOTIFY pgrst,'reload schema';
SELECT 'Flux atualizado: códigos de quatro dígitos e liberação de mesas ativados' AS resultado;

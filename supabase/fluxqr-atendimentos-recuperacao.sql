-- Atualização do banco existente após fluxqr-atualizacao-beta.sql. Recarregue todos os aparelhos.
BEGIN;
-- Explicit table services, append-only events, recovery and safe trial wind-down.
ALTER TABLE public.venue_tables ADD COLUMN IF NOT EXISTS active_service_id uuid;
ALTER TABLE public.venue_tables ADD COLUMN IF NOT EXISTS service_started_at timestamptz;
ALTER TABLE public.venue_tables ADD COLUMN IF NOT EXISTS service_state text NOT NULL DEFAULT 'free' CHECK(service_state IN ('free','active','bill_requested'));
CREATE TABLE IF NOT EXISTS public.table_services(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL REFERENCES restaurants(id),table_id uuid REFERENCES venue_tables(id) ON DELETE SET NULL,
 started_at timestamptz NOT NULL DEFAULT now(),ended_at timestamptz,state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','bill_requested','closed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_table_service ON public.table_services(table_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS table_services_restaurant_time ON public.table_services(restaurant_id,started_at DESC);
ALTER TABLE public.table_services ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.table_services FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.table_services TO authenticated;
DROP POLICY IF EXISTS owner_services ON public.table_services;
CREATE POLICY owner_services ON public.table_services FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM restaurants WHERE id=restaurant_id AND owner_id=(SELECT auth.uid())));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.table_services(id);
CREATE INDEX IF NOT EXISTS orders_service_id_idx ON public.orders(service_id);
CREATE OR REPLACE FUNCTION public.ensure_table_service(p_table_id uuid,p_backfill boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t record; sid uuid; slug text;
BEGIN
 SELECT restaurant_id INTO t FROM venue_tables WHERE id=p_table_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t.restaurant_id::text,0));
 SELECT * INTO t FROM venue_tables WHERE id=p_table_id FOR UPDATE;
 IF t.active_service_id IS NOT NULL AND EXISTS(SELECT 1 FROM table_services WHERE id=t.active_service_id AND ended_at IS NULL) THEN RETURN t.active_service_id; END IF;
 SELECT r.slug INTO slug FROM restaurants r WHERE r.id=t.restaurant_id;
 IF NOT p_backfill AND coalesce(get_restaurant_plan(slug),'basic') NOT IN ('trial','essential','pro','enterprise') THEN RAISE EXCEPTION 'Seu plano não permite iniciar outro atendimento. Os atendimentos existentes podem ser encerrados.'; END IF;
 INSERT INTO table_services(restaurant_id,table_id) VALUES(t.restaurant_id,t.id) RETURNING id INTO sid;
 UPDATE venue_tables SET active_service_id=sid,service_started_at=now(),service_state='active' WHERE id=t.id;
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.ensure_table_service(uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.start_table_service(p_table_id uuid,p_staff_token text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid;s record;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
 SELECT * INTO s FROM staff_session_info(p_staff_token);
 IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 END IF;
 PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
 RETURN ensure_table_service(p_table_id);
END $$;
REVOKE ALL ON FUNCTION public.start_table_service(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_table_service(uuid,text) TO anon,authenticated;
-- Preserve open orders and still-valid issued codes when installing over an existing restaurant.
DO $$ DECLARE t record;sid uuid; BEGIN
 FOR t IN SELECT vt.id FROM venue_tables vt WHERE EXISTS(SELECT 1 FROM orders o WHERE o.table_id=vt.id AND NOT o.archived AND o.status<>'cancelled') OR EXISTS(SELECT 1 FROM table_order_codes c WHERE c.table_id=vt.id AND c.expires_at>now()) LOOP
 sid:=ensure_table_service(t.id,true);
 UPDATE orders SET service_id=sid WHERE table_id=t.id AND NOT archived AND service_id IS NULL;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.attach_table_service() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid;
BEGIN
 IF NEW.table_id IS NOT NULL THEN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=NEW.table_id;
 IF rid IS DISTINCT FROM NEW.restaurant_id THEN RAISE EXCEPTION 'Mesa de outro restaurante'; END IF;
 NEW.service_id:=ensure_table_service(NEW.table_id);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS attach_table_service ON public.orders;
CREATE TRIGGER attach_table_service BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.attach_table_service();
REVOKE ALL ON FUNCTION public.attach_table_service() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.mark_service_bill() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tid uuid;
BEGIN
 IF NEW.kind='bill' THEN
 SELECT id INTO tid FROM venue_tables WHERE restaurant_id=NEW.restaurant_id AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(NEW.table_label,'^(Mesa\s*)+','','i')));
 UPDATE table_services SET state='bill_requested' WHERE id=(SELECT active_service_id FROM venue_tables WHERE id=tid) AND ended_at IS NULL;
 UPDATE venue_tables SET service_state='bill_requested' WHERE id=tid AND active_service_id IS NOT NULL;
 END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mark_service_bill ON public.waiter_calls;
CREATE TRIGGER mark_service_bill AFTER INSERT ON public.waiter_calls FOR EACH ROW EXECUTE FUNCTION public.mark_service_bill();
REVOKE ALL ON FUNCTION public.mark_service_bill() FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.operation_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL REFERENCES restaurants(id),table_id uuid,service_id uuid,order_id uuid,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),event text NOT NULL,actor_user_id uuid,actor_staff_id uuid,actor_name text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS operation_events_table_time ON public.operation_events(restaurant_id,table_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS operation_events_order_time ON public.operation_events(order_id,occurred_at DESC);
ALTER TABLE public.operation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operation_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.operation_events TO authenticated;
DROP POLICY IF EXISTS owner_operation_events ON public.operation_events;
CREATE POLICY owner_operation_events ON public.operation_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM restaurants WHERE id=restaurant_id AND owner_id=(SELECT auth.uid())));
CREATE OR REPLACE FUNCTION public.record_operation_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid;tid uuid;sid uuid;oid uuid;kind text;meta jsonb;staff_id uuid;staff_name text;
BEGIN
 IF TG_TABLE_NAME='orders' THEN
 IF TG_OP='UPDATE' AND NEW.status=OLD.status AND NEW.archived=OLD.archived AND NEW.service_fee IS NOT DISTINCT FROM OLD.service_fee AND NEW.cover_charge IS NOT DISTINCT FROM OLD.cover_charge AND NEW.delivered_by_name IS NOT DISTINCT FROM OLD.delivered_by_name THEN RETURN NEW; END IF;
 rid:=NEW.restaurant_id;tid:=NEW.table_id;sid:=NEW.service_id;oid:=NEW.id;
 kind:=CASE WHEN TG_OP='INSERT' THEN 'order_created' WHEN NEW.archived AND NOT OLD.archived THEN 'order_closed' WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'order_status' ELSE 'order_adjusted' END;
 meta:=jsonb_build_object('status',NEW.status,'service_fee',NEW.service_fee,'cover_charge',NEW.cover_charge,'reason',NEW.cancellation_reason);
 IF TG_OP='UPDATE' THEN meta:=meta||jsonb_build_object('previous_status',OLD.status,'previous_service_fee',OLD.service_fee,'previous_cover_charge',OLD.cover_charge); END IF;
 ELSE
 IF NEW.active_service_id IS NOT DISTINCT FROM OLD.active_service_id AND NEW.service_state=OLD.service_state THEN RETURN NEW; END IF;
 rid:=NEW.restaurant_id;tid:=NEW.id;sid:=coalesce(NEW.active_service_id,OLD.active_service_id);kind:=CASE WHEN NEW.active_service_id IS NULL THEN 'service_closed' WHEN OLD.active_service_id IS NULL THEN 'service_started' WHEN NEW.service_state='bill_requested' THEN 'bill_requested' ELSE 'service_resumed' END;meta:=jsonb_build_object('state',NEW.service_state);
 END IF;
 staff_id:=nullif(current_setting('flux.actor_staff',true),'')::uuid;
 SELECT sm.name INTO staff_name FROM staff_members sm WHERE sm.id=staff_id AND sm.restaurant_id=rid;
 INSERT INTO operation_events(restaurant_id,table_id,service_id,order_id,event,actor_user_id,actor_staff_id,actor_name,details)
 VALUES(rid,tid,sid,oid,kind,auth.uid(),staff_id,coalesce(staff_name,CASE WHEN auth.uid() IS NOT NULL THEN 'Responsável' ELSE 'Cliente / sistema' END),meta);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS record_order_event ON public.orders;
CREATE TRIGGER record_order_event AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.record_operation_event();
DROP TRIGGER IF EXISTS record_service_event ON public.venue_tables;
CREATE TRIGGER record_service_event AFTER UPDATE ON public.venue_tables FOR EACH ROW EXECUTE FUNCTION public.record_operation_event();
REVOKE ALL ON FUNCTION public.record_operation_event() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_table_events(p_table_id uuid,p_staff_token text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid;s record;result jsonb;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
 SELECT * INTO s FROM staff_session_info(p_staff_token);
 IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(row_to_json(e)),'[]') INTO result FROM (SELECT occurred_at,event,actor_name,details FROM operation_events WHERE restaurant_id=rid AND table_id=p_table_id ORDER BY occurred_at DESC,id DESC LIMIT 40)e;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_table_events(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_events(uuid,text) TO anon,authenticated;

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
REVOKE ALL ON FUNCTION public.table_order_code(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.table_order_code(uuid,text,boolean) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.transition_order(p_order_id uuid,p_expected_status text,p_next_status text,p_staff_token text DEFAULT NULL,p_delivered_by text DEFAULT NULL,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid; s record; staff_name text;
BEGIN
 SELECT restaurant_id INTO rid FROM orders WHERE id=p_order_id;
 IF p_staff_token IS NOT NULL THEN
   SELECT * INTO s FROM staff_session_info(p_staff_token);
   IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','kitchen','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   IF (p_next_status IN ('accepted','preparing','ready') AND s.role NOT IN ('kitchen','both')) OR (p_next_status IN ('served','cancelled') AND s.role NOT IN ('waiter','both')) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   staff_name:=s.name;
 ELSIF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Acesso negado';
 ELSE staff_name:=left(nullif(btrim(p_delivered_by),''),80); END IF;
 IF p_next_status NOT IN ('accepted','preparing','ready','served','cancelled') OR p_next_status IS NULL OR p_expected_status IS NULL THEN RAISE EXCEPTION 'Etapa inválida'; END IF;
 PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
 UPDATE orders SET status=p_next_status::public.order_status,
 delivered_by_name=CASE WHEN p_next_status='served' THEN staff_name ELSE delivered_by_name END,
 delivered_at=CASE WHEN p_next_status='served' THEN coalesce(delivered_at,now()) ELSE delivered_at END,
 cancellation_reason=CASE WHEN p_next_status='cancelled' THEN left(p_reason,280) ELSE cancellation_reason END
 WHERE id=p_order_id AND restaurant_id=rid AND NOT archived AND status::text=p_expected_status;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outra pessoa já atualizou este pedido. A fila será recarregada.' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.transition_order(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_order(uuid,text,text,text,text,text) TO anon,authenticated;

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
REVOKE ALL ON FUNCTION public.submit_internal_order(uuid,uuid,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_internal_order(uuid,uuid,jsonb,text,text) TO anon,authenticated;


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
 PERFORM set_config('flux.actor_staff',coalesce((SELECT staff_id::text FROM staff_session_info(p_staff_token)),''),true);
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(tid::text,4));
 SELECT coalesce(array_agg(id ORDER BY created_at,id),'{}'::uuid[]) INTO ids FROM orders
 WHERE restaurant_id=rid AND NOT coalesce(archived,false) AND status::text<>'cancelled'
 AND (table_id=tid OR (table_id IS NULL AND lower(btrim(regexp_replace(table_label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(canonical,'^(Mesa\s*)+','','i')))));
 IF EXISTS(SELECT 1 FROM orders WHERE id=ANY(ids) AND status<>'served') THEN RAISE EXCEPTION 'Há pedidos ainda não entregues. Entregue ou cancele antes de encerrar a mesa.'; END IF;
 primary_id:=ids[1];
 IF primary_id IS NOT NULL AND (p_service_fee>0 OR p_cover_charge>0) THEN
 UPDATE orders SET service_fee=p_service_fee,cover_charge=p_cover_charge WHERE id=primary_id;
 END IF;
 UPDATE orders SET archived=true,status='served',updated_at=now() WHERE id=ANY(ids);
 UPDATE waiter_calls SET resolved=true,resolved_at=now() WHERE restaurant_id=rid AND NOT resolved
 AND lower(btrim(regexp_replace(table_label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(canonical,'^(Mesa\s*)+','','i')));
 UPDATE orders SET archived=true WHERE table_id=tid AND status='cancelled' AND NOT archived;
 UPDATE table_services SET ended_at=now(),state='closed' WHERE id=(SELECT active_service_id FROM venue_tables WHERE id=tid) AND ended_at IS NULL;
 UPDATE venue_tables SET active_service_id=NULL,service_started_at=NULL,service_state='free' WHERE id=tid;
 DELETE FROM table_order_codes WHERE table_id=tid;
 RETURN ids;
END $$;
REVOKE ALL ON FUNCTION public.release_table(uuid,text,text,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_table(uuid,text,text,numeric,numeric) TO anon,authenticated;


CREATE OR REPLACE FUNCTION public.recover_public_order(p_restaurant_id uuid,p_tracking_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_tracking_token IS NULL OR p_tracking_token !~ '^[0-9a-f-]{36}$' THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text,0));
 SELECT jsonb_build_object('order_id',id,'status',status) INTO result FROM orders WHERE restaurant_id=p_restaurant_id AND tracking_token_hash=encode(extensions.digest(p_tracking_token,'sha256'),'hex');
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.recover_public_order(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_public_order(uuid,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.recover_internal_order(p_table_id uuid,p_request_token uuid,p_staff_token text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rid uuid;s record;result uuid;
BEGIN
 SELECT restaurant_id INTO rid FROM venue_tables WHERE id=p_table_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Mesa inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=rid AND owner_id=auth.uid()) THEN
 SELECT * INTO s FROM staff_session_info(p_staff_token);
 IF s.restaurant_id IS DISTINCT FROM rid OR coalesce(s.role,'') NOT IN ('waiter','both') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 SELECT order_id INTO result FROM internal_order_requests WHERE restaurant_id=rid AND table_id=p_table_id AND request_token=p_request_token;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.recover_internal_order(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_internal_order(uuid,uuid,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_active_table_delete() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN IF OLD.active_service_id IS NOT NULL THEN RAISE EXCEPTION 'Encerre o atendimento antes de excluir a mesa.'; END IF;RETURN OLD;END $$;
DROP TRIGGER IF EXISTS guard_active_table_delete ON public.venue_tables;
CREATE TRIGGER guard_active_table_delete BEFORE DELETE ON public.venue_tables FOR EACH ROW EXECUTE FUNCTION public.guard_active_table_delete();
REVOKE ALL ON FUNCTION public.guard_active_table_delete() FROM PUBLIC,anon,authenticated;

COMMIT;
NOTIFY pgrst,'reload schema';
SELECT 'Atendimentos, histórico e recuperação ativados' AS resultado;

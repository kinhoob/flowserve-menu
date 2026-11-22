-- Operation hardening: kitchen visibility is independent from table checkout.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kitchen_hidden boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.guard_order_direction() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT NEW.archived AND NOT (
   (OLD.status='pending' AND NEW.status IN ('accepted','preparing','cancelled')) OR
   (OLD.status='accepted' AND NEW.status IN ('preparing','cancelled')) OR
   (OLD.status='preparing' AND NEW.status IN ('ready','cancelled')) OR
   (OLD.status='ready' AND NEW.status IN ('served','cancelled'))
 ) THEN RAISE EXCEPTION 'Este pedido já foi atualizado. Atualize a fila antes de continuar.' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_order_direction ON public.orders;
CREATE TRIGGER guard_order_direction BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_direction();
REVOKE ALL ON FUNCTION public.guard_order_direction() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.hide_completed_orders(p_restaurant_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=p_restaurant_id AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 UPDATE orders SET kitchen_hidden=true WHERE restaurant_id=p_restaurant_id AND status IN ('served','cancelled') AND NOT kitchen_hidden;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.hide_completed_orders(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hide_completed_orders(uuid) TO authenticated;
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
 UPDATE orders SET status=p_next_status::public.order_status,
 delivered_by_name=CASE WHEN p_next_status='served' THEN staff_name ELSE delivered_by_name END,
 delivered_at=CASE WHEN p_next_status='served' THEN coalesce(delivered_at,now()) ELSE delivered_at END,
 cancellation_reason=CASE WHEN p_next_status='cancelled' THEN left(p_reason,280) ELSE cancellation_reason END
 WHERE id=p_order_id AND restaurant_id=rid AND NOT archived AND status::text=p_expected_status;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outra pessoa já atualizou este pedido. A fila será recarregada.' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.transition_order(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_order(uuid,text,text,text,text,text) TO anon,authenticated;
-- Legacy clients cannot overwrite a newer status without an expected version.
REVOKE EXECUTE ON FUNCTION public.staff_update_order_status(text,uuid,text,text) FROM anon,authenticated;

-- Budgets commit even when the inner validation fails. No IP or client identity is trusted.
CREATE TABLE IF NOT EXISTS public.public_action_budgets(
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 table_id uuid NOT NULL, action text NOT NULL, window_start timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0, failures integer NOT NULL DEFAULT 0,
 PRIMARY KEY(restaurant_id,table_id,action)
);
ALTER TABLE public.public_action_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_action_budgets FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.public_request_budget(p_rid uuid,p_tid uuid,p_action text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE total integer; n integer; bad integer; minute timestamptz:=date_trunc('minute',clock_timestamp());
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_rid::text,0));
 INSERT INTO public_action_budgets AS b VALUES(p_rid,'00000000-0000-0000-0000-000000000000','all',minute,1,0)
 ON CONFLICT(restaurant_id,table_id,action) DO UPDATE SET window_start=EXCLUDED.window_start,attempts=CASE WHEN b.window_start=minute THEN b.attempts+1 ELSE 1 END RETURNING attempts INTO total;
 IF total>120 THEN RETURN false; END IF;
 INSERT INTO public_action_budgets AS b VALUES(p_rid,p_tid,p_action,minute,1,0)
 ON CONFLICT(restaurant_id,table_id,action) DO UPDATE SET window_start=EXCLUDED.window_start,attempts=CASE WHEN b.window_start=minute THEN b.attempts+1 ELSE 1 END,failures=CASE WHEN b.window_start=minute THEN b.failures ELSE 0 END RETURNING attempts,failures INTO n,bad;
 RETURN n<=CASE WHEN p_action='order' THEN 20 ELSE 6 END AND bad<5;
END $$;
REVOKE ALL ON FUNCTION public.public_request_budget(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.submit_public_order(p_restaurant_id uuid,p_table_label text,p_customer_name text,p_customer_phone text,p_currency text,p_items jsonb,p_tracking_token text,p_table_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE tid uuid; result uuid; msg text; state text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text,0));
 -- A committed retry must not consume budget or create another order.
 SELECT id INTO result FROM orders WHERE restaurant_id=p_restaurant_id AND tracking_token_hash=encode(extensions.digest(p_tracking_token,'sha256'),'hex');
 IF result IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'order_id',result); END IF;
 SELECT id INTO tid FROM venue_tables WHERE restaurant_id=p_restaurant_id AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(p_table_label,'^(Mesa\s*)+','','i')));
 IF tid IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Mesa inválida','code','22023'); END IF;
 IF NOT public_request_budget(p_restaurant_id,tid,'order') THEN RETURN jsonb_build_object('ok',false,'message','Muitas tentativas nesta mesa. Aguarde um minuto ou procure o garçom.','code','RATE_LIMIT'); END IF;
 BEGIN
 result:=public.place_order(p_restaurant_id,p_table_label,p_customer_name,p_customer_phone,p_currency,p_items,p_tracking_token,p_table_code);
 RETURN jsonb_build_object('ok',true,'order_id',result);
 EXCEPTION WHEN OTHERS THEN
 GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
 UPDATE public_action_budgets SET failures=failures+1 WHERE restaurant_id=p_restaurant_id AND table_id=tid AND action='order';
 RETURN jsonb_build_object('ok',false,'message',CASE WHEN state IN ('22023','P0001') THEN msg ELSE 'Não foi possível enviar. Confira o carrinho e tente novamente.' END,'code',state);
 END;
END $$;
REVOKE ALL ON FUNCTION public.submit_public_order(uuid,text,text,text,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_order(uuid,text,text,text,text,jsonb,text,text) TO anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.place_order(uuid,text,text,text,text,jsonb,text,text),public.place_order(uuid,text,text,text,text,jsonb,text) FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.submit_public_call(p_restaurant_id uuid,p_table_label text,p_customer_name text,p_message text,p_kind text,p_table_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tid uuid; msg text; state text;
BEGIN
 SELECT id INTO tid FROM venue_tables WHERE restaurant_id=p_restaurant_id AND lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i')))=lower(btrim(regexp_replace(p_table_label,'^(Mesa\s*)+','','i')));
 IF tid IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Mesa inválida'); END IF;
 IF NOT public_request_budget(p_restaurant_id,tid,'call') THEN RETURN jsonb_build_object('ok',false,'message','Aguarde um minuto antes de chamar novamente.','code','RATE_LIMIT'); END IF;
 BEGIN
 PERFORM public.public_waiter_call(p_restaurant_id,p_table_label,p_customer_name,p_message,p_kind,p_table_code);
 RETURN jsonb_build_object('ok',true);
 EXCEPTION WHEN OTHERS THEN
 GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
 UPDATE public_action_budgets SET failures=failures+1 WHERE restaurant_id=p_restaurant_id AND table_id=tid AND action='call';
 RETURN jsonb_build_object('ok',false,'message',CASE WHEN state IN ('22023','P0001') THEN msg ELSE 'Não foi possível chamar. Tente novamente.' END,'code',state);
 END;
END $$;
REVOKE ALL ON FUNCTION public.submit_public_call(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_call(uuid,text,text,text,text,text) TO anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.public_waiter_call(uuid,text,text,text,text,text) FROM anon,authenticated;

-- Retrying a staff/owner send after a network timeout must not duplicate the order.
CREATE TABLE IF NOT EXISTS public.internal_order_requests(
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 request_token uuid NOT NULL, table_id uuid NOT NULL REFERENCES venue_tables(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 PRIMARY KEY(restaurant_id,request_token)
);
ALTER TABLE public.internal_order_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_order_requests FROM PUBLIC,anon,authenticated;
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
 DELETE FROM table_order_codes WHERE table_id=tid;
 RETURN ids;
END $$;
REVOKE ALL ON FUNCTION public.release_table(uuid,text,text,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_table(uuid,text,text,numeric,numeric) TO anon,authenticated;

-- Cancelling an item is not confirmation that the guests have left the table.
CREATE OR REPLACE FUNCTION public.expire_table_order_code() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.archived AND NOT EXISTS(SELECT 1 FROM orders WHERE table_id=NEW.table_id AND NOT coalesce(archived,false) AND status::text<>'cancelled') THEN
 DELETE FROM table_order_codes WHERE table_id=NEW.table_id;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.expire_table_order_code() FROM PUBLIC,anon,authenticated;

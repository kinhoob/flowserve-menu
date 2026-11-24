-- Execute antes e depois do pacote intermediário e compare as impressões digitais.
-- Este script usa apenas leitura. Não seleciona dados de clientes nem altera o Stripe.
BEGIN READ ONLY;
SET LOCAL search_path = public, pg_catalog;
DO $commercial_preflight$
DECLARE missing text;
BEGIN
  SELECT string_agg(name, ', ') INTO missing FROM unnest(ARRAY[
    'public.venue_tables','public.orders','public.order_items','public.restaurants','public.profiles',
    'public.categories','public.menu_items','public.modifier_groups','public.modifier_options',
    'public.platform_admins','public.platform_entitlements','public.platform_audit_log',
    'public.subscriptions','public.billing_events','public.table_services','public.operation_events',
    'public.waiter_calls','public.table_order_codes','public.internal_order_requests','public.staff_members'
  ]) AS expected(name) WHERE to_regclass(name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Objetos de base ausentes: %', missing; END IF;
  SELECT string_agg(signature, ', ') INTO missing FROM unnest(ARRAY[
    'public.effective_entitlement(uuid)','public.get_my_entitlement()','public.get_restaurant_plan(text)',
    'public.platform_change_entitlement(uuid,text,text,integer,text,bigint)',
    'public.apply_billing_event(text,bigint,text,jsonb)','public.staff_session_info(text)',
    'public.staff_list_orders(text)','public.staff_list_tables(text)','public.staff_list_calls(text)',
    'public.place_order(uuid,text,text,text,text,jsonb,text,text)',
    'public.staff_place_order(text,uuid,jsonb)','public.owner_place_order(uuid,uuid,jsonb,text)',
    'public.ensure_table_service(uuid,boolean)','public.start_table_service(uuid,text)',
    'public.release_table(uuid,text,text,numeric,numeric)','public.table_order_code(uuid,text,boolean)',
    'public.submit_internal_order(uuid,uuid,jsonb,text,text)',
    'public.submit_public_order(uuid,text,text,text,text,jsonb,text,text)',
    'public.submit_public_call(uuid,text,text,text,text,text)','public.mark_service_bill()',
    'public.validated_order_items(uuid,jsonb)','public.check_table_order_code(uuid,text)'
  ]) AS expected(signature) WHERE to_regprocedure(signature) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Funções de base ausentes: %', missing; END IF;
  SELECT string_agg(relation || '.' || column_name, ', ') INTO missing FROM (VALUES
    ('venue_tables','active_service_id'),('orders','service_id'),('orders','tracking_token_hash'),
    ('subscriptions','last_event_created'),('subscriptions','plan_type'),('waiter_calls','is_test')
  ) AS required(relation,column_name) WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.' || relation)
      AND a.attname=required.column_name AND a.attnum>0 AND NOT a.attisdropped
  );
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Colunas de base ausentes: %', missing; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.oid IN (
    'public.venue_tables'::regclass,'public.orders'::regclass,'public.order_items'::regclass,
    'public.profiles'::regclass,'public.categories'::regclass,'public.menu_items'::regclass,
    'public.modifier_groups'::regclass,'public.modifier_options'::regclass,'public.staff_members'::regclass
  ) AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'RLS desabilitado em tabela de base.'; END IF;
END $commercial_preflight$;
DO $legacy_billing_check$ BEGIN
  IF to_regclass('public.billing_reconciliation') IS NOT NULL
    OR to_regclass('public.billing_checkout_attempts') IS NOT NULL
    OR to_regprocedure('public.release_table_service(uuid,uuid,uuid,text,numeric,numeric)') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)')
      AND (prosrc LIKE '%reconciliation_generation%' OR prosrc LIKE '%snapshot_requested_at%'))
    OR NOT coalesce(has_function_privilege('service_role',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'execute'),false)
    OR has_function_privilege('anon',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'execute')
    OR has_function_privilege('authenticated',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'execute')
  THEN RAISE EXCEPTION 'Contrato de cobrança não corresponde ao app legado.'; END IF;
  IF to_regprocedure('public.flux_legacy_plan_bridge_v1()') IS NOT NULL THEN
  IF to_regprocedure('public.select_operational_tables(uuid,uuid[])') IS NULL
    OR to_regprocedure('public.require_waiter_plan(uuid)') IS NULL
    OR to_regprocedure('public.can_edit_catalog(uuid)') IS NULL
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND permissive='RESTRICTIVE'
      AND (policyname LIKE 'active_plan_catalog_%' OR policyname LIKE 'operation_plan_%')
      AND tablename IN ('staff_members','venue_tables','categories','menu_items','modifier_groups','modifier_options')) <> 16
    OR EXISTS (SELECT 1 FROM (VALUES
      ('venue_tables','guard_operational_qr'),('venue_tables','flux_legacy_guard_table_label'),('orders','commercial_guard_order'),('waiter_calls','commercial_guard_call')
    ) required(relation,trigger_name) WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||relation)
      AND t.tgname=trigger_name AND t.tgenabled IN ('O','A')
    ))
  THEN RAISE EXCEPTION 'Subconjunto de planos incompleto ou alterado.'; END IF;
  END IF;
END $legacy_billing_check$;
SELECT to_regprocedure('public.flux_legacy_plan_bridge_v1()') IS NOT NULL AS pacote_intermediario_instalado;
SELECT signature, md5(pg_get_functiondef(p.oid)) AS definicao,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role
FROM (VALUES ('public.apply_billing_event(text,bigint,text,jsonb)'),
  ('public.release_table(uuid,text,text,numeric,numeric)'),
  ('public.staff_list_orders(text)'),
  ('public.staff_list_tables(text)'),
  ('public.staff_list_calls(text)'),
  ('public.platform_change_entitlement(uuid,text,text,integer,text,bigint)'),
  ('public.submit_public_order(uuid,text,text,text,text,jsonb,text,text)'),
  ('public.submit_public_call(uuid,text,text,text,text,text)'),
  ('public.submit_internal_order(uuid,uuid,jsonb,text,text)'),
  ('public.start_table_service(uuid,text)'),
  ('public.table_order_code(uuid,text,boolean)'),
  ('public.owner_place_order(uuid,uuid,jsonb,text)'),
  ('public.staff_place_order(text,uuid,jsonb)')) required(signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(required.signature) ORDER BY signature;
SELECT to_regprocedure('public.select_operational_tables(uuid,uuid[])') IS NOT NULL AS selecao_operacional,
  to_regprocedure('public.begin_billing_reconciliation(text,text)') IS NOT NULL AS reconciliacao_nova;
SELECT count(*) AS restaurantes_essential_com_mais_de_dez_mesas_cadastradas FROM (
  SELECT r.id FROM public.restaurants r JOIN public.venue_tables t ON t.restaurant_id=r.id
  WHERE public.get_restaurant_plan(r.slug)='essential' GROUP BY r.id HAVING count(*) > 10
) counts;
SELECT count(*) AS nomes_de_mesa_ambiguos FROM (
  SELECT restaurant_id,lower(btrim(regexp_replace(label,'^(Mesa\s*)+','','i'))) AS nome
  FROM public.venue_tables GROUP BY restaurant_id,nome HAVING count(*)>1
) conflicts;
COMMIT;

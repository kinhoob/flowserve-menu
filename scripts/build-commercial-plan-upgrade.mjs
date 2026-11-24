import fs from "node:fs";

const stages = [
  {
    file: "20261124063416_commercial_beta_entitlements.sql",
    markers: [
      "to_regclass('public.restaurant_qr_locks') IS NOT NULL",
      "to_regprocedure('public.select_operational_tables(uuid,uuid[])') IS NOT NULL",
      "to_regprocedure('public.is_platform_owner()') IS NOT NULL",
      "EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.venue_tables'::regclass AND tgname='guard_operational_qr' AND tgenabled IN ('O','A'))",
    ],
  },
  {
    file: "20261124065754_commercial_beta_review.sql",
    markers: [
      "to_regclass('public.billing_reconciliation') IS NOT NULL",
      "to_regclass('public.billing_checkout_attempts') IS NOT NULL",
      "to_regprocedure('public.release_table_service(uuid,uuid,uuid,text,numeric,numeric)') IS NOT NULL",
      "to_regprocedure('public.reserve_billing_checkout(uuid,text,text,text,text)') IS NOT NULL",
    ],
  },
  {
    file: "20261124150718_plan_enforcement_audit.sql",
    markers: [
      "to_regprocedure('public.get_staff_entitlement(text)') IS NOT NULL",
      "to_regprocedure('public.get_restaurant_analytics(uuid,timestamptz,timestamptz,integer)') IS NOT NULL",
      "to_regprocedure('public.can_edit_catalog(uuid)') IS NOT NULL",
      "(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('categories','menu_items','modifier_groups','modifier_options') AND policyname IN ('active_plan_catalog_insert','active_plan_catalog_update','active_plan_catalog_delete') AND permissive='RESTRICTIVE') = 12",
    ],
  },
];

export function commercialPlanUpgradeSQL() {
  const statements = stages.map(({ file, markers }, index) => {
    const migration = fs
      .readFileSync(new URL("../supabase/migrations/" + file, import.meta.url), "utf8")
      .trim();
    const tag = "$commercial_stage_" + index + "$";
    const body = "$commercial_sql_" + index + "$";
    return [
      "DO " + tag + " BEGIN",
      "  IF " + markers.map((m) => "(" + m + ")").join(" AND\n     ") + " THEN",
      "    RAISE NOTICE 'Etapa já instalada: " + file + "';",
      "  ELSIF " + markers.map((m) => "(" + m + ")").join(" OR\n        ") + " THEN",
      "    RAISE EXCEPTION 'Etapa parcial: " + file + ". Confira o schema antes de repetir.';",
      "  ELSE",
      "    EXECUTE " + body + "\n" + migration + "\n" + body + ";",
      "  END IF;",
      "END " + tag + ";",
    ].join("\n");
  });
  return [
    "-- Gerado por node scripts/build-commercial-plan-upgrade.mjs.",
    "-- Apenas para uma base Flux existente. Use os passos em docs/DEPLOYMENT.md.",
    "BEGIN;",
    "SET LOCAL statement_timeout = '120s';",
    "DO $commercial_preflight$",
    "DECLARE missing text;",
    "BEGIN",
    "  SELECT string_agg(name, ', ') INTO missing FROM unnest(ARRAY[",
    "    'public.venue_tables','public.orders','public.order_items','public.restaurants','public.profiles',",
    "    'public.categories','public.menu_items','public.modifier_groups','public.modifier_options',",
    "    'public.platform_admins','public.platform_entitlements','public.platform_audit_log',",
    "    'public.subscriptions','public.billing_events','public.table_services','public.operation_events',",
    "    'public.waiter_calls','public.table_order_codes','public.internal_order_requests'",
    "  ]) AS expected(name) WHERE to_regclass(name) IS NULL;",
    "  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Objetos de base ausentes: %', missing; END IF;",
    "  SELECT string_agg(signature, ', ') INTO missing FROM unnest(ARRAY[",
    "    'public.effective_entitlement(uuid)','public.get_my_entitlement()','public.get_restaurant_plan(text)',",
    "    'public.platform_change_entitlement(uuid,text,text,integer,text,bigint)',",
    "    'public.apply_billing_event(text,bigint,text,jsonb)','public.staff_session_info(text)',",
    "    'public.staff_list_orders(text)','public.staff_list_tables(text)','public.staff_list_calls(text)',",
    "    'public.place_order(uuid,text,text,text,text,jsonb,text,text)',",
    "    'public.staff_place_order(text,uuid,jsonb)','public.owner_place_order(uuid,uuid,jsonb,text)',",
    "    'public.ensure_table_service(uuid,boolean)','public.start_table_service(uuid,text)',",
    "    'public.release_table(uuid,text,text,numeric,numeric)','public.table_order_code(uuid,text,boolean)',",
    "    'public.submit_internal_order(uuid,uuid,jsonb,text,text)',",
    "    'public.submit_public_order(uuid,text,text,text,text,jsonb,text,text)',",
    "    'public.submit_public_call(uuid,text,text,text,text,text)','public.mark_service_bill()',",
    "    'public.validated_order_items(uuid,jsonb)','public.check_table_order_code(uuid,text)'",
    "  ]) AS expected(signature) WHERE to_regprocedure(signature) IS NULL;",
    "  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Funções de base ausentes: %', missing; END IF;",
    "  SELECT string_agg(relation || '.' || column_name, ', ') INTO missing FROM (VALUES",
    "    ('venue_tables','active_service_id'),('orders','service_id'),('orders','tracking_token_hash'),",
    "    ('subscriptions','last_event_created'),('subscriptions','plan_type'),('waiter_calls','is_test'),",
    "    ('order_items','product_id_snapshot'),('order_items','category_id_snapshot'),",
    "    ('order_items','category_name_snapshot'),('order_items','department_snapshot')",
    "  ) AS required(relation,column_name) WHERE NOT EXISTS (",
    "    SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.' || relation)",
    "      AND a.attname=required.column_name AND a.attnum>0 AND NOT a.attisdropped",
    "  );",
    "  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Colunas de base ausentes: %', missing; END IF;",
    "  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.oid IN (",
    "    'public.venue_tables'::regclass,'public.orders'::regclass,'public.order_items'::regclass,",
    "    'public.profiles'::regclass,'public.categories'::regclass,'public.menu_items'::regclass,",
    "    'public.modifier_groups'::regclass,'public.modifier_options'::regclass",
    "  ) AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'RLS desabilitado em tabela de base.'; END IF;",
    "END $commercial_preflight$;",
    ...statements,
    "NOTIFY pgrst, 'reload schema';",
    "COMMIT;",
    "",
  ].join("\n");
}

if (process.argv[1] === import.meta.filename) {
  fs.writeFileSync(
    new URL("../supabase/fluxqr-planos-beta.sql", import.meta.url),
    commercialPlanUpgradeSQL(),
  );
}

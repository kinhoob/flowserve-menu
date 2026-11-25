import fs from "node:fs";
import { LEGACY_PLAN_MARKER, legacyPlanSlices } from "./legacy-plan-slices.mjs";

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
  {
    file: "20261124152106_guard_staff_operations.sql",
    markers: [
      "to_regprocedure('public.can_manage_restaurant_operation(uuid)') IS NOT NULL",
      "to_regprocedure('public.require_waiter_plan(uuid)') IS NOT NULL",
      "EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname IN ('operation_plan_staff_insert','operation_plan_staff_update','operation_plan_staff_delete','operation_plan_table_delete'))",
    ],
  },
  {
    file: "20261125033939_enforce_active_plan_access.sql",
    markers: [
      "EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='entitled_operation')",
      "EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='restaurants' AND policyname='active_venue_update')",
      "EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='active_menu_media_insert')",
    ],
  },
];

function installedContract() {
  const functions = [
    [0, "guard_operational_qr", "", []],
    [0, "restaurant_table_is_operational", "uuid,text", ["anon", "authenticated"]],
    [0, "ensure_table_service", "uuid,boolean", []],
    [0, "select_operational_tables", "uuid,uuid[]", ["authenticated"]],
    [0, "platform_change_entitlement", "uuid,text,text,integer,text,bigint", ["authenticated"]],
    [1, "apply_billing_event", "text,bigint,text,jsonb", ["service_role"]],
    [1, "begin_billing_reconciliation", "text,text", ["service_role"]],
    [4, "reserve_billing_checkout", "uuid,text,text,text,text", ["service_role"]],
    [4, "release_table_service", "uuid,uuid,uuid,text,numeric,numeric", ["anon", "authenticated"]],
    [1, "release_table", "uuid,text,text,numeric,numeric", ["anon", "authenticated"]],
    [4, "get_staff_entitlement", "text", ["anon", "authenticated"]],
    [4, "get_restaurant_analytics", "uuid,timestamptz,timestamptz,integer", ["authenticated"]],
    [3, "start_table_service", "uuid,text", ["anon", "authenticated"]],
    [3, "table_order_code", "uuid,text,boolean", ["anon", "authenticated"]],
    [3, "can_manage_restaurant_operation", "uuid", ["authenticated"]],
    [3, "require_waiter_plan", "uuid", []],
    [4, "staff_can_view_operation", "text,boolean", []],
    [4, "transition_order", "uuid,text,text,text,text,text", ["anon", "authenticated"]],
    [4, "get_table_events", "uuid,text", ["anon", "authenticated"]],
    [4, "submit_internal_order", "uuid,uuid,jsonb,text,text", ["anon", "authenticated"]],
    [4, "recover_internal_order", "uuid,uuid,text", ["anon", "authenticated"]],
    [4, "hide_completed_orders", "uuid", ["authenticated"]],
    [4, "staff_resolve_call", "text,uuid", ["anon", "authenticated"]],
    [4, "guard_basic_operation_settings", "", []],
  ];
  const checks = functions.map(([stage, name, args, roles], index) => {
    const sql = fs.readFileSync(
      new URL("../supabase/migrations/" + stages[stage].file, import.meta.url),
      "utf8",
    );
    const body = sql.match(
      new RegExp(
        "CREATE (?:OR REPLACE )?FUNCTION public\\." +
          name +
          "\\([\\s\\S]*?\\bAS \\$\\$([\\s\\S]*?)\\$\\$;",
      ),
    )?.[1];
    if (!body) throw new Error("Missing SQL body: " + name);
    const tag = "$commercial_body_" + index + "$";
    const signature = "public." + name + "(" + args + ")";
    const target = "to_regprocedure('" + signature + "')";
    const grants = [
      "anon",
      "authenticated",
      ...roles.filter((role) => role === "service_role"),
    ].map(
      (role) =>
        "has_function_privilege('" +
        role +
        "'," +
        target +
        ",'EXECUTE') IS " +
        (roles.includes(role) ? "TRUE" : "FALSE"),
    );
    return [
      "  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=" +
        target +
        " AND btrim(replace(prosrc,chr(13),''))=btrim(",
      tag + body.replaceAll("\r", "") + tag + ")) OR NOT (" + grants.join(" AND ") + ") THEN",
      "    RAISE EXCEPTION 'Corpo ou grants divergentes em " + signature + "';",
      "  END IF;",
    ].join("\n");
  });
  return [
    "DO $commercial_contract$ BEGIN",
    ...checks,
    "  IF EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) AS role_name WHERE",
    "    has_function_privilege(role_name,'public.staff_place_order(text,uuid,jsonb)','EXECUTE')",
    "    OR has_function_privilege(role_name,'public.owner_place_order(uuid,uuid,jsonb,text)','EXECUTE')) THEN",
    "    RAISE EXCEPTION 'RPC legada de pedido manual ainda exposta.'; END IF;",
    "  IF EXISTS (SELECT 1 FROM (VALUES",
    "    ('venue_tables','guard_operational_qr','guard_operational_qr',23),",
    "    ('venue_tables','guard_active_table_delete','guard_active_table_delete',11),",
    "    ('orders','commercial_guard_order','guard_new_order_plan',7),",
    "    ('orders','attach_table_service','attach_table_service',7),",
    "    ('waiter_calls','commercial_guard_call','guard_new_call_plan',7),",
    "    ('waiter_calls','mark_service_bill','mark_service_bill',5),",
    "    ('restaurants','guard_basic_operation_settings','guard_basic_operation_settings',19)",
    "  ) expected(relation,trigger_name,function_name,kind) WHERE NOT EXISTS (",
    "    SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.' || relation)",
    "      AND t.tgname=trigger_name AND t.tgfoid=to_regprocedure('public.' || function_name || '()')",
    "      AND t.tgtype=kind AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal",
    "  )) THEN RAISE EXCEPTION 'Gatilhos comerciais ausentes, desabilitados ou divergentes.'; END IF;",
    "  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND permissive='RESTRICTIVE'",
    "    AND roles=ARRAY['authenticated']::name[] AND (",
    "      (tablename='staff_members' AND policyname='operation_plan_staff_insert' AND cmd='INSERT' AND with_check='can_manage_restaurant_operation(restaurant_id)')",
    "      OR (tablename='staff_members' AND policyname='operation_plan_staff_update' AND cmd='UPDATE' AND qual='can_manage_restaurant_operation(restaurant_id)' AND with_check=qual)",
    "      OR (tablename='staff_members' AND policyname='operation_plan_staff_delete' AND cmd='DELETE' AND qual='can_manage_restaurant_operation(restaurant_id)')",
    "      OR (tablename='venue_tables' AND policyname='operation_plan_table_delete' AND cmd='DELETE' AND qual='can_manage_restaurant_operation(restaurant_id)')",
    "    )) <> 4 THEN RAISE EXCEPTION 'Políticas operacionais divergentes.'; END IF;",
    "  IF (SELECT count(*) FROM pg_policies WHERE permissive='RESTRICTIVE' AND roles=ARRAY['authenticated']::name[] AND (",
    "      (schemaname='public' AND policyname='entitled_operation' AND cmd='ALL' AND tablename IN ('venue_tables','orders','waiter_calls','staff_members','table_services','operation_events','order_items'))",
    "      OR (schemaname='public' AND tablename='restaurants' AND policyname IN ('active_venue_insert','active_venue_update','active_venue_delete'))",
    "      OR (schemaname='storage' AND tablename='objects' AND policyname IN ('active_menu_media_insert','active_menu_media_update','active_menu_media_delete'))",
    "    )) <> 13 THEN RAISE EXCEPTION 'Políticas de acesso ativo divergentes.'; END IF;",
    "  IF EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) AS role_name WHERE",
    "    has_function_privilege(role_name,'public.staff_list_members(text)','EXECUTE')",
    "    OR has_function_privilege(role_name,'public.staff_archive_orders(text,uuid[])','EXECUTE')) THEN",
    "    RAISE EXCEPTION 'RPC legada de equipe ainda exposta.'; END IF;",
    "END $commercial_contract$;",
  ].join("\n");
}

export function commercialPlanUpgradeSQL() {
  const { billingAndPlatform, newStaffAndReports, operationalLookup } = legacyPlanSlices();
  const statements = stages.map(({ file, markers }, index) => {
    const migration = fs
      .readFileSync(new URL("../supabase/migrations/" + file, import.meta.url), "utf8")
      .trim();
    const tag = "$commercial_stage_" + index + "$";
    const body = "$commercial_sql_" + index + "$";
    const legacyCompletion =
      index === 0
        ? billingAndPlatform + "\n" + operationalLookup
        : index === 2
          ? newStaffAndReports
          : null;
    const fromBridge = legacyCompletion
      ? [
          "  ELSIF to_regprocedure('" + LEGACY_PLAN_MARKER + "') IS NOT NULL THEN",
          "    EXECUTE " + body + "\n" + legacyCompletion + "\n" + body + ";",
        ]
      : [];
    return [
      "DO " + tag + " BEGIN",
      "  IF " + markers.map((m) => "(" + m + ")").join(" AND\n     ") + " THEN",
      "    RAISE NOTICE 'Etapa já instalada: " + file + "';",
      ...fromBridge,
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
    "SET LOCAL search_path = public, pg_catalog;",
    commercialPreflightSQL(),
    ...statements,
    installedContract(),
    "DROP TRIGGER IF EXISTS flux_legacy_guard_table_label ON public.venue_tables;",
    "DROP FUNCTION IF EXISTS public.flux_legacy_guard_table_label();",
    "DROP FUNCTION IF EXISTS " + LEGACY_PLAN_MARKER + ";",
    "NOTIFY pgrst, 'reload schema';",
    "COMMIT;",
    "",
  ].join("\n");
}

export function commercialPreflightSQL({ includeReports = true } = {}) {
  return [
    "DO $commercial_preflight$",
    "DECLARE missing text;",
    "BEGIN",
    "  SELECT string_agg(name, ', ') INTO missing FROM unnest(ARRAY[",
    "    'public.venue_tables','public.orders','public.order_items','public.restaurants','public.profiles',",
    "    'public.categories','public.menu_items','public.modifier_groups','public.modifier_options',",
    "    'public.platform_admins','public.platform_entitlements','public.platform_audit_log',",
    "    'public.subscriptions','public.billing_events','public.table_services','public.operation_events',",
    "    'public.waiter_calls','public.table_order_codes','public.internal_order_requests','public.staff_members'",
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
    "    ('subscriptions','last_event_created'),('subscriptions','plan_type'),('waiter_calls','is_test')",
    ...(includeReports
      ? [
          "    , ('order_items','product_id_snapshot'),('order_items','category_id_snapshot'),",
          "    ('order_items','category_name_snapshot'),('order_items','department_snapshot')",
        ]
      : []),
    "  ) AS required(relation,column_name) WHERE NOT EXISTS (",
    "    SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.' || relation)",
    "      AND a.attname=required.column_name AND a.attnum>0 AND NOT a.attisdropped",
    "  );",
    "  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Colunas de base ausentes: %', missing; END IF;",
    "  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.oid IN (",
    "    'public.venue_tables'::regclass,'public.orders'::regclass,'public.order_items'::regclass,",
    "    'public.profiles'::regclass,'public.categories'::regclass,'public.menu_items'::regclass,",
    "    'public.modifier_groups'::regclass,'public.modifier_options'::regclass,'public.staff_members'::regclass",
    "  ) AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'RLS desabilitado em tabela de base.'; END IF;",
    "END $commercial_preflight$;",
  ].join("\n");
}

if (process.argv[1] === import.meta.filename) {
  fs.writeFileSync(
    new URL("../supabase/fluxqr-planos-beta.sql", import.meta.url),
    commercialPlanUpgradeSQL(),
  );
}

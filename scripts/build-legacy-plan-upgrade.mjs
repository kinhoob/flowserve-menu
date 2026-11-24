import fs from "node:fs";
import { commercialPreflightSQL } from "./build-commercial-plan-upgrade.mjs";
import { LEGACY_PLAN_FILE, LEGACY_PLAN_MARKER, legacyPlanSlices } from "./legacy-plan-slices.mjs";

const names = [
  "apply_billing_event(text,bigint,text,jsonb)",
  "release_table(uuid,text,text,numeric,numeric)",
  "staff_list_orders(text)",
  "staff_list_tables(text)",
  "staff_list_calls(text)",
  "platform_change_entitlement(uuid,text,text,integer,text,bigint)",
  "submit_public_order(uuid,text,text,text,text,jsonb,text,text)",
  "submit_public_call(uuid,text,text,text,text,text)",
  "submit_internal_order(uuid,uuid,jsonb,text,text)",
  "start_table_service(uuid,text)",
  "table_order_code(uuid,text,boolean)",
  "owner_place_order(uuid,uuid,jsonb,text)",
  "staff_place_order(text,uuid,jsonb)",
];
const fromLegacyFunctions =
  "FROM (VALUES " +
  names.map((name) => "('public." + name + "')").join(",\n  ") +
  ") required(signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(required.signature)";
const legacyContract =
  "SELECT jsonb_object_agg(signature,jsonb_build_object(" +
  "'body',CASE WHEN signature NOT IN ('public.start_table_service(uuid,text)','public.table_order_code(uuid,text,boolean)','public.release_table(uuid,text,text,numeric,numeric)') " +
  "THEN md5(pg_get_functiondef(p.oid)) END,'args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'acl',p.proacl,'owner',p.proowner)) " +
  fromLegacyFunctions;

const bridgeAssertions = [
  "  IF to_regprocedure('public.select_operational_tables(uuid,uuid[])') IS NULL",
  "    OR to_regprocedure('public.require_waiter_plan(uuid)') IS NULL",
  "    OR to_regprocedure('public.can_edit_catalog(uuid)') IS NULL",
  "    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND permissive='RESTRICTIVE'",
  "      AND (policyname LIKE 'active_plan_catalog_%' OR policyname LIKE 'operation_plan_%')",
  "      AND tablename IN ('staff_members','venue_tables','categories','menu_items','modifier_groups','modifier_options')) <> 16",
  "    OR EXISTS (SELECT 1 FROM (VALUES",
  "      ('venue_tables','guard_operational_qr'),('venue_tables','flux_legacy_guard_table_label'),('orders','commercial_guard_order'),('waiter_calls','commercial_guard_call')",
  "    ) required(relation,trigger_name) WHERE NOT EXISTS (",
  "      SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||relation)",
  "      AND t.tgname=trigger_name AND t.tgenabled IN ('O','A')",
  "    ))",
  "  THEN RAISE EXCEPTION 'Subconjunto de planos incompleto ou alterado.'; END IF;",
].join("\n");

const assertLegacyBilling = [
  "  IF to_regclass('public.billing_reconciliation') IS NOT NULL",
  "    OR to_regclass('public.billing_checkout_attempts') IS NOT NULL",
  "    OR to_regprocedure('public.release_table_service(uuid,uuid,uuid,text,numeric,numeric)') IS NOT NULL",
  "    OR EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)')",
  "      AND (prosrc LIKE '%reconciliation_generation%' OR prosrc LIKE '%snapshot_requested_at%'))",
  "    OR NOT coalesce(has_function_privilege('service_role',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'execute'),false)",
  "    OR has_function_privilege('anon',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'execute')",
  "    OR has_function_privilege('authenticated',to_regprocedure('public.apply_billing_event(text,bigint,text,jsonb)'),'execute')",
  "  THEN RAISE EXCEPTION 'Contrato de cobrança não corresponde ao app legado.'; END IF;",
].join("\n");

const legacyLabelGuard = `
CREATE FUNCTION public.flux_legacy_guard_table_label() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.restaurant_id = OLD.restaurant_id
    AND public.operational_table_label(NEW.label) = public.operational_table_label(OLD.label)
  THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.restaurant_id::text,0));
  IF EXISTS (SELECT 1 FROM venue_tables t WHERE t.restaurant_id=NEW.restaurant_id AND t.id<>NEW.id
    AND public.operational_table_label(t.label)=public.operational_table_label(NEW.label)) THEN
    RAISE EXCEPTION 'Já existe uma mesa com esse nome, inclusive entre as pausadas.' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.flux_legacy_guard_table_label() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER flux_legacy_guard_table_label BEFORE INSERT OR UPDATE OF label,restaurant_id
  ON public.venue_tables FOR EACH ROW EXECUTE FUNCTION public.flux_legacy_guard_table_label();
`.trim();

function legacyTableClosureSQL() {
  const sql = fs.readFileSync(
    new URL("../supabase/migrations/20261123000101_table_service_recovery.sql", import.meta.url),
    "utf8",
  );
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.release_table(");
  const end = sql.indexOf("REVOKE ALL ON FUNCTION public.release_table(", start);
  if (start < 0 || end < 0) throw new Error("Missing legacy release_table");
  const closure = sql.slice(start, end).trim();
  const lookup = " SELECT id,label INTO tid,canonical";
  if (!closure.includes(lookup)) throw new Error("Unexpected legacy release_table lookup");
  return closure
    .replace(
      lookup,
      " PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));\n SELECT id,label INTO STRICT tid,canonical",
    )
    .replace(
      " RETURN ids;\nEND",
      " RETURN ids;\nEXCEPTION WHEN no_data_found OR too_many_rows THEN\n RAISE EXCEPTION 'Mesa inválida ou ambígua. Confira o cadastro antes de encerrar.';\nEND",
    );
}

export function legacyPlanUpgradeSQL() {
  const { plans, catalog, staffWriteGuards, operationalLookup } = legacyPlanSlices();
  const labelCheck = "    AND (";
  const legacyLookup = operationalLookup.replace(
    "    AND (\n      SELECT count(*) FROM venue_tables t",
    "    AND (SELECT count(*) FROM venue_tables all_tables WHERE all_tables.restaurant_id=r.id\n" +
      "      AND public.operational_table_label(all_tables.label)=public.operational_table_label(p_table_label)) = 1\n" +
      labelCheck +
      "\n      SELECT count(*) FROM venue_tables t",
  );
  if (legacyLookup === operationalLookup) throw new Error("Missing operational label check");
  return [
    "-- FluxQr: pacote intermediário exclusivo para o app 8c04778.",
    "-- Gerado por node scripts/build-legacy-plan-upgrade.mjs. Consulte docs/DEPLOYMENT.md.",
    "BEGIN;",
    "SET LOCAL search_path = public, pg_catalog;",
    "SET LOCAL statement_timeout = '120s';",
    commercialPreflightSQL({ includeReports: false }),
    "DO $legacy_plan_upgrade$",
    "DECLARE legacy_before jsonb; legacy_after jsonb;",
    "BEGIN",
    assertLegacyBilling,
    "  IF to_regprocedure('" + LEGACY_PLAN_MARKER + "') IS NULL THEN",
    "    IF to_regclass('public.restaurant_qr_locks') IS NOT NULL",
    "      OR to_regprocedure('public.select_operational_tables(uuid,uuid[])') IS NOT NULL",
    "      OR to_regprocedure('public.is_platform_owner()') IS NOT NULL",
    "      OR to_regprocedure('public.get_staff_entitlement(text)') IS NOT NULL",
    "      OR to_regprocedure('public.can_edit_catalog(uuid)') IS NOT NULL",
    "      OR to_regprocedure('public.require_waiter_plan(uuid)') IS NOT NULL",
    "      OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.venue_tables'::regclass AND attname='operational' AND NOT attisdropped)",
    "    THEN RAISE EXCEPTION 'Etapa comercial parcial encontrada. Pare e confira a instalação.'; END IF;",
    "    legacy_before := (" + legacyContract + ");",
    "    EXECUTE $plan_rules$",
    plans,
    catalog,
    staffWriteGuards,
    legacyLabelGuard,
    legacyLookup,
    legacyTableClosureSQL(),
    "    $plan_rules$;",
    "    legacy_after := (" + legacyContract + ");",
    "    IF legacy_after IS DISTINCT FROM legacy_before THEN",
    "      RAISE EXCEPTION 'Contrato legado de RPCs ou cobrança alterado. Nenhuma etapa foi aplicada.';",
    "    END IF;",
    "    CREATE FUNCTION " + LEGACY_PLAN_MARKER + " RETURNS boolean",
    "      LANGUAGE sql IMMUTABLE SET search_path='' AS $bridge_marker$ SELECT true; $bridge_marker$;",
    "    REVOKE ALL ON FUNCTION " + LEGACY_PLAN_MARKER + " FROM PUBLIC, anon, authenticated;",
    "  END IF;",
    bridgeAssertions,
    "END $legacy_plan_upgrade$;",
    "NOTIFY pgrst, 'reload schema';",
    "COMMIT;",
    "",
  ].join("\n");
}

export function legacyPlanCheckSQL() {
  return [
    "-- Execute antes e depois do pacote intermediário e compare as impressões digitais.",
    "-- Este script usa apenas leitura. Não seleciona dados de clientes nem altera o Stripe.",
    "BEGIN READ ONLY;",
    "SET LOCAL search_path = public, pg_catalog;",
    commercialPreflightSQL({ includeReports: false }),
    "DO $legacy_billing_check$ BEGIN",
    assertLegacyBilling,
    "  IF to_regprocedure('" + LEGACY_PLAN_MARKER + "') IS NOT NULL THEN",
    bridgeAssertions,
    "  END IF;",
    "END $legacy_billing_check$;",
    "SELECT to_regprocedure('" +
      LEGACY_PLAN_MARKER +
      "') IS NOT NULL AS pacote_intermediario_instalado;",
    "SELECT signature, md5(pg_get_functiondef(p.oid)) AS definicao,",
    "  has_function_privilege('anon',p.oid,'EXECUTE') AS anon,",
    "  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,",
    "  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role",
    fromLegacyFunctions + " ORDER BY signature;",
    "SELECT to_regprocedure('public.select_operational_tables(uuid,uuid[])') IS NOT NULL AS selecao_operacional,",
    "  to_regprocedure('public.begin_billing_reconciliation(text,text)') IS NOT NULL AS reconciliacao_nova;",
    "SELECT count(*) AS restaurantes_essential_com_mais_de_dez_mesas_cadastradas FROM (",
    "  SELECT r.id FROM public.restaurants r JOIN public.venue_tables t ON t.restaurant_id=r.id",
    "  WHERE public.get_restaurant_plan(r.slug)='essential' GROUP BY r.id HAVING count(*) > 10",
    ") counts;",
    "SELECT count(*) AS nomes_de_mesa_ambiguos FROM (",
    "  SELECT restaurant_id,lower(btrim(regexp_replace(label,'^(Mesa\\s*)+','','i'))) AS nome",
    "  FROM public.venue_tables GROUP BY restaurant_id,nome HAVING count(*)>1",
    ") conflicts;",

    "COMMIT;",
    "",
  ].join("\n");
}

if (process.argv[1] === import.meta.filename) {
  fs.mkdirSync(new URL("../supabase/compat/", import.meta.url), { recursive: true });
  fs.writeFileSync(
    new URL("../supabase/compat/" + LEGACY_PLAN_FILE, import.meta.url),
    legacyPlanUpgradeSQL(),
  );
  fs.writeFileSync(
    new URL("../supabase/compat/fluxqr-planos-legado-verificacao.sql", import.meta.url),
    legacyPlanCheckSQL(),
  );
}

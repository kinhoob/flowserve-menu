import fs from "node:fs";

export const LEGACY_PLAN_MARKER = "public.flux_legacy_plan_bridge_v1()";
export const LEGACY_PLAN_FILE = "20261124160000_fluxqr_planos_legado.sql";

function splitMigration(file, marker) {
  const sql = fs.readFileSync(new URL("../supabase/migrations/" + file, import.meta.url), "utf8");
  const split = sql.indexOf(marker);
  if (split < 0 || sql.indexOf(marker, split + marker.length) >= 0)
    throw new Error("Invalid migration boundary: " + file);
  return [sql.slice(0, split).trim(), sql.slice(split).trim()];
}

export function legacyPlanSlices() {
  const [plans, billingAndPlatform] = splitMigration(
    "20261124063416_commercial_beta_entitlements.sql",
    "-- Authoritative Stripe snapshots outrank delivery timestamps.",
  );
  const [newStaffAndReports, catalog] = splitMigration(
    "20261124150718_plan_enforcement_audit.sql",
    "CREATE FUNCTION public.can_edit_catalog(",
  );
  const staffWriteGuards = fs
    .readFileSync(
      new URL("../supabase/migrations/20261124152106_guard_staff_operations.sql", import.meta.url),
      "utf8",
    )
    .trim();
  const operationalLookup = plans
    .slice(
      plans.indexOf("CREATE FUNCTION public.restaurant_table_is_operational("),
      plans.indexOf("REVOKE ALL ON FUNCTION public.restaurant_table_is_operational"),
    )
    .trim()
    .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
  if (!operationalLookup.startsWith("CREATE OR REPLACE FUNCTION"))
    throw new Error("Missing operational table lookup");
  return {
    plans,
    billingAndPlatform,
    newStaffAndReports,
    catalog,
    staffWriteGuards,
    operationalLookup,
  };
}

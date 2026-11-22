import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, "supabase/migrations", name), "utf8");
export function betaUpgradeSQL(includeHardening = true) {
  const links = read("20261116000400_restaurant_menu_links.sql")
    .replace(
      "CREATE TABLE public.restaurant_slug_aliases",
      "CREATE TABLE IF NOT EXISTS public.restaurant_slug_aliases",
    )
    .replace(
      "CREATE TRIGGER preserve_restaurant_slug",
      "DROP TRIGGER IF EXISTS preserve_restaurant_slug ON public.restaurants;\nCREATE TRIGGER preserve_restaurant_slug",
    );
  return `-- Flux: atualização do banco EXISTENTE, preservando restaurantes, produtos e pedidos.
-- Execute o arquivo completo no SQL Editor, no projeto FluxQr, com o papel postgres.
-- Inclui personalização, links, horários, códigos, notificações e a central de gestão.
-- Após sucesso, atualize a página do Flux e configure a agenda em Configurações > Operação.
BEGIN;
SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF to_regprocedure('public.menu_effective_price(numeric,numeric,boolean,timestamp with time zone,timestamp with time zone)') IS NULL THEN
 RAISE EXCEPTION 'Falta a atualização anterior de operações. Este arquivo exige o banco Flux já inicializado e atualizado.';
 END IF;
END $guard$;
${read("20261116000100_complete_menu_identity.sql")}
${read("20261116000300_menu_black_gold.sql")}
DO $links$ BEGIN
 IF to_regclass('public.restaurant_slug_aliases') IS NULL OR to_regprocedure('public.resolve_restaurant_slug(text)') IS NULL THEN
 EXECUTE $pending_links$${links}$pending_links$;
 END IF;
END $links$;
${read("20261116000500_service_hours_notifications.sql")}
${read("20261116000600_platform_management.sql")}
${read("20261116000700_analytics_item_history.sql")}
${read("20261116000800_platform_growth.sql")}
${read("20261118000100_table_sessions.sql")}
${includeHardening ? read("20261123000100_beta_operation_hardening.sql") : ""}
COMMIT;
NOTIFY pgrst,'reload schema';
SELECT 'Flux atualizado: gestão de clientes, horários, códigos, notificações e links prontos' AS resultado,
 EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS agendador_automatico_ativo,
 (SELECT count(*) FROM public.platform_admins WHERE active) AS administradores_ativos;
`;
}
if (process.argv[1] === import.meta.filename) {
  const output = process.argv[2] ?? path.join(root, "supabase/fluxqr-atualizacao-beta.sql");
  fs.writeFileSync(output, betaUpgradeSQL());
  console.log("SQL de atualização gerado: " + output);
}

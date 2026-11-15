import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const migrations = path.join(root, "supabase/migrations");
const files = fs
  .readdirSync(migrations)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const sql =
  `-- FluxQr: instalacao inicial em um projeto Supabase NOVO e vazio.
-- Gerado das ${files.length} migracoes versionadas. Sem senhas ou chaves.
-- Execute no SQL Editor do projeto correto, com o papel postgres.
-- Nao reaplique este instalador em um banco ja inicializado.
BEGIN;
SET LOCAL statement_timeout = '120s';
DO $flux_install_guard$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Este instalador exige um projeto Supabase com Auth configurado.';
  END IF;
  IF to_regclass('public.profiles') IS NOT NULL
    OR to_regclass('public.restaurants') IS NOT NULL
    OR to_regclass('public.orders') IS NOT NULL
    OR to_regclass('public.menu_items') IS NOT NULL THEN
    RAISE EXCEPTION 'Instalacao cancelada: ja existem tabelas do Flux. Aplique somente migracoes pendentes.';
  END IF;
END;
$flux_install_guard$;

` +
  files
    .map(
      (file) => `-- MIGRATION: ${file}\n${fs.readFileSync(path.join(migrations, file), "utf8")}\n`,
    )
    .join("\n") +
  `
COMMIT;
NOTIFY pgrst, 'reload schema';
SELECT 'FluxQr inicializado com sucesso' AS resultado;
`;
const output = path.join(root, "supabase/bootstrap.sql");
fs.writeFileSync(output, sql);
console.log(`Generated initial installer from ${files.length} migrations: supabase/bootstrap.sql`);

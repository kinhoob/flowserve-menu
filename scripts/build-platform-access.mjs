import fs from "node:fs";
import path from "node:path";
import { betaUpgradeSQL } from "./build-beta-upgrade.mjs";
export function platformActivationSQL(emails) {
  if (
    emails.length !== 2 ||
    new Set(emails.map((email) => email.toLowerCase())).size !== 2 ||
    emails.some((email) => !/^[-a-z0-9._+%]+@[-a-z0-9.]+\.[a-z]{2,}$/i.test(email))
  )
    throw new Error("Informe os dois e-mails distintos das contas autorizadas.");
  const values = emails.map((email) => `'${email.toLowerCase().replaceAll("'", "''")}'`).join(",");
  return `
-- Liberação exclusiva das duas contas confirmadas. Este bloco contém dados privados: não publique no Git.
DO $platform_access$
BEGIN
 IF NOT (SELECT count(*)=2 AND count(DISTINCT lower(u.email))=2 FROM auth.users u WHERE lower(u.email) IN (${values}) AND (to_jsonb(u)->>'email_confirmed_at') IS NOT NULL) THEN
 RAISE EXCEPTION 'As duas contas autorizadas precisam estar cadastradas no Flux e com o e-mail confirmado. Cadastre ou confirme as contas e execute o arquivo novamente.';
 END IF;
 INSERT INTO public.platform_admins(user_id,active)
 SELECT id,true FROM auth.users WHERE lower(email) IN (${values})
 ON CONFLICT(user_id) DO UPDATE SET active=true;
END $platform_access$;
`;
}
if (process.argv[1] === import.meta.filename) {
  const [first, second, output] = process.argv.slice(2);
  if (!output)
    throw new Error("Informe dois e-mails e um caminho de saída privado, fora do repositório.");
  const relative = path.relative(path.resolve(import.meta.dirname, ".."), path.resolve(output));
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  )
    throw new Error("Salve a ativação privada fora do repositório público.");
  const source = betaUpgradeSQL();
  const at = source.lastIndexOf("\nCOMMIT;");
  if (at < 0) throw new Error("Transação de atualização não encontrada");
  fs.writeFileSync(
    output,
    source.slice(0, at) + platformActivationSQL([first ?? "", second ?? ""]) + source.slice(at),
  );
  console.log("SQL privado de ativação gerado. Não publique este arquivo no Git.");
}

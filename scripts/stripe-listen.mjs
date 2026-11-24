import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
const file = path.resolve(".env.local");
const env = parseEnv(fs.readFileSync(file, "utf8"));
if (
  env.PAYMENTS_ENVIRONMENT !== "sandbox" ||
  !env.STRIPE_SANDBOX_SECRET_KEY?.startsWith("sk_test_")
)
  throw new Error("O listener só aceita Stripe de teste.");
const executable = process.env.STRIPE_CLI_PATH ?? path.resolve(".tools/stripe/stripe.exe");
if (!fs.existsSync(executable))
  throw new Error(
    "Stripe CLI não encontrado. Instale a ferramenta oficial ou configure STRIPE_CLI_PATH.",
  );
const child = spawn(
  executable,
  [
    "listen",
    "--events",
    "customer.subscription.created,customer.subscription.updated,customer.subscription.deleted",
    "--forward-to",
    "http://127.0.0.1:5187/api/public/payments/webhook?env=sandbox",
  ],
  {
    env: { ...process.env, STRIPE_API_KEY: env.STRIPE_SANDBOX_SECRET_KEY },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let ready = false;
let tail = "";
function receive(chunk) {
  tail = (tail + chunk.toString()).slice(-6000);
  const match = tail.match(/whsec_[A-Za-z0-9]+(?=[\s\x1b])/);
  if (match && !ready) {
    const key = "PAYMENTS_SANDBOX_WEBHOOK_SECRET";
    let text = fs.readFileSync(file, "utf8");
    const pattern = new RegExp("^" + key + "=.*$", "m");
    text = pattern.test(text)
      ? text.replace(pattern, () => key + "=" + match[0])
      : text + "\n" + key + "=" + match[0] + "\n";
    fs.writeFileSync(file, text);
    ready = true;
    console.log("Webhook de teste conectado. Assinatura salva no .env.local sem exibir o segredo.");
  }
  if (/\[200\]/.test(chunk.toString()))
    console.log("Evento de teste recebido pelo Flux: HTTP 200.");
  if (/\[500\]|\[400\]/.test(chunk.toString()))
    console.log("O Flux recusou um evento de teste. Confira a configuração do servidor.");
}
child.stdout.on("data", receive);
child.stderr.on("data", receive);
child.on("error", () => {
  console.error("Não foi possível iniciar o Stripe CLI.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  console.log("Listener Stripe encerrado (código " + code + ").");
  process.exitCode = code ?? 1;
});
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());

import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import Stripe from "stripe";
const file = path.resolve(".env.local");
const env = parseEnv(fs.readFileSync(file, "utf8"));
if (
  env.PAYMENTS_ENVIRONMENT !== "sandbox" ||
  !env.STRIPE_SANDBOX_SECRET_KEY?.startsWith("sk_test_")
)
  throw new Error("Configure as chaves de teste e PAYMENTS_ENVIRONMENT=sandbox.");
const stripe = new Stripe(env.STRIPE_SANDBOX_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
const plans = [
  { slug: "basic", name: "Basic", amount: 3000 },
  { slug: "essential", name: "Essential", amount: 9900 },
  { slug: "pro", name: "Pro", amount: 19900 },
];
for (const plan of plans) {
  const lookup = plan.slug + "_monthly";
  const found = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 2 });
  if (found.data.length) {
    const price = found.data[0];
    if (
      price.currency !== "brl" ||
      price.unit_amount !== plan.amount ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1
    )
      throw new Error("Confira o preço de teste existente: " + lookup);
    console.log(plan.name + ": preço de teste já configurado");
    continue;
  }
  const product = await stripe.products.create(
    { name: "Flux Menu " + plan.name, metadata: { flux_plan: plan.slug } },
    { idempotencyKey: "flux-sandbox-product-" + plan.slug + "-v1" },
  );
  await stripe.prices.create(
    {
      product: product.id,
      unit_amount: plan.amount,
      currency: "brl",
      recurring: { interval: "month" },
      lookup_key: lookup,
      metadata: { flux_plan: plan.slug },
    },
    { idempotencyKey: "flux-sandbox-price-" + lookup + "-v1" },
  );
  console.log(
    plan.name + ": R$ " + plan.amount / 100 + "/mês configurado apenas no Stripe de teste",
  );
}

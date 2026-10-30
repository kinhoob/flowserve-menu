import { timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

const GATEWAY_STRIPE_BASE = "https://connector-gateway.lovable.dev/stripe";

export function getConnectionApiKey(env: StripeEnv): string {
  return env === "sandbox" ? getEnv("STRIPE_SANDBOX_API_KEY") : getEnv("STRIPE_LIVE_API_KEY");
}

export function createStripeClient(env: StripeEnv): Stripe {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");

  return new Stripe(connectionApiKey, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(((input: RequestInfo | URL, init?: RequestInit) => {
      const gatewayUrl = (input instanceof Request ? input.url : input.toString()).replace(
        "https://api.stripe.com",
        GATEWAY_STRIPE_BASE,
      );
      return fetch(gatewayUrl, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers).entries()),
          "X-Connection-Api-Key": connectionApiKey,
          "Lovable-API-Key": lovableApiKey,
        },
      });
    }) as typeof fetch),
  });
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const parsed = z
      .object({
        message: z.string().optional(),
        type: z.string().optional(),
        code: z.string().optional(),
        decline_code: z.string().optional(),
        param: z.string().optional(),
        requestId: z.string().optional(),
        raw: z
          .object({
            message: z.string().optional(),
            type: z.string().optional(),
            code: z.string().optional(),
            decline_code: z.string().optional(),
            param: z.string().optional(),
            requestId: z.string().optional(),
          })
          .optional(),
      })
      .safeParse(error);
    if (!parsed.success) return "Stripe request failed";
    const e = parsed.data;
    const message = e.raw?.message ?? e.message;
    if (message) {
      const details = [
        e.raw?.type ?? e.type,
        e.raw?.code ?? e.code,
        e.raw?.decline_code ?? e.decline_code,
        e.raw?.param ?? e.param,
        e.raw?.requestId ?? e.requestId,
      ].filter(Boolean);
      return details.length ? `${message} (${details.join(", ")})` : message;
    }
  }
  return "Stripe request failed";
}

export async function verifyWebhook(
  req: Request,
  env: StripeEnv,
): Promise<{
  id: string;
  created: number;
  type: string;
  livemode: boolean;
  data: { object: unknown };
}> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret =
    env === "sandbox"
      ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
      : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");

  if (!signature || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }
  if (!timestamp || v1Signatures.length === 0) throw new Error("Invalid signature format");

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) throw new Error("Webhook timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = Buffer.from(new Uint8Array(signed)).toString("hex");

  const matches = v1Signatures.some(
    (signature) =>
      /^[0-9a-f]{64}$/.test(signature) &&
      timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")),
  );
  if (!matches) throw new Error("Invalid webhook signature");

  const event = z
    .object({
      id: z.string(),
      created: z.number().finite(),
      type: z.string(),
      livemode: z.boolean(),
      data: z.object({ object: z.unknown() }),
    })
    .parse(JSON.parse(body));
  if (
    typeof event.id !== "string" ||
    !Number.isFinite(event.created) ||
    event.livemode !== (env === "live")
  )
    throw new Error("Invalid webhook envelope");
  return event;
}

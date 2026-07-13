import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY;
const restaurantId = process.env.TEST_RESTAURANT_ID ?? "8a234dfe-1acb-4b3f-b6a5-796db0b5afeb";

const shouldRun = !!url && !!anonKey;
const d = shouldRun ? describe : describe.skip;

// Random-ish BR phone to reduce rate-limit collisions between runs.
function randomPhone() {
  const suffix = String(Math.floor(100000000 + Math.random() * 899999999));
  return `119${suffix.slice(0, 8)}`; // 11 digits, DDD 11, starts with 9
}

const anon = shouldRun
  ? createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined as any },
    })
  : (null as any);

const createdOrderIds: string[] = [];

d("anon lockdown on orders/order_items", () => {
  it("blocks direct INSERT into public.orders as anon", async () => {
    const { data, error } = await anon
      .from("orders")
      .insert({
        restaurant_id: restaurantId,
        customer_name: "Test",
        customer_phone: "11999999999",
        subtotal: 1,
        currency: "BRL",
        status: "pending",
      })
      .select()
      .single();

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    // Postgres permission denied / RLS violation
    expect(
      /permission denied|row-level security|violates/i.test(error!.message),
    ).toBe(true);
  });

  it("blocks direct INSERT into public.order_items as anon", async () => {
    const { data, error } = await anon
      .from("order_items")
      .insert({
        order_id: "00000000-0000-0000-0000-000000000000",
        name_snapshot: "x",
        price_snapshot: 1,
        quantity: 1,
      })
      .select()
      .single();

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(
      /permission denied|row-level security|violates/i.test(error!.message),
    ).toBe(true);
  });

  it("allows placing an order only via the place_order RPC", async () => {
    const phone = randomPhone();
    const { data, error } = await anon.rpc("place_order", {
      p_restaurant_id: restaurantId,
      p_table_label: `TEST-${Date.now()}`,
      p_customer_name: "Vitest Bot",
      p_customer_phone: phone,
      p_currency: "BRL",
      p_items: [
        {
          name_snapshot: "Item de teste",
          price_snapshot: 1.5,
          quantity: 1,
          notes: "vitest",
          modifiers_snapshot: [],
        },
      ],
    });

    expect(error).toBeNull();
    expect(typeof data).toBe("string");
    if (typeof data === "string") createdOrderIds.push(data);
  });

  it("rejects invalid phone via RPC", async () => {
    const { data, error } = await anon.rpc("place_order", {
      p_restaurant_id: restaurantId,
      p_table_label: "X",
      p_customer_name: "Bot",
      p_customer_phone: "123",
      p_currency: "BRL",
      p_items: [
        { name_snapshot: "x", price_snapshot: 1, quantity: 1, modifiers_snapshot: [] },
      ],
    });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it("rejects empty cart via RPC", async () => {
    const { data, error } = await anon.rpc("place_order", {
      p_restaurant_id: restaurantId,
      p_table_label: "X",
      p_customer_name: "Bot",
      p_customer_phone: randomPhone(),
      p_currency: "BRL",
      p_items: [],
    });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(/vazio|empty/i.test(error!.message)).toBe(true);
  });
});

afterAll(async () => {
  if (!shouldRun || createdOrderIds.length === 0) return;
  // Best-effort cleanup via service role if provided; otherwise leave rows (archived stays false but harmless in test data).
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return;
  const admin = createClient(url!, service, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined as any },
  });
  await admin.from("order_items").delete().in("order_id", createdOrderIds);
  await admin.from("orders").delete().in("id", createdOrderIds);
});

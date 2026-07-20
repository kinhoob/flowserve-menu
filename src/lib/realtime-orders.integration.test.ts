import { afterAll, describe, expect, it } from "vitest";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const restaurantId =
  process.env.TEST_RESTAURANT_ID ?? "8a234dfe-1acb-4b3f-b6a5-796db0b5afeb";

const shouldRun = !!url && !!anonKey;
const d = shouldRun ? describe : describe.skip;

// Max acceptable end-to-end latency (RPC → realtime event on subscriber).
// Realtime typically fires < 500ms; 5s catches only real regressions.
const MAX_LATENCY_MS = 5000;
// Extra headroom for the subscribe() → SUBSCRIBED handshake.
const SUBSCRIBE_TIMEOUT_MS = 8000;

function randomPhone() {
  const suffix = String(Math.floor(100000000 + Math.random() * 899999999));
  return `119${suffix.slice(0, 8)}`;
}

function makeClient(): SupabaseClient {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined as any },
  });
}

async function waitSubscribed(channel: RealtimeChannel) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Realtime SUBSCRIBED handshake timeout")),
      SUBSCRIBE_TIMEOUT_MS,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timer);
        reject(new Error(`Realtime status: ${status}`));
      }
    });
  });
}

const created: { client: SupabaseClient; channels: RealtimeChannel[]; orderIds: string[] } = {
  client: shouldRun ? makeClient() : (null as any),
  channels: [],
  orderIds: [],
};

d("realtime broadcasts new orders to KDS-style subscribers", () => {
  it("emits INSERT on public.orders within acceptable latency after place_order", async () => {
    const client = created.client;
    const channel = client.channel(`test-orders-${Date.now()}`);
    created.channels.push(channel);

    let orderEvent: { payload: any; at: number } | null = null;
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "orders",
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      (payload) => {
        if (!orderEvent) orderEvent = { payload, at: Date.now() };
      },
    );

    await waitSubscribed(channel);

    const phone = randomPhone();
    const tableLabel = `RT-${Date.now()}`;
    const sentAt = Date.now();
    const { data, error } = await client.rpc("place_order", {
      p_restaurant_id: restaurantId,
      p_table_label: tableLabel,
      p_customer_name: "Realtime Bot",
      p_customer_phone: phone,
      p_currency: "BRL",
      p_items: [
        { name_snapshot: "Item RT", price_snapshot: 5, quantity: 1, modifiers_snapshot: [] },
      ],
    });
    expect(error).toBeNull();
    expect(typeof data).toBe("string");
    if (typeof data === "string") created.orderIds.push(data);

    // Poll until the event lands or we hit the deadline.
    const deadline = sentAt + MAX_LATENCY_MS;
    while (!orderEvent && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(orderEvent, "no realtime INSERT received on public.orders").not.toBeNull();
    const latency = orderEvent!.at - sentAt;
    // eslint-disable-next-line no-console
    console.log(`[realtime] orders INSERT latency: ${latency}ms`);
    expect(latency).toBeLessThan(MAX_LATENCY_MS);
    expect(orderEvent!.payload.new?.id).toBe(data);
    expect(orderEvent!.payload.new?.table_label).toBe(tableLabel);
  }, 20_000);

  it("emits INSERT on public.order_items within acceptable latency after place_order", async () => {
    const client = created.client;
    const channel = client.channel(`test-order-items-${Date.now()}`);
    created.channels.push(channel);

    const itemEvents: { payload: any; at: number }[] = [];
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "order_items" },
      (payload) => itemEvents.push({ payload, at: Date.now() }),
    );

    await waitSubscribed(channel);

    const phone = randomPhone();
    const sentAt = Date.now();
    const { data: orderId, error } = await client.rpc("place_order", {
      p_restaurant_id: restaurantId,
      p_table_label: `RT2-${Date.now()}`,
      p_customer_name: "Realtime Bot",
      p_customer_phone: phone,
      p_currency: "BRL",
      p_items: [
        { name_snapshot: "Batata", price_snapshot: 12, quantity: 2, modifiers_snapshot: [] },
        { name_snapshot: "Coca", price_snapshot: 8, quantity: 1, modifiers_snapshot: [] },
      ],
    });
    expect(error).toBeNull();
    if (typeof orderId === "string") created.orderIds.push(orderId);

    const deadline = sentAt + MAX_LATENCY_MS;
    // Wait until we've collected at least one item for this order.
    let mine = itemEvents.filter((e) => e.payload.new?.order_id === orderId);
    while (mine.length < 2 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      mine = itemEvents.filter((e) => e.payload.new?.order_id === orderId);
    }

    expect(mine.length, "no realtime INSERT received on public.order_items").toBeGreaterThanOrEqual(1);
    const latency = mine[0].at - sentAt;
    // eslint-disable-next-line no-console
    console.log(`[realtime] order_items INSERT latency: ${latency}ms (${mine.length}/2 rows)`);
    expect(latency).toBeLessThan(MAX_LATENCY_MS);
  }, 20_000);
});

d("waiter calls: anon can create; realtime broadcast is owner-only by design", () => {
  it("INSERT on public.waiter_calls succeeds as anon", async () => {
    const client = created.client;
    const { data, error } = await client
      .from("waiter_calls")
      .insert({
        restaurant_id: restaurantId,
        table_label: `RT-CALL-${Date.now()}`,
        reason: "bill",
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("anon subscriber does NOT receive waiter_calls INSERT (RLS-blocked)", async () => {
    // Documents current design: waiter_calls SELECT is owner-only, so realtime
    // deliveries to anon subscribers are filtered out. Staff dashboards work
    // because the orders/order_items events trigger a refetch of calls via RPC.
    const client = created.client;
    const channel = client.channel(`test-calls-${Date.now()}`);
    created.channels.push(channel);

    let received = false;
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "waiter_calls",
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      () => {
        received = true;
      },
    );

    await waitSubscribed(channel);

    const { error } = await client.from("waiter_calls").insert({
      restaurant_id: restaurantId,
      table_label: `RT-CALL2-${Date.now()}`,
      reason: "waiter",
    });
    expect(error).toBeNull();

    // Give realtime a full window to deliver — we expect nothing.
    await new Promise((r) => setTimeout(r, 3000));
    expect(received).toBe(false);
  }, 15_000);
});

afterAll(async () => {
  if (!shouldRun) return;
  for (const ch of created.channels) {
    try {
      await created.client.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (service && created.orderIds.length) {
    const admin = createClient(url!, service, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined as any },
    });
    await admin.from("order_items").delete().in("order_id", created.orderIds);
    await admin.from("orders").delete().in("id", created.orderIds);
  }
});

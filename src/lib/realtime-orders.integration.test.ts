import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const restaurant = process.env.TEST_RESTAURANT_ID;
const product = process.env.TEST_MENU_ITEM_ID;
const table = process.env.TEST_TABLE_LABEL;
const enabled =
  process.env.RUN_INTEGRATION_TESTS === "1" &&
  !!url &&
  !!key &&
  !!serviceKey &&
  !!restaurant &&
  !!product &&
  !!table;
const suite = enabled ? describe : describe.skip;
const client = enabled
  ? createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const created: string[] = [];

suite("anonymous realtime privacy", () => {
  it("does not broadcast customer orders or items to anonymous subscribers", async () => {
    const events: unknown[] = [];
    const channel = client!
      .channel(`privacy-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (p) =>
        events.push(p),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, (p) =>
        events.push(p),
      );
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Subscription timeout")), 8000);
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      const token = crypto.randomUUID();
      const { data, error } = await client!.rpc("place_order", {
        p_restaurant_id: restaurant,
        p_table_label: table,
        p_customer_name: "Privacy Test",
        p_customer_phone: "11912345678",
        p_currency: "BRL",
        p_tracking_token: token,
        p_items: [{ menu_item_id: product, quantity: 1 }],
      });
      expect(error).toBeNull();
      if (typeof data === "string") created.push(data);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      expect(events).toEqual([]);
      const tracked = await client!.rpc("get_order_status", { p_order_id: data, p_token: token });
      expect(tracked.error).toBeNull();
      expect(tracked.data).toBe("pending");
    } finally {
      await client!.removeChannel(channel);
    }
  }, 15000);
});

afterAll(async () => {
  if (!enabled) return;
  const admin = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (created.length) {
    await admin.from("order_items").delete().in("order_id", created);
    await admin.from("orders").delete().in("id", created);
  }
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffListOrders, staffListTables, staffLogin, staffLogout } from "./staff-rpc";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
beforeEach(() => vi.resetAllMocks());
describe("staff RPC response boundaries", () => {
  it("accepts nullable legacy fees and preserves the items needed by the kitchen", async () => {
    const order = {
      id: "order",
      restaurant_id: "restaurant",
      table_label: "Mesa 1",
      customer_name: null,
      status: "pending",
      archived: false,
      created_at: "2026-10-30T00:00:00Z",
      currency: "BRL",
      subtotal: 20,
      service_fee: null,
      cover_charge: null,
      total: 20,
      created_by_name: null,
      delivered_by_name: null,
      delivered_at: null,
      items: [{ id: "item", name: "Prato", price: 20, quantity: 1, notes: null }],
    };
    rpc.mockResolvedValue({ data: [order], error: null });
    expect(await staffListOrders("token")).toEqual([order]);
  });
  it("rejects malformed RPC data before it reaches the operational screens", async () => {
    rpc.mockResolvedValue({ data: [{ id: "table", label: 12 }], error: null });
    await expect(staffListTables("token")).rejects.toThrow();
  });
  it("rejects an unknown staff role", async () => {
    rpc.mockResolvedValue({
      data: [{ token: "token", staff_id: "staff", name: "Nome", role: "admin" }],
      error: null,
    });
    await expect(staffLogin("restaurante", "1234")).rejects.toThrow();
  });
  it("reports logout failures instead of pretending to revoke the session", async () => {
    rpc.mockResolvedValue({ error: new Error("offline") });
    await expect(staffLogout("token")).rejects.toThrow("offline");
  });
});

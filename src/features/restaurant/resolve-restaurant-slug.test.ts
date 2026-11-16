import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveRestaurantSlug } from "./resolve-restaurant-slug";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
beforeEach(() => vi.resetAllMocks());
describe("old menu links", () => {
  it("resolves the canonical restaurant address", async () => {
    rpc.mockResolvedValue({ data: "cafe-da-praca", error: null });
    expect(await resolveRestaurantSlug("old-link")).toBe("cafe-da-praca");
    expect(rpc).toHaveBeenCalledWith("resolve_restaurant_slug", { p_slug: "old-link" });
  });
  it("keeps the original link working before the migration is installed", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await resolveRestaurantSlug("r-1234567890")).toBe("r-1234567890");
  });
  it("does not disguise connection failures as a missing restaurant", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("offline") });
    await expect(resolveRestaurantSlug("cafe")).rejects.toThrow("offline");
  });
});

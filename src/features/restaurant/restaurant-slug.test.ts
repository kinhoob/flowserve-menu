import { describe, expect, it } from "vitest";
import { restaurantSlug, validRestaurantSlug } from "./restaurant-slug";
describe("restaurant menu address", () => {
  it("generates readable links from accented restaurant names", () => {
    expect(restaurantSlug("  Café da Praça & Cia! ")).toBe("cafe-da-praca-cia");
    expect(restaurantSlug("São João — Restaurante")).toBe("sao-joao-restaurante");
    expect(restaurantSlug("Oi")).toBe("oi-restaurante");
    expect(validRestaurantSlug(restaurantSlug("🍽️"))).toBe(true);
  });
  it("bounds generated addresses and rejects paths, queries and invalid delimiters", () => {
    expect(restaurantSlug("a".repeat(90))).toHaveLength(64);
    expect(restaurantSlug("a".repeat(90), 80)).toHaveLength(80);
    for (const value of [
      "/outro",
      "menu?admin=true",
      "cafe--bar",
      "-restaurante",
      "ab",
      "Maiusculas",
      "café",
    ])
      expect(validRestaurantSlug(value)).toBe(false);
    expect(validRestaurantSlug("cafe-da-praca-2")).toBe(true);
  });
});

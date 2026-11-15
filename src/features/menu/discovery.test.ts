import { describe, expect, it } from "vitest";
import { discoverMenu, parseFavorites, type DiscoverableItem } from "./discovery";
const items: DiscoverableItem[] = [
  {
    id: "pizza",
    name: "Pizza Margherita",
    description: "Manjericão fresco",
    price: 58,
    is_promo: false,
    dietary_tags: ["vegetarian"],
    category_name: "Principais",
  },
  {
    id: "bowl",
    name: "Bowl da estação",
    description: "Grãos e legumes",
    price: 29,
    is_promo: true,
    dietary_tags: ["vegan"],
    category_name: "Leves & frescos",
  },
  {
    id: "burger",
    name: "Burger da casa",
    description: "Carne de 180 g",
    price: 36,
    is_promo: false,
    dietary_tags: [],
    category_name: "Principais",
  },
];
const defaults = {
  query: "",
  filter: "all" as const,
  sort: "featured" as const,
  favorites: new Set<string>(),
};
describe("public menu discovery", () => {
  it("matches accents, words and category names across the whole menu", () => {
    expect(
      discoverMenu(items, { ...defaults, query: "ESTACAO graos" }).map((item) => item.id),
    ).toEqual(["bowl"]);
    expect(discoverMenu(items, { ...defaults, query: "principais" })).toHaveLength(2);
  });
  it("combines search, offers and saved favorites without changing the source order", () => {
    expect(
      discoverMenu(items, { ...defaults, filter: "favorites", favorites: new Set(["pizza"]) }).map(
        (item) => item.id,
      ),
    ).toEqual(["pizza"]);
    expect(discoverMenu(items, { ...defaults, filter: "promo", query: "burger" })).toEqual([]);
    expect(discoverMenu(items, defaults).map((item) => item.id)).toEqual([
      "pizza",
      "bowl",
      "burger",
    ]);
  });
  it("includes vegan meals in the vegetarian filter", () => {
    expect(
      discoverMenu(items, { ...defaults, filter: "vegetarian" }).map((item) => item.id),
    ).toEqual(["pizza", "bowl"]);
  });
  it("sorts a copy by price and leaves the restaurant order untouched", () => {
    expect(discoverMenu(items, { ...defaults, sort: "price-asc" }).map((item) => item.id)).toEqual([
      "bowl",
      "burger",
      "pizza",
    ]);
    expect(discoverMenu(items, { ...defaults, sort: "price-desc" })[0].id).toBe("pizza");
    expect(items[0].id).toBe("pizza");
  });
  it("recovers from broken or unrelated browser storage", () => {
    expect(parseFavorites("{")).toEqual([]);
    expect(parseFavorites('{"id":"pizza"}')).toEqual([]);
    expect(parseFavorites('["pizza",null,22,"pizza","bowl"]')).toEqual(["pizza", "bowl"]);
    expect(parseFavorites(null)).toEqual([]);
  });
});

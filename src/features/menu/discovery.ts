export type DiscoverableItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_promo: boolean;
  dietary_tags: string[];
  category_name?: string;
};
export type MenuFilter = "all" | "favorites" | "promo" | "vegetarian";
export type MenuSort = "featured" | "price-asc" | "price-desc" | "name";
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
export function discoverMenu<T extends DiscoverableItem>(
  items: readonly T[],
  options: {
    query: string;
    filter: MenuFilter;
    sort: MenuSort;
    favorites: ReadonlySet<string>;
  },
): T[] {
  const words = normalizeSearch(options.query).split(/\s+/).filter(Boolean);
  const results = items.filter((item) => {
    const haystack = normalizeSearch(
      `${item.name} ${item.description ?? ""} ${item.category_name ?? ""}`,
    );
    if (!words.every((word) => haystack.includes(word))) return false;
    if (options.filter === "favorites" && !options.favorites.has(item.id)) return false;
    if (options.filter === "promo" && !item.is_promo) return false;
    if (
      options.filter === "vegetarian" &&
      !item.dietary_tags.some((tag) => tag === "vegetarian" || tag === "vegan")
    )
      return false;
    return true;
  });
  if (options.sort === "price-asc") results.sort((a, b) => a.price - b.price);
  if (options.sort === "price-desc") results.sort((a, b) => b.price - a.price);
  if (options.sort === "name") results.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return results;
}
export function parseFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter((id): id is string => typeof id === "string" && id.length <= 100),
          ),
        ].slice(0, 500)
      : [];
  } catch {
    return [];
  }
}

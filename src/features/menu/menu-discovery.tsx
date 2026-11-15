import { cn } from "@/lib/utils";
import { Heart, Leaf, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { MenuFilter, MenuSort } from "./discovery";
const filters = [
  { value: "all", label: "Tudo", icon: SlidersHorizontal },
  { value: "promo", label: "Ofertas", icon: Sparkles },
  { value: "vegetarian", label: "Vegetarianos", icon: Leaf },
  { value: "favorites", label: "Favoritos", icon: Heart },
] as const;
export function MenuDiscovery({
  query,
  onQuery,
  filter,
  onFilter,
  sort,
  onSort,
  count,
}: {
  query: string;
  onQuery: (value: string) => void;
  filter: MenuFilter;
  onFilter: (value: MenuFilter) => void;
  sort: MenuSort;
  onSort: (value: MenuSort) => void;
  count: number;
}) {
  return (
    <div className="menu-discovery space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            aria-label="Buscar no cardápio"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="O que você está com vontade de comer?"
            className="h-12 w-full rounded-xl border border-border bg-background/60 pl-11 pr-11 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              onClick={() => onQuery("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          aria-label="Ordenar cardápio"
          className="h-12 rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={sort}
          onChange={(e) => {
            const value = e.target.value;
            if (
              value === "featured" ||
              value === "price-asc" ||
              value === "price-desc" ||
              value === "name"
            )
              onSort(value);
          }}
        >
          <option value="featured">Ordem do cardápio</option>
          <option value="price-asc">Menor preço</option>
          <option value="price-desc">Maior preço</option>
          <option value="name">Nome: A–Z</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar cardápio">
          {filters.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => onFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
                filter === value
                  ? "border-primary/35 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {count} {count === 1 ? "opção" : "opções"}
        </span>
      </div>
      {filter === "vegetarian" && (
        <p className="text-xs text-muted-foreground">
          Classificação informada pelo restaurante. Confirme ingredientes e restrições com a equipe.
        </p>
      )}
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronRight,
  GripVertical,
  Loader2,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useDeleteMenuItem,
  useMenuItems,
  useReorderCategories,
  useReorderMenuItems,
  useUpdateCategory,
  useUpsertMenuItem,
  type Category,
  type MenuItem,
} from "@/features/menu/menu-queries";
import { Button } from "@/components/ui/button";
import { ItemDialog } from "@/features/menu/item-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/menu")({
  head: () => ({ meta: [{ title: "Cardápio — Flux" }] }),
  component: MenuPage,
});

function MenuPage() {
  const navigate = useNavigate();
  const { data: restaurant, isLoading: rLoading } = useRestaurant();
  const restaurantId = restaurant?.id;
  const { data: categories = [], isLoading: cLoading } = useCategories(restaurantId);
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: MenuItem | null }>({
    open: false,
    item: null,
  });
  const [delItem, setDelItem] = useState<MenuItem | null>(null);
  const [delCat, setDelCat] = useState<Category | null>(null);

  const deleteItem = useDeleteMenuItem();
  const deleteCat = useDeleteCategory(restaurantId);

  // Restaurant is auto-created on signup; no redirect needed.

  useEffect(() => {
    if (!activeCatId && categories.length) setActiveCatId(categories[0].id);
    if (activeCatId && !categories.find((c) => c.id === activeCatId)) {
      setActiveCatId(categories[0]?.id ?? null);
    }
  }, [categories, activeCatId]);

  const { data: items = [], isLoading: iLoading } = useMenuItems(restaurantId, activeCatId ?? undefined);

  const filtered = items.filter((i) =>
    query ? i.name.toLowerCase().includes(query.toLowerCase()) : true,
  );

  if (rLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!restaurant) return null;
  const currency = restaurant.currency;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Cardápio</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">
            <span className="text-gradient-gold italic">{restaurant.name}</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Organize categorias e itens. As mudanças vão ao ar instantaneamente.
          </p>
        </div>
        <Button
          onClick={() => activeCatId && setItemDialog({ open: true, item: null })}
          disabled={!activeCatId}
          size="lg"
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Novo item
        </Button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
        <CategoriesPanel
          restaurantId={restaurantId!}
          categories={categories}
          activeId={activeCatId}
          onPick={setActiveCatId}
          loading={cLoading}
          onDelete={setDelCat}
        />

        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Buscar itens…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          {!activeCatId ? (
            <EmptyState
              title="Nenhuma categoria selecionada"
              hint="Crie sua primeira categoria para começar a adicionar itens."
            />
          ) : iLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={query ? "Sem resultados" : "Nenhum item ainda"}
              hint={
                query
                  ? "Tente uma busca diferente."
                  : "Adicione seu primeiro prato ou bebida nesta categoria."
              }
              action={
                !query && (
                  <Button onClick={() => setItemDialog({ open: true, item: null })} className="mt-4">
                    <Plus className="h-4 w-4" /> Adicionar item
                  </Button>
                )
              }
            />
          ) : (
            <ul className="grid gap-3 stagger sm:grid-cols-2">
              {filtered.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  currency={currency}
                  onEdit={() => setItemDialog({ open: true, item })}
                  onDelete={() => setDelItem(item)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {activeCatId && restaurantId && (
        <ItemDialog
          open={itemDialog.open}
          onOpenChange={(v) => setItemDialog((s) => ({ ...s, open: v }))}
          restaurantId={restaurantId}
          categoryId={activeCatId}
          item={itemDialog.item}
        />
      )}

      <AlertDialog open={!!delItem} onOpenChange={(v) => !v && setDelItem(null)}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{delItem?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!delItem) return;
                try {
                  await deleteItem.mutateAsync(delItem.id);
                  toast.success("Item excluído");
                } catch (e: any) {
                  toast.error(e.message);
                }
                setDelItem(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!delCat} onOpenChange={(v) => !v && setDelCat(null)}>
        <AlertDialogContent className="border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{delCat?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os itens desta categoria serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!delCat) return;
                try {
                  await deleteCat.mutateAsync(delCat.id);
                  toast.success("Categoria excluída");
                } catch (e: any) {
                  toast.error(e.message);
                }
                setDelCat(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoriesPanel({
  restaurantId,
  categories,
  activeId,
  onPick,
  loading,
  onDelete,
}: {
  restaurantId: string;
  categories: Category[];
  activeId: string | null;
  onPick: (id: string) => void;
  loading: boolean;
  onDelete: (c: Category) => void;
}) {
  const create = useCreateCategory(restaurantId);
  const update = useUpdateCategory(restaurantId);
  const reorder = useReorderCategories(restaurantId);

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    reorder.mutate(reordered.map((c, i) => ({ id: c.id, position: i })));
  };
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [newKind, setNewKind] = useState<"food" | "drink">("food");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    try {
      const cat = await create.mutateAsync({ name: name.trim(), kind: newKind });
      onPick(cat.id);
      setName("");
      setNewKind("food");
      setAdding(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleKind = async (c: Category) => {
    const next = ((c as any).kind === "drink" ? "food" : "drink") as "food" | "drink";
    try {
      await update.mutateAsync({ id: c.id, patch: { kind: next } as any });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const saveRename = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await update.mutateAsync({ id, patch: { name: editName.trim() } });
      setEditingId(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <aside className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between px-2 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Categorias
        </span>
        <button
          onClick={() => setAdding(true)}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-background hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="space-y-0.5">
          {categories.map((c) => {
            const active = c.id === activeId;
            const editing = editingId === c.id;
            return (
              <li key={c.id}>
                <div
                  className={
                    "group flex items-center gap-1 rounded-xl px-2 py-2 text-sm transition-all duration-300 " +
                    (active
                      ? "bg-gold-soft text-foreground"
                      : "text-muted-foreground hover:bg-background hover:translate-x-0.5")
                  }
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                  {editing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => saveRename(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(c.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 bg-transparent text-sm outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => onPick(c.id)}
                      className="flex flex-1 items-center justify-between truncate text-left"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span className="truncate">{c.name}</span>
                        <span
                          className={
                            "rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ring-1 " +
                            ((c as any).kind === "drink"
                              ? "bg-[oklch(0.65_0.18_250_/_0.15)] text-[oklch(0.78_0.13_250)] ring-[oklch(0.65_0.18_250_/_0.3)]"
                              : "bg-gold-soft text-primary ring-[oklch(0.78_0.13_84_/_0.3)]")
                          }
                        >
                          {(c as any).kind === "drink" ? "Bar" : "Cozinha"}
                        </span>
                      </span>
                      {active && <ChevronRight className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="border-border bg-surface">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleKind(c)}>
                        <UtensilsCrossed className="h-3.5 w-3.5" />
                        {(c as any).kind === "drink" ? "Mover p/ Cozinha" : "Mover p/ Bar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="mt-2 space-y-2 rounded-xl border border-border bg-background p-2 animate-scale-in">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") {
                setAdding(false);
                setName("");
              }
            }}
            placeholder="ex.: Coquetéis"
            className="input-field h-9"
          />
          <div className="flex gap-1">
            {(["food", "drink"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setNewKind(k)}
                className={
                  "flex-1 rounded-lg px-2 py-1.5 text-[11px] uppercase tracking-wider transition " +
                  (newKind === k
                    ? "bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]"
                    : "border border-border text-muted-foreground hover:text-foreground")
                }
              >
                {k === "food" ? "Cozinha" : "Bar"}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={submit} disabled={create.isPending}>
              Adicionar
            </Button>
          </div>
        </div>
      ) : categories.length === 0 && !loading ? (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar primeira categoria
        </button>
      ) : null}
    </aside>
  );
}

function ItemCard({
  item,
  currency,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const upsert = useUpsertMenuItem(item.restaurant_id);
  return (
    <li
      className={
        "group relative flex gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-3 hover-lift hover:border-[oklch(0.78_0.13_84_/_0.3)] " +
        (item.is_available ? "" : "opacity-60")
      }
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-background/60">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium">{item.name}</h3>
          <div className="font-display text-lg tracking-tight text-primary">
            {formatPrice(Number(item.price), currency)}
          </div>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {item.description || "Sem descrição"}
        </p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex flex-wrap gap-1">
            {item.dietary_tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                {translateTag(t)}
              </span>
            ))}
            {!item.is_available && (
              <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-destructive">
                Oculto
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() =>
                upsert.mutate({
                  id: item.id,
                  category_id: item.category_id,
                  name: item.name,
                  price: Number(item.price),
                  is_available: !item.is_available,
                })
              }
              className="rounded-md px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground transition hover:bg-background hover:text-foreground"
            >
              {item.is_available ? "Ocultar" : "Exibir"}
            </button>
            <button
              onClick={onEdit}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-background hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/40 py-16 text-center animate-fade-up">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
        <UtensilsCrossed className="h-5 w-5 text-primary" />
      </div>
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{hint}</p>
      {action}
    </div>
  );
}

const TAG_LABELS: Record<string, string> = {
  vegan: "Vegano",
  vegetarian: "Vegetariano",
  "gluten-free": "Sem glúten",
  spicy: "Picante",
  new: "Novidade",
};
function translateTag(t: string) {
  return TAG_LABELS[t] ?? t;
}

export function formatPrice(n: number, currency: string) {
  try {
    const locale = currency === "BRL" ? "pt-BR" : undefined;
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

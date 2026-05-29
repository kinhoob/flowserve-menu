import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, Loader2, Minus, Plus, ShoppingBag, UtensilsCrossed, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/routes/_authenticated/menu";
import { FluxLogo } from "@/components/brand/logo";
import {
  fetchModifiersForRestaurant,
  type ModifierGroupWithOptions,
} from "@/features/menu/modifier-queries";
import { callWaiter } from "@/features/waiter/waiter-queries";

const searchSchema = z.object({
  table: z.string().optional(),
});

export const Route = createFileRoute("/m/$slug")({
  validateSearch: searchSchema,
  head: ({ params }) => ({
    meta: [
      { title: `Cardápio — ${params.slug}` },
      { name: "description", content: "Faça seu pedido pelo Flux." },
    ],
  }),
  component: PublicMenuPage,
});

type CartLine = {
  lineId: string;
  itemId: string;
  name: string;
  basePrice: number;
  unitPrice: number; // base + modifier deltas
  qty: number;
  note: string;
  modifiers: { group: string; name: string; price_delta: number }[];
};

type PublicItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string;
};

function PublicMenuPage() {
  const { slug } = Route.useParams();
  const { table } = Route.useSearch();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-menu", slug],
    queryFn: async () => {
      const { data: r, error: rErr } = await supabase
        .from("restaurants")
        .select("id,name,description,currency,brand_color,slug,kitchen_open")
        .eq("slug", slug)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!r) throw notFound();
      const [cats, items, modifiersMap] = await Promise.all([
        supabase.from("categories").select("*").eq("restaurant_id", r.id).eq("is_active", true).order("position"),
        supabase.from("menu_items").select("*, categories(kind)").eq("restaurant_id", r.id).eq("is_available", true).order("position"),
        fetchModifiersForRestaurant(r.id),
      ]);
      if (cats.error) throw cats.error;
      if (items.error) throw items.error;
      const kitchenOpen = (r as any).kitchen_open !== false;
      const filteredItems = kitchenOpen
        ? (items.data ?? [])
        : (items.data ?? []).filter((i: any) => i.categories?.kind === "drink");
      return { restaurant: r, categories: cats.data ?? [], items: filteredItems as PublicItem[], modifiers: modifiersMap, kitchenOpen };
    },
  });

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [openCart, setOpenCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{ id: string; status: string } | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [pickerItem, setPickerItem] = useState<PublicItem | null>(null);
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [bump, setBump] = useState(0);

  // Realtime subscription to the placed order's status
  useEffect(() => {
    if (!placedOrder?.id) return;
    const channel = supabase
      .channel(`order-${placedOrder.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${placedOrder.id}` },
        (payload) => {
          const next = (payload.new as any)?.status as string | undefined;
          if (next) setPlacedOrder((p) => (p ? { ...p, status: next } : p));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [placedOrder?.id]);

  useEffect(() => {
    if (data?.categories.length && !activeCat) setActiveCat(data.categories[0].id);
  }, [data, activeCat]);

  const itemsByCat = useMemo(() => {
    const map = new Map<string, PublicItem[]>();
    data?.items.forEach((i) => {
      const arr = map.get(i.category_id) ?? [];
      arr.push(i);
      map.set(i.category_id, arr);
    });
    return map;
  }, [data]);

  const total = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);
  const totalQty = cart.reduce((s, c) => s + c.qty, 0);

  const addSimple = (it: PublicItem) => {
    const line: CartLine = {
      lineId: crypto.randomUUID(),
      itemId: it.id,
      name: it.name,
      basePrice: Number(it.price),
      unitPrice: Number(it.price),
      qty: 1,
      note: "",
      modifiers: [],
    };
    setCart((c) => {
      // merge with identical line without modifiers and no note
      const existing = c.find((x) => x.itemId === it.id && x.modifiers.length === 0 && !x.note);
      if (existing) return c.map((x) => (x === existing ? { ...x, qty: x.qty + 1 } : x));
      return [...c, line];
    });
    setBump((b) => b + 1);
    toast.success(`${it.name} adicionado`, { duration: 1100 });
  };

  const handleAdd = (it: PublicItem) => {
    const groups = data?.modifiers.get(it.id) ?? [];
    if (groups.length === 0) {
      addSimple(it);
    } else {
      setPickerItem(it);
    }
  };

  const addConfigured = (
    it: PublicItem,
    selected: { group: string; name: string; price_delta: number }[],
  ) => {
    const delta = selected.reduce((s, x) => s + x.price_delta, 0);
    setCart((c) => [
      ...c,
      {
        lineId: crypto.randomUUID(),
        itemId: it.id,
        name: it.name,
        basePrice: Number(it.price),
        unitPrice: Number(it.price) + delta,
        qty: 1,
        note: "",
        modifiers: selected,
      },
    ]);
    setBump((b) => b + 1);
    toast.success(`${it.name} adicionado`, { duration: 1100 });
  };

  const setQty = (lineId: string, qty: number) => {
    setCart((c) =>
      qty <= 0 ? c.filter((x) => x.lineId !== lineId) : c.map((x) => (x.lineId === lineId ? { ...x, qty } : x)),
    );
  };

  const setNote = (lineId: string, note: string) => {
    setCart((c) => c.map((x) => (x.lineId === lineId ? { ...x, note } : x)));
  };

  const placeOrder = async () => {
    if (!data || cart.length === 0) return;
    if (!customerName.trim()) {
      toast.error("Informe seu nome para enviar o pedido");
      return;
    }
    setSubmitting(true);
    try {
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          restaurant_id: data.restaurant.id,
          table_label: table ? `Mesa ${table}` : null,
          customer_name: customerName.trim(),
          subtotal: total,
          currency: data.restaurant.currency,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      const { error: iErr } = await supabase.from("order_items").insert(
        cart.map((c) => ({
          order_id: order.id,
          menu_item_id: c.itemId,
          name_snapshot: c.name,
          price_snapshot: c.unitPrice,
          quantity: c.qty,
          notes: c.note || null,
          modifiers_snapshot: c.modifiers,
        })),
      );
      if (iErr) throw iErr;
      setSent(true);
      setCart([]);
      setCustomerName("");
      setTimeout(() => {
        setSent(false);
        setOpenCart(false);
      }, 2200);
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível enviar o pedido");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCallWaiter = async () => {
    if (!data) return;
    setCallingWaiter(true);
    try {
      await callWaiter({
        restaurant_id: data.restaurant.id,
        table_label: table ? `Mesa ${table}` : null,
        customer_name: customerName.trim() || null,
      });
      toast.success("Garçom a caminho", { duration: 2000 });
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível chamar o garçom");
    } finally {
      setCallingWaiter(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <FluxLogo />
        <p className="mt-6 font-display text-2xl">Cardápio não encontrado</p>
        <p className="mt-2 text-sm text-muted-foreground">O link pode estar incorreto.</p>
      </div>
    );
  }

  const { restaurant, categories } = data;
  const currency = restaurant.currency;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative overflow-hidden border-b border-border bg-surface">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.78_0.13_84_/_0.15),transparent)] blur-2xl"
        />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto max-w-3xl px-5 pb-8 pt-10"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Cardápio digital</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">
            <span className="text-gradient-gold italic">{restaurant.name}</span>
          </h1>
          {!data.kitchenOpen && (
            <div className="mt-4 rounded-xl border border-[oklch(0.62_0.21_25_/_0.4)] bg-[oklch(0.62_0.21_25_/_0.08)] px-4 py-3 text-sm text-[oklch(0.85_0.12_25)]">
              Cozinha encerrada. Apenas bebidas disponíveis.
            </div>
          )}
          {restaurant.description && (
            <p className="mt-2 text-sm text-muted-foreground">{restaurant.description}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {table && (
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Mesa {table}
              </div>
            )}
            {table && (
              <button
                onClick={handleCallWaiter}
                disabled={callingWaiter}
                className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.78_0.13_84_/_0.3)] bg-gold-soft px-3 py-1 text-xs text-primary transition hover:bg-[oklch(0.78_0.13_84_/_0.18)]"
              >
                {callingWaiter ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
                Chamar garçom
              </button>
            )}
            {table && (
              <button
                onClick={async () => {
                  if (!data) return;
                  try {
                    await callWaiter({
                      restaurant_id: data.restaurant.id,
                      table_label: `Mesa ${table}`,
                      customer_name: customerName.trim() || null,
                      kind: "bill",
                    });
                    toast.success("Conta solicitada", { duration: 2000 });
                  } catch (e: any) {
                    toast.error(e.message ?? "Erro");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <Check className="h-3 w-3" /> Pedir a conta
              </button>
            )}
          </div>
        </motion.div>

        <nav className="sticky top-0 z-10 -mx-px overflow-x-auto border-t border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-1 px-3 py-2">
            {categories.map((c) => {
              const active = c.id === activeCat;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveCat(c.id);
                    document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={
                    "whitespace-nowrap rounded-full px-4 py-1.5 text-xs transition " +
                    (active
                      ? "bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.4)]"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <main className="mx-auto max-w-3xl px-5 pb-32 pt-6">
        {categories.length === 0 ? (
          <EmptyMenu />
        ) : (
          categories.map((cat) => {
            const items = itemsByCat.get(cat.id) ?? [];
            return (
              <section key={cat.id} id={`cat-${cat.id}`} className="mb-10 scroll-mt-20">
                <h2 className="font-display text-2xl tracking-tight">{cat.name}</h2>
                {cat.description && <p className="mt-1 text-xs text-muted-foreground">{cat.description}</p>}
                <ul className="mt-4 space-y-3 stagger">
                  {items.map((it) => {
                    const hasMods = (data.modifiers.get(it.id)?.length ?? 0) > 0;
                    return (
                      <motion.li
                        key={it.id}
                        whileTap={{ scale: 0.99 }}
                        className="group flex gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-3 transition hover:border-[oklch(0.78_0.13_84_/_0.3)]"
                      >
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-background/60">
                          {it.image_url ? (
                            <img
                              src={it.image_url}
                              alt=""
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                              <UtensilsCrossed className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="truncate text-sm font-medium">{it.name}</h3>
                            <span className="font-display text-base tracking-tight text-primary">
                              {formatPrice(Number(it.price), currency)}
                            </span>
                          </div>
                          {it.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{it.description}</p>
                          )}
                          <div className="mt-auto flex items-center justify-end pt-2">
                            <button
                              onClick={() => handleAdd(it)}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary"
                            >
                              <Plus className="h-3.5 w-3.5" /> {hasMods ? "Personalizar" : "Adicionar"}
                            </button>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                  {items.length === 0 && (
                    <li className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                      Sem itens nesta categoria.
                    </li>
                  )}
                </ul>
              </section>
            );
          })
        )}
      </main>

      {/* Floating cart FAB */}
      <AnimatePresence>
        {cart.length > 0 && !openCart && (
          <motion.button
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => setOpenCart(true)}
            className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-[oklch(0.78_0.13_84_/_0.3)] bg-primary px-5 py-3.5 text-primary-foreground shadow-[0_30px_60px_-20px_oklch(0.78_0.13_84_/_0.5)]"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="relative">
                <ShoppingBag className="h-5 w-5" />
                <motion.span
                  key={bump}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 18 }}
                  className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-1 text-[10px] font-bold text-primary ring-2 ring-primary"
                >
                  {totalQty}
                </motion.span>
              </span>
              Revisar pedido
            </span>
            <span className="font-display text-lg">{formatPrice(total, currency)}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Cart / Review drawer */}
      <AnimatePresence>
        {openCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !submitting && setOpenCart(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-hidden rounded-t-3xl border-t border-border bg-surface"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h3 className="font-display text-2xl tracking-tight">Revisar pedido</h3>
                  <p className="text-xs text-muted-foreground">Ajuste as quantidades antes de enviar para a cozinha</p>
                </div>
                <button
                  onClick={() => !submitting && setOpenCart(false)}
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-background hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {sent ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.4)]"
                  >
                    <Check className="h-7 w-7" />
                  </motion.div>
                  <p className="mt-5 font-display text-2xl">Pedido enviado</p>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                    O estabelecimento já recebeu seu pedido. Em breve estará a caminho.
                  </p>
                </div>
              ) : (
                <>
                  <ul className="max-h-[48vh] space-y-2 overflow-y-auto px-5 py-4">
                    <AnimatePresence initial={false}>
                      {cart.map((c) => (
                        <motion.li
                          key={c.lineId}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="rounded-xl border border-border bg-background/60 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{c.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatPrice(c.unitPrice, currency)} cada
                              </div>
                              {c.modifiers.length > 0 && (
                                <ul className="mt-1.5 space-y-0.5">
                                  {c.modifiers.map((m, i) => (
                                    <li key={i} className="text-[11px] text-muted-foreground">
                                      <span className="text-primary/80">·</span> {m.name}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                              <button
                                onClick={() => setQty(c.lineId, c.qty - 1)}
                                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-surface hover:text-foreground"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-6 text-center text-sm font-medium tabular-nums">{c.qty}</span>
                              <button
                                onClick={() => setQty(c.lineId, c.qty + 1)}
                                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-surface hover:text-foreground"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <input
                            value={c.note}
                            onChange={(e) => setNote(c.lineId, e.target.value)}
                            placeholder="Observação (ex.: sem cebola, gelo e limão)"
                            className="mt-2 w-full rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-xs outline-none transition placeholder:text-muted-foreground/60 focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                          />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                  <div className="border-t border-border px-5 py-4">
                    <label className="mb-3 block">
                      <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                        Seu nome
                      </span>
                      <input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Como podemos te chamar?"
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                      />
                    </label>
                    <div className="flex items-center justify-between pb-3">
                      <span className="text-sm text-muted-foreground">Subtotal</span>
                      <span className="font-display text-2xl tracking-tight">
                        {formatPrice(total, currency)}
                      </span>
                    </div>
                    <button
                      onClick={placeOrder}
                      disabled={submitting || cart.length === 0 || !customerName.trim()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                    >
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      Enviar pedido {table ? `da Mesa ${table}` : ""}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modifier picker */}
      <ModifierPicker
        item={pickerItem}
        groups={pickerItem ? data.modifiers.get(pickerItem.id) ?? [] : []}
        currency={currency}
        onClose={() => setPickerItem(null)}
        onConfirm={(selected) => {
          if (!pickerItem) return;
          addConfigured(pickerItem, selected);
          setPickerItem(null);
        }}
      />
    </div>
  );
}

function ModifierPicker({
  item,
  groups,
  currency,
  onClose,
  onConfirm,
}: {
  item: PublicItem | null;
  groups: ModifierGroupWithOptions[];
  currency: string;
  onClose: () => void;
  onConfirm: (selected: { group: string; name: string; price_delta: number }[]) => void;
}) {
  const [picks, setPicks] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (item) setPicks({});
  }, [item]);

  if (!item) return null;

  const toggle = (g: ModifierGroupWithOptions, optId: string) => {
    setPicks((p) => {
      const cur = p[g.id] ?? [];
      const has = cur.includes(optId);
      let next: string[];
      if (g.max_select <= 1) next = has ? [] : [optId];
      else if (has) next = cur.filter((x) => x !== optId);
      else next = cur.length >= g.max_select ? cur : [...cur, optId];
      return { ...p, [g.id]: next };
    });
  };

  const canConfirm = groups.every((g) => {
    const cur = picks[g.id] ?? [];
    if (g.is_required && cur.length < Math.max(1, g.min_select)) return false;
    return true;
  });

  const delta = groups.reduce((s, g) => {
    const ids = picks[g.id] ?? [];
    return s + g.modifier_options.filter((o) => ids.includes(o.id)).reduce((a, o) => a + Number(o.price_delta), 0);
  }, 0);

  const confirm = () => {
    const selected: { group: string; name: string; price_delta: number }[] = [];
    groups.forEach((g) => {
      (picks[g.id] ?? []).forEach((id) => {
        const opt = g.modifier_options.find((o) => o.id === id);
        if (opt) selected.push({ group: g.name, name: opt.name, price_delta: Number(opt.price_delta) });
      });
    });
    onConfirm(selected);
  };

  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h3 className="font-display text-2xl tracking-tight">{item.name}</h3>
                <p className="text-xs text-muted-foreground">Personalize antes de adicionar</p>
              </div>
              <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground transition hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-5 px-5 py-5">
              {groups.map((g) => (
                <div key={g.id}>
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-sm font-medium">
                      {g.name}{" "}
                      {g.is_required && <span className="text-xs text-primary">· obrigatório</span>}
                    </h4>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {g.max_select > 1 ? `Até ${g.max_select}` : "Escolha 1"}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {g.modifier_options.map((o) => {
                      const selected = (picks[g.id] ?? []).includes(o.id);
                      return (
                        <li key={o.id}>
                          <button
                            onClick={() => toggle(g, o.id)}
                            className={
                              "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition " +
                              (selected
                                ? "border-[oklch(0.78_0.13_84_/_0.5)] bg-gold-soft text-foreground"
                                : "border-border bg-background/40 text-muted-foreground hover:border-foreground/30 hover:text-foreground")
                            }
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={
                                  "flex h-4 w-4 items-center justify-center rounded-full border " +
                                  (selected ? "border-primary bg-primary text-primary-foreground" : "border-border")
                                }
                              >
                                {selected && <Check className="h-2.5 w-2.5" />}
                              </span>
                              {o.name}
                            </span>
                            {Number(o.price_delta) !== 0 && (
                              <span className="text-xs text-primary">
                                {Number(o.price_delta) > 0 ? "+" : ""}
                                {formatPrice(Number(o.price_delta), currency)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 border-t border-border bg-surface px-5 py-4">
              <button
                onClick={confirm}
                disabled={!canConfirm}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Adicionar · {formatPrice(Number(item.price) + delta, currency)}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function EmptyMenu() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/40 py-20 text-center">
      <UtensilsCrossed className="h-6 w-6 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">Cardápio em breve.</p>
    </div>
  );
}

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, ShoppingBag, UtensilsCrossed, X, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/routes/_authenticated/menu";
import { FluxLogo } from "@/components/brand/logo";

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

type CartItem = { id: string; name: string; price: number; qty: number };

function PublicMenuPage() {
  const { slug } = Route.useParams();
  const { table } = Route.useSearch();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-menu", slug],
    queryFn: async () => {
      const { data: r, error: rErr } = await supabase
        .from("restaurants")
        .select("id,name,description,currency,brand_color,slug")
        .eq("slug", slug)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!r) throw notFound();
      const [cats, items] = await Promise.all([
        supabase.from("categories").select("*").eq("restaurant_id", r.id).eq("is_active", true).order("position"),
        supabase.from("menu_items").select("*").eq("restaurant_id", r.id).eq("is_available", true).order("position"),
      ]);
      if (cats.error) throw cats.error;
      if (items.error) throw items.error;
      return { restaurant: r, categories: cats.data ?? [], items: items.data ?? [] };
    },
  });

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [openCart, setOpenCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [customerName, setCustomerName] = useState("");

  useEffect(() => {
    if (data?.categories.length && !activeCat) setActiveCat(data.categories[0].id);
  }, [data, activeCat]);

  type PublicItem = NonNullable<typeof data>["items"][number];
  const itemsByCat = useMemo(() => {
    const map = new Map<string, PublicItem[]>();
    data?.items.forEach((i) => {
      const arr = map.get(i.category_id) ?? [];
      arr.push(i);
      map.set(i.category_id, arr);
    });
    return map;
  }, [data]);

  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const totalQty = cart.reduce((s, c) => s + c.qty, 0);

  const addToCart = (it: { id: string; name: string; price: number }) => {
    setCart((c) => {
      const ex = c.find((x) => x.id === it.id);
      if (ex) return c.map((x) => (x.id === it.id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { ...it, qty: 1 }];
    });
    toast.success(`${it.name} adicionado`, { duration: 1200 });
  };

  const setQty = (id: string, qty: number) => {
    setCart((c) => (qty <= 0 ? c.filter((x) => x.id !== id) : c.map((x) => (x.id === id ? { ...x, qty } : x))));
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
          menu_item_id: c.id,
          name_snapshot: c.name,
          price_snapshot: c.price,
          quantity: c.qty,
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
          {restaurant.description && (
            <p className="mt-2 text-sm text-muted-foreground">{restaurant.description}</p>
          )}
          {table && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Mesa {table}
            </div>
          )}
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
                  {items.map((it) => (
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
                            onClick={() => addToCart({ id: it.id, name: it.name, price: Number(it.price) })}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary"
                          >
                            <Plus className="h-3.5 w-3.5" /> Adicionar
                          </button>
                        </div>
                      </div>
                    </motion.li>
                  ))}
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

      {/* Cart bar */}
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
              <ShoppingBag className="h-4 w-4" />
              {totalQty} {totalQty === 1 ? "item" : "itens"}
            </span>
            <span className="font-display text-lg">{formatPrice(total, currency)}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Cart drawer */}
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
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-hidden rounded-t-3xl border-t border-border bg-surface"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="font-display text-2xl tracking-tight">Seu pedido</h3>
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
                  <ul className="max-h-[50vh] space-y-2 overflow-y-auto px-5 py-4">
                    {cart.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatPrice(c.price, currency)} cada
                          </div>
                        </div>
                        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                          <button
                            onClick={() => setQty(c.id, c.qty - 1)}
                            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-surface hover:text-foreground"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-medium tabular-nums">{c.qty}</span>
                          <button
                            onClick={() => setQty(c.id, c.qty + 1)}
                            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-surface hover:text-foreground"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-border px-5 py-4">
                    <div className="flex items-center justify-between pb-3">
                      <span className="text-sm text-muted-foreground">Subtotal</span>
                      <span className="font-display text-2xl tracking-tight">
                        {formatPrice(total, currency)}
                      </span>
                    </div>
                    <button
                      onClick={placeOrder}
                      disabled={submitting || cart.length === 0}
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
    </div>
  );
}

function EmptyMenu() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/40 py-20 text-center">
      <UtensilsCrossed className="h-6 w-6 text-muted-foreground" />
      <p className="mt-4 font-display text-xl">Cardápio em preparo</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        Em breve este restaurante publicará seus itens.
      </p>
    </div>
  );
}

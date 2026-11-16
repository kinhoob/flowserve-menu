import { AppearanceDemo } from "@/features/menu/appearance/appearance-studio";
import { FluxLogo } from "@/components/brand/logo";
import { DEMO_DISHES, DEMO_ORDERS, type DemoOrder } from "@/features/demo/demo-data";
import { OperationPreview } from "@/features/demo/operation-preview";
import { SplitBillDialog } from "@/features/experience/split-bill-dialog";
import { discoverMenu, type MenuFilter, type MenuSort } from "@/features/menu/discovery";
import { MenuDiscovery } from "@/features/menu/menu-discovery";
import { useMenuFavorites } from "@/features/menu/use-menu-favorites";
import { formatPrice } from "@/lib/format";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  Heart,
  Leaf,
  Minus,
  Plus,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [{ title: "Explore o Flux Menu — Demonstração" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: z.object({
    view: z.enum(["operation", "menu", "customize"]).default("operation"),
  }),
  component: DemoPage,
});
function DemoPage() {
  const { view } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MenuFilter>("all");
  const [sort, setSort] = useState<MenuSort>("featured");
  const { favorites, toggleFavorite } = useMenuFavorites("demonstracao-flux");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<DemoOrder[]>(DEMO_ORDERS);
  const [statusFilter, setStatusFilter] = useState("all");
  const [completed, setCompleted] = useState(false);
  const dishes = useMemo(
    () => discoverMenu(DEMO_DISHES, { query, filter, sort, favorites }),
    [query, filter, sort, favorites],
  );
  const selection = DEMO_DISHES.filter((dish) => (cart[dish.id] ?? 0) > 0);
  const qty = selection.reduce((sum, dish) => sum + cart[dish.id], 0);
  const totalCents = selection.reduce(
    (sum, dish) => sum + Math.round(dish.price * 100) * cart[dish.id],
    0,
  );
  function changeQty(id: string, delta: number) {
    setCompleted(false);
    setCart((value) => ({ ...value, [id]: Math.max(0, Math.min(99, (value[id] ?? 0) + delta)) }));
  }
  function advance(id: string) {
    setOrders((value) =>
      value.map((order) =>
        order.id !== id
          ? order
          : {
              ...order,
              status:
                order.status === "pending"
                  ? "preparing"
                  : order.status === "preparing"
                    ? "ready"
                    : "served",
            },
      ),
    );
    toast.success("Status atualizado na demonstração");
  }
  function simulate() {
    if (!qty) return;
    setOrders((value) => [
      {
        id: "demo-" + String(value.length + 1),
        table: "01",
        item: selection.map((dish) => dish.name).join(" + "),
        itemsSummary: selection.map((dish) => `${cart[dish.id]}× ${dish.name}`).join(" + "),
        qty,
        amount: totalCents / 100,
        status: "pending",
        time: "Agora",
      },
      ...value,
    ]);
    setCart({});
    setCompleted(true);
    toast.success("Pedido simulado. Veja na aba Operação.", {
      description: "Nenhum pedido real foi enviado e não houve cobrança.",
    });
  }
  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="border-b border-border bg-background/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link to="/" aria-label="Voltar ao início">
            <FluxLogo />
          </Link>
          <span className="order-3 w-full text-center text-[10px] uppercase tracking-[.15em] text-muted-foreground sm:order-none sm:w-auto">
            Demonstração · Dados ilustrativos · Sem cobranças
          </span>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="flux-button border border-border text-foreground"
          >
            Criar minha conta
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Link
              to="/"
              className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="h-3 w-3" />
              Voltar ao Flux
            </Link>
            <p className="flux-eyebrow text-primary">Sinta o fluxo</p>
            <h1 className="mt-3 font-display text-3xl leading-tight sm:text-5xl">
              Do primeiro toque
              <br className="sm:hidden" /> à última mesa.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Explore o cardápio, monte uma seleção e acompanhe um pedido pela cozinha. Tudo aqui é
              uma simulação.
            </p>
          </div>
          <button
            onClick={() => {
              setOrders(DEMO_ORDERS);
              setCart({});
              setCompleted(false);
              setStatusFilter("all");
              toast.success("Demonstração reiniciada");
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reiniciar simulação
          </button>
        </div>
        <nav
          aria-label="Visões da demonstração"
          className="mb-8 flex max-w-full w-fit flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1.5"
        >
          {[
            { key: "operation", label: "Operação", icon: ChefHat },
            { key: "menu", label: "Cardápio do cliente", icon: UtensilsCrossed },
            { key: "customize", label: "Personalizar", icon: Sparkles },
          ].map(({ key, label, icon: Icon }) => (
            <Link
              key={key}
              to="/demo"
              search={{ view: key as "operation" | "menu" | "customize" }}
              aria-current={view === key ? "page" : undefined}
              className="relative inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-xs font-medium"
            >
              {view === key && (
                <motion.span
                  layoutId="demo-tab"
                  className="absolute inset-0 rounded-xl bg-primary/12 ring-1 ring-primary/25"
                />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{label}</span>
            </Link>
          ))}
        </nav>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {view === "customize" ? (
              <AppearanceDemo />
            ) : view === "operation" ? (
              <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
                <div>
                  <div
                    className="mb-4 flex flex-wrap gap-2"
                    role="group"
                    aria-label="Filtrar pedidos da demonstração"
                  >
                    {[
                      { value: "all", label: "Todos" },
                      { value: "pending", label: "Novos" },
                      { value: "preparing", label: "Em preparo" },
                      { value: "ready", label: "Prontos" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setStatusFilter(option.value)}
                        aria-pressed={statusFilter === option.value}
                        className={`min-h-10 rounded-full border px-4 text-xs ${statusFilter === option.value ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <OperationPreview
                    orders={orders.filter(
                      (order) => statusFilter === "all" || order.status === statusFilter,
                    )}
                    onAdvance={advance}
                  />
                  {!orders.some(
                    (order) => statusFilter === "all" || order.status === statusFilter,
                  ) && (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Nenhum pedido neste status.
                    </p>
                  )}
                </div>
                <aside className="space-y-5">
                  <div className="flux-panel p-6">
                    <span className="flux-eyebrow text-primary">Um pedido, três passos</span>
                    <h2 className="mt-3 font-display text-xl">
                      A equipe sabe o próximo movimento.
                    </h2>
                    <ol className="mt-5 space-y-5">
                      {[
                        "Cliente escolhe e envia",
                        "Cozinha prepara e sinaliza",
                        "Equipe entrega na mesa",
                      ].map((text, index) => (
                        <li key={text} className="flex items-center gap-3 text-sm">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                            0{index + 1}
                          </span>
                          <span className="text-muted-foreground">{text}</span>
                        </li>
                      ))}
                    </ol>
                    <Link
                      to="/demo"
                      search={{ view: "menu" }}
                      className="flux-button mt-6 w-full bg-primary text-primary-foreground"
                    >
                      Experimentar o cardápio
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                  <div className="rounded-2xl border border-[#526954]/40 bg-[#1d2b21] p-5">
                    <Sparkles className="mb-3 h-5 w-5 text-[#b3c6a3]" />
                    <p className="text-sm text-[#dbe7d5]">
                      Clique nos pedidos para avançar o preparo.
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-[#a0b49f]">
                      Os dados desta tela são locais e podem ser reiniciados a qualquer momento.
                    </p>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="grid items-start gap-6 lg:grid-cols-[1fr_310px]">
                <div>
                  <div className="flux-panel mb-5 overflow-hidden">
                    <div className="relative bg-[#223429] px-6 py-7">
                      <span className="flux-eyebrow text-[#adcaa9]">Restaurante demonstrativo</span>
                      <h2 className="mt-2 font-display text-3xl">Casa do Flux</h2>
                      <p className="mt-2 text-sm text-[#b8c6b6]">
                        Boa comida. Boas escolhas. No seu tempo.
                      </p>
                      <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-[#d5dfd0]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#b8d3a1]" />
                        Mesa 01 · cardápio ilustrativo
                      </span>
                    </div>
                  </div>
                  <MenuDiscovery
                    query={query}
                    onQuery={setQuery}
                    filter={filter}
                    onFilter={setFilter}
                    sort={sort}
                    onSort={setSort}
                    count={dishes.length}
                  />
                  <motion.div layout className="mt-5 grid gap-4 sm:grid-cols-2">
                    <AnimatePresence mode="popLayout">
                      {dishes.map((dish) => (
                        <motion.article
                          layout
                          key={dish.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.97 }}
                          className="group overflow-hidden rounded-2xl border border-border bg-surface"
                        >
                          <div className="relative h-44 overflow-hidden bg-[#2b352b]">
                            <img
                              loading="lazy"
                              src={dish.image_url}
                              alt={`Foto ilustrativa de ${dish.name}`}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            {dish.is_promo && (
                              <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">
                                Oferta da casa
                              </span>
                            )}
                            <button
                              onClick={() => toggleFavorite(dish.id)}
                              aria-label={`${favorites.has(dish.id) ? "Remover" : "Salvar"} ${dish.name} ${favorites.has(dish.id) ? "dos" : "nos"} favoritos`}
                              aria-pressed={favorites.has(dish.id)}
                              className="absolute right-3 top-3 rounded-full bg-background/85 p-2.5 text-primary backdrop-blur"
                            >
                              <Heart
                                className="h-4 w-4"
                                fill={favorites.has(dish.id) ? "currentColor" : "none"}
                              />
                            </button>
                          </div>
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-display text-base">{dish.name}</h3>
                              {dish.dietary_tags.length > 0 && (
                                <Leaf
                                  aria-label="Opção vegetariana"
                                  className="h-4 w-4 shrink-0 text-[#b3c6a3]"
                                />
                              )}
                            </div>
                            <p className="mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">
                              {dish.description}
                            </p>
                            <p className="mt-3 text-[10px] text-[#b3c6a3]">{dish.portion}</p>
                            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                              <div>
                                {dish.original_price && (
                                  <p className="text-[10px] text-muted-foreground line-through">
                                    {formatPrice(dish.original_price, "BRL")}
                                  </p>
                                )}
                                <p className="font-display text-lg text-primary">
                                  {formatPrice(dish.price, "BRL")}
                                </p>
                              </div>
                              <button
                                aria-label={`Adicionar ${dish.name}`}
                                onClick={() => {
                                  changeQty(dish.id, 1);
                                  toast.success(`${dish.name} na seleção`, { duration: 1100 });
                                }}
                                disabled={(cart[dish.id] ?? 0) >= 99}
                                className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Adicionar
                              </button>
                            </div>
                          </div>
                        </motion.article>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                  {dishes.length === 0 && (
                    <div className="flux-panel mt-5 p-10 text-center">
                      <Heart className="mx-auto h-6 w-6 text-primary" />
                      <h3 className="mt-4 font-display text-xl">Nenhuma opção por aqui</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Busque outro termo ou salve seus pratos favoritos.
                      </p>
                      <button
                        onClick={() => {
                          setFilter("all");
                          setQuery("");
                        }}
                        className="flux-button mt-3 text-primary"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  )}
                  <p className="mt-5 text-[10px] text-muted-foreground">
                    Fotos e porções ilustrativas. Nenhum modelo 3D de prato real está disponível
                    nesta demonstração.
                  </p>
                </div>
                <aside id="demo-cart" className="flux-panel scroll-mt-6 p-5 lg:sticky lg:top-6">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-semibold">Sua seleção</h2>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">
                      {qty} itens
                    </span>
                  </div>
                  {qty === 0 ? (
                    <div className="py-8 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/7">
                        {completed ? (
                          <Check className="h-5 w-5 text-primary" />
                        ) : (
                          <ShoppingBag className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <p className="text-sm">
                        {completed ? "Pedido simulado com sucesso" : "A próxima boa escolha é sua."}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {completed
                          ? "Abra a aba Operação para acompanhar o preparo."
                          : "Adicione pratos para experimentar o fluxo do pedido."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <ul className="divide-y divide-border">
                        {selection.map((dish) => (
                          <li key={dish.id} className="py-4">
                            <div className="flex justify-between gap-3 text-xs">
                              <span>{dish.name}</span>
                              <span className="whitespace-nowrap text-muted-foreground">
                                {formatPrice(dish.price * cart[dish.id], "BRL")}
                              </span>
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                              <button
                                onClick={() => changeQty(dish.id, -1)}
                                aria-label={`Diminuir ${dish.name}`}
                                className="rounded-lg border border-border p-2"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="text-xs">{cart[dish.id]}</span>
                              <button
                                onClick={() => changeQty(dish.id, 1)}
                                disabled={cart[dish.id] >= 99}
                                aria-label={`Aumentar ${dish.name}`}
                                className="rounded-lg border border-border p-2"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="flex justify-between border-t border-border py-4">
                        <span className="text-sm">Total ilustrativo</span>
                        <span className="font-display text-xl text-primary">
                          {formatPrice(totalCents / 100, "BRL")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-3">
                        <SplitBillDialog total={totalCents / 100} />
                        <button
                          onClick={simulate}
                          className="flux-button w-full bg-primary text-primary-foreground"
                        >
                          Simular pedido
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                  <p className="mt-4 text-center text-[10px] text-muted-foreground">
                    Sem pagamento. Sem envio à cozinha real.
                  </p>
                </aside>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      {view === "menu" && qty > 0 && (
        <a
          href="#demo-cart"
          className="fixed inset-x-5 bottom-5 z-30 flex items-center justify-between rounded-2xl bg-primary px-5 py-4 text-sm font-semibold text-primary-foreground shadow-elevated lg:hidden"
        >
          <span className="inline-flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Ver seleção · {qty}
          </span>
          <span>{formatPrice(totalCents / 100, "BRL")}</span>
        </a>
      )}
    </div>
  );
}

import { getServiceStatus } from "@/features/restaurant/service-hours";
import { resolveRestaurantSlug } from "@/features/restaurant/resolve-restaurant-slug";
import { ConnectionNotice } from "@/features/orders/connection-notice";
import { withLivePrices } from "@/features/menu/live-prices";
import { MenuCover, MenuSignature } from "@/features/menu/appearance/menu-identity";
import {
  menuButtonStyle,
  menuThemeStyle,
  menuAppearanceAttributes,
  readAppearance,
  readRestaurantColors,
  readableColor,
} from "@/features/menu/appearance/appearance";
import { FluxLogo } from "@/components/brand/logo";
import type { DishModel } from "@/features/ar/model-assets";
import { discoverMenu, type MenuFilter, type MenuSort } from "@/features/menu/discovery";
import { MenuDiscovery } from "@/features/menu/menu-discovery";
import { ModifierPicker } from "@/features/menu/modifier-picker";
import { fetchModifiersForRestaurant } from "@/features/menu/modifier-queries";
import { useMenuFavorites } from "@/features/menu/use-menu-favorites";
import { callWaiter } from "@/features/waiter/waiter-queries";
import { supabase } from "@/integrations/supabase/client";
import { getErrorDetails } from "@/lib/errors";
import { formatPrice } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  Check,
  Heart,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
const DishModelDialog = lazy(() => import("@/features/ar/dish-model-dialog"));

const searchSchema = z.object({
  table: z.string().optional(),
});

export const Route = createFileRoute("/m/$slug")({
  validateSearch: searchSchema,
  head: ({ params }) => ({
    meta: [
      { title: `Cardápio — ${params.slug}` },
      { name: "description", content: "Faça seu pedido pelo Flux Menu." },
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
  modifiers: { id: string; group: string; name: string; price_delta: number }[];
};

type PublicItem = DishModel & {
  dietary_tags: string[];
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string;
  is_promo: boolean;
  promo_label: string | null;
  original_price: number | null;
};

function fetchPublicRestaurant(address: string) {
  return supabase
    .from("restaurants")
    .select(
      "id,name,description,currency,brand_color,brand_text_color,brand_accent_color,brand_card_color,brand_header_color,brand_button_color,banner_enabled,banner_title,banner_description,banner_image_url,banner_cta_label,slug,kitchen_open,logo_url",
    )
    .eq("slug", address)
    .maybeSingle();
}

function PublicMenuPage() {
  const reduceMotion = useReducedMotion();
  const { slug } = Route.useParams();
  const navigate = Route.useNavigate();
  const { table: rawTable } = Route.useSearch();
  // Normaliza: se o QR vier com "Mesa 1" no parâmetro, evita virar "Mesa Mesa 1"
  const table = rawTable ? rawTable.replace(/^Mesa\s*/i, "").trim() : undefined;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["public-menu", slug, table],
    retry: false,
    refetchInterval: 30000,
    queryFn: async () => {
      let result = await fetchPublicRestaurant(slug);
      if (!result.error && !result.data) {
        const canonical = await resolveRestaurantSlug(slug);
        if (canonical !== slug) result = await fetchPublicRestaurant(canonical);
      }
      const { data: r, error: rErr } = result;
      if (rErr) throw rErr;
      if (!r) throw notFound();
      const [cats, items, modifiersMap, planRes, appearanceRes] = await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("restaurant_id", r.id)
          .eq("is_active", true)
          .order("position"),
        supabase
          .from("menu_items")
          .select("*, categories(kind)")
          .eq("restaurant_id", r.id)
          .eq("is_available", true)
          .order("position"),
        fetchModifiersForRestaurant(r.id),
        supabase.rpc("get_restaurant_plan", { p_slug: r.slug }),
        supabase.from("restaurants").select("menu_appearance").eq("id", r.id).maybeSingle(),
      ]);
      if (cats.error) throw cats.error;
      if (items.error) throw items.error;
      if (planRes.error) throw planRes.error;
      const service = await getServiceStatus(r.id);
      const kitchenOpen = service.kitchen_open;
      const barOpen = service.bar_open;
      const filteredItems =
        !kitchenOpen && !barOpen
          ? (items.data ?? [])
          : (items.data ?? []).filter((i) =>
              i.categories?.kind === "drink" ? barOpen : kitchenOpen,
            );
      const plan = ((planRes.data as unknown as string) ?? "basic").toLowerCase();
      const viewOnly = plan === "basic" || !table || (!kitchenOpen && !barOpen);
      return {
        restaurant: r,
        appearance: readAppearance(appearanceRes.data?.menu_appearance),
        categories: cats.data ?? [],
        items: (await withLivePrices(r.id, filteredItems)) as PublicItem[],
        modifiers: modifiersMap,
        kitchenOpen,
        barOpen,
        requireCode: service.require_table_code,
        serviceSetupPending: service.setupPending,
        orderingPlan: plan !== "basic",
        viewOnly,
      };
    },
  });

  const [query, setQuery] = useState("");
  const [menuFilter, setMenuFilter] = useState<MenuFilter>("all");
  const [menuSort, setMenuSort] = useState<MenuSort>("featured");
  const { favorites, toggleFavorite } = useMenuFavorites(slug);
  const [modelItem, setModelItem] = useState<PublicItem | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [openCart, setOpenCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{
    id: string;
    status: string;
    token: string;
  } | null>(null);
  const orderAttempt = useRef<string | null>(null);
  const [tableCode, setTableCode] = useState("");
  useEffect(() => {
    setTableCode("");
  }, [slug, table]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickerItem, setPickerItem] = useState<PublicItem | null>(null);
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [bump, setBump] = useState(0);

  // Keep an in-progress cart or private tracking session mounted during a restaurant rename.
  useEffect(() => {
    if (cart.length || placedOrder || submitting || orderAttempt.current) return;
    if (data?.restaurant.slug && data.restaurant.slug !== slug)
      void navigate({
        to: "/m/$slug",
        params: { slug: data.restaurant.slug },
        search: { table: rawTable },
        replace: true,
      });
  }, [data?.restaurant.slug, slug, rawTable, navigate, cart.length, placedOrder, submitting]);

  // Only expose the status belonging to this private tracking token.
  useEffect(() => {
    if (!placedOrder?.id) return;
    let stopped = false;
    const refresh = async () => {
      const { data: status, error } = await supabase.rpc("get_order_status", {
        p_order_id: placedOrder.id,
        p_token: placedOrder.token,
      });
      if (!stopped && !error && typeof status === "string")
        setPlacedOrder((p) => (p ? { ...p, status } : p));
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [placedOrder?.id, placedOrder?.token]);

  useEffect(() => {
    if (data?.categories.length && !activeCat) setActiveCat(data.categories[0].id);
  }, [data, activeCat]);

  const visibleItems = useMemo(
    () =>
      discoverMenu(
        (data?.items ?? []).map((item) => ({
          ...item,
          category_name: data?.categories.find((category) => category.id === item.category_id)
            ?.name,
        })),
        { query, filter: menuFilter, sort: menuSort, favorites },
      ),
    [data, query, menuFilter, menuSort, favorites],
  );
  const itemsByCat = useMemo(() => {
    const map = new Map<string, PublicItem[]>();
    for (const item of visibleItems) {
      const group = map.get(item.category_id) ?? [];
      group.push(item);
      map.set(item.category_id, group);
    }
    return map;
  }, [visibleItems]);

  const isDiscovering = !!query.trim() || menuFilter !== "all" || menuSort !== "featured";
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
      if (existing)
        return c.map((x) => (x === existing ? { ...x, qty: Math.min(99, x.qty + 1) } : x));
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
    selected: { id: string; group: string; name: string; price_delta: number }[],
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
      qty <= 0
        ? c.filter((x) => x.lineId !== lineId)
        : c.map((x) => (x.lineId === lineId ? { ...x, qty: Math.min(99, qty) } : x)),
    );
  };

  const setNote = (lineId: string, note: string) => {
    setCart((c) => c.map((x) => (x.lineId === lineId ? { ...x, note } : x)));
  };

  const placeOrder = async () => {
    if (!navigator.onLine) {
      toast.error("Reconecte à internet antes de enviar. Seu carrinho foi mantido.");
      return;
    }
    if (!data || cart.length === 0) return;
    if (!customerName.trim()) {
      toast.error("Informe seu nome para enviar o pedido");
      return;
    }
    let phoneDigits = customerPhone.replace(/\D/g, "");
    // Remove código do país (55) se presente
    if ((phoneDigits.length === 12 || phoneDigits.length === 13) && phoneDigits.startsWith("55")) {
      phoneDigits = phoneDigits.slice(2);
    }
    const VALID_DDDS = new Set([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42,
      43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74,
      75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
    ]);
    const ddd = Number(phoneDigits.slice(0, 2));
    const isValidLen = phoneDigits.length === 10 || phoneDigits.length === 11;
    const isMobileOk = phoneDigits.length === 10 || phoneDigits[2] === "9";
    if (!isValidLen || !VALID_DDDS.has(ddd) || !isMobileOk) {
      toast.error("Informe um telefone brasileiro válido com DDD (ex: 11 91234-5678)");
      return;
    }
    if (data.requireCode && !tableCode.trim()) {
      toast.error("Peça o código da mesa ao garçom e preencha antes de enviar.");
      return;
    }
    setSubmitting(true);
    try {
      orderAttempt.current ??= crypto.randomUUID();
      const trackingToken = orderAttempt.current;
      const { data: orderId, error } = await supabase.rpc("place_order", {
        p_restaurant_id: data.restaurant.id,
        p_tracking_token: trackingToken,
        p_table_code: tableCode.trim().toLowerCase(),
        p_table_label: table ? `Mesa ${table}` : null,
        p_customer_name: customerName.trim(),
        p_customer_phone: phoneDigits,
        p_currency: data.restaurant.currency,
        p_items: cart.map((c) => ({
          menu_item_id: c.itemId,
          name_snapshot: c.name,
          price_snapshot: c.unitPrice,
          expected_unit_price: c.unitPrice,
          quantity: c.qty,
          notes: c.note || null,
          modifier_option_ids: c.modifiers.map((m) => m.id),
        })),
      });
      if (error) throw error;
      setSent(true);
      setPlacedOrder({ id: orderId as string, status: "pending", token: trackingToken });
      orderAttempt.current = null;
      setCart([]);
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      let details: { retry_after_seconds?: number } | null = null;
      try {
        details = e.details
          ? z.object({ retry_after_seconds: z.number().optional() }).parse(JSON.parse(e.details))
          : null;
      } catch {
        /* ignore */
      }
      if (e?.code) orderAttempt.current = null;
      const message = e?.message ?? "Não foi possível enviar o pedido";
      const hint = e?.hint as string | undefined;
      const retry = details?.retry_after_seconds as number | undefined;
      const description = retry ? `Tente novamente em ${retry}s.${hint ? ` ${hint}` : ""}` : hint;
      toast.error(message, description ? { description } : undefined);
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
        table_code: tableCode.trim().toLowerCase(),
        table_label: table ? `Mesa ${table}` : null,
        customer_name: customerName.trim() || null,
      });
      toast.success("Garçom a caminho", { duration: 2000 });
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
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
        <p className="mt-6 font-display text-2xl">Não foi possível carregar o cardápio</p>
        <p className="mt-2 text-sm text-muted-foreground">Confira sua conexão e o link da mesa.</p>
        <button
          onClick={() => void refetch()}
          className="mt-5 rounded-xl bg-primary px-4 py-3 text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const { restaurant, categories } = data;
  const currency = restaurant.currency;

  const colors = readRestaurantColors(restaurant);
  const appearance = data.appearance;
  const brandAccent = colors.accent;
  const readableOn = (color: string | null) => readableColor(color || colors.accent);
  const brandStyle = menuThemeStyle(colors, appearance);
  const bannerEnabled = restaurant.banner_enabled === true;
  const bannerTitle = restaurant.banner_title as string | null;
  const bannerDescription = restaurant.banner_description as string | null;
  const bannerImage = restaurant.banner_image_url as string | null;
  const bannerCta = restaurant.banner_cta_label as string | null;
  return (
    <div
      className="public-menu min-h-screen bg-background text-foreground"
      style={brandStyle}
      {...menuAppearanceAttributes(appearance)}
    >
      <ConnectionNotice />
      <MenuCover appearance={appearance} />
      <div className="menu-header relative overflow-hidden border-b border-border bg-surface">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full menu-header-glow blur-2xl"
        />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto max-w-3xl px-5 pb-8 pt-10"
        >
          <div className="menu-identity flex items-center gap-4">
            {restaurant.logo_url ? (
              <img
                src={restaurant.logo_url}
                alt={`Logo ${restaurant.name}`}
                className="menu-logo h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-[oklch(0.78_0.13_84_/_0.3)] shadow-[0_8px_24px_-12px_oklch(0.78_0.13_84_/_0.5)]"
              />
            ) : (
              <div
                className="menu-logo grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary"
                aria-label="Iniciais do restaurante"
              >
                {restaurant.name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-primary">
                {appearance.tagline}
              </p>
              <h1 className="menu-restaurant-name mt-2 font-display text-4xl tracking-tight">
                <span>{restaurant.name}</span>
              </h1>
            </div>
          </div>
          {appearance.welcome && (
            <p className="mt-4 whitespace-pre-line text-sm">{appearance.welcome}</p>
          )}
          {!data.kitchenOpen && (
            <div className="mt-4 rounded-xl border border-[oklch(0.62_0.21_25_/_0.4)] bg-[oklch(0.62_0.21_25_/_0.08)] px-4 py-3 text-sm text-[oklch(0.85_0.12_25)]">
              {data.barOpen
                ? "Cozinha encerrada. Bebidas disponíveis no horário do bar."
                : "Atendimento encerrado. Novos pedidos estão indisponíveis."}
            </div>
          )}
          {!data.barOpen && data.kitchenOpen && (
            <p className="mt-4 rounded-xl border border-border p-3 text-sm">
              Bar encerrado. A cozinha continua atendendo.
            </p>
          )}
          {table && data.requireCode && !data.serviceSetupPending && (
            <label className="mt-4 block rounded-xl border border-border bg-background/60 p-4 text-sm">
              <span className="block font-medium">Código temporário da mesa</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Peça ao garçom no salão. O código protege seus pedidos e chamados.
              </span>
              <input
                aria-label="Código da mesa"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={tableCode}
                onChange={(e) =>
                  setTableCode(e.target.value.replace(/[^a-fA-F0-9]/g, "").slice(0, 12))
                }
                placeholder="12 caracteres fornecidos no salão"
                className="mt-3 w-full rounded-lg border border-border bg-background p-3 font-mono"
              />
            </label>
          )}
          {data.viewOnly && (
            <div className="mt-4 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              {data.serviceSetupPending
                ? "Pedidos temporariamente indisponíveis enquanto o restaurante atualiza o sistema."
                : !table
                  ? "Consulte o cardápio à vontade. Para pedir, escaneie o QR Code da sua mesa no restaurante."
                  : !data.kitchenOpen && !data.barOpen
                    ? "Você pode consultar o cardápio. Novos pedidos voltam no próximo horário de atendimento."
                    : "Visualização apenas. Chame o garçom para pedir."}
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
            {table && data.orderingPlan && !data.serviceSetupPending && (
              <button
                onClick={handleCallWaiter}
                disabled={callingWaiter}
                className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.78_0.13_84_/_0.3)] bg-gold-soft px-3 py-1 text-xs text-primary transition hover:bg-[oklch(0.78_0.13_84_/_0.18)]"
              >
                {callingWaiter ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Bell className="h-3 w-3" />
                )}
                Chamar garçom
              </button>
            )}
            {table && data.orderingPlan && !data.serviceSetupPending && (
              <button
                onClick={async () => {
                  if (!data) return;
                  try {
                    await callWaiter({
                      restaurant_id: data.restaurant.id,
                      table_code: tableCode.trim().toLowerCase(),
                      table_label: `Mesa ${table}`,
                      customer_name: customerName.trim() || null,
                      kind: "bill",
                    });
                    toast.success("Conta solicitada", { duration: 2000 });
                  } catch (caught: unknown) {
                    const e = getErrorDetails(caught);
                    toast.error(e.message ?? "Erro");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <Check className="h-3 w-3" /> Pedir a conta
              </button>
            )}
          </div>

          {bannerEnabled && (bannerTitle || bannerDescription || bannerImage) && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-6 overflow-hidden rounded-2xl border border-[oklch(0.78_0.13_84_/_0.4)] shadow-[0_8px_32px_-12px_oklch(0.78_0.13_84_/_0.4)]"
              style={{ backgroundColor: brandAccent || undefined }}
            >
              <div className="flex flex-col items-stretch gap-0 sm:flex-row">
                {bannerImage && (
                  <img
                    src={bannerImage}
                    alt={bannerTitle || "Promoção"}
                    className="h-32 w-full object-cover sm:h-auto sm:w-40"
                  />
                )}
                <div
                  className="flex flex-1 flex-col justify-center gap-1 p-4"
                  style={{ color: readableOn(brandAccent) }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
                    Promoção
                  </p>
                  {bannerTitle && (
                    <h3 className="font-display text-xl tracking-tight">{bannerTitle}</h3>
                  )}
                  {bannerDescription && <p className="text-sm opacity-90">{bannerDescription}</p>}
                  {bannerCta && (
                    <button
                      type="button"
                      onClick={() =>
                        document.getElementById("menu-catalog")?.scrollIntoView({
                          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                            ? "instant"
                            : "smooth",
                          block: "start",
                        })
                      }
                      className="mt-2 inline-flex w-fit items-center rounded-full px-3 py-1.5 text-xs font-medium"
                      style={{
                        backgroundColor: readableOn(brandAccent),
                        color: brandAccent || "#0b0b0c",
                      }}
                    >
                      {bannerCta}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>

        {!isDiscovering && (
          <nav className="menu-categories sticky top-0 z-10 -mx-px overflow-x-auto border-t border-border bg-background/90 backdrop-blur">
            <div className="mx-auto flex max-w-3xl gap-1 px-3 py-2">
              {categories.map((c) => {
                const active = c.id === activeCat;
                return (
                  <button
                    key={c.id}
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      setActiveCat(c.id);
                      const section = document.getElementById(`cat-${c.id}`);
                      section?.scrollIntoView({
                        behavior: reduceMotion ? "instant" : "smooth",
                        block: "start",
                      });
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
        )}
      </div>

      <main id="menu-catalog" className="mx-auto max-w-3xl scroll-mt-20 px-5 pb-32 pt-6">
        <div className="mb-8">
          <MenuDiscovery
            query={query}
            onQuery={setQuery}
            filter={menuFilter}
            onFilter={setMenuFilter}
            sort={menuSort}
            onSort={setMenuSort}
            count={visibleItems.length}
          />
        </div>
        {data.items.length > 0 && visibleItems.length === 0 && (
          <div className="flux-panel mb-8 p-8 text-center">
            <Heart className="mx-auto mb-3 h-6 w-6 text-primary" />
            <h2 className="font-display text-xl">
              {menuFilter === "favorites"
                ? "Seus favoritos começam aqui"
                : "Nenhuma opção encontrada"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {menuFilter === "favorites"
                ? "Toque no coração de um prato para salvar neste dispositivo."
                : "Experimente outro termo ou remova os filtros."}
            </p>
            <button
              onClick={() => {
                setQuery("");
                setMenuFilter("all");
              }}
              className="flux-button mt-3 text-primary"
            >
              Ver o cardápio completo
            </button>
          </div>
        )}
        {categories.length === 0 || data.items.length === 0 ? (
          <EmptyMenu />
        ) : (
          (isDiscovering
            ? [{ id: "discovery-results", name: "Sua próxima escolha", description: null }]
            : categories
          ).map((cat) => {
            const items =
              cat.id === "discovery-results" ? visibleItems : (itemsByCat.get(cat.id) ?? []);
            if (!items.length) return null;
            return (
              <section key={cat.id} id={`cat-${cat.id}`} className="mb-10 scroll-mt-20">
                <h2 className="menu-section-title font-display text-2xl tracking-tight">
                  {cat.name}
                </h2>
                {cat.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{cat.description}</p>
                )}
                <ul data-menu-grid className="mt-4 space-y-3 stagger">
                  {items.map((it, index) => {
                    const hasMods = (data.modifiers.get(it.id)?.length ?? 0) > 0;
                    return (
                      <motion.li
                        key={it.id}
                        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.12 }}
                        transition={{
                          duration: 0.4,
                          delay: Math.min(index % 4, 3) * 0.045,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                        className="menu-card group flex gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-3 transition hover:border-primary/30"
                      >
                        <div className="menu-photo relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-background/60 sm:h-28 sm:w-28">
                          {it.image_url ? (
                            <img
                              src={it.image_url}
                              alt={it.name}
                              loading="lazy"
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                              <UtensilsCrossed className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div className="menu-card-content flex min-w-0 flex-1 flex-col">
                          <button
                            onClick={() => toggleFavorite(it.id)}
                            aria-label={`${favorites.has(it.id) ? "Remover" : "Salvar"} ${it.name} ${favorites.has(it.id) ? "dos" : "nos"} favoritos`}
                            aria-pressed={favorites.has(it.id)}
                            className="menu-favorite rounded-full p-2 text-primary"
                          >
                            <Heart
                              className="h-4 w-4"
                              fill={favorites.has(it.id) ? "currentColor" : "none"}
                            />
                          </button>
                          <div className="menu-card-heading flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <h3 className="text-sm font-semibold leading-snug">{it.name}</h3>
                              {it.is_promo && (
                                <span
                                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                                  style={{
                                    backgroundColor: brandAccent || undefined,
                                    color: readableOn(brandAccent),
                                  }}
                                >
                                  {(it.promo_label as string) || "Promo"}
                                </span>
                              )}
                            </div>
                            <div className="menu-price flex flex-col items-end">
                              {it.is_promo && it.original_price ? (
                                <span className="text-[10px] text-muted-foreground line-through">
                                  {formatPrice(Number(it.original_price), currency)}
                                </span>
                              ) : null}
                              <span className="font-display text-base tracking-tight text-primary">
                                {formatPrice(Number(it.price), currency)}
                              </span>
                            </div>
                          </div>
                          {appearance.showPortion && it.portion_description && (
                            <p className="mt-1 text-xs text-primary">{it.portion_description}</p>
                          )}
                          {appearance.showDescription && it.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {it.description}
                            </p>
                          )}
                          <div className="menu-card-actions mt-auto flex flex-wrap items-center justify-end gap-2 pt-3">
                            {it.model_3d_url && (
                              <button
                                onClick={() => setModelItem(it)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs"
                              >
                                Ver prato em 3D
                              </button>
                            )}
                            {!data.viewOnly && (
                              <button
                                onClick={() => handleAdd(it)}
                                style={menuButtonStyle(colors, appearance)}
                                className="menu-add-button inline-flex items-center justify-center gap-1 rounded-lg bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary"
                              >
                                <Plus className="h-3.5 w-3.5" />{" "}
                                {hasMods ? "Personalizar" : appearance.buttonLabel}
                              </button>
                            )}
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
            style={menuButtonStyle(colors, appearance, colors.background)}
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
              className="menu-drawer fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-hidden rounded-t-3xl border-t border-border bg-surface"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h3 className="font-display text-2xl tracking-tight">Revisar pedido</h3>
                  <button
                    disabled={submitting}
                    className="mt-2 text-xs underline underline-offset-4"
                    onClick={async () => {
                      const fresh = await refetch();
                      if (!fresh.data || fresh.error) {
                        toast.error("Não foi possível atualizar o cardápio");
                        return;
                      }
                      const unavailable = cart.some((line) => {
                        const item = fresh.data.items.find((i) => i.id === line.itemId);
                        if (!item) return true;
                        const options = (fresh.data.modifiers.get(item.id) ?? []).flatMap(
                          (g) => g.modifier_options,
                        );
                        return line.modifiers.some((m) => !options.some((o) => o.id === m.id));
                      });
                      setCart((current) =>
                        current.map((line) => {
                          const item = fresh.data.items.find((i) => i.id === line.itemId);
                          if (!item) {
                            return line;
                          }
                          const options = (fresh.data.modifiers.get(item.id) ?? []).flatMap(
                            (g) => g.modifier_options,
                          );
                          const modifiers = line.modifiers.map((m) => {
                            const next = options.find((o) => o.id === m.id);
                            if (!next) {
                              return m;
                            }
                            return { ...m, name: next.name, price_delta: Number(next.price_delta) };
                          });
                          return {
                            ...line,
                            name: item.name,
                            basePrice: Number(item.price),
                            unitPrice:
                              Number(item.price) +
                              modifiers.reduce((sum, m) => sum + m.price_delta, 0),
                            modifiers,
                          };
                        }),
                      );
                      toast.info(
                        unavailable
                          ? "Alguns itens ou adicionais não estão disponíveis. Remova-os e escolha novamente."
                          : "Valores atualizados. Revise o pedido antes de enviar.",
                      );
                    }}
                  >
                    Atualizar valores do carrinho
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Ajuste as quantidades antes de enviar para a cozinha
                  </p>
                </div>
                <button
                  onClick={() => !submitting && setOpenCart(false)}
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-background hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {sent ? (
                <OrderStatusPanel
                  status={placedOrder?.status ?? "pending"}
                  onClose={() => {
                    setSent(false);
                    setPlacedOrder(null);
                    setCustomerName("");
                    setCustomerPhone("");
                    setOpenCart(false);
                  }}
                />
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
                              <span className="w-6 text-center text-sm font-medium tabular-nums">
                                {c.qty}
                              </span>
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
                    {data.requireCode && (
                      <label className="mb-3 block text-sm">
                        Código da mesa{" "}
                        <input
                          aria-label="Código da mesa para enviar pedido"
                          autoComplete="off"
                          value={tableCode}
                          onChange={(e) =>
                            setTableCode(e.target.value.replace(/[^a-fA-F0-9]/g, "").slice(0, 12))
                          }
                          placeholder="Peça o código ao garçom"
                          className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-mono"
                        />
                      </label>
                    )}
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
                    <label className="mb-3 block">
                      <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                        Telefone (WhatsApp)
                      </span>
                      <input
                        value={customerPhone}
                        onChange={(e) =>
                          setCustomerPhone(e.target.value.replace(/[^\d\s()+-]/g, "").slice(0, 20))
                        }
                        placeholder="(11) 99999-9999"
                        inputMode="tel"
                        type="tel"
                        autoComplete="tel"
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
                      style={menuButtonStyle(colors, appearance)}
                      disabled={
                        submitting ||
                        cart.length === 0 ||
                        (data.requireCode && tableCode.length !== 12) ||
                        !customerName.trim() ||
                        customerPhone.replace(/\D/g, "").length < 10
                      }
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
        groups={pickerItem ? (data.modifiers.get(pickerItem.id) ?? []) : []}
        currency={currency}
        onClose={() => setPickerItem(null)}
        onConfirm={(selected) => {
          if (!pickerItem) return;
          addConfigured(pickerItem, selected);
          setPickerItem(null);
        }}
      />

      <MenuSignature appearance={appearance} name={restaurant.name} />
      {modelItem && (
        <Suspense
          fallback={
            <div role="status" className="fixed bottom-4 left-4 z-50 rounded-lg bg-surface p-3">
              Carregando visualização…
            </div>
          }
        >
          <DishModelDialog
            item={modelItem}
            onClose={() => setModelItem(null)}
            theme={
              {
                ...brandStyle,
                backgroundColor: colors.card,
                color: brandStyle["--menu-card-text"],
                "--foreground": brandStyle["--menu-card-text"],
                "--muted-foreground": brandStyle["--menu-card-muted"],
                "--primary": brandStyle["--menu-card-accent"],
                "--primary-foreground": brandStyle["--menu-card-primary-foreground"],
              } as React.CSSProperties
            }
          />
        </Suspense>
      )}
    </div>
  );
}

function EmptyMenu() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
        <UtensilsCrossed className="h-6 w-6 text-primary" />
      </div>
      <p className="mt-5 font-display text-2xl tracking-tight">
        O cardápio está sendo preparado 👨‍🍳
      </p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Volte em instantes para conferir nossas delícias!
      </p>
    </div>
  );
}

const STATUS_STEPS: { key: string; label: string; sub: string }[] = [
  { key: "pending", label: "Pedido Recebido", sub: "Aguardando a cozinha confirmar" },
  { key: "accepted", label: "Pedido Confirmado", sub: "Cozinha aceitou o pedido" },
  { key: "preparing", label: "Em Preparo", sub: "Seu pedido está sendo feito!" },
  { key: "ready", label: "Pronto!", sub: "A caminho da sua mesa" },
  { key: "served", label: "Entregue", sub: "Bom apetite!" },
];

function OrderStatusPanel({ status, onClose }: { status: string; onClose: () => void }) {
  const isCancelled = status === "cancelled";
  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === status);
  const current = STATUS_STEPS[currentIdx] ?? STATUS_STEPS[0];
  const isDone = status === "served";

  return (
    <div className="px-6 py-10">
      {isCancelled ? (
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive">
            <X className="h-7 w-7" />
          </div>
          <p className="mt-5 font-display text-2xl">Pedido cancelado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Procure um atendente se precisar de ajuda.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center text-center">
            <motion.div
              key={status}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{
                scale: isDone ? 1 : [1, 1.08, 1],
                opacity: 1,
              }}
              transition={
                isDone
                  ? { duration: 0.5 }
                  : {
                      scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                      opacity: { duration: 0.4 },
                    }
              }
              className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.5)]"
            >
              {!isDone && (
                <span className="absolute inset-0 animate-ping rounded-full bg-[oklch(0.78_0.13_84_/_0.35)]" />
              )}
              <Check className="relative h-8 w-8" />
            </motion.div>
            <p className="mt-5 font-display text-2xl tracking-tight">{current.label}</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">{current.sub}</p>
          </div>

          <ol className="mt-8 space-y-3">
            {STATUS_STEPS.filter((s) => s.key !== "served" || isDone).map((s, i) => {
              const active = i === currentIdx;
              const done = i < currentIdx || isDone;
              return (
                <li
                  key={s.key}
                  className={
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition " +
                    (active
                      ? "border-[oklch(0.78_0.13_84_/_0.5)] bg-gold-soft text-foreground"
                      : done
                        ? "border-border bg-background/40 text-foreground"
                        : "border-border bg-background/20 text-muted-foreground")
                  }
                >
                  <span
                    className={
                      "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold " +
                      (active
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-primary/30 text-primary"
                          : "bg-surface text-muted-foreground")
                    }
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="flex-1">{s.label}</span>
                  {active && (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}

      <button
        onClick={onClose}
        className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground transition hover:text-foreground"
      >
        Fechar
      </button>
    </div>
  );
}

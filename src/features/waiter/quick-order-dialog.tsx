import { ModifierPicker, type SelectedModifier } from "@/features/menu/modifier-picker";
import { fetchModifiersForRestaurant } from "@/features/menu/modifier-queries";
import { StaffPicker } from "@/features/staff/staff-picker";
import { supabase } from "@/integrations/supabase/client";
import { getErrorDetails } from "@/lib/errors";
import { formatPrice } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Minus, Plus, Search, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type WItem = {
  id: string;
  name: string;
  price: number;
  category_id: string;
  category_name: string;
};

type Line = {
  itemId: string;
  productId: string;
  name: string;
  price: number;
  qty: number;
  notes: string;
  modifiers: SelectedModifier[];
};

export function QuickOrderModal({
  tableId,
  tableLabel,
  restaurantId,
  currency,
  onClose,
  onDone,
  staffIdentity,
}: {
  tableId: string;
  tableLabel: string;
  restaurantId: string;
  currency: string;
  onClose: () => void;
  onDone?: () => void;
  staffIdentity?: { token: string; name: string };
}) {
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pickerItem, setPickerItem] = useState<WItem | null>(null);
  const modifiers = useQuery({
    queryKey: ["modifiers", restaurantId],
    queryFn: () => fetchModifiersForRestaurant(restaurantId),
  });

  const [pickingStaff, setPickingStaff] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["waiter-items", restaurantId],
    queryFn: async (): Promise<WItem[]> => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, price, category_id, is_available, categories(name)")
        .eq("restaurant_id", restaurantId)
        .eq("is_available", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        category_id: r.category_id,
        category_name: r.categories?.name ?? "",
      }));
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items ?? [];
    return (items ?? []).filter(
      (i) => i.name.toLowerCase().includes(term) || i.category_name.toLowerCase().includes(term),
    );
  }, [items, q]);

  function addConfigured(it: WItem, selected: SelectedModifier[] = []) {
    const key =
      it.id +
      ":" +
      selected
        .map((m) => m.id)
        .sort()
        .join(",");
    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === key);
      if (existing)
        return prev.map((l) => (l.itemId === key ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
      return [
        ...prev,
        {
          itemId: key,
          productId: it.id,
          name: it.name,
          price: it.price + selected.reduce((sum, m) => sum + m.price_delta, 0),
          qty: 1,
          notes: "",
          modifiers: selected,
        },
      ];
    });
  }
  function addItem(it: WItem) {
    if (modifiers.isPending) {
      toast.info("Carregando adicionais");
      return;
    }
    if (modifiers.isError) {
      toast.error("Não foi possível carregar adicionais");
      return;
    }
    if (modifiers.data?.get(it.id)?.length) setPickerItem(it);
    else addConfigured(it);
  }

  function setQty(id: string, qty: number) {
    if (qty <= 0) {
      setLines((p) => p.filter((l) => l.itemId !== id));
      return;
    }
    setLines((p) => p.map((l) => (l.itemId === id ? { ...l, qty } : l)));
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);

  function requestSubmit() {
    if (lines.length === 0) return;
    if (staffIdentity) void submit(staffIdentity.name);
    else setPickingStaff(true);
  }

  async function submit(createdByName: string) {
    if (lines.length === 0) return;
    setSubmitting(true);
    try {
      const items = lines.map((l) => ({
        menu_item_id: l.productId,
        quantity: l.qty,
        notes: l.notes || null,
        modifier_option_ids: l.modifiers.map((m) => m.id),
      }));
      const { error } = staffIdentity
        ? await supabase.rpc("staff_place_order", {
            p_token: staffIdentity.token,
            p_table_id: tableId,
            p_items: items,
          })
        : await supabase.rpc("owner_place_order", {
            p_restaurant_id: restaurantId,
            p_table_id: tableId,
            p_created_by_name: createdByName,
            p_items: items,
          });
      if (error) throw error;
      toast.success(`Pedido enviado · ${tableLabel}`, {
        description: `${lines.reduce((s, l) => s + l.qty, 0)} item(s) · ${formatPrice(subtotal, currency)}`,
      });
      onDone?.();
      onClose();
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      toast.error(e.message ?? "Erro ao enviar pedido");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-background sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Lançamento rápido
            </div>
            <h2 className="font-sans font-semibold text-xl tracking-tight">{tableLabel}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar item ou categoria…"
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="space-y-1.5 pb-2">
              {filtered.map((it) => {
                const ex = lines.find((l) => l.productId === it.id && l.modifiers.length === 0);
                return (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
                  >
                    <button onClick={() => addItem(it)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium">{it.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {it.category_name} · {formatPrice(it.price, currency)}
                      </div>
                    </button>
                    {ex ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setQty(ex.itemId, ex.qty - 1)}
                          className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[1.5rem] text-center text-sm font-medium">
                          {ex.qty}
                        </span>
                        <button
                          onClick={() => setQty(ex.itemId, ex.qty + 1)}
                          className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addItem(it)}
                        className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                      >
                        Adicionar
                      </button>
                    )}
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum item encontrado.
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="border-t border-border bg-surface/50 px-5 py-3">
          {lines.length > 0 && (
            <div className="mb-3 max-h-32 space-y-1.5 overflow-y-auto">
              {lines.map((l) => (
                <div key={l.itemId} className="flex items-center gap-2 text-xs">
                  <button
                    aria-label={`Diminuir quantidade de ${l.name}`}
                    onClick={() => setQty(l.itemId, l.qty - 1)}
                    className="rounded border border-border p-1"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="font-medium text-primary">{l.qty}×</span>
                  <button
                    aria-label={`Aumentar quantidade de ${l.name}`}
                    onClick={() => setQty(l.itemId, l.qty + 1)}
                    className="rounded border border-border p-1"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <span className="flex-1 truncate">{l.name}</span>
                  <input
                    value={l.notes}
                    onChange={(e) =>
                      setLines((p) =>
                        p.map((x) => (x.itemId === l.itemId ? { ...x, notes: e.target.value } : x)),
                      )
                    }
                    placeholder="obs"
                    className="w-24 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Subtotal
              </div>
              <div className="font-sans font-semibold text-xl tracking-tight">
                {formatPrice(subtotal, currency)}
              </div>
            </div>
            <button
              onClick={requestSubmit}
              disabled={lines.length === 0 || submitting}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" /> Enviar pedido
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {pickingStaff && (
          <StaffPicker
            restaurantId={restaurantId}
            title="Quem lançou esse pedido?"
            onSelect={async (name) => {
              setPickingStaff(false);
              await submit(name);
            }}
            onClose={() => setPickingStaff(false)}
          />
        )}
      </AnimatePresence>
      <ModifierPicker
        item={pickerItem}
        groups={pickerItem ? (modifiers.data?.get(pickerItem.id) ?? []) : []}
        currency={currency}
        onClose={() => setPickerItem(null)}
        onConfirm={(selected) => {
          if (pickerItem) addConfigured(pickerItem, selected);
          setPickerItem(null);
        }}
      />
    </motion.div>
  );
}

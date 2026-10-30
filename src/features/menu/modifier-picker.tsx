import { formatPrice } from "@/lib/format";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ModifierGroupWithOptions } from "./modifier-queries";
export type SelectedModifier = { id: string; group: string; name: string; price_delta: number };
export function ModifierPicker({
  item,
  groups,
  currency,
  onClose,
  onConfirm,
}: {
  item: { id: string; name: string; price: number } | null;
  groups: ModifierGroupWithOptions[];
  currency: string;
  onClose: () => void;
  onConfirm: (selected: { id: string; group: string; name: string; price_delta: number }[]) => void;
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
    if (cur.length < Math.max(g.is_required ? 1 : 0, g.min_select) || cur.length > g.max_select)
      return false;
    return true;
  });

  const delta = groups.reduce((s, g) => {
    const ids = picks[g.id] ?? [];
    return (
      s +
      g.modifier_options
        .filter((o) => ids.includes(o.id))
        .reduce((a, o) => a + Number(o.price_delta), 0)
    );
  }, 0);

  const confirm = () => {
    const selected: { id: string; group: string; name: string; price_delta: number }[] = [];
    groups.forEach((g) => {
      (picks[g.id] ?? []).forEach((id) => {
        const opt = g.modifier_options.find((o) => o.id === id);
        if (opt)
          selected.push({
            id: opt.id,
            group: g.name,
            name: opt.name,
            price_delta: Number(opt.price_delta),
          });
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
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-0 z-[80] max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h3 className="font-display text-2xl tracking-tight">{item.name}</h3>
                <p className="text-xs text-muted-foreground">Personalize antes de adicionar</p>
              </div>
              <button
                aria-label="Fechar adicionais"
                onClick={onClose}
                className="rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
              >
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
                                  (selected
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border")
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
                <Plus className="h-4 w-4" /> Adicionar ·{" "}
                {formatPrice(Number(item.price) + delta, currency)}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

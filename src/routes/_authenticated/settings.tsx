import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ChefHat, Store } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — Flux" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: restaurant, isLoading } = useRestaurant();
  const qc = useQueryClient();
  const [kitchenOpen, setKitchenOpen] = useState(true);

  useEffect(() => {
    if (restaurant) setKitchenOpen((restaurant as any).kitchen_open ?? true);
  }, [restaurant]);

  const update = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await supabase.from("restaurants").update(patch).eq("id", restaurant!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurant"] }),
  });

  async function toggleKitchen(v: boolean) {
    setKitchenOpen(v);
    try {
      await update.mutateAsync({ kitchen_open: v });
      toast.success(v ? "Cozinha aberta" : "Cozinha encerrada — apenas bebidas disponíveis");
    } catch (e: any) {
      setKitchenOpen(!v);
      toast.error(e.message ?? "Erro ao salvar");
    }
  }

  if (isLoading || !restaurant) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-primary">Configurações</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">
          Controle de <span className="text-gradient-gold italic">operação</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Defina o estado do estabelecimento em tempo real.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
              <ChefHat className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-xl tracking-tight">Cozinha</h2>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Quando fechada, itens de comida são automaticamente desabilitados no cardápio público.
                Apenas bebidas continuam disponíveis para pedido.
              </p>
              <p className="mt-3 text-sm">
                Status:{" "}
                <span className={kitchenOpen ? "font-medium text-emerald-400" : "font-medium text-[oklch(0.78_0.18_25)]"}>
                  {kitchenOpen ? "Aberta" : "Fechada"}
                </span>
              </p>
            </div>
          </div>
          <Switch checked={kitchenOpen} onCheckedChange={toggleKitchen} disabled={update.isPending} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl tracking-tight">Estabelecimento</h2>
            <p className="mt-1 text-xs text-muted-foreground">Identificação pública do seu cardápio.</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome</dt>
                <dd className="mt-1 text-sm">{restaurant.name}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Slug</dt>
                <dd className="mt-1 truncate text-sm">/m/{restaurant.slug}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Moeda</dt>
                <dd className="mt-1 text-sm">{restaurant.currency}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Fuso</dt>
                <dd className="mt-1 text-sm">{restaurant.timezone}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}

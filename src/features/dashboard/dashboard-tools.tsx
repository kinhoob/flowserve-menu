import { MascotPreference } from "@/features/assistant/mascot-preference";
import { useEffect, useState, lazy, Suspense, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useTables, type VenueTable } from "@/features/tables/table-queries";
import { useTrialStatus, canAccess } from "@/features/billing/trial-status";
import { UpgradeProModal } from "@/features/billing/upgrade-modal";
const QuickOrderModal = lazy(() =>
  import("@/features/waiter/quick-order-dialog").then((m) => ({ default: m.QuickOrderModal })),
);
import { DashboardToolsContext } from "./use-dashboard-tools";
import { Link } from "@tanstack/react-router";
import { publicMenuUrl } from "@/lib/public-menu-url";

export function DashboardTools({ children }: { children: ReactNode }) {
  const { data: restaurant } = useRestaurant();
  const tables = useTables(restaurant?.id);
  const { data: trial } = useTrialStatus();
  const [selecting, setSelecting] = useState(false),
    [help, setHelp] = useState(false),
    [locked, setLocked] = useState(false);
  const [table, setTable] = useState<VenueTable | null>(null);
  const newOrder = () => {
    if (!trial || !canAccess(trial, "waiter")) {
      setLocked(true);
      return;
    }
    setSelecting(true);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]') ||
        document.querySelector('[role="dialog"],[role="alertdialog"]')
      )
        return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      }
      if (e.key === "/") {
        const input = document.querySelector<HTMLInputElement>(
          'main input[type="search"],main input[data-dashboard-search],main input[placeholder*="Buscar"]',
        );
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return (
    <DashboardToolsContext.Provider value={{ newOrder, shortcuts: () => setHelp(true) }}>
      {children}
      <Dialog open={selecting} onOpenChange={setSelecting}>
        <DialogContent className="border-border bg-surface">
          <DialogHeader>
            <DialogTitle>Novo pedido</DialogTitle>
            <DialogDescription>
              Escolha a mesa para lançar os itens. Nenhum pedido é enviado nesta etapa.
            </DialogDescription>
          </DialogHeader>
          {tables.isPending ? (
            <p role="status">Carregando mesas…</p>
          ) : tables.isError ? (
            <p role="alert">
              Não foi possível carregar as mesas.{" "}
              <button className="underline" onClick={() => void tables.refetch()}>
                Tentar novamente
              </button>
            </p>
          ) : !tables.data?.length ? (
            <p>
              Cadastre uma mesa em{" "}
              <Link
                to="/tables"
                onClick={() => setSelecting(false)}
                className="text-primary underline"
              >
                Gerenciar mesas
              </Link>{" "}
              para começar.
            </p>
          ) : (
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
              {tables.data.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTable(t);
                    setSelecting(false);
                  }}
                  className="min-h-14 rounded-xl border border-border p-3 text-sm hover:border-primary"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {table && restaurant && (
        <Suspense
          fallback={
            <p role="status" className="fixed bottom-24 left-4 z-50 rounded-xl bg-surface p-4">
              Preparando novo pedido…
            </p>
          }
        >
          <QuickOrderModal
            tableId={table.id}
            tableLabel={table.label}
            restaurantId={restaurant.id}
            currency={restaurant.currency}
            onClose={() => setTable(null)}
            onDone={() => setTable(null)}
          />
        </Suspense>
      )}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="border-border bg-surface">
          <DialogHeader>
            <DialogTitle>Atalhos e preferências</DialogTitle>
            <DialogDescription>
              Navegue mais rápido. Atalhos de uma tecla não são ativados enquanto você digita ou
              está em uma janela.
            </DialogDescription>
          </DialogHeader>
          <MascotPreference />
          <dl className="space-y-4 text-sm">
            {[
              ["Ctrl / ⌘ + K", "Buscar páginas, mesas e ações"],
              ["/", "Focar a busca disponível na tela"],
              ["?", "Abrir esta ajuda"],
              ["Esc", "Fechar a janela atual"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <dt>{label}</dt>
                <dd>
                  <kbd className="rounded border border-border bg-background px-2 py-1 text-xs">
                    {key}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
      <UpgradeProModal
        open={locked}
        featureLabel="Lançamento de pedidos pela equipe"
        onClose={() => setLocked(false)}
      />
    </DashboardToolsContext.Provider>
  );
}
export function MenuPreviewLink({ className = "" }: { className?: string }) {
  const { data: restaurant } = useRestaurant();
  return restaurant ? (
    <a href={publicMenuUrl(restaurant.slug)} target="_blank" rel="noreferrer" className={className}>
      Ver cardápio <span className="sr-only">(abre em outra aba)</span>
    </a>
  ) : null;
}

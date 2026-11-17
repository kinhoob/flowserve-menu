import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { BellMascot } from "@/components/brand/bell-mascot";
import { X, ArrowRight, MonitorPlay, Keyboard } from "lucide-react";
import { useDashboardTools } from "@/features/dashboard/use-dashboard-tools";
const TIPS: Record<string, string[]> = {
  "/dashboard": [
    "Veja o que precisa de atenção nos cards de novos pedidos, prontos e chamados.",
    "Use Novo pedido para escolher uma mesa e começar o lançamento.",
    "Ctrl + K abre páginas, ações e mesas. No celular, toque na lupa.",
  ],
  "/menu": [
    "Crie as categorias antes de adicionar pratos e bebidas.",
    "Marque um produto como indisponível quando acabar, sem precisar apagá-lo.",
    "Use a busca para encontrar itens. A tecla / foca a busca desta tela.",
  ],
  "/tables": [
    "Confira a ocupação e abra o histórico de cada mesa.",
    "A busca no topo também encontra mesas pelo nome.",
  ],
  "/kitchen": [
    "Filtre Cozinha ou Bar para concentrar a fila da equipe.",
    "Ative o som neste aparelho para ouvir a chegada de pedidos.",
    "Confira os adicionais e observações antes de avançar o preparo.",
  ],
  "/qrcodes": [
    "Confira o domínio público antes de imprimir seus QR Codes.",
    "Entregue o código temporário ao cliente no salão. Não imprima esse código junto ao QR.",
  ],
  "/settings": [
    "Personalize a identidade do restaurante e confira a prévia antes de salvar.",
    "Configure os horários da cozinha e do bar para controlar novos pedidos.",
  ],
  "/analytics": [
    "Compare períodos para entender o movimento do restaurante.",
    "Receita de pedidos não comprova recebimento do pagamento.",
  ],
  "/waiter": [
    "Abra uma mesa para consultar pedidos e acompanhar a conta.",
    "Confira os valores antes de finalizar o atendimento.",
  ],
};
export function FloatingAssistant({ hidden = false }: { hidden?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tools = useDashboardTools();
  const [open, setOpen] = useState(false),
    [pinned, setPinned] = useState(false),
    [tip, setTip] = useState(0),
    [visible, setVisible] = useState(true);
  const box = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tips = TIPS[pathname] ?? [
    "Posso ajudar você a conhecer o Flux. Abra o tutorial para acompanhar cada tela.",
  ];
  const close = () => {
    setOpen(false);
    setPinned(false);
  };
  useEffect(() => {
    clearTimeout(timer.current);
    setOpen(false);
    setPinned(false);
    setTip(0);
  }, [pathname, hidden]);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    changed();
    document.addEventListener("visibilitychange", changed);
    return () => {
      document.removeEventListener("visibilitychange", changed);
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        setPinned(false);
        if (box.current?.contains(document.activeElement)) trigger.current?.focus();
      }
    };
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  if (hidden) return null;
  return (
    <div
      ref={box}
      className="flux-assistant fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-[35] md:bottom-6 md:right-6"
      onPointerEnter={(e) => {
        clearTimeout(timer.current);
        if (e.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && !pinned && !box.current?.contains(document.activeElement))
          timer.current = setTimeout(() => setOpen(false), 220);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node) && !pinned) setOpen(false);
      }}
    >
      {open && (
        <aside
          id="flux-assistant-tips"
          role="dialog"
          aria-label="Dicas da campainha Flux"
          className="assistant-bubble absolute bottom-[76px] right-0 max-h-[min(60dvh,420px)] w-[min(320px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-primary/30 bg-surface p-4 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-primary">Uma dica para o seu fluxo</span>
            <button
              aria-label="Fechar dicas"
              onClick={() => {
                close();
                trigger.current?.focus();
              }}
              className="rounded-lg p-2 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 min-h-16 text-sm leading-6 text-foreground">
            {tips[tip % tips.length]}
          </p>
          <button
            onClick={() => setTip((n) => n + 1)}
            className="mt-2 flex min-h-10 items-center gap-2 text-xs text-primary"
          >
            Outra dica <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <div className="mt-3 grid gap-2 border-t border-border pt-3">
            <button
              onClick={() => {
                close();
                window.dispatchEvent(new Event("flux:start-tour"));
              }}
              className="flex min-h-10 items-center gap-2 rounded-lg bg-primary/10 px-3 text-xs"
            >
              <MonitorPlay className="h-4 w-4 text-primary" />
              Abrir tutorial guiado
            </button>
            <button
              onClick={() => {
                close();
                tools.shortcuts();
              }}
              className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground"
            >
              <Keyboard className="h-4 w-4" />
              Atalhos do teclado
            </button>
          </div>
        </aside>
      )}
      <button
        ref={trigger}
        aria-label="Campainha Flux: abrir dicas e tutorial"
        aria-expanded={open}
        aria-controls={open ? "flux-assistant-tips" : undefined}
        aria-haspopup="dialog"
        onClick={(e) => {
          if (pinned) {
            close();
          } else {
            clearTimeout(timer.current);
            setPinned(true);
            setOpen(true);
            if (e.detail === 0)
              requestAnimationFrame(() =>
                box.current?.querySelector<HTMLButtonElement>("aside button")?.focus(),
              );
          }
        }}
        className="assistant-orb flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-[#171717]/90 shadow-lg outline-offset-4 transition-[background-color,border-color,opacity] hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <BellMascot animated={visible} className="h-12 w-12" />
      </button>
    </div>
  );
}

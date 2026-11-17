import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { BellMascot } from "@/components/brand/bell-mascot";
import { X, ArrowRight, MonitorPlay, Keyboard, EyeOff, Move } from "lucide-react";
import { useDashboardTools } from "@/features/dashboard/use-dashboard-tools";
import { useMascotPreferences } from "./use-mascot-preferences";
import { clampMascot, bubblePlacement, type Point, type Viewport } from "./assistant-position";
import { toast } from "sonner";
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
  const preferences = useMascotPreferences();
  const [open, setOpen] = useState(false),
    [pinned, setPinned] = useState(false),
    [tip, setTip] = useState(0),
    [visible, setVisible] = useState(true);
  const [view, setView] = useState<(Viewport & { offsetX: number; offsetY: number }) | null>(null),
    [point, setPoint] = useState<Point>({ x: 0, y: 0 }),
    [moving, setMoving] = useState(false);
  const box = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<{ id: number; startX: number; startY: number; origin: Point } | null>(null),
    moved = useRef(false),
    latest = useRef(point),
    frame = useRef<number | undefined>(undefined);
  const close = () => {
    setOpen(false);
    setPinned(false);
  };
  const tips = TIPS[pathname] ?? [
    "Posso te acompanhar pelo Flux. Abra o tutorial e vamos conhecer cada tela juntos.",
  ];
  useEffect(() => {
    clearTimeout(timer.current);
    setOpen(false);
    setPinned(false);
    setTip(0);
    drag.current = null;
    setMoving(false);
  }, [pathname, hidden, preferences.enabled]);
  useEffect(() => {
    const resize = () => {
      const viewport = window.visualViewport;
      const next = {
        width: viewport?.width ?? innerWidth,
        height: viewport?.height ?? innerHeight,
        offsetX: viewport?.offsetLeft ?? 0,
        offsetY: viewport?.offsetTop ?? 0,
      };
      setView(next);
      setPoint((p) => {
        const nextPoint = clampMascot(p, next);
        latest.current = nextPoint;
        return nextPoint;
      });
    };
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
    };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const v = { width: viewport?.width ?? innerWidth, height: viewport?.height ?? innerHeight };
    const next = clampMascot(
      preferences.position ?? { x: v.width - 80, y: v.height - (v.width < 768 ? 160 : 88) },
      v,
    );
    latest.current = next;
    setPoint(next);
  }, [preferences.position]);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    changed();
    document.addEventListener("visibilitychange", changed);
    return () => {
      document.removeEventListener("visibilitychange", changed);
      clearTimeout(timer.current);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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
  function finish(e: ReactPointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    setMoving(false);
    setPoint(latest.current);
    if (moved.current) preferences.update({ position: latest.current });
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  if (hidden || !preferences.enabled || !view) return null;
  const pos = clampMascot(point, view),
    bubble = bubblePlacement(pos, view);
  return (
    <div
      ref={box}
      style={{
        left: 0,
        top: 0,
        transform:
          "translate3d(" + (pos.x + view.offsetX) + "px," + (pos.y + view.offsetY) + "px,0)",
      }}
      className="flux-assistant fixed z-[35] h-16 w-16"
      onPointerEnter={(e) => {
        clearTimeout(timer.current);
        if (e.pointerType === "mouse" && !drag.current) setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && !pinned && !box.current?.contains(document.activeElement))
          timer.current = setTimeout(() => setOpen(false), 220);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node) && !pinned) setOpen(false);
      }}
    >
      {open && !moving && (
        <aside
          id="flux-assistant-tips"
          role="dialog"
          aria-label="Conversa com a campainha Flux"
          style={{
            left: bubble.left,
            width: bubble.width,
            ...(bubble.top ? { top: 76 } : { bottom: 76 }),
          }}
          className="assistant-chat absolute rounded-2xl border border-primary/30 bg-surface shadow-xl"
        >
          <span
            aria-hidden
            className="assistant-chat-tail absolute h-3 w-3 rotate-45 border-primary/30 bg-surface"
            style={{
              left: bubble.tail - 6,
              ...(bubble.top
                ? { top: -7, borderLeftWidth: 1, borderTopWidth: 1 }
                : { bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 }),
            }}
          />
          <div
            className="relative overflow-y-auto rounded-2xl p-4"
            style={{ maxHeight: bubble.maxHeight }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-primary">Campainha do Flux</span>
              <button
                aria-label="Fechar conversa"
                onClick={() => {
                  close();
                  trigger.current?.focus();
                }}
                className="rounded-lg p-2 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p
              key={pathname + tip}
              aria-live={pinned ? "polite" : "off"}
              className="assistant-bubble mt-2 text-sm leading-6"
            >
              {tips[tip % tips.length]}
            </p>
            <button
              onClick={() => setTip((n) => n + 1)}
              className="mt-3 flex min-h-10 items-center gap-2 text-xs text-primary"
            >
              Me conte outra dica <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <div className="mt-3 grid gap-1 border-t border-border pt-3">
              <button
                onClick={() => {
                  close();
                  window.dispatchEvent(new Event("flux:start-tour"));
                }}
                className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs"
              >
                <MonitorPlay className="h-4 w-4 text-primary" />
                Me mostre o tutorial
              </button>
              <button
                onClick={() => {
                  close();
                  tools.shortcuts();
                }}
                className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground"
              >
                <Keyboard className="h-4 w-4" />
                Atalhos e preferências
              </button>
              <button
                onClick={() => {
                  preferences.update({ enabled: false });
                  close();
                  toast(
                    "Campainha ocultada. Reative em Configurações → Operação ou pela busca Ctrl + K.",
                  );
                }}
                className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground"
              >
                <EyeOff className="h-4 w-4" />
                Ocultar campainha
              </button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Move className="h-3 w-3" />
              Arraste para mudar de lugar.
            </p>
          </div>
        </aside>
      )}
      <button
        ref={trigger}
        aria-label="Campainha Flux: abrir dicas e tutorial"
        aria-description="Arraste para reposicionar. Pelo teclado, use Shift e as setas."
        aria-expanded={open}
        aria-controls={open ? "flux-assistant-tips" : undefined}
        aria-haspopup="dialog"
        style={{ touchAction: "none" }}
        className="flex h-16 w-16 select-none items-center justify-center rounded-lg bg-transparent outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
        onPointerDown={(e) => {
          if (!e.isPrimary || e.button !== 0) return;
          clearTimeout(timer.current);
          moved.current = false;
          drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, origin: pos };
          latest.current = pos;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start || start.id !== e.pointerId) return;
          const dx = e.clientX - start.startX,
            dy = e.clientY - start.startY;
          if (!moved.current && Math.hypot(dx, dy) < 6) return;
          moved.current = true;
          setMoving(true);
          close();
          latest.current = clampMascot({ x: start.origin.x + dx, y: start.origin.y + dy }, view);
          if (!frame.current)
            frame.current = requestAnimationFrame(() => {
              setPoint(latest.current);
              frame.current = undefined;
            });
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={(e) => {
          if (!e.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
            return;
          e.preventDefault();
          close();
          const next = clampMascot(
            {
              x: pos.x + (e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0),
              y: pos.y + (e.key === "ArrowUp" ? -16 : e.key === "ArrowDown" ? 16 : 0),
            },
            view,
          );
          setPoint(next);
          latest.current = next;
          preferences.update({ position: next });
        }}
        onClick={(e) => {
          if (moved.current) {
            moved.current = false;
            return;
          }
          if (pinned) close();
          else {
            clearTimeout(timer.current);
            setPinned(true);
            setOpen(true);
            if (e.detail === 0)
              requestAnimationFrame(() =>
                box.current?.querySelector<HTMLButtonElement>("aside button")?.focus(),
              );
          }
        }}
      >
        <BellMascot animated={visible && !moving} className="pointer-events-none h-16 w-16" />
      </button>
    </div>
  );
}

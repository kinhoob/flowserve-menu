import { BellMascot } from "@/components/brand/bell-mascot";
import { useAuth } from "@/features/auth/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, MonitorPlay, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
const STEPS = [
  {
    to: "/dashboard",
    title: "Conheça sua central",
    body: "Esta é a tela real da sua operação. Veja os pedidos recentes e os indicadores.",
    actions: [
      "Use o menu lateral para trocar de área. No celular, use a barra inferior ou toque em Mais.",
      "O sino reúne chamados e resumos do fechamento.",
      "Este tutorial navega pelas telas sem cadastrar ou alterar seus dados.",
    ],
    result: "Vamos preparar o restaurante, o salão e o atendimento, nessa ordem.",
  },
  {
    to: "/settings",
    tab: "establishment",
    title: "Dê um nome ao restaurante",
    body: "Em Estabelecimento você define como o cliente encontra sua marca.",
    actions: [
      "Preencha nome e descrição. Confira a moeda e ajuste o fuso horário.",
      "Escolha o endereço público pelo nome do restaurante.",
      "Envie sua logo e salve as alterações.",
    ],
    result:
      "Exemplo: /m/bar-da-praca. Endereços antigos continuam funcionando após a atualização SQL.",
  },
  {
    to: "/settings",
    tab: "appearance",
    title: "Um cardápio com a sua cara",
    body: "A prévia mostra o resultado enquanto você personaliza.",
    actions: [
      "Comece por uma paleta ou escolha suas próprias cores.",
      "Ajuste capa, tipografia, formato dos produtos e mensagens.",
      "Confira a prévia para celular e toque em Salvar para publicar.",
    ],
    result: "Dica: contraste alto entre texto e fundo ajuda o cliente a ler no salão.",
  },
  {
    to: "/menu",
    title: "Monte o cardápio",
    body: "Organize categorias, produtos, complementos e promoções nesta tela.",
    actions: [
      "Crie categorias do tipo Cozinha ou Bar: isso determina o horário de cada produto.",
      "Adicione foto, preço e disponibilidade. Configure adicionais quando necessário.",
      "Agende promoções ou importe um catálogo em CSV. Revise antes de confirmar.",
    ],
    result:
      "O preço é conferido no banco ao enviar o pedido. Alterações não mudam pedidos já feitos.",
  },
  {
    to: "/settings",
    tab: "operation",
    target: "service-hours",
    title: "Defina quando receber pedidos",
    body: "Cozinha e bar têm agendas independentes, no fuso do restaurante.",
    actions: [
      "Ative a agenda semanal e marque os dias de funcionamento.",
      "Defina abertura e fechamento de cada setor e salve.",
      "Use as pausas manuais para interromper um setor antes do horário.",
    ],
    result: "Exemplo: cozinha fecha às 23h e bar à 01h. Após 23h, só bebidas podem ser pedidas.",
  },
  {
    to: "/qrcodes",
    title: "Prepare mesas e QR Codes",
    body: "Cada mesa tem seu próprio link. Confira o endereço público antes de imprimir.",
    actions: [
      "Cadastre as mesas e confira seus nomes.",
      "Baixe os cartões em PNG ou PDF e coloque-os nas mesas.",
      "Consulte Mostrar código e entregue o código temporário ao cliente no salão. Não o imprima junto ao QR.",
    ],
    result:
      "O código expira em 2 horas e pode ser trocado. Uma foto antiga do QR, sozinha, não autoriza pedidos.",
  },
  {
    to: "/kitchen",
    title: "Da fila ao preparo",
    body: "Pedidos enviados pelo cliente chegam aqui para a equipe.",
    actions: [
      "Filtre Cozinha ou Bar e ative o som no aparelho de atendimento.",
      "Avance para Em preparo e depois Pronto conforme o pedido andar.",
      "Confira observações e adicionais. Ao cancelar, informe o motivo.",
    ],
    result: "O fechamento impede novos pedidos; a equipe continua concluindo os que já chegaram.",
  },
  {
    to: "/waiter",
    title: "Atenda o salão e encerre a conta",
    body: "Acompanhe mesas ocupadas, chamados e solicitações de conta.",
    actions: [
      "Abra a mesa para registrar pedidos ou consultar a conta.",
      "Atenda os chamados e marque os pedidos como entregues.",
      "Confira os valores e finalize a conta. O código anterior expira ao encerrar a última conta da mesa.",
    ],
    result:
      "Para o próximo cliente, consulte um novo código. Cadastre o PIN da equipe em Configurações → Equipe.",
  },
  {
    to: "/analytics",
    title: "Entenda os resultados",
    body: "Veja o movimento, os produtos mais vendidos e os tempos de preparo.",
    actions: [
      "Escolha o período e confira receita e ticket médio.",
      "Use horários de pico e ranking para planejar compras e equipe.",
      "Exporte os resultados. No sino, consulte o resumo de cada fechamento.",
    ],
    result:
      "Receita de pedidos não confirma pagamento. Cancelados ficam fora dos totais de vendas.",
  },
  {
    to: "/dashboard",
    target: "notification-bell",
    title: "Seu fechamento no sino",
    body: "No horário de fechamento do bar, o Flux cria um aviso com o resumo do turno.",
    actions: [
      "Toque no sino no topo para abrir os avisos.",
      "Abra Bar encerrado para consultar receita, pedidos em aberto e cancelados.",
      "O turno respeita a meia-noite. Avisos ficam salvos se você estiver desconectado.",
    ],
    result:
      "Teste completo: escaneie o QR, solicite o código da mesa e acompanhe um pedido até encerrar a conta.",
  },
] as const;
export function AdminTour({ onActiveChange }: { onActiveChange?: (active: boolean) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);
  useEffect(() => {
    onActiveChange?.(active);
    return () => onActiveChange?.(false);
  }, [active, onActiveChange]);
  const [step, setStep] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    setMinimized(false);
  }, [step, active]);
  const current = STEPS[step];
  const key = `flux-admin-tour-v3:${user?.id}`;
  useEffect(() => {
    const start = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener("flux:start-tour", start);
    return () => window.removeEventListener("flux:start-tour", start);
  }, []);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      /* Manual replay remains available. */
    }
    void supabase
      .from("profiles")
      .select("has_seen_onboarding")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (alive && !error && !data?.has_seen_onboarding)
          timer = setTimeout(() => {
            setStep(0);
            setActive(true);
          }, 700);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [user, key]);
  useEffect(() => {
    if (active)
      void navigate({ to: current.to, search: "tab" in current ? { tab: current.tab } : {} });
  }, [active, current, navigate]);
  useEffect(() => {
    if (!active) return;
    const target = "target" in current ? current.target : null;
    const timer = setTimeout(() => {
      if (target)
        document
          .getElementById(target)
          ?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "instant" });
    }, 400);
    return () => clearTimeout(timer);
  }, [active, current, pathname, reduced]);
  function close() {
    setActive(false);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* Storage is optional. */
    }
    if (user)
      void supabase.from("profiles").update({ has_seen_onboarding: true }).eq("id", user.id);
  }
  useEffect(() => {
    if (!active) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [active]);
  if (!active) return null;
  return (
    <motion.section
      role="region"
      aria-label="Tutorial guiado do Flux"
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-40 flex max-h-[52dvh] w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-primary/40 bg-surface p-4 shadow-2xl md:bottom-6 md:right-6 md:max-h-[65dvh] md:w-[390px]"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
          <MonitorPlay className="h-4 w-4" />
          Tutorial · {step + 1}/{STEPS.length}
        </span>
        <button
          onClick={() => setMinimized((v) => !v)}
          className="ml-auto mr-2 text-xs text-muted-foreground"
        >
          {minimized ? "Expandir" : "Ver tela"}
        </button>
        <button aria-label="Fechar tutorial" onClick={close} className="rounded-lg p-2">
          <X className="h-4 w-4" />
        </button>
      </div>
      {!minimized && (
        <>
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="my-3 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
            <h2 aria-live="polite" className="font-display text-xl">
              {current.title}
            </h2>
            <div className="mt-3 flex items-center gap-3">
              <BellMascot className="h-16 w-16 shrink-0" />
              <div
                key={current.title}
                className="assistant-bubble assistant-tour-speech relative rounded-2xl rounded-bl-sm border border-primary/20 bg-primary/5 p-3"
              >
                <p className="text-sm leading-6 text-muted-foreground">{current.body}</p>
              </div>
            </div>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              {current.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
            <p className="mt-4 rounded-xl bg-gold-soft p-3 text-xs leading-relaxed">
              {current.result}
            </p>
            <label className="mt-4 block text-xs text-muted-foreground">
              Ir para uma etapa
              <select
                aria-label="Etapa do tutorial"
                value={step}
                onChange={(e) => setStep(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
              >
                {STEPS.map((s, i) => (
                  <option key={s.title} value={i}>
                    {i + 1}. {s.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-border pt-3">
            <button
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1 text-sm disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              onClick={() => (step === STEPS.length - 1 ? close() : setStep((s) => s + 1))}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground"
            >
              {step === STEPS.length - 1 ? "Concluir" : "Próximo"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </motion.section>
  );
}

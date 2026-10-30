import { useAuth } from "@/features/auth/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "flux-admin-tour-v2";

type Step = {
  selector: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    selector: "#nav-settings",
    title: "1. Personalize seu restaurante",
    body: "Em Configurações > Estabelecimento, defina o nome, slug público e moeda. Já criamos um workspace pra você começar.",
  },
  {
    selector: "#nav-menu",
    title: "2. Cadastre categorias e produtos",
    body: "Crie categorias (Cozinha ou Bar) e adicione itens com preço, foto e modificadores. Tudo aparece em tempo real no QR do cliente.",
  },
  {
    selector: "#nav-qrcodes",
    title: "3. Gere o QR Code das mesas",
    body: "Cadastre as mesas do seu salão e baixe o PDF dos QR Codes para imprimir e colar.",
  },
  {
    selector: "#nav-kitchen",
    title: "4. Acompanhe os pedidos",
    body: "Aqui chegam os pedidos em tempo real, com status de preparo. O Garçom complementa a operação no salão.",
  },
  {
    selector: "#nav-analytics",
    title: "5. Análises e horários de pico",
    body: "Veja receita por dia, itens mais vendidos e horários mais movimentados para tomar decisões melhores.",
  },
];

export function AdminTour() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [checked, setChecked] = useState(false);

  // First-login auto-start (once per user)
  useEffect(() => {
    if (!user) {
      setChecked(true);
      return;
    }
    if (localStorage.getItem(STORAGE_KEY)) {
      setChecked(true);
      return;
    }
    supabase
      .from("profiles")
      .select("has_seen_onboarding")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setChecked(true);
          return;
        }
        if (data?.has_seen_onboarding) {
          localStorage.setItem(STORAGE_KEY, "1");
        } else {
          setTimeout(() => {
            setStep(0);
            setActive(true);
          }, 700);
        }
        setChecked(true);
      });
  }, [user]);

  // Manual launch from Settings
  useEffect(() => {
    const handler = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener("flux:start-tour", handler);
    return () => window.removeEventListener("flux:start-tour", handler);
  }, []);

  useEffect(() => {
    if (!active) return;
    const update = () => {
      const el = document.querySelector(STEPS[step].selector);
      if (el) setRect((el as HTMLElement).getBoundingClientRect());
      else setRect(null);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step]);

  async function persistSeen() {
    if (user) {
      await supabase.from("profiles").update({ has_seen_onboarding: true }).eq("id", user.id);
    }
    localStorage.setItem(STORAGE_KEY, "1");
  }

  function close() {
    persistSeen();
    setActive(false);
  }

  function next() {
    if (step >= STEPS.length - 1) close();
    else setStep((s) => s + 1);
  }

  if (!active || !checked) return null;
  const current = STEPS[step];

  const tooltipStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: Math.max(12, rect.top - 8),
        left: rect.right + 16,
        zIndex: 100,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 100,
      };

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-[2px]"
        onClick={next}
      />
      {rect && (
        <motion.div
          key={"highlight-" + step}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed z-[95] rounded-xl ring-2 ring-[oklch(0.78_0.13_84)] shadow-[0_0_0_8px_oklch(0.78_0.13_84_/_0.18)]"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      <motion.div
        key={"tip-" + step}
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        style={tooltipStyle}
        className="w-80 max-w-[calc(100vw-32px)] rounded-2xl border border-[oklch(0.78_0.13_84_/_0.4)] bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Tour · {step + 1}/{STEPS.length}
          </div>
          <button
            onClick={close}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="mt-2 font-display text-xl tracking-tight">{current.title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{current.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={close} className="text-xs text-muted-foreground hover:text-foreground">
            Pular
          </button>
          <button
            onClick={next}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
          >
            {step >= STEPS.length - 1 ? "Concluir" : "Próximo"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

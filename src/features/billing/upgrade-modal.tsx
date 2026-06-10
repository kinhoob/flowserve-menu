import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Sparkles, X } from "lucide-react";

export function UpgradeProModal({
  open,
  featureLabel,
  onClose,
}: {
  open: boolean;
  featureLabel?: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-background p-8 text-center shadow-[0_40px_80px_-30px_oklch(0_0_0_/_0.7)]"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-1 rounded-[2rem] bg-[conic-gradient(from_180deg_at_50%_50%,oklch(0.78_0.13_84_/_0.25),transparent,oklch(0.78_0.13_84_/_0.25))] opacity-60 blur-2xl"
            />
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 rounded-lg p-2 text-muted-foreground transition hover:bg-surface hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.4)]">
                <Lock className="h-7 w-7 text-primary" />
              </div>
              <h2 className="mt-6 font-display text-2xl tracking-tight">
                Recurso Exclusivo do <span className="text-gradient-gold italic">Plano Pro</span>
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
                {featureLabel ? (
                  <>
                    <strong className="font-medium text-foreground">{featureLabel}</strong> não está
                    incluído no seu plano atual. Faça upgrade para o Pro e libere todo o potencial do Flux.
                  </>
                ) : (
                  <>Este recurso não está incluído no seu plano atual. Faça upgrade para o Pro e libere todo o potencial do Flux.</>
                )}
              </p>
              <button
                onClick={() => {
                  onClose();
                  navigate({ to: "/settings", search: { tab: "billing" } });
                }}
                className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-[0_18px_40px_-15px_oklch(0.78_0.13_84_/_0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_25px_60px_-18px_oklch(0.78_0.13_84_/_0.75)]"
              >
                <Sparkles className="h-4 w-4" />
                Fazer Upgrade Agora
              </button>
              <button
                onClick={onClose}
                className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Continuar no meu plano
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

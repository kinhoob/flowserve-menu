import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { UserCircle2, Users, X } from "lucide-react";
import { useStaff, type StaffMember } from "./staff-queries";

export function StaffPicker({
  restaurantId,
  title = "Quem está atendendo?",
  onSelect,
  onClose,
}: {
  restaurantId: string;
  title?: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const { data: staff = [], isLoading } = useStaff(restaurantId);
  const active = (staff as StaffMember[]).filter((s) => s.active);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-background sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Equipe</div>
            <h2 className="font-display text-lg tracking-tight">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : active.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
                <Users className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">Nenhum garçom cadastrado</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Adicione a equipe em Configurações &gt; Gerenciar Equipe para registrar quem
                realizou cada ação.
              </p>
              <Link
                to="/settings"
                onClick={onClose}
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Ir para Configurações
              </Link>
              <button
                onClick={() => onSelect("Equipe")}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              >
                Continuar sem identificar
              </button>
            </div>
          ) : (
            <ul className="grid gap-1.5">
              {active.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => onSelect(s.name)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3 text-left transition hover:border-[oklch(0.78_0.13_84_/_0.4)]"
                  >
                    <UserCircle2 className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { canAccess, type TrialInfo } from "@/features/billing/trial-status";
import { normalizeSearch } from "@/features/menu/discovery";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { ArrowUpRight, Command as CommandIcon, Lock, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { NAV } from "./navigation";
export function CommandPalette({
  trial,
  onLocked,
}: {
  trial: TrialInfo | null | undefined;
  onLocked: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Buscar páginas e ações"
        aria-haspopup="dialog"
        className="flex min-h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground md:w-full md:max-w-sm md:justify-start md:gap-3 md:px-3.5"
      >
        <Search aria-hidden className="h-4 w-4" />
        <span className="hidden text-xs md:inline">Buscar páginas e ações…</span>
        <kbd className="ml-auto hidden items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] md:inline-flex">
          <CommandIcon className="h-2.5 w-2.5" /> / Ctrl K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden border-border bg-surface p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Navegação rápida</DialogTitle>
          <DialogDescription className="sr-only">
            Busque uma página. Use as setas para selecionar e Enter para abrir.
          </DialogDescription>
          <Command
            label="Páginas do Flux Menu"
            filter={(value, query) =>
              normalizeSearch(value).includes(normalizeSearch(query)) ? 1 : 0
            }
          >
            <div className="flex items-center gap-3 border-b border-border px-4 pr-12">
              <Search className="h-4 w-4 shrink-0 text-primary" />
              <Command.Input
                autoFocus
                placeholder="Para onde vamos?"
                className="h-16 w-full bg-transparent text-sm outline-none"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhuma página encontrada. Tente “mesas” ou “cardápio”.
              </Command.Empty>
              <Command.Group
                heading="Seu estabelecimento"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {NAV.map(({ to, label, icon: Icon, feature }) => {
                  const locked = !!feature && !!trial && !canAccess(trial, feature);
                  return (
                    <Command.Item
                      key={to}
                      value={label}
                      onSelect={() => {
                        setOpen(false);
                        if (locked) onLocked(label);
                        else void navigate({ to });
                      }}
                      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground outline-none data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                      {locked ? (
                        <Lock className="ml-auto h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-50" />
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            </Command.List>
            <div className="flex justify-between border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
              <span>↑ ↓ navegar · Enter abrir</span>
              <span>Esc fechar</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { Switch } from "@/components/ui/switch";
import {
  useCreateStaff,
  useDeleteStaff,
  useStaff,
  useUpdateStaff,
  type StaffMember,
} from "@/features/staff/staff-queries";
import { getErrorDetails } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

export function TeamSection({ restaurantId, slug }: { restaurantId: string; slug: string }) {
  const { data: staff = [], isLoading } = useStaff(restaurantId);
  const create = useCreateStaff(restaurantId);
  const update = useUpdateStaff(restaurantId);
  const remove = useDeleteStaff(restaurantId);
  const [newName, setNewName] = useState("");
  const [showQr, setShowQr] = useState(false);

  const staffUrl =
    typeof window !== "undefined" ? `${window.location.origin}/staff/${slug}` : `/staff/${slug}`;

  async function add() {
    const n = newName.trim();
    if (!n) return;
    try {
      await create.mutateAsync(n);
      setNewName("");
      toast.success(`${n} adicionado(a) à equipe`);
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      toast.error(e.message ?? "Erro ao adicionar");
    }
  }

  function randomPin() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl tracking-tight">Gerenciar equipe</h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Cadastre os funcionários, defina um PIN de 4 dígitos e a função (Garçom, Cozinha ou
            ambos). Eles acessarão apenas as telas de operação, sem ver dados financeiros.
          </p>

          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold">Link de acesso da equipe</div>
              <div className="truncate text-[11px] text-muted-foreground">{staffUrl}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(staffUrl);
                  toast.success("Link copiado");
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface"
              >
                Copiar link
              </button>
              <button
                onClick={() => setShowQr((v) => !v)}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                {showQr ? "Ocultar" : "Gerar QR Code"}
              </button>
            </div>
          </div>

          {showQr && (
            <div className="mt-3 flex justify-center rounded-xl border border-border bg-white p-4">
              <img
                alt="QR do acesso da equipe"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(staffUrl)}`}
                className="h-56 w-56"
              />
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder="Nome do funcionário"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
            />
            <button
              onClick={add}
              disabled={create.isPending || !newName.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Adicionar
            </button>
          </div>

          <div className="mt-5">
            {isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (staff as StaffMember[]).length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-6 text-center text-xs text-muted-foreground">
                Nenhum membro cadastrado ainda.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {(staff as StaffMember[]).map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "truncate text-sm font-medium",
                          !s.active && "text-muted-foreground line-through",
                        )}
                      >
                        {s.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {s.active ? "Ativo" : "Inativo"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={s.role ?? "waiter"}
                        onChange={(e) =>
                          update.mutate({
                            id: s.id,
                            patch: {
                              role: z.enum(["waiter", "kitchen", "both"]).parse(e.target.value),
                            },
                          })
                        }
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      >
                        <option value="waiter">Garçom</option>
                        <option value="kitchen">Cozinha</option>
                        <option value="both">Garçom + Cozinha</option>
                      </select>
                      <input
                        key={s.updated_at}
                        defaultValue=""
                        aria-label={`Novo PIN de ${s.name}`}
                        type="password"
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          if (!/^\d{4}$/.test(v)) {
                            toast.error("O PIN deve ter 4 dígitos");
                            return;
                          }
                          update.mutate({ id: s.id, patch: { pin: v } });
                          e.target.value = "";
                        }}
                        placeholder="PIN"
                        maxLength={4}
                        inputMode="numeric"
                        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-center text-xs tracking-widest"
                      />
                      <button
                        onClick={() => {
                          const pin = randomPin();
                          update.mutate(
                            { id: s.id, patch: { pin } },
                            {
                              onSuccess: () =>
                                toast.success(`Novo PIN: ${pin}`, { duration: 15000 }),
                            },
                          );
                        }}
                        className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                        title="Gerar PIN"
                      >
                        Gerar
                      </button>
                      <Switch
                        checked={s.active}
                        onCheckedChange={(v) => update.mutate({ id: s.id, patch: { active: v } })}
                      />
                      <button
                        onClick={() => {
                          if (confirm(`Remover ${s.name}?`)) remove.mutate(s.id);
                        }}
                        className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

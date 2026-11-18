import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { WEEKDAYS, hoursSchema, suggestedHours } from "./service-hours";

export function ServiceHoursEditor({ restaurant }: { restaurant: Tables<"restaurants"> }) {
  const qc = useQueryClient();
  const initial = hoursSchema.safeParse(restaurant.operating_hours);
  const [hours, setHours] = useState(() => (initial.success ? initial.data : suggestedHours()));
  const [enabled, setEnabled] = useState(initial.success);
  const [barOpen, setBarOpen] = useState(restaurant.bar_open ?? true);
  const [codeRequired, setCodeRequired] = useState(restaurant.require_table_code ?? true);
  const ready = restaurant.bar_open !== undefined;
  const [dirty, setDirty] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      if (enabled && !hoursSchema.safeParse(hours).success)
        throw new Error("Confira os horários. Abertura e fechamento devem ser diferentes.");
      const { error } = await supabase
        .from("restaurants")
        .update({
          operating_hours: enabled ? hours : null,
          bar_open: barOpen,
          require_table_code: codeRequired,
        })
        .eq("id", restaurant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["restaurant"] });
      void qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Horários e proteção das mesas salvos");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <section
      id="service-hours"
      className="space-y-6 rounded-2xl border border-border bg-surface p-5 md:p-6"
    >
      <div>
        <p className="text-xs uppercase tracking-widest text-primary">Atendimento seguro</p>
        <h2 className="mt-2 font-display text-2xl">Horários da cozinha e do bar</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Fuso: {restaurant.timezone}. Cada setor para de receber pedidos no horário de fechamento.
          Pedidos já enviados continuam no atendimento.
        </p>
      </div>
      {!ready && (
        <p role="status" className="rounded-xl border border-primary/30 p-3 text-sm">
          Execute o SQL de atualização para ativar horários, códigos e notificações.
        </p>
      )}
      <label className="flex items-center justify-between gap-4">
        <span>
          Bar habilitado{" "}
          <small className="block text-muted-foreground">
            Desligue para pausar bebidas imediatamente.
          </small>
        </span>
        <Switch
          aria-label="Bar habilitado"
          disabled={!ready}
          checked={barOpen}
          onCheckedChange={(v) => {
            setBarOpen(v);
            setDirty(true);
          }}
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>
          Usar agenda semanal{" "}
          <small className="block text-muted-foreground">
            Sem agenda, valem apenas as pausas manuais. Os horários abaixo são sugestões até salvar.
          </small>
        </span>
        <Switch
          aria-label="Usar agenda semanal"
          disabled={!ready}
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            setDirty(true);
          }}
        />
      </label>
      {enabled && (
        <div className="grid gap-6 lg:grid-cols-2">
          {(["kitchen", "bar"] as const).map((dept) => (
            <fieldset key={dept} disabled={!ready || save.isPending} className="min-w-0 space-y-3">
              <legend className="mb-3 font-medium">{dept === "kitchen" ? "Cozinha" : "Bar"}</legend>
              {hours[dept].map((day, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-background/60 p-2"
                >
                  <label className="flex w-24 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={day.enabled}
                      onChange={(e) => {
                        setHours((h) => ({
                          ...h,
                          [dept]: h[dept].map((d, n) =>
                            n === i ? { ...d, enabled: e.target.checked } : d,
                          ),
                        }));
                        setDirty(true);
                      }}
                    />
                    {WEEKDAYS[i]}
                  </label>
                  {(["open", "close"] as const).map((field) => (
                    <input
                      key={field}
                      type="time"
                      aria-label={`${WEEKDAYS[i]} ${dept} ${field === "open" ? "abertura" : "fechamento"}`}
                      value={day[field]}
                      disabled={!day.enabled}
                      onChange={(e) => {
                        setHours((h) => ({
                          ...h,
                          [dept]: h[dept].map((d, n) =>
                            n === i ? { ...d, [field]: e.target.value } : d,
                          ),
                        }));
                        setDirty(true);
                      }}
                      className="min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-40"
                    />
                  ))}
                </div>
              ))}
            </fieldset>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Exemplo: sexta 18:00–01:00 encerra no sábado à 01:00. O sino avisa o fechamento do bar e
        abre o resumo desse turno. Configure a cozinha para encerrar antes, se necessário.
      </p>
      <label className="flex items-center justify-between gap-4">
        <span>
          Código temporário por mesa{" "}
          <small className="block max-w-xl text-muted-foreground">
            Opcional: o garçom entrega quatro dígitos no salão. O código é encerrado ao liberar a
            mesa e tem limite de segurança de 24 horas. Desligar não desativa o bloqueio por
            horário; durante o expediente, qualquer pessoa com o link poderá pedir.
          </small>
        </span>
        <Switch
          aria-label="Exigir código da mesa"
          disabled={!ready}
          checked={codeRequired}
          onCheckedChange={(v) => {
            setCodeRequired(v);
            setDirty(true);
          }}
        />
      </label>
      {!codeRequired && (
        <p className="text-sm text-amber-400">
          Com essa proteção desligada, qualquer pessoa com o link da mesa pode pedir durante o
          atendimento.
        </p>
      )}
      <button
        disabled={!ready || !dirty || save.isPending}
        onClick={() => save.mutate()}
        className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
      >
        {save.isPending ? "Salvando…" : "Salvar horários e proteção"}
      </button>
    </section>
  );
}

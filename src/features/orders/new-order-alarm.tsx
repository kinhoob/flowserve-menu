import { Lock } from "lucide-react";
import { playChime } from "@/lib/sound";
import { useEffect, useRef, useState } from "react";
export function NewOrderAlarm({
  orders,
  allowed,
  initiallyArmed = false,
}: {
  orders: { id: string; status: string }[];
  allowed: boolean;
  initiallyArmed?: boolean;
}) {
  if (!allowed)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" /> Alertas sonoros no Pro
      </span>
    );
  return <OrderAlarmControl orders={orders} initiallyArmed={initiallyArmed} />;
}

function OrderAlarmControl({
  orders,
  initiallyArmed,
}: {
  orders: { id: string; status: string }[];
  initiallyArmed: boolean;
}) {
  const [armed, setArmed] = useState(initiallyArmed);
  const previous = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(orders.filter((o) => o.status === "pending").map((o) => o.id));
    if (armed && previous.current && [...ids].some((id) => !previous.current!.has(id))) playChime();
    previous.current = ids;
  }, [orders, armed]);
  return (
    <button
      className="rounded-xl border border-border px-3 py-2 text-xs"
      aria-pressed={armed}
      onClick={() => {
        if (!armed) playChime();
        setArmed((value) => !value);
      }}
    >
      {armed ? "Alerta sonoro ativo · silenciar" : "Ativar e testar alerta sonoro"}
    </button>
  );
}

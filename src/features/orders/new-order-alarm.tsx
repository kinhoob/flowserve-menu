import { playChime } from "@/lib/sound";
import { useEffect, useRef, useState } from "react";
export function NewOrderAlarm({ orders }: { orders: { id: string; status: string }[] }) {
  const [armed, setArmed] = useState(false);
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

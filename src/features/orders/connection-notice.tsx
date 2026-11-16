import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
export function ConnectionNotice() {
  const [online, setOnline] = useState(true),
    [recovered, setRecovered] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    setOnline(navigator.onLine);
    const off = () => {
      setOnline(false);
      setRecovered(false);
    };
    const on = () => {
      setOnline(true);
      setRecovered(true);
      void qc.invalidateQueries();
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, [qc]);
  useEffect(() => {
    if (!recovered) return;
    const timer = setTimeout(() => setRecovered(false), 6000);
    return () => clearTimeout(timer);
  }, [recovered]);
  if (online && !recovered) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-40 border-b border-border bg-surface px-4 py-3 text-center text-sm"
    >
      {online
        ? "Conexão restabelecida. Atualizando os dados…"
        : "Você está sem conexão. Os dados exibidos podem estar desatualizados. Reconecte antes de enviar ou alterar pedidos."}
    </div>
  );
}

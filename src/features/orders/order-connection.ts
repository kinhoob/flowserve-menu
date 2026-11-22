import { useSyncExternalStore } from "react";
export type OrderConnection = "connecting" | "live" | "fallback";
const modes = new Map<string, OrderConnection>();
const listeners = new Set<() => void>();
export function setOrderConnection(id: string, mode: OrderConnection) {
  if (modes.get(id) === mode) return;
  modes.set(id, mode);
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function useOrderConnection(id: string | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => (id ? (modes.get(id) ?? "connecting") : "connecting"),
    () => "connecting" as OrderConnection,
  );
}
export function orderPollInterval(mode: OrderConnection) {
  return mode === "live" ? 60000 : 5000;
}

import { useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/use-auth";
import type { Point } from "./assistant-position";
type Preferences = { enabled: boolean; position: Point | null };
const fallback = new Map<string, string>();
const eventName = "flux:mascot-preferences";
const initial = "{}";
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
  };
};
function parse(value: string): Preferences {
  try {
    const data = JSON.parse(value);
    return {
      enabled: data?.enabled !== false,
      position:
        Number.isFinite(data?.position?.x) && Number.isFinite(data?.position?.y)
          ? data.position
          : null,
    };
  } catch {
    return { enabled: true, position: null };
  }
}
export function useMascotPreferences() {
  const { user } = useAuth();
  const key = "flux:mascot:v1:" + user?.id;
  const read = () => {
    try {
      return fallback.get(key) ?? localStorage.getItem(key) ?? initial;
    } catch {
      return fallback.get(key) ?? initial;
    }
  };
  const raw = useSyncExternalStore(subscribe, read, () => initial);
  const preferences = useMemo(() => parse(raw), [raw]);
  const update = (patch: Partial<Preferences>) => {
    const value = JSON.stringify({ ...parse(read()), ...patch });
    try {
      localStorage.setItem(key, value);
      fallback.delete(key);
    } catch {
      fallback.set(key, value);
      /* Preferences still work for this session. */
    }
    window.dispatchEvent(new Event(eventName));
  };
  return { ...preferences, update };
}

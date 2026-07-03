import { useEffect, useState } from "react";

export type StaffSession = {
  token: string;
  staff_id: string;
  name: string;
  role: "waiter" | "kitchen" | "both";
  restaurant_slug: string;
  restaurant_name: string;
  restaurant_id?: string;
};

const KEY_PREFIX = "flux-staff-session:";

export function storageKey(slug: string) {
  return `${KEY_PREFIX}${slug}`;
}

export function readStaffSession(slug: string): StaffSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    return JSON.parse(raw) as StaffSession;
  } catch {
    return null;
  }
}

export function writeStaffSession(session: StaffSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(session.restaurant_slug), JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("flux-staff-session-change"));
}

export function clearStaffSession(slug: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(slug));
  window.dispatchEvent(new CustomEvent("flux-staff-session-change"));
}

export function useStaffSession(slug: string): StaffSession | null {
  // Initialize synchronously from localStorage on the client so that a
  // hard-reload with an existing session doesn't flash the PIN screen.
  const [session, setSession] = useState<StaffSession | null>(() => readStaffSession(slug));
  useEffect(() => {
    // Re-sync after mount (covers SSR/hydration and slug changes) and listen
    // for cross-tab / same-tab session writes.
    setSession(readStaffSession(slug));
    const handler = () => setSession(readStaffSession(slug));
    window.addEventListener("flux-staff-session-change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("flux-staff-session-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, [slug]);
  return session;
}



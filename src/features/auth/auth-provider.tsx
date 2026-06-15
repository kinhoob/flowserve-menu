import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setSession(null);
      setLoading(false);
    }, 8000);

    const finishAuthLoad = (nextSession: Session | null) => {
      if (!active) return;
      window.clearTimeout(timeout);
      setSession(nextSession);
      setLoading(false);
    };

    // Set up listener BEFORE getSession (Supabase auth pattern)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      finishAuthLoad(newSession);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => finishAuthLoad(data.session))
      .catch(() => finishAuthLoad(null));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext, type AuthState } from "./use-auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      // Safety: liberate the UI even if Supabase never responds
      setLoading(false);
    }, 5000);

    const finishAuthLoad = (nextSession: Session | null) => {
      if (!active) return;
      window.clearTimeout(timeout);
      setSession(nextSession);
      setLoading(false);
    };

    // Set up listener BEFORE getSession (Supabase auth pattern)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Ignore noisy events (TOKEN_REFRESHED fires ~hourly and on focus; INITIAL_SESSION duplicates getSession)
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") {
        // Still complete initial load if we somehow only get INITIAL_SESSION
        if (event === "INITIAL_SESSION") finishAuthLoad(newSession);
        return;
      }
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

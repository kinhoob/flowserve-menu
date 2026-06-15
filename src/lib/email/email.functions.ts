import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Welcome email: disabled (Resend removido). Mantido como no-op para
 * preservar a chamada existente no client e não quebrar nada.
 */
export const sendWelcomeEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { sent: false, reason: "disabled" as const };
  });

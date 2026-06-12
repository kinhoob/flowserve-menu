import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sends the welcome email exactly once per user.
 * Idempotent via the `welcome_email_sent_at` column on profiles.
 */
export const sendWelcomeEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("display_name, welcome_email_sent_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[welcome] profile lookup error", error);
      return { sent: false, reason: "profile_error" as const };
    }
    if (profile?.welcome_email_sent_at) {
      return { sent: false, reason: "already_sent" as const };
    }

    // Get the authenticated user's email via the user-scoped client.
    const { data: userRes } = await supabase.auth.getUser();
    const email = userRes?.user?.email;
    if (!email) {
      return { sent: false, reason: "no_email" as const };
    }

    // Mark as sent BEFORE actually sending to prevent races / double-sends.
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("id", userId)
      .is("welcome_email_sent_at", null);

    if (updErr) {
      console.error("[welcome] mark sent error", updErr);
      return { sent: false, reason: "mark_error" as const };
    }

    try {
      const { sendWelcomeEmail } = await import("./send-welcome.server");
      await sendWelcomeEmail({
        to: email,
        displayName: profile?.display_name ?? null,
      });
      return { sent: true as const };
    } catch (err) {
      console.error("[welcome] send error", err);
      // Roll back so a future attempt can retry.
      await supabase
        .from("profiles")
        .update({ welcome_email_sent_at: null })
        .eq("id", userId);
      return { sent: false, reason: "send_error" as const };
    }
  });

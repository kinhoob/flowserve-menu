import { supabase } from "@/integrations/supabase/client";

export function safeAuthDestination(path: string | undefined): string {
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    [...path].some((character) => character.charCodeAt(0) < 32)
  )
    return "/dashboard";
  const url = new URL(path, "https://flux.invalid");
  if (url.origin !== "https://flux.invalid" || url.pathname === "/auth") return "/dashboard";
  return url.pathname + url.search + url.hash;
}
function confirmationUrl(origin: string): string {
  return new URL("/dashboard", origin).href;
}
export async function registerWithEmail(input: {
  email: string;
  password: string;
  displayName: string;
  origin: string;
}) {
  const email = input.email.trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: confirmationUrl(input.origin),
      data: { display_name: input.displayName.trim() || email.split("@")[0] },
    },
  });
  if (error) throw error;
  return { confirmationRequired: !data.session };
}
export async function resendConfirmation(input: { email: string; origin: string }) {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: input.email.trim(),
    options: { emailRedirectTo: confirmationUrl(input.origin) },
  });
  if (error) throw error;
}

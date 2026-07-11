// Pure helpers extracted from the /reset-password route so the flow
// (link validation, password checks, error classification, resend cooldown)
// can be unit-tested without rendering the whole route tree.

export const RESEND_COOLDOWN_SECONDS = 60;
export const VALIDATION_TIMEOUT_MS = 4000;

export type LinkStatus = "validating" | "ready" | "invalid" | "expired";

export interface HashClassification {
  status: LinkStatus;
  message: string;
}

/**
 * Look at the hash params Supabase places on the recovery URL and decide if it
 * already signals a failure (expired / generic invalid). Returns null when the
 * hash carries no error and we should proceed with normal session validation.
 */
export function classifyHashError(
  params: URLSearchParams,
): HashClassification | null {
  const errorCode = params.get("error_code");
  const errorDescription = params.get("error_description");
  const error = params.get("error");

  if (
    errorCode === "otp_expired" ||
    errorDescription?.toLowerCase().includes("expired")
  ) {
    return {
      status: "expired",
      message: "Este link de recuperação expirou. Solicite um novo abaixo.",
    };
  }

  if (error || errorCode) {
    return {
      status: "invalid",
      message: errorDescription
        ? decodeURIComponent(errorDescription.replace(/\+/g, " "))
        : "Link de recuperação inválido. Solicite um novo abaixo.",
    };
  }

  return null;
}

export function parseHashParams(hash: string): URLSearchParams {
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(clean);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface PasswordValidation {
  ok: boolean;
  message?: string;
}

export function validateNewPassword(
  password: string,
  confirm: string,
): PasswordValidation {
  if (password.length < 6) {
    return { ok: false, message: "A senha precisa ter pelo menos 6 caracteres." };
  }
  if (password !== confirm) {
    return { ok: false, message: "As senhas não coincidem." };
  }
  return { ok: true };
}

export interface UpdateUserErrorResult {
  /** New link status to move the UI to, if the error means the session is gone. */
  status?: LinkStatus;
  /** Human-facing toast text. */
  toast: string;
  /** Optional inline banner message when we downgrade to expired/invalid. */
  banner?: string;
}

/**
 * Map Supabase updateUser error messages to actionable UI state.
 */
export function classifyUpdateUserError(rawMessage: string): UpdateUserErrorResult {
  const msg = rawMessage.toLowerCase();

  if (msg.includes("session") || msg.includes("expired") || msg.includes("jwt")) {
    return {
      status: "expired",
      toast: "Link expirado. Solicite um novo email de recuperação.",
      banner: "Sua sessão de recuperação expirou. Solicite um novo link abaixo.",
    };
  }
  if (msg.includes("same") || msg.includes("different")) {
    return { toast: "A nova senha precisa ser diferente da atual." };
  }
  if (msg.includes("weak") || msg.includes("password")) {
    return {
      toast:
        "Senha muito fraca. Use pelo menos 6 caracteres com letras e números.",
    };
  }
  return { toast: "Não foi possível redefinir. Tente novamente." };
}

export interface ResendErrorResult {
  /** Whether we should engage the cooldown even though the send failed. */
  engageCooldown: boolean;
  toast: string;
}

/**
 * Map resend/rate-limit responses to a cooldown decision. Rate-limit style
 * errors still engage the local cooldown to prevent hammering the API.
 */
export function classifyResendError(rawMessage: string): ResendErrorResult {
  const msg = rawMessage.toLowerCase();
  if (msg.includes("rate") || msg.includes("limit") || msg.includes("too many")) {
    return {
      engageCooldown: true,
      toast:
        "Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.",
    };
  }
  return {
    engageCooldown: false,
    toast: "Não foi possível enviar. Tente novamente em instantes.",
  };
}

/**
 * Compute the next cooldown value on each tick. Returns 0 once it drains.
 */
export function tickCooldown(current: number): number {
  return current <= 1 ? 0 : current - 1;
}

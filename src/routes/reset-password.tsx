import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, KeyRound, AlertTriangle, MailCheck } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { FluxLogo } from "@/components/brand/logo";
import {
  RESEND_COOLDOWN_SECONDS,
  VALIDATION_TIMEOUT_MS,
  classifyHashError,
  classifyResendError,
  classifyUpdateUserError,
  isValidEmail,
  parseHashParams as parseHashParamsPure,
  tickCooldown,
  validateNewPassword,
  type LinkStatus,
} from "@/lib/reset-password.helpers";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Flux" },
      { name: "description", content: "Defina uma nova senha para sua conta Flux." },
    ],
  }),
  component: ResetPasswordPage,
});

function parseHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return parseHashParamsPure(window.location.hash);
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LinkStatus>("validating");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Resend flow
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hashParams = useMemo(() => parseHashParams(), []);

  // Detect explicit error in URL hash (Supabase returns error_code=otp_expired, etc.)
  useEffect(() => {
    const hashError = classifyHashError(hashParams);
    if (hashError) {
      setStatus(hashError.status);
      setErrorMsg(hashError.message);
      return;
    }

    let resolved = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        resolved = true;
        setStatus("ready");
      }
    });

    supabase.auth.getSession().then(({ data, error: sessErr }) => {
      if (sessErr) {
        resolved = true;
        setStatus("invalid");
        setErrorMsg("Não foi possível validar o link. Solicite um novo abaixo.");
        return;
      }
      if (data.session) {
        resolved = true;
        setStatus("ready");
      }
    });

    // Safety timeout: if no PASSWORD_RECOVERY event nor session appeared, the link is stale/invalid.
    const timeout = setTimeout(() => {
      if (!resolved) {
        setStatus("invalid");
        setErrorMsg(
          "Não encontramos um link de recuperação válido. Ele pode ter expirado ou já sido usado.",
        );
      }
    }, VALIDATION_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [hashParams]);


  // Cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownTimer.current) {
        clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
      }
      return;
    }
    if (!cooldownTimer.current) {
      cooldownTimer.current = setInterval(() => {
        setCooldown((s) => tickCooldown(s));
      }, 1000);
    }
    return () => {
      if (cooldownTimer.current && cooldown <= 1) {
        clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
      }
    };
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const check = validateNewPassword(password, confirm);
    if (!check.ok) {
      toast.error(check.message!);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha redefinida. Bem-vindo de volta!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const result = classifyUpdateUserError(
        err instanceof Error ? err.message : "",
      );
      if (result.status) setStatus(result.status);
      if (result.banner) setErrorMsg(result.banner);
      toast.error(result.toast);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resendLoading || cooldown > 0) return;
    const email = resendEmail.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      toast.error("Informe um email válido.");
      return;
    }
    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Se existir uma conta com esse email, enviamos um novo link.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const result = classifyResendError(
        err instanceof Error ? err.message : "",
      );
      toast.error(result.toast);
      if (result.engageCooldown) setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setResendLoading(false);
    }
  };


  const showRecoveryForm = status === "ready";
  const showResendPanel = status === "invalid" || status === "expired";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.78_0.13_84_/_0.14),transparent)] blur-2xl"
      />
      <Link
        to="/auth"
        search={{ mode: "login" }}
        className="absolute left-6 top-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-8 flex justify-center">
          <FluxLogo />
        </div>

        <div className="rounded-3xl border border-border bg-surface/80 p-8 shadow-[0_60px_120px_-40px_oklch(0_0_0_/_0.8)] backdrop-blur">
          <div className="flex justify-center">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${
                showResendPanel
                  ? "bg-destructive/10 text-destructive ring-destructive/30"
                  : "bg-gold-soft text-primary ring-[oklch(0.78_0.13_84_/_0.3)]"
              }`}
            >
              {showResendPanel ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <KeyRound className="h-5 w-5" />
              )}
            </div>
          </div>
          <h1 className="mt-5 text-center font-display text-3xl tracking-tight">
            {status === "expired"
              ? "Link expirado"
              : status === "invalid"
                ? "Link inválido"
                : "Redefinir senha"}
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {status === "validating" && "Validando link de recuperação…"}
            {status === "ready" && "Escolha uma nova senha para sua conta."}
            {showResendPanel && (errorMsg || "Solicite um novo link para continuar.")}
          </p>

          {status === "validating" && (
            <div className="mt-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {showRecoveryForm && (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <Field
                label="Nova senha"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
              />
              <Field
                label="Confirmar senha"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={setConfirm}
                placeholder="••••••••"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-[0_18px_40px_-15px_oklch(0.78_0.13_84_/_0.6)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar nova senha
              </button>
            </form>
          )}

          {showResendPanel && (
            <form onSubmit={handleResend} className="mt-8 space-y-4">
              <Field
                label="Seu email"
                type="email"
                autoComplete="email"
                required
                value={resendEmail}
                onChange={setResendEmail}
                placeholder="voce@exemplo.com"
              />
              <button
                type="submit"
                disabled={resendLoading || cooldown > 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-[0_18px_40px_-15px_oklch(0.78_0.13_84_/_0.6)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {resendLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MailCheck className="h-4 w-4" />
                )}
                {cooldown > 0
                  ? `Aguarde ${cooldown}s para reenviar`
                  : "Enviar novo link de recuperação"}
              </button>
              <p className="text-center text-xs text-muted-foreground">
                Por segurança, você pode solicitar um novo link a cada {RESEND_COOLDOWN_SECONDS} segundos.
              </p>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
  minLength,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-[oklch(0.78_0.13_84_/_0.6)] focus:ring-2 focus:ring-[oklch(0.78_0.13_84_/_0.2)]"
      />
    </label>
  );
}

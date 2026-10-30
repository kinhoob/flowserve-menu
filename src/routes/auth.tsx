import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { FluxLogo } from "@/components/brand/logo";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { sendWelcomeEmailFn } from "@/lib/email/email.functions";

async function fireWelcomeEmail() {
  try {
    await sendWelcomeEmailFn();
  } catch (err) {
    console.error("[welcome] dispatch failed", err);
  }
}

const searchSchema = z.object({
  mode: z.enum(["login", "signup"]).optional().default("login"),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar — Flux Menu" },
      { name: "description", content: "Acesse sua conta Flux Menu." },
    ],
  }),
  component: AuthPage,
});

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "Email ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu email antes de entrar.";
  if (m.includes("user already") || m.includes("already registered"))
    return "Este email já está cadastrado. Faça login.";
  if (m.includes("password") && m.includes("6"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
  if (m.includes("invalid") && m.includes("email"))
    return "Email inválido. Verifique e tente novamente.";
  if (m.includes("token") && (m.includes("invalid") || m.includes("expired")))
    return "Código inválido ou expirado. Solicite um novo.";
  if (m.includes("otp") && m.includes("expired")) return "Código expirado. Solicite um novo.";
  if (m.includes("network") || m.includes("failed to fetch"))
    return "Falha de conexão. Verifique sua internet.";
  return "Não foi possível concluir. Tente novamente em alguns instantes.";
}

function AuthPage() {
  const { mode: initialMode, redirect: redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [step, setStep] = useState<"form" | "otp">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotLoading) return;
    const target = forgotEmail.trim() || email.trim();
    if (!target) {
      toast.error("Informe o email para receber o link.");
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Enviamos um link de recuperação para o seu email.");
      setForgotOpen(false);
      setForgotEmail("");
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : ""));
    } finally {
      setForgotLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: redirectTo ?? "/dashboard" });
    });
  }, [navigate, redirectTo]);

  useEffect(() => {
    setMode(initialMode);
    setStep("form");
    setOtp("");
  }, [initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Enviamos um código de 6 dígitos para o seu email.");
        setStep("otp");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta.");
        navigate({ to: redirectTo ?? "/dashboard" });
      }
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : ""));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    if (verifying) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error) throw error;
      toast.success("Email confirmado. Vamos configurar seu restaurante.");
      void fireWelcomeEmail();
      navigate({ to: redirectTo ?? "/dashboard" });
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : ""));
      setOtp("");
    } finally {
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (resending) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Novo código enviado para o seu email.");
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : ""));
    } finally {
      setResending(false);
    }
  };

  const handleGoogle = async () => {
    if (oauthLoading) return;
    setOauthLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/dashboard",
      });
      if (result.error) {
        toast.error(friendlyError(result.error.message || ""));
        setOauthLoading(false);
        return;
      }
      if (result.redirected) return;
      void fireWelcomeEmail();
      navigate({ to: redirectTo ?? "/dashboard" });
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : ""));
      setOauthLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.78_0.13_84_/_0.14),transparent)] blur-2xl"
      />
      <div className="pointer-events-none absolute inset-0 bg-grid-faint [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />

      <Link
        to="/"
        className="absolute left-6 top-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-8 flex justify-center">
          <FluxLogo />
        </div>

        <div className="rounded-3xl border border-border bg-surface/80 p-8 shadow-[0_60px_120px_-40px_oklch(0_0_0_/_0.8)] backdrop-blur">
          <AnimatePresence mode="wait">
            {step === "otp" ? (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
                    <Mail className="h-5 w-5" />
                  </div>
                </div>
                <h1 className="mt-5 text-center font-display text-3xl tracking-tight">
                  Confirme seu email
                </h1>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  Digite o código de 6 dígitos que enviamos para
                  <br />
                  <span className="text-foreground">{email}</span>
                </p>

                <div className="mt-8 flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(val) => {
                      setOtp(val);
                      if (val.length === 6) handleVerifyOtp(val);
                    }}
                    disabled={verifying}
                  >
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="h-12 w-12 text-lg font-semibold"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                {verifying && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando código…
                  </div>
                )}

                <div className="mt-8 space-y-3 text-center">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resending}
                    className="text-sm text-foreground underline-offset-4 hover:underline disabled:opacity-60"
                  >
                    {resending ? "Enviando…" : "Reenviar código"}
                  </button>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setStep("form");
                        setOtp("");
                      }}
                      className="text-xs text-muted-foreground transition hover:text-foreground"
                    >
                      Usar outro email
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <div>
                  <h1 className="font-display text-3xl tracking-tight">
                    {mode === "signup" ? "Crie sua conta" : "Bem-vindo de volta"}
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {mode === "signup"
                      ? "Comece a servir cardápios digitais em minutos."
                      : "Acesse seu painel Flux Menu."}
                  </p>
                </div>

                <button
                  onClick={handleGoogle}
                  disabled={oauthLoading}
                  className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-[oklch(0.78_0.13_84_/_0.4)] hover:bg-surface-2 disabled:opacity-60"
                >
                  {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
                  Continuar com Google
                </button>

                <div className="my-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    ou com email
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === "signup" && (
                    <Field
                      label="Seu nome"
                      type="text"
                      autoComplete="name"
                      value={displayName}
                      onChange={setDisplayName}
                      placeholder="Alex Moraes"
                    />
                  )}
                  <Field
                    label="Email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={setEmail}
                    placeholder="voce@estabelecimento.com"
                  />
                  <Field
                    label="Senha"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-[0_18px_40px_-15px_oklch(0.78_0.13_84_/_0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_25px_60px_-18px_oklch(0.78_0.13_84_/_0.75)] disabled:opacity-60"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {mode === "signup" ? "Criar conta" : "Entrar"}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email);
                        setForgotOpen(true);
                      }}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                  {mode === "signup" ? "Já tem uma conta?" : "Novo no Flux Menu?"}{" "}
                  <button
                    onClick={() => setMode(mode === "signup" ? "login" : "signup")}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {mode === "signup" ? "Entrar" : "Criar uma"}
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {forgotOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
            onClick={() => !forgotLoading && setForgotOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            >
              <h2 className="font-display text-xl tracking-tight">Recuperar senha</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enviaremos um link para você definir uma nova senha.
              </p>
              <form onSubmit={handleForgotPassword} className="mt-5 space-y-4">
                <Field
                  label="Email"
                  type="email"
                  autoComplete="email"
                  required
                  value={forgotEmail}
                  onChange={setForgotEmail}
                  placeholder="voce@estabelecimento.com"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setForgotOpen(false)}
                    disabled={forgotLoading}
                    className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Enviar link
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Ao continuar você aceita os Termos e a Política de Privacidade do Flux Menu.
        </p>
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

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 11v3.2h4.5c-.2 1.2-1.6 3.6-4.5 3.6-2.7 0-4.9-2.2-4.9-5s2.2-5 4.9-5c1.6 0 2.6.7 3.2 1.2l2.2-2.1C15.9 5.6 14.1 4.8 12 4.8 7.8 4.8 4.4 8.2 4.4 12.4S7.8 20 12 20c6.9 0 7.6-6.4 7-9z"
      />
    </svg>
  );
}

export { redirect };

import { useAuth } from "@/features/auth/use-auth";
import {
  registerWithEmail,
  resendConfirmation,
  safeAuthDestination,
} from "@/features/auth/email-confirmation";
import { FluxLogo } from "@/components/brand/logo";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

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
    return "Link inválido ou expirado. Solicite um novo e-mail.";
  if (m.includes("otp") && m.includes("expired")) return "Link expirado. Solicite um novo e-mail.";
  if (m.includes("network") || m.includes("failed to fetch"))
    return "Falha de conexão. Verifique sua internet.";
  return "Não foi possível concluir. Tente novamente em alguns instantes.";
}

function AuthPage() {
  const { mode: initialMode, redirect: redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const destination = safeAuthDestination(redirectTo);
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [step, setStep] = useState<"form" | "confirm-email">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
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
    if (user) void navigate({ to: destination, replace: true });
  }, [user, navigate, destination]);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    setMode(initialMode);
    setStep("form");
  }, [initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      if (mode === "signup") {
        const result = await registerWithEmail({
          email,
          password,
          displayName,
          origin: window.location.origin,
        });
        setPassword("");
        if (!result.confirmationRequired) {
          toast.success("Conta criada. Bem-vindo ao Flux Menu.");
          void navigate({ to: destination });
          return;
        }
        toast.success("Confira seu e-mail para confirmar o cadastro.");
        setResendCooldown(60);
        setStep("confirm-email");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta.");
        navigate({ to: destination });
      }
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : ""));
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    try {
      await resendConfirmation({ email, origin: window.location.origin });
      setResendCooldown(60);
      toast.success("Solicitamos um novo link. Confira seu e-mail.");
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
      const result = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: new URL("/dashboard", window.location.origin).href },
      });
      if (result.error) {
        toast.error(friendlyError(result.error.message || ""));
        setOauthLoading(false);
        return;
      }
      // Supabase redirects to Google; the persisted browser session handles the callback.
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : ""));
      setOauthLoading(false);
    }
  };

  if (!isSupabaseConfigured())
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-12">
        <div className="flux-panel max-w-lg p-8 sm:p-12">
          <FluxLogo />
          <p className="flux-eyebrow mt-10 text-primary">O próximo passo começa aqui</p>
          <h1 className="mt-4 font-display text-3xl leading-tight">
            Enquanto preparamos seu ambiente, conheça o fluxo.
          </h1>
          <p className="mt-5 text-sm leading-7 text-muted-foreground">
            O acesso às contas ainda está em configuração. A demonstração já está disponível para
            explorar o cardápio e a operação, sem cadastro nem cobranças.
          </p>
          <Link
            to="/demo"
            search={{ view: "operation" }}
            className="flux-button mt-7 w-full bg-primary text-primary-foreground"
          >
            Explorar demonstração
          </Link>
          <Link to="/" className="flux-button mt-2 w-full text-muted-foreground">
            Voltar ao início
          </Link>
        </div>
      </main>
    );

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
            {step === "confirm-email" ? (
              <motion.div
                key="confirm-email"
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
                  Abra o link de confirmação enviado para
                  <br />
                  <span className="text-foreground">{email}</span>
                </p>

                <div className="mt-6 rounded-2xl border border-border bg-background/50 p-4 text-sm leading-6 text-muted-foreground">
                  No e-mail, clique em “Confirm email address” para concluir seu cadastro. Você será
                  levado ao aplicativo. Confira também a pasta de spam.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPassword("");
                    setMode("login");
                    setStep("form");
                    void navigate({
                      to: "/auth",
                      search: { mode: "login", redirect: destination },
                      replace: true,
                    });
                  }}
                  className="flux-button mt-5 w-full bg-primary text-primary-foreground"
                >
                  Já confirmei. Entrar
                </button>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Se o link abrir em outro navegador, entre com seu e-mail e senha.
                </p>

                <div className="mt-8 space-y-3 text-center">
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resending || resendCooldown > 0}
                    className="text-sm text-foreground underline-offset-4 hover:underline disabled:opacity-60"
                  >
                    {resending
                      ? "Enviando…"
                      : resendCooldown > 0
                        ? `Reenviar em ${resendCooldown}s`
                        : "Reenviar link de confirmação"}
                  </button>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setStep("form");
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

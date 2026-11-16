import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export function PlatformLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword("");
    } catch {
      setError("Não foi possível entrar. Confira o e-mail e a senha da sua conta.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-5 text-left"
    >
      <label className="block text-sm">
        E-mail de administrador
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3"
        />
      </label>
      <label className="block text-sm">
        Senha
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-amber-400">
          {error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
      >
        {pending ? "Entrando…" : "Entrar na administração"}
      </button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Use sua conta existente do Flux. O acesso aos dados da plataforma exige autorização de
        administrador.
      </p>
    </form>
  );
}

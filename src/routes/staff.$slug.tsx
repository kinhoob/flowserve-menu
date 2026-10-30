import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Delete, Loader2, LogOut, ChefHat, Users } from "lucide-react";
import { toast } from "sonner";
import { FluxLogo } from "@/components/brand/logo";
import {
  useStaffSession,
  writeStaffSession,
  clearStaffSession,
} from "@/features/staff/staff-session";
import { staffLogin, staffLogout } from "@/features/staff/staff-rpc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff/$slug")({
  head: () => ({ meta: [{ title: "Acesso da Equipe — Flux Menu" }] }),
  component: StaffLayout,
});

function StaffLayout() {
  const { slug } = Route.useParams();
  const session = useStaffSession(slug);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isRoot = pathname === `/staff/${slug}` || pathname === `/staff/${slug}/`;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid SSR/hydration flash: only decide once mounted on the client.
  if (!mounted) return null;
  if (!session) return <PinScreen slug={slug} />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/staff/$slug" params={{ slug }} className="flex items-center gap-2">
          <FluxLogo />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {session.restaurant_name || "Flux Menu"}
            </div>
            <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {session.name} · {roleLabel(session.role)}
            </div>
          </div>
        </Link>
        <button
          onClick={async () => {
            try {
              await staffLogout(session.token);
            } catch {
              /* noop */
            }
            clearStaffSession(slug);
            toast.success("Sessão encerrada");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      </header>
      {isRoot ? <StaffHome /> : <Outlet />}
    </div>
  );
}

function roleLabel(role: string) {
  return role === "waiter" ? "Garçom" : role === "kitchen" ? "Cozinha" : "Garçom + Cozinha";
}

function StaffHome() {
  const { slug } = Route.useParams();
  const session = useStaffSession(slug);
  const canWaiter = session?.role === "waiter" || session?.role === "both";
  const canKitchen = session?.role === "kitchen" || session?.role === "both";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-2xl tracking-tight">O que você quer fazer?</h1>
      <p className="mt-1 text-sm text-muted-foreground">Escolha uma das áreas abaixo.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {canWaiter && (
          <Link
            to="/staff/$slug/waiter"
            params={{ slug }}
            className="group relative flex h-48 flex-col justify-between rounded-2xl border border-border bg-surface p-6 transition hover:border-primary/50 hover:bg-surface/70"
          >
            <Users className="h-8 w-8 text-primary" />
            <div>
              <div className="font-display text-xl">Painel do Garçom</div>
              <div className="text-xs text-muted-foreground">
                Pedidos, chamados e fechamento de mesas
              </div>
            </div>
          </Link>
        )}
        {canKitchen && (
          <Link
            to="/staff/$slug/kitchen"
            params={{ slug }}
            className="group relative flex h-48 flex-col justify-between rounded-2xl border border-border bg-surface p-6 transition hover:border-primary/50 hover:bg-surface/70"
          >
            <ChefHat className="h-8 w-8 text-primary" />
            <div>
              <div className="font-display text-xl">KDS (Cozinha)</div>
              <div className="text-xs text-muted-foreground">Pedidos em preparo e prontos</div>
            </div>
          </Link>
        )}
      </div>
    </main>
  );
}

function PinScreen({ slug }: { slug: string }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(code: string) {
    if (loading) return;
    setLoading(true);
    try {
      const session = await staffLogin(slug, code);
      writeStaffSession(session);
      toast.success(`Olá, ${session.name}!`);
      navigate({ to: "/staff/$slug", params: { slug } });
    } catch (e: any) {
      toast.error(e.message ?? "PIN inválido");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  function press(d: string) {
    setPin((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) void submit(next);
      return next;
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-xs">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <FluxLogo />
          <h1 className="font-display text-xl tracking-tight">
            Digite seu PIN para acessar o Flux Menu
          </h1>
          <p className="text-xs text-muted-foreground">Peça o código de 4 dígitos ao gerente.</p>
        </div>

        <div className="mb-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "h-12 w-12 rounded-xl border-2 transition",
                pin.length > i ? "border-primary bg-primary/10" : "border-border bg-surface",
              )}
            >
              <div className="flex h-full items-center justify-center text-lg font-semibold">
                {pin[i] ? "●" : ""}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <NumpadBtn key={d} onClick={() => press(d)} disabled={loading}>
              {d}
            </NumpadBtn>
          ))}
          <NumpadBtn onClick={() => setPin("")} disabled={loading} variant="ghost">
            <span className="text-xs">Limpar</span>
          </NumpadBtn>
          <NumpadBtn onClick={() => press("0")} disabled={loading}>
            0
          </NumpadBtn>
          <NumpadBtn
            onClick={() => setPin((p) => p.slice(0, -1))}
            disabled={loading}
            variant="ghost"
          >
            <Delete className="h-5 w-5" />
          </NumpadBtn>
        </div>

        {loading && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Validando…
          </div>
        )}
      </div>
    </div>
  );
}

function NumpadBtn({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "ghost";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-14 items-center justify-center rounded-xl text-lg font-semibold transition active:scale-95 disabled:opacity-40",
        variant === "default"
          ? "bg-surface text-foreground hover:bg-surface/70 border border-border"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

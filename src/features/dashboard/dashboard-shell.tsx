import { FloatingAssistant } from "@/features/assistant/floating-assistant";
import { useDashboardTools } from "@/features/dashboard/use-dashboard-tools";
import { DashboardTools, MenuPreviewLink } from "./dashboard-tools";
import { RestaurantHeader } from "./restaurant-header";
import { BetaBadge } from "@/components/brand/beta-badge";
import { AdminTour } from "@/features/onboarding/admin-tour";
import { NotificationBell } from "./notification-bell";
import { ConnectionNotice } from "@/features/orders/connection-notice";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link, useRouterState } from "@tanstack/react-router";
import { Lock, LogOut, Menu, Keyboard, MoreHorizontal, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./command-palette";
import { NAV } from "./navigation";

import { FluxLogo } from "@/components/brand/logo";
import { useAuth } from "@/features/auth/use-auth";
import { FeatureLocked, TrialExpiredBlock } from "@/features/billing/trial-guard";
import {
  canOpenFeature,
  isTrialExpired,
  minimumPlan,
  useTrialStatus,
} from "@/features/billing/trial-status";
import { UpgradeProModal } from "@/features/billing/upgrade-modal";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <DashboardTools>
      <DashboardShellContent>{children}</DashboardShellContent>
    </DashboardTools>
  );
}
function DashboardShellContent({ children }: { children: ReactNode }) {
  const tools = useDashboardTools();
  const [betaDismissed, setBetaDismissed] = useState(true);
  useEffect(() => {
    try {
      setBetaDismissed(sessionStorage.getItem("flux-beta-dismissed") === "yes");
    } catch {
      setBetaDismissed(false);
    }
  }, []);
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const billingPage =
    pathname === "/settings" && new URLSearchParams(searchStr).get("tab") === "billing";
  const { data: trial, isPending: planLoading, refetch: refetchPlan } = useTrialStatus();
  const [lockedLabel, setLockedLabel] = useState<string | null>(null);
  const [tourActive, setTourActive] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = (user?.user_metadata?.display_name || user?.email || "U")
    .slice(0, 2)
    .toUpperCase();

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const restricted = !canOpenFeature(trial, "dashboard");
  const feature = NAV.find((item) => item.to === pathname)?.feature;

  const navBlock = restricted ? (
    <nav className="flex-1 px-6">
      <Link to="/settings" search={{ tab: "billing" }} className="text-sm text-primary">
        Assinatura
      </Link>
    </nav>
  ) : (
    <nav className="flex-1 space-y-1 px-3">
      {NAV.map(({ label, to, icon: Icon, soon, id, feature }) => {
        const locked = !!feature && !canOpenFeature(trial, feature);
        const active = pathname === to && !soon;
        return (
          <Link
            key={label}
            to={to}
            id={id}
            onClick={(e) => {
              if (locked) {
                e.preventDefault();
                setLockedLabel(label + " · " + minimumPlan(feature));
              }
            }}
            className={cn(
              "group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors duration-150",
              active
                ? "bg-gold-soft text-foreground ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              locked && "opacity-70",
            )}
          >
            <span className="flex items-center gap-3">
              <Icon className={cn("h-4 w-4 transition", active && "text-primary")} />
              {label}
            </span>
            {locked ? (
              <Lock className="h-3.5 w-3.5 text-primary" />
            ) : soon ? (
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Em breve
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const userBlock = (
    <div className="border-t border-border p-4">
      <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.86_0.12_84)] to-[oklch(0.4_0.05_60)] text-xs font-semibold text-[oklch(0.18_0.02_70)]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {user?.user_metadata?.display_name || user?.email?.split("@")[0]}
          </div>
          <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
        </div>
        <button
          onClick={() => signOut()}
          title="Sair"
          className="rounded-lg p-2 text-muted-foreground transition hover:bg-background hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="dashboard-ui flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar md:flex">
        <div className="px-6 pb-6 pt-7">
          <FluxLogo />
        </div>
        {navBlock}
        {userBlock}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:px-6 md:py-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="rounded-xl border border-border bg-surface p-2.5 text-muted-foreground transition hover:text-foreground md:hidden"
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-0">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              <div className="px-6 pb-6 pt-7">
                <FluxLogo />
              </div>
              {navBlock}
              {userBlock}
            </SheetContent>
          </Sheet>

          {!restricted && <CommandPalette trial={trial} onLocked={setLockedLabel} />}

          {restricted ? <span className="font-display">Flux Menu</span> : <RestaurantHeader />}

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex">
              <BetaBadge />
            </span>
            {!restricted && (
              <MenuPreviewLink className="hidden rounded-lg border border-border px-3 py-2 text-xs lg:inline-flex" />
            )}
            <button
              onClick={tools.shortcuts}
              aria-label="Mostrar atalhos de teclado"
              className={cn(
                "hidden rounded-lg p-2 text-muted-foreground",
                !restricted && "sm:block",
              )}
            >
              <Keyboard className="h-4 w-4" />
            </button>
            {canOpenFeature(trial, "kitchen") && <NotificationBell />}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-6 md:py-8">
          <ConnectionNotice />
          {!restricted && !betaDismissed && (
            <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
              <p className="text-xs leading-5 text-muted-foreground">
                <strong className="font-medium text-primary">Flux em beta.</strong> Teste as
                configurações antes de usar no salão.
              </p>
              <button
                aria-label="Dispensar aviso beta"
                onClick={() => {
                  setBetaDismissed(true);
                  try {
                    sessionStorage.setItem("flux-beta-dismissed", "yes");
                  } catch {
                    /* Dismissal stays available in memory. */
                  }
                }}
                className="rounded p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {trial && isTrialExpired(trial) && !billingPage ? (
              <TrialExpiredBlock />
            ) : !trial && !billingPage ? (
              <div
                role="status"
                className="mx-auto max-w-lg rounded-2xl border border-border p-6 text-center"
              >
                <p>
                  {planLoading
                    ? "Verificando seu plano…"
                    : "Não foi possível verificar seu plano. Tente novamente."}
                </p>
                {!planLoading && (
                  <button
                    onClick={() => void refetchPlan()}
                    className="mt-4 rounded-xl bg-primary px-4 py-2 text-primary-foreground"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            ) : feature && !canOpenFeature(trial, feature) ? (
              <FeatureLocked feature={feature} />
            ) : (
              children
            )}
          </motion.div>
        </main>
      </div>

      {!restricted && (
        <nav
          aria-label="Navegação rápida no celular"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] md:hidden"
        >
          {NAV.filter((n) => ["/dashboard", "/kitchen", "/tables"].includes(n.to)).map(
            ({ to, label, icon: Icon, feature }) => (
              <Link
                key={to}
                to={to}
                aria-current={pathname === to ? "page" : undefined}
                onClick={(e) => {
                  if (feature && !canOpenFeature(trial, feature)) {
                    e.preventDefault();
                    setLockedLabel(label + " · " + minimumPlan(feature));
                  }
                }}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px]",
                  pathname === to ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                {feature && !canOpenFeature(trial, feature) ? (
                  <Lock className="h-4 w-4 text-primary" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                {to === "/dashboard" ? "Início" : label}
              </Link>
            ),
          )}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
            Mais
          </button>
        </nav>
      )}
      {!restricted && <AdminTour onActiveChange={setTourActive} />}
      {!restricted && <FloatingAssistant hidden={tourActive || mobileOpen} />}
      <UpgradeProModal
        open={!restricted && lockedLabel !== null}
        featureLabel={lockedLabel}
        onClose={() => setLockedLabel(null)}
      />
    </div>
  );
}

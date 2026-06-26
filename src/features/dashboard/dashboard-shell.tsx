import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  QrCode,
  BarChart3,
  Settings,
  LogOut,
  Bell,
  Search,
  HandPlatter,
  Lock,
  Armchair,
  Menu,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

import { motion } from "framer-motion";
import { useAuth } from "@/features/auth/auth-provider";
import { FluxLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { useTrialStatus, canAccess, type FeatureKey } from "@/features/billing/trial-guard";
import { UpgradeProModal } from "@/features/billing/upgrade-modal";

type NavItem = {
  label: string;
  to: "/dashboard" | "/menu" | "/qrcodes" | "/kitchen" | "/analytics" | "/waiter" | "/settings" | "/tables";
  icon: typeof LayoutDashboard;
  soon?: boolean;
  id?: string;
  feature?: FeatureKey;
};

const NAV: NavItem[] = [
  { label: "Visão geral", to: "/dashboard", icon: LayoutDashboard, id: "nav-dashboard" },
  { label: "Pedidos", to: "/kitchen", icon: ClipboardList, id: "nav-kitchen", feature: "kitchen" },
  { label: "Garçom", to: "/waiter", icon: HandPlatter, id: "nav-waiter", feature: "waiter" },
  { label: "Cardápio", to: "/menu", icon: UtensilsCrossed, id: "nav-menu", feature: "menu" },
  { label: "Mesas", to: "/tables", icon: Armchair, id: "nav-tables" },
  { label: "QR Codes", to: "/qrcodes", icon: QrCode, id: "nav-qrcodes" },
  { label: "Análises", to: "/analytics", icon: BarChart3, id: "nav-analytics", feature: "analytics" },
  { label: "Configurações", to: "/settings", icon: Settings, id: "nav-settings" },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: trial } = useTrialStatus();
  const [lockedLabel, setLockedLabel] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = (user?.user_metadata?.display_name || user?.email || "U")
    .slice(0, 2)
    .toUpperCase();

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const navBlock = (
    <nav className="flex-1 space-y-1 px-3">
      {NAV.map(({ label, to, icon: Icon, soon, id, feature }) => {
        const locked = !!feature && !!trial && !canAccess(trial, feature);
        const active = pathname === to && !soon;
        return (
          <Link
            key={label}
            to={to}
            id={id}
            onClick={(e) => {
              if (locked) {
                e.preventDefault();
                setLockedLabel(label);
              }
            }}
            className={cn(
              "group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-all duration-300",
              active
                ? "bg-gold-soft text-foreground ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground hover:translate-x-0.5",
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
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
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

          <div className="relative hidden w-full max-w-md md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Buscar pedidos, itens, mesas…"
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-[oklch(0.78_0.13_84_/_0.5)]"
            />
          </div>

          <div className="md:hidden">
            <FluxLogo />
          </div>

          <div className="flex items-center gap-2">
            <button className="rounded-xl border border-border bg-surface p-2.5 text-muted-foreground transition hover:text-foreground hover:-translate-y-0.5">
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-6 md:py-8">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      <UpgradeProModal
        open={lockedLabel !== null}
        featureLabel={lockedLabel}
        onClose={() => setLockedLabel(null)}
      />
    </div>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  QrCode,
  ChefHat,
  Settings,
  LogOut,
  Bell,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FluxLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  to: "/dashboard" | "/menu" | "/onboarding";
  icon: typeof LayoutDashboard;
  soon?: boolean;
};

const NAV: NavItem[] = [
  { label: "Overview", to: "/dashboard", icon: LayoutDashboard },
  { label: "Orders", to: "/dashboard", icon: ClipboardList, soon: true },
  { label: "Menu", to: "/menu", icon: UtensilsCrossed },
  { label: "Kitchen", to: "/dashboard", icon: ChefHat, soon: true },
  { label: "QR Codes", to: "/dashboard", icon: QrCode, soon: true },
  { label: "Settings", to: "/dashboard", icon: Settings, soon: true },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const initials = (user?.user_metadata?.display_name || user?.email || "U")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="px-6 pb-6 pt-7">
          <FluxLogo />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ label, to, icon: Icon, soon }) => {
            const active = pathname === to && !soon;
            return (
              <Link
                key={label}
                to={to}
                className={cn(
                  "group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition",
                  active
                    ? "bg-gold-soft text-foreground ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon className={cn("h-4 w-4", active && "text-primary")} />
                  {label}
                </span>
                {soon && (
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
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
              title="Sign out"
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-background hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-6 py-4 backdrop-blur">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search orders, items, tables…"
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-[oklch(0.78_0.13_84_/_0.5)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-xl border border-border bg-surface p-2.5 text-muted-foreground transition hover:text-foreground">
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}

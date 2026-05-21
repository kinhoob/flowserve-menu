import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, DollarSign, Receipt, Users, Flame } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useRestaurant } from "@/features/restaurant/use-restaurant";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — Flux" }],
  }),
  component: DashboardPage,
});

const STATS = [
  { label: "Revenue today", value: "$0", delta: "—", icon: DollarSign },
  { label: "Orders today", value: "0", delta: "—", icon: Receipt },
  { label: "Active tables", value: "0 / 0", delta: "—", icon: Users },
  { label: "Top item", value: "—", delta: "Setup pending", icon: Flame },
];

function DashboardPage() {
  const { user } = useAuth();
  const { data: restaurant } = useRestaurant();
  const name = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "there";
  const ctaTo = restaurant ? "/menu" : "/onboarding";
  const ctaLabel = restaurant ? "Manage your menu" : "Set up your restaurant";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      {/* Welcome */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Overview</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">
            Good evening, <span className="text-gradient-gold italic">{name}</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Here's how your venue is performing today.
          </p>
        </div>
        <Link
          to={ctaTo}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          {ctaLabel}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map(({ label, value, delta, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-surface p-5 transition hover:border-[oklch(0.78_0.13_84_/_0.3)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 font-display text-3xl tracking-tight">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{delta}</div>
          </div>
        ))}
      </div>

      {/* Two-up */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl tracking-tight">Revenue (7 days)</h2>
              <p className="text-xs text-muted-foreground">
                Start taking orders to populate this chart.
              </p>
            </div>
            <span className="rounded-full bg-gold-soft px-3 py-1 text-xs text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
              Live
            </span>
          </div>
          <div className="mt-6 flex h-56 items-end gap-2">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-md bg-gradient-to-t from-[oklch(0.78_0.13_84_/_0.05)] to-[oklch(0.78_0.13_84_/_0.25)]"
                style={{ height: `${20 + Math.sin(i * 0.7) * 18 + i * 2}%` }}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-xl tracking-tight">Get started</h2>
          <p className="mt-1 text-xs text-muted-foreground">Complete these steps to go live.</p>
          <ul className="mt-5 space-y-3 text-sm">
            {[
              "Create your restaurant profile",
              "Add menu categories & items",
              "Generate QR codes for tables",
              "Open the kitchen panel",
            ].map((step, i) => (
              <li
                key={step}
                className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recent */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl tracking-tight">Recent activity</h2>
          <span className="text-xs text-muted-foreground">No activity yet</span>
        </div>
        <div className="mt-8 flex flex-col items-center justify-center py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-4 text-sm font-medium">No orders yet</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            When guests scan a QR and place an order, you'll see it appear here in real time.
          </p>
        </div>
      </div>
    </div>
  );
}

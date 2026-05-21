import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, QrCode, ChefHat, BarChart3, Sparkles } from "lucide-react";
import { FluxLogo } from "@/components/brand/logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flux — Digital Menus for Bars & Restaurants" },
      {
        name: "description",
        content:
          "QR ordering, kitchen display, and real-time operations. Flux is the digital menu platform for modern hospitality.",
      },
    ],
  }),
  component: LandingPage,
});

const features = [
  {
    icon: QrCode,
    title: "QR ordering",
    body: "Generate branded QR codes per table. Guests scan, browse, and order in seconds — no app required.",
  },
  {
    icon: ChefHat,
    title: "Kitchen display",
    body: "A live, kanban-style ticket board for your bar and kitchen. Status changes sync instantly.",
  },
  {
    icon: BarChart3,
    title: "Operations dashboard",
    body: "Revenue, popular items, table activity — every signal you need, surfaced in one premium dashboard.",
  },
];

function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid-faint [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.78_0.13_84_/_0.18),transparent)] blur-2xl"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <FluxLogo />
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">Product</a>
          <a href="#why" className="transition hover:text-foreground">Why Flux</a>
          <a href="#pricing" className="transition hover:text-foreground">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            search={{ mode: "login" }}
            className="hidden rounded-xl px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Get started
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-6">
        {/* Hero */}
        <section className="pb-28 pt-20 md:pb-40 md:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Now in private beta
            </span>
            <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight md:text-7xl">
              The operating system <br className="hidden md:block" />
              for{" "}
              <span className="text-gradient-gold italic">modern hospitality</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-balance text-base text-muted-foreground md:text-lg">
              Flux turns every table into a checkout. QR menus, live kitchen tickets,
              and a dashboard that finally feels worthy of the room.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Start free trial
                <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm text-foreground/90 backdrop-blur transition hover:bg-surface"
              >
                See the product
              </a>
            </div>
          </div>

          {/* Visual frame */}
          <div className="relative mx-auto mt-20 max-w-5xl">
            <div className="rounded-3xl border border-border bg-surface/70 p-2 shadow-[0_60px_120px_-40px_oklch(0_0_0_/_0.8)] backdrop-blur">
              <div className="overflow-hidden rounded-2xl border border-border bg-background">
                <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.55_0.18_25)]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.78_0.13_84)]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.66_0.13_152)]" />
                  <span className="ml-3 text-xs text-muted-foreground">flux.app / dashboard</span>
                </div>
                <div className="grid grid-cols-12 gap-4 p-6">
                  <div className="col-span-3 space-y-3">
                    {["Overview", "Orders", "Menu", "Tables", "Analytics"].map((label, i) => (
                      <div
                        key={label}
                        className={`rounded-lg px-3 py-2 text-xs ${
                          i === 0
                            ? "bg-gold-soft text-foreground ring-1 ring-[oklch(0.78_0.13_84_/_0.35)]"
                            : "text-muted-foreground"
                        }`}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="col-span-9 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: "Revenue today", value: "$3,284" },
                        { label: "Orders", value: "147" },
                        { label: "Active tables", value: "12 / 18" },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-xl border border-border bg-surface p-4"
                        >
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            {stat.label}
                          </div>
                          <div className="mt-2 font-display text-2xl">{stat.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="h-40 rounded-xl border border-border bg-gradient-to-b from-surface to-background" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-primary">Built for service</p>
            <h2 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">
              Three surfaces. One pour.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Flux unifies the guest, the kitchen, and the operator behind a single, opinionated system.
            </p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-2xl border border-border bg-surface/80 p-6 transition hover:border-[oklch(0.78_0.13_84_/_0.4)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-2xl tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Why */}
        <section id="why" className="py-24">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-primary">Why Flux</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">
                Hospitality deserves better software.
              </h2>
              <p className="mt-5 text-muted-foreground">
                Most ordering tools look like they were built in a meeting room. Flux is built
                like a product you'd be proud to put on the table — quiet, fast, and finished.
              </p>
              <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                {[
                  "Multi-tenant architecture, one account per venue",
                  "Real-time kitchen sync — no polling, no stale orders",
                  "Designed for tablets, phones, and back-office laptops",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-border bg-surface p-8">
              <blockquote className="font-display text-2xl leading-snug tracking-tight">
                "We replaced three tools with Flux. Service got 22% faster and the menu finally
                matches the room."
              </blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[oklch(0.86_0.12_84)] to-[oklch(0.4_0.05_60)]" />
                <div>
                  <div className="text-sm font-medium">Mara Vance</div>
                  <div className="text-xs text-muted-foreground">GM, Atelier Bar — Lisbon</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="pricing" className="py-24">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-12 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.78_0.13_84_/_0.18),transparent_60%)]"
            />
            <div className="relative">
              <h2 className="font-display text-4xl tracking-tight md:text-5xl">
                Open Flux for your venue.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
                Start with a free trial. Bring your menu, your QR codes, and your team —
                we'll take care of the rest.
              </p>
              <div className="mt-8">
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  Create your account
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-7xl px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row">
          <FluxLogo className="text-base" />
          <p>© {new Date().getFullYear()} Flux Labs. Crafted for hospitality.</p>
        </div>
      </footer>
    </div>
  );
}

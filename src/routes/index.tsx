import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, QrCode, ChefHat, BarChart3, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { FluxLogo } from "@/components/brand/logo";
import { FadeIn } from "@/components/motion/page-transition";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flux — Cardápios digitais para bares e restaurantes" },
      {
        name: "description",
        content:
          "Pedidos via QR, painel da cozinha e operação em tempo real. Flux é a plataforma de cardápio digital para a hospitalidade moderna.",
      },
    ],
  }),
  component: LandingPage,
});

const features = [
  {
    icon: QrCode,
    title: "Pedidos por QR",
    body: "Gere QR codes personalizados por mesa. O cliente escaneia, navega e pede em segundos — sem app.",
  },
  {
    icon: ChefHat,
    title: "Painel da cozinha",
    body: "Quadro Kanban ao vivo para o bar e a cozinha. Mudanças de status sincronizam instantaneamente.",
  },
  {
    icon: BarChart3,
    title: "Operação no ponto",
    body: "Receita, itens populares, atividade nas mesas — todo sinal que você precisa em um dashboard premium.",
  },
];

function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid-faint [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.78_0.13_84_/_0.18),transparent)] blur-2xl"
      />

      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6"
      >
        <FluxLogo />
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">Produto</a>
          <a href="#why" className="transition hover:text-foreground">Por que Flux</a>
          <a href="#pricing" className="transition hover:text-foreground">Planos</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            search={{ mode: "login" }}
            className="hidden rounded-xl px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground sm:inline-flex"
          >
            Entrar
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 hover:-translate-y-0.5"
          >
            Começar agora
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-6">
        <section className="pb-28 pt-20 md:pb-40 md:pt-32">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
            }}
            className="mx-auto max-w-3xl text-center"
          >
            <motion.span
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Beta privado em andamento
            </motion.span>
            <motion.h1
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 font-display text-5xl leading-[1.05] tracking-tight md:text-7xl"
            >
              O sistema operacional <br className="hidden md:block" />
              da{" "}
              <span className="text-gradient-gold italic">hospitalidade moderna</span>
            </motion.h1>
            <motion.p
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mt-6 max-w-xl text-balance text-base text-muted-foreground md:text-lg"
            >
              O Flux transforma cada mesa em um checkout. Cardápios via QR, comandas em tempo real
              e um dashboard à altura do salão.
            </motion.p>
            <motion.div
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 hover:-translate-y-0.5"
              >
                Iniciar teste grátis
                <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm text-foreground/90 backdrop-blur transition hover:bg-surface"
              >
                Conhecer o produto
              </a>
            </motion.div>
          </motion.div>

          <FadeIn delay={0.2}>
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
                      {["Visão geral", "Pedidos", "Cardápio", "Mesas", "Análises"].map((label, i) => (
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
                          { label: "Receita hoje", value: "R$ 3.284" },
                          { label: "Pedidos", value: "147" },
                          { label: "Mesas ativas", value: "12 / 18" },
                        ].map((stat) => (
                          <div key={stat.label} className="rounded-xl border border-border bg-surface p-4">
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
          </FadeIn>
        </section>

        <section id="features" className="py-24">
          <FadeIn>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-primary">Feito para o serviço</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">
                Três superfícies. Uma só operação.
              </h2>
              <p className="mt-4 text-muted-foreground">
                O Flux unifica o cliente, a cozinha e o gestor por trás de um sistema único e elegante.
              </p>
            </div>
          </FadeIn>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, title, body }, i) => (
              <FadeIn key={title} delay={0.1 + i * 0.08}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-surface/80 p-6 hover-lift hover:border-[oklch(0.78_0.13_84_/_0.4)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 font-display text-2xl tracking-tight">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        <section id="why" className="py-24">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <FadeIn>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary">Por que Flux</p>
                <h2 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">
                  A hospitalidade merece um software melhor.
                </h2>
                <p className="mt-5 text-muted-foreground">
                  A maioria das ferramentas de pedido parece ter sido feita em sala de reunião. O Flux
                  é construído como um produto digno da sua mesa — silencioso, rápido e bem-acabado.
                </p>
                <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                  {[
                    "Arquitetura multi-tenant, uma conta por estabelecimento",
                    "Sincronização em tempo real com a cozinha — sem polling, sem pedido perdido",
                    "Pensado para tablets, celulares e laptops do escritório",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
            <FadeIn delay={0.15}>
              <div className="rounded-3xl border border-border bg-surface p-8 hover-lift">
                <blockquote className="font-display text-2xl leading-snug tracking-tight">
                  "Substituímos três ferramentas pelo Flux. O serviço ficou 22% mais rápido e o cardápio
                  finalmente combina com o salão."
                </blockquote>
                <div className="mt-6 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[oklch(0.86_0.12_84)] to-[oklch(0.4_0.05_60)]" />
                  <div>
                    <div className="text-sm font-medium">Mara Vance</div>
                    <div className="text-xs text-muted-foreground">GM, Atelier Bar — Lisboa</div>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        <section id="pricing" className="py-24">
          <FadeIn>
            <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-12 text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.78_0.13_84_/_0.18),transparent_60%)]"
              />
              <div className="relative">
                <h2 className="font-display text-4xl tracking-tight md:text-5xl">
                  Abra o Flux para o seu salão.
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
                  Comece com um teste grátis. Traga seu cardápio, seus QR codes e sua equipe —
                  o resto a gente cuida.
                </p>
                <div className="mt-8">
                  <Link
                    to="/auth"
                    search={{ mode: "signup" }}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 hover:-translate-y-0.5"
                  >
                    Criar minha conta
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </FadeIn>
        </section>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-7xl px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row">
          <FluxLogo className="text-base" />
          <p>© {new Date().getFullYear()} Flux Labs. Feito para a hospitalidade.</p>
        </div>
      </footer>
    </div>
  );
}

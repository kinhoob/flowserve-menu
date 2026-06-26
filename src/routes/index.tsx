import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  QrCode,
  ChefHat,
  BarChart3,
  Sparkles,
  Check,
  Zap,
  Clock,
  Smartphone,
  Radio,
  ShieldCheck,
  Menu as MenuIcon,
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { motion } from "framer-motion";
import { FluxLogo } from "@/components/brand/logo";
import { FadeIn } from "@/components/motion/page-transition";
import { ScrollToTop } from "@/components/ui/scroll-to-top";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flux — A evolução do atendimento" },
      {
        name: "description",
        content:
          "O sistema operacional da hospitalidade moderna. Reduza o tempo de espera, transforme seu salão em uma engrenagem perfeita.",
      },
    ],
  }),
  component: LandingPage,
});

const partners = ["ATELIER", "MARÉ", "VINHO & SAL", "OBRA PRIMA", "CASA DOURADA", "BAR NOIR"];

type Plan = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  featured: boolean;
  badge: string | null;
  comingSoon: boolean;
  slug?: "basic" | "essential" | "pro";
};

const plans: Plan[] = [
  {
    name: "Basic",
    price: "R$ 30",
    period: "/mês",
    description: "Cardápio Digital Essencial. Apenas visualização — sem pedidos ou chamados.",
    features: [
      "Cardápio digital ilimitado",
      "QR Code para o salão",
      "Atualizações em tempo real",
      "Sem pedidos ou chamado de garçom",
    ],
    cta: "Começar agora",
    featured: false,
    badge: null,
    comingSoon: false,
    slug: "basic",
  },
  {
    name: "Essential",
    price: "R$ 99",
    period: "/mês",
    description: "Operação Digital. Pedidos via QR Code e Painel da Cozinha.",
    features: [
      "Pedidos por QR Code",
      "KDS para cozinha e bar",
      "Cardápio digital ilimitado",
      "Até 5 QR Codes",
      "Suporte por email",
    ],
    cta: "Começar grátis",
    featured: false,
    badge: null,
    comingSoon: false,
    slug: "essential",
  },
  {
    name: "Pro",
    price: "R$ 199",
    period: "/mês",
    description: "Gestão Total. Tudo do Essential mais a operação de salão.",
    features: [
      "QR Codes ilimitados",
      "Rota do Garçom (lançamento rápido)",
      "Análises de pico e ticket médio",
      "Alertas sonoros em tempo real",
      "Suporte prioritário",
    ],
    cta: "Iniciar teste grátis",
    featured: true,
    badge: "Mais Popular",
    comingSoon: false,
    slug: "pro",
  },
  {
    name: "Enterprise",
    price: "Personalizado",
    period: "",
    description: "Soluções Customizadas para redes e operações multi-unidade.",
    features: [
      "Multi-unidades centralizado",
      "Integrações sob medida",
      "SLA dedicado e onboarding",
      "Gerente de conta exclusivo",
    ],
    cta: "Entrar na Lista de Espera",
    featured: false,
    badge: "Em breve",
    comingSoon: true,
  },
];

const STRIPE_PAYMENT_LINKS: Record<"basic" | "essential" | "pro", string> = {
  basic: "https://buy.stripe.com/test_14A28tbqigv26e97ajdjO02",
  essential: "https://buy.stripe.com/test_cNi5kFamegv27idbqzdjO01",
  pro: "https://buy.stripe.com/test_5kQ14pbqiceM461bqzdjO00",
};

function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid-faint [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[920px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.78_0.13_84_/_0.22),transparent)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[40%] -left-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,oklch(0.55_0.18_25_/_0.12),transparent)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[70%] -right-40 h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,oklch(0.6_0.15_220_/_0.1),transparent)] blur-3xl"
      />

      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6"
      >
        <div className="flex items-center gap-2">
          <FluxLogo />
          <span className="inline-flex items-center rounded-full border border-[oklch(0.78_0.13_84_/_0.4)] bg-gold-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            Beta
          </span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">
            Produto
          </a>
          <a href="#why" className="transition hover:text-foreground">
            Por que Flux?
          </a>
          <a href="#pricing" className="transition hover:text-foreground">
            Planos
          </a>
          <a href="#faq" className="transition hover:text-foreground">
            FAQ
          </a>
          <Link to="/privacidade" className="transition hover:text-foreground">
            Privacidade
          </Link>
          <Link to="/termos" className="transition hover:text-foreground">
            Termos
          </Link>
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
            className="group inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_30px_-12px_oklch(0.78_0.13_84_/_0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-12px_oklch(0.78_0.13_84_/_0.7)] hover:opacity-95"
          >
            Começar agora
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </motion.header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-6">
        {/* HERO */}
        <section className="pb-28 pt-20 md:pb-40 md:pt-28">
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
              <Sparkles className="h-3.5 w-3.5 text-primary" />A plataforma escolhida pela hospitalidade moderna
            </motion.span>
            <motion.h1
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 font-display text-5xl leading-[1.02] tracking-tight md:text-7xl"
            >
              A evolução do atendimento. <br className="hidden md:block" />
              Onde a <span className="text-gradient-gold italic">agilidade encontra</span> a hospitalidade.
            </motion.h1>
            <motion.p
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mt-6 max-w-xl text-balance text-base text-muted-foreground md:text-lg"
            >
              Reduza o tempo de espera em até 40% e transforme seu salão em uma engrenagem perfeita. Pedidos por QR,
              comandas em tempo real e analytics à altura da sua marca.
            </motion.p>
            <motion.div
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_18px_40px_-15px_oklch(0.78_0.13_84_/_0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_25px_60px_-18px_oklch(0.78_0.13_84_/_0.75)]"
              >
                Iniciar teste grátis
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm text-foreground/90 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-[oklch(0.78_0.13_84_/_0.4)] hover:bg-surface"
              >
                Conhecer o produto
              </a>
            </motion.div>
          </motion.div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="border-y border-border/60 py-12">
          <FadeIn>
            <p className="text-center text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Operando salões em mais de 80 cidades
            </p>
            <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-6">
              {partners.map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-center font-display text-sm tracking-[0.25em] text-muted-foreground/60 transition hover:text-foreground"
                >
                  {name}
                </div>
              ))}
            </div>
          </FadeIn>
        </section>

        {/* BENTO FEATURES */}
        <section id="features" className="py-24">
          <FadeIn>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-primary">Feito para o serviço</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">
                Cada bloco. Uma vantagem competitiva.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Tudo o que o seu salão precisa para operar como uma máquina silenciosa — e elegante.
              </p>
            </div>
          </FadeIn>

          <div className="mt-14 grid auto-rows-[12rem] grid-cols-1 gap-4 md:grid-cols-3 md:auto-rows-[14rem]">
            {/* Big card */}
            <FadeIn className="md:col-span-2 md:row-span-2">
              <BentoCard
                icon={QrCode}
                title="Pedidos por QR Code"
                body="O cliente escaneia, navega e pede em segundos. Sem app, sem fricção, sem fila no caixa."
                size="lg"
                accent
              />
            </FadeIn>

            <FadeIn delay={0.05}>
              <BentoCard
                icon={Clock}
                title="Reduza a espera em 40%"
                body="Pedidos vão direto à cozinha. O garçom volta a ser anfitrião."
              />
            </FadeIn>

            <FadeIn delay={0.1}>
              <BentoCard
                icon={ChefHat}
                title="KDS em tempo real"
                body="Kanban ao vivo para bar e cozinha. Zero pedido perdido."
              />
            </FadeIn>

            <FadeIn delay={0.15}>
              <BentoCard
                icon={Radio}
                title="Sincronia instantânea"
                body="Atualizações chegam à equipe em milissegundos. Sem refresh, sem polling."
              />
            </FadeIn>

            <FadeIn delay={0.2}>
              <BentoCard
                icon={BarChart3}
                title="Analytics de pico"
                body="Veja o ticket médio, horários quentes e itens campeões em tempo real."
              />
            </FadeIn>

            <FadeIn delay={0.25}>
              <BentoCard
                icon={Smartphone}
                title="Modo garçom"
                body="Lançamento rápido com uma mão. Pensado para tablets e celulares."
              />
            </FadeIn>

            <FadeIn delay={0.3}>
              <BentoCard
                icon={ShieldCheck}
                title="Multi-tenant seguro"
                body="Uma conta por estabelecimento. Dados isolados, infraestrutura premium."
              />
            </FadeIn>
          </div>
        </section>

        {/* WHY */}
        <section id="why" className="py-24">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <FadeIn>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary">Por que Flux?</p>
                <h2 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">
                  A hospitalidade merece um software à sua altura.
                </h2>
                <p className="mt-5 text-muted-foreground">
                  Construímos o Flux como se fosse parte do seu salão — silencioso, rápido, bem-acabado. Não é uma
                  ferramenta corporativa adaptada. É um produto pensado para a mesa.
                </p>
                <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                  {[
                    "Arquitetura dedicada por estabelecimento",
                    "Sincronização realtime sem pedido perdido",
                    "Otimizado para tablets, celulares e desktop",
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
              <div className="relative rounded-3xl border border-border bg-surface p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[oklch(0.78_0.13_84_/_0.4)]">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(closest-side,oklch(0.78_0.13_84_/_0.08),transparent_70%)]"
                />
                <blockquote className="relative font-display text-2xl leading-snug tracking-tight">
                  "Substituímos três ferramentas pelo Flux. O serviço ficou 22% mais rápido e o cardápio finalmente
                  combina com o salão."
                </blockquote>
                <div className="relative mt-6 flex items-center gap-3">
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

        {/* PRICING */}
        <section id="pricing" className="py-24">
          <FadeIn>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-primary">Planos</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">Escolha o tamanho do seu salão.</h2>
              <p className="mt-4 text-muted-foreground">Sem fidelidade, sem taxa de setup. Cancele quando quiser.</p>
            </div>
          </FadeIn>

          <div className="mt-14 grid gap-6 md:grid-cols-2 md:items-stretch lg:grid-cols-4">
            {plans.map((plan, i) => (
              <FadeIn key={plan.name} delay={0.08 * i}>
                <div className="relative h-full">
                  {plan.featured && (
                    <>
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -inset-1 rounded-[2rem] bg-[conic-gradient(from_180deg_at_50%_50%,oklch(0.78_0.13_84_/_0.55),oklch(0.55_0.1_60_/_0.2),oklch(0.78_0.13_84_/_0.55))] opacity-80 blur-md"
                      />
                      <motion.div
                        aria-hidden
                        animate={{ opacity: [0.35, 0.75, 0.35] }}
                        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                        className="pointer-events-none absolute -inset-2 rounded-[2.25rem] bg-[radial-gradient(closest-side,oklch(0.78_0.13_84_/_0.45),transparent_70%)] blur-2xl"
                      />
                    </>
                  )}
                  <div
                    className={`group relative flex h-full flex-col rounded-3xl border p-8 transition-all duration-300 hover:-translate-y-1 ${
                      plan.featured
                        ? "border-[oklch(0.78_0.13_84_/_0.5)] bg-gradient-to-b from-[oklch(0.78_0.13_84_/_0.12)] to-surface shadow-[0_40px_80px_-30px_oklch(0.78_0.13_84_/_0.5)]"
                        : plan.comingSoon
                          ? "border-dashed border-border bg-surface/60"
                          : "border-border bg-surface/80 hover:border-[oklch(0.78_0.13_84_/_0.3)] hover:shadow-[0_30px_60px_-25px_oklch(0_0_0_/_0.6)]"
                    }`}
                  >
                    {plan.badge && (
                      <div
                        className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-[0_10px_30px_-10px_oklch(0_0_0_/_0.6)] ${
                          plan.featured
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {plan.badge}
                      </div>
                    )}

                    <div>
                      <h3 className="font-display text-2xl tracking-tight">{plan.name}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                    </div>

                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="font-display text-4xl tracking-tight">{plan.price}</span>
                      {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
                    </div>

                    <ul className="mt-8 space-y-3 text-sm">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${
                              plan.featured
                                ? "bg-primary text-primary-foreground"
                                : "bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]"
                            }`}
                          >
                            <Check className="h-3 w-3" />
                          </span>
                          <span className="text-foreground/85">{f}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto pt-10">
                      {plan.comingSoon ? (
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/40 px-5 py-3 text-sm font-medium text-muted-foreground"
                        >
                          {plan.cta}
                        </button>
                      ) : (
                        <a
                          href={plan.slug ? STRIPE_PAYMENT_LINKS[plan.slug] : "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`group/btn inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 ${
                            plan.featured
                              ? "bg-primary text-primary-foreground shadow-[0_15px_35px_-12px_oklch(0.78_0.13_84_/_0.6)] hover:shadow-[0_22px_45px_-15px_oklch(0.78_0.13_84_/_0.75)]"
                              : "border border-border bg-background text-foreground hover:border-[oklch(0.78_0.13_84_/_0.5)] hover:bg-surface"
                          }`}
                        >
                          {plan.cta}
                          <ArrowUpRight className="h-4 w-4 transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-24">
          <FadeIn>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-primary">FAQ</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">Perguntas frequentes.</h2>
              <p className="mt-4 text-muted-foreground">
                Tudo o que você precisa saber antes de começar. Não achou sua dúvida?{" "}
                <a href="mailto:contato@flux.app" className="text-primary hover:underline">
                  fale com a gente
                </a>
                .
              </p>
            </div>
          </FadeIn>

          <div className="mx-auto mt-12 max-w-3xl space-y-3">
            {[
              {
                q: "Preciso instalar algum aplicativo?",
                a: "Não. O Flux roda 100% no navegador, tanto para o cliente final (via QR Code) quanto para o salão, cozinha e administração. Funciona em celular, tablet e desktop.",
              },
              {
                q: "Quanto tempo leva para colocar no ar?",
                a: "Em média 10 minutos. Você cria a conta, cadastra o cardápio (ou importa), gera seus QR Codes e já pode receber pedidos.",
              },
              {
                q: "Tem fidelidade ou taxa de setup?",
                a: "Não. Os planos são mensais, sem fidelidade e sem taxa de setup. Cancele quando quiser direto no painel.",
              },
              {
                q: "Qual a diferença entre Basic, Essential e Pro?",
                a: "Basic é só cardápio digital (visualização). Essential libera pedidos por QR Code e KDS de cozinha, com até 5 QR Codes. Pro inclui QR Codes ilimitados, Rota do Garçom, análises de pico e suporte prioritário.",
              },
              {
                q: "Os dados do meu estabelecimento ficam seguros?",
                a: "Sim. Cada estabelecimento opera em ambiente multi-tenant isolado, com criptografia em trânsito, controle de acesso por função e backups contínuos. Conformidade com a LGPD.",
              },
              {
                q: "Posso testar antes de pagar?",
                a: "Sim. Todos os planos pagos começam com período de teste grátis. Você só é cobrado se decidir continuar.",
              },
              {
                q: "O Flux emite nota fiscal?",
                a: "A emissão de NFC-e/SAT está no roadmap. Hoje o Flux opera como sistema de comanda, pedidos e KDS — e exporta os dados para o seu sistema fiscal.",
              },
              {
                q: "Como funciona o suporte?",
                a: "Essential tem suporte por email em horário comercial. Pro tem suporte prioritário com tempo de resposta menor. Enterprise tem gerente de conta dedicado.",
              },
            ].map((item, i) => (
              <FadeIn key={item.q} delay={0.04 * i}>
                <details className="group rounded-2xl border border-border bg-surface/60 px-5 py-4 transition-all hover:border-[oklch(0.78_0.13_84_/_0.3)] open:border-[oklch(0.78_0.13_84_/_0.4)] open:bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground">
                    <span>{item.q}</span>
                    <span
                      aria-hidden
                      className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-border text-muted-foreground transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="py-24">
          <FadeIn>
            <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-12 text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.78_0.13_84_/_0.22),transparent_60%)]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-32 left-1/2 h-64 w-[120%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.55_0.1_60_/_0.18),transparent)] blur-3xl"
              />
              <div className="relative">
                <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  Pronto em menos de 10 minutos
                </div>
                <h2 className="mt-6 font-display text-4xl tracking-tight md:text-5xl">
                  A evolução do atendimento. <br className="hidden md:block" />
                  Onde a agilidade encontra a hospitalidade.
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
                  Comece com um teste grátis. Traga seu cardápio, sua equipe e suas mesas e o resto deixa que a gente
                  cuida.
                </p>
                <div className="mt-8">
                  <Link
                    to="/auth"
                    search={{ mode: "signup" }}
                    className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_18px_40px_-15px_oklch(0.78_0.13_84_/_0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_25px_60px_-18px_oklch(0.78_0.13_84_/_0.75)]"
                  >
                    Criar minha conta
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            </div>
          </FadeIn>
        </section>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-7xl px-6 py-10">
        <div className="flex flex-col gap-6 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <FluxLogo className="text-base" />
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href="#faq" className="transition hover:text-foreground">
              FAQ
            </a>
            <Link to="/privacidade" className="transition hover:text-foreground">
              Política de Privacidade
            </Link>
            <Link to="/termos" className="transition hover:text-foreground">
              Termos de Uso
            </Link>
            <a href="mailto:contato@flux.app" className="transition hover:text-foreground">
              Contato
            </a>
          </nav>
          <p>© {new Date().getFullYear()} Flux Labs. Feito para a hospitalidade.</p>
        </div>
      </footer>

      <ScrollToTop />
    </div>
  );
}

function BentoCard({
  icon: Icon,
  title,
  body,
  size = "md",
  accent = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  size?: "md" | "lg";
  accent?: boolean;
}) {
  return (
    <div
      className={`group relative h-full overflow-hidden rounded-3xl border p-6 transition-all duration-300 hover:-translate-y-1 ${
        accent
          ? "border-[oklch(0.78_0.13_84_/_0.35)] bg-gradient-to-br from-[oklch(0.78_0.13_84_/_0.12)] via-surface to-surface"
          : "border-border bg-surface/80 hover:border-[oklch(0.78_0.13_84_/_0.35)]"
      } hover:shadow-[0_30px_60px_-25px_oklch(0_0_0_/_0.7)]`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,oklch(0.78_0.13_84_/_0.18),transparent)] opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
      />
      <div className="relative flex h-full flex-col">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className={`mt-5 font-display tracking-tight ${size === "lg" ? "text-3xl md:text-4xl" : "text-xl"}`}>
          {title}
        </h3>
        <p className={`mt-2 leading-relaxed text-muted-foreground ${size === "lg" ? "text-base max-w-md" : "text-sm"}`}>
          {body}
        </p>
      </div>
    </div>
  );
}

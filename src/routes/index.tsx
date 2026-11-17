import { ArPreview } from "@/features/landing/ar-preview";
import { BetaBadge } from "@/components/brand/beta-badge";
import { FluxLogo } from "@/components/brand/logo";
import { ScrollReveal as FadeIn } from "@/features/landing/scroll-reveal";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DEMO_DISHES } from "@/features/demo/demo-data";
import { OperationPreview } from "@/features/demo/operation-preview";
import { plans } from "@/features/experience/plan-catalog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChefHat,
  Command,
  Heart,
  Leaf,
  Menu as MenuIcon,
  Plus,
  QrCode,
  Sparkles,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { useRef, useState } from "react";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flux Menu — Do primeiro toque à última mesa" },
      {
        name: "description",
        content:
          "Um cardápio que dá vontade de escolher. Uma operação que deixa o salão fluir. Explore o Flux Menu para bares e restaurantes.",
      },
    ],
  }),
  component: LandingPage,
});
const nav = [
  { href: "#experience", label: "A experiência" },
  { href: "#operation", label: "A operação" },
  { href: "#pricing", label: "Planos" },
  { href: "#faq", label: "Dúvidas" },
];
function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileSection = useRef<string | null>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 28 });
  const sectionScroll: ScrollIntoViewOptions = {
    behavior: reducedMotion ? "auto" : "smooth",
    block: "start",
  };
  return (
    <div className="flux-landing relative w-full min-w-0 min-h-screen overflow-x-clip bg-background text-foreground">
      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary"
      />
      <Link
        to="/"
        hash="main"
        resetScroll={false}
        hashScrollIntoView={sectionScroll}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </Link>
      <div
        aria-hidden
        className="flux-dot-grid pointer-events-none absolute inset-x-0 top-0 h-[900px] opacity-40 [mask-image:linear-gradient(black,transparent)]"
      />
      <header className="relative z-30 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-6 sm:px-8 lg:py-8">
        <Link to="/" aria-label="Flux Menu, início">
          <span className="flex items-center gap-3">
            <FluxLogo />
            <BetaBadge />
          </span>
        </Link>
        <nav
          aria-label="Principal"
          className="hidden items-center gap-8 text-xs text-muted-foreground lg:flex"
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              to="/"
              hash={item.href.slice(1)}
              resetScroll={false}
              hashScrollIntoView={sectionScroll}
              className="hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <Link
            to="/demo"
            search={{ view: "operation" }}
            className="inline-flex items-center gap-1.5 text-foreground"
          >
            Explorar produto
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            search={{ mode: "login" }}
            className="hidden rounded-xl px-4 py-3 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            Entrar
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="flux-button hidden border border-border bg-surface/70 text-foreground sm:inline-flex"
          >
            Começar agora
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Abrir navegação"
                className="rounded-xl border border-border p-3 lg:hidden"
              >
                <MenuIcon className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent
              className="border-border bg-background"
              onCloseAutoFocus={(event) => {
                const sectionId = mobileSection.current;
                if (!sectionId) return;
                event.preventDefault();
                mobileSection.current = null;
                requestAnimationFrame(() => {
                  const section = document.getElementById(sectionId);
                  if (!section) return;
                  section.tabIndex = -1;
                  section.focus({ preventScroll: true });
                  section.scrollIntoView(sectionScroll);
                });
              }}
            >
              <SheetTitle className="sr-only">Navegação do Flux Menu</SheetTitle>
              <div className="mb-10 mt-4">
                <FluxLogo />
              </div>
              <nav className="flex flex-col gap-2">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    to="/"
                    hash={item.href.slice(1)}
                    resetScroll={false}
                    hashScrollIntoView={sectionScroll}
                    onClick={() => {
                      mobileSection.current = item.href.slice(1);
                      setMobileOpen(false);
                    }}
                    className="rounded-xl px-4 py-4 text-sm hover:bg-surface"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  to="/demo"
                  search={{ view: "operation" }}
                  onClick={() => setMobileOpen(false)}
                  className="flux-button mt-4 bg-primary text-primary-foreground"
                >
                  Explorar demonstração
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/auth"
                  search={{ mode: "login" }}
                  className="flux-button border border-border"
                >
                  Entrar na minha conta
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main id="main">
        <section className="relative mx-auto grid max-w-7xl items-center gap-8 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-14 lg:pb-24 lg:pt-16">
          <div className="relative z-10 max-w-xl">
            <FadeIn y={10}>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#6b5b43]/40 bg-[#27221b]/65 px-3 py-1.5 text-[10px] font-medium tracking-wide text-[#d5c3a4]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#d5c3a4]" />
                Beta aberto · Vamos evoluir seu salão juntos.
              </div>
              <h1 className="font-display text-[clamp(2.65rem,5.1vw,4.65rem)] font-semibold leading-[1.08] tracking-[-.065em]">
                Mais sabor
                <br />
                na escolha.
                <br />
                <span className="text-primary">Mais fluidez</span>
                <br />
                no salão.
              </h1>
              <p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground sm:text-base">
                Um cardápio que convida. Pedidos que chegam à cozinha. Uma equipe que sabe o próximo
                passo. Tudo no mesmo fluxo.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/demo"
                  search={{ view: "operation" }}
                  className="flux-button bg-primary text-primary-foreground shadow-[0_10px_30px_-15px_#e7bc7080]"
                >
                  Explorar demonstração
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="flux-button border border-border bg-surface/60"
                >
                  Criar minha conta
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-[#d5c3a4]" />
                  Feito para o celular
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-[#d5c3a4]" />
                  Do pedido à mesa
                </span>
              </div>
            </FadeIn>
          </div>
          <div className="relative mx-auto w-full max-w-[610px] pb-16 pt-8 sm:pb-20 lg:pt-0">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-12 rounded-full bg-[radial-gradient(ellipse_at_center,#6b5b4330,transparent_65%)]"
            />
            <FadeIn delay={0.08} y={18}>
              <div className="relative rounded-3xl shadow-[0_35px_100px_-35px_#000b] sm:-rotate-1">
                <OperationPreview compact />
              </div>
            </FadeIn>
            <motion.div
              initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.65, delay: reducedMotion ? 0 : 0.3 }}
              className="absolute -bottom-2 right-2 w-[168px] rotate-3 rounded-[25px] border-[5px] border-[#6b5b43] bg-[#f1efe4] p-2.5 text-[#171614] shadow-[0_20px_70px_-20px_#000a] sm:right-5 sm:w-[195px]"
            >
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[#171614]" />
              <div className="mb-2 flex items-center justify-between px-1 text-[8px]">
                <span className="font-semibold">Casa do Flux</span>
                <span className="rounded-full bg-[#eee5d5] px-1.5 py-0.5">Mesa 01</span>
              </div>
              <div className="relative h-24 overflow-hidden rounded-xl sm:h-28">
                <img
                  src={DEMO_DISHES[0].image_url}
                  alt="Foto ilustrativa de um burger no exemplo de cardápio"
                  className="h-full w-full object-cover"
                />
                <span className="absolute right-2 top-2 rounded-full bg-[#faf8ee] p-1.5">
                  <Heart className="h-2.5 w-2.5" />
                </span>
              </div>
              <p className="mt-2 text-[10px] font-semibold">Burger da casa</p>
              <p className="mt-1 text-[8px] text-[#b8a586]">Feito para dar vontade.</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs font-bold">R$ 36,00</span>
                <span className="rounded-lg bg-[#27221b] p-1.5 text-[#f0eddd]">
                  <Plus className="h-3 w-3" />
                </span>
              </div>
              <p className="mt-2 text-[7px] text-[#b8a586]">Cardápio ilustrativo</p>
            </motion.div>
            <div className="absolute -left-1 bottom-10 hidden items-center gap-3 rounded-2xl border border-[#6b5b43]/40 bg-[#27221b] px-4 py-3 shadow-lg sm:flex">
              <div className="rounded-xl bg-[#b8a586]/15 p-2">
                <Check className="h-4 w-4 text-[#d5c3a4]" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-[#eee5d5]">Tudo conversando.</p>
                <p className="mt-0.5 text-[9px] text-[#d5c3a4]">Cliente, cozinha e equipe.</p>
              </div>
            </div>
          </div>
        </section>
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border/80 py-6">
            <p className="text-[10px] uppercase tracking-[.2em] text-muted-foreground">
              Feito para quem serve bem
            </p>
            <div className="flex flex-wrap gap-5 text-xs font-medium text-[#d5c3a4] sm:gap-9">
              {["Restaurantes", "Bares", "Cafés", "Bistrôs"].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <Link
              to="/"
              hash="experience"
              resetScroll={false}
              hashScrollIntoView={sectionScroll}
              aria-label="Conhecer a experiência"
              className="hidden h-8 w-8 items-center justify-center rounded-full border border-border sm:flex"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <section id="experience" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <FadeIn>
            <div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="flux-eyebrow text-primary">Cada toque importa</p>
                <h2 className="mt-4 font-display text-3xl leading-tight sm:text-5xl">
                  A experiência começa
                  <br />
                  <span className="text-[#b8a586]">antes da primeira garfada.</span>
                </h2>
              </div>
              <p className="max-w-xs text-sm leading-6 text-muted-foreground">
                Menos dúvida para escolher. Mais espaço para aproveitar o momento.
              </p>
            </div>
          </FadeIn>
          <div className="grid gap-4 md:grid-cols-3">
            <FadeIn direction="left" className="min-w-0 md:col-span-2">
              <div className="flux-panel transition-[border-color,box-shadow] duration-500 hover:border-primary/30 hover:shadow-[0_16px_60px_-30px_#e7bc7030] grid h-full overflow-hidden sm:grid-cols-2">
                <div className="flex flex-col p-7">
                  <span className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <UtensilsCrossed className="h-5 w-5" />
                  </span>
                  <span className="flux-eyebrow text-muted-foreground">
                    Escolher também é aproveitar
                  </span>
                  <h3 className="mt-3 font-display text-2xl">
                    Um cardápio
                    <br />
                    com apetite.
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    Fotos, descrição da porção e adicionais. Busca inteligente, favoritos e filtros
                    para encontrar o prato certo.
                  </p>
                  <Link
                    to="/demo"
                    search={{ view: "menu" }}
                    className="mt-7 inline-flex w-fit items-center gap-2 text-xs font-medium text-primary"
                  >
                    Abrir o cardápio demonstrativo
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="relative m-3 flex min-h-72 flex-col justify-end overflow-hidden rounded-2xl bg-[#27221b]">
                  <img
                    loading="lazy"
                    src={DEMO_DISHES[2].image_url}
                    alt="Foto ilustrativa de um bowl com vegetais"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#171614]/95 via-transparent to-transparent" />
                  <div className="relative p-5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eee5d5] px-2.5 py-1 text-[9px] font-medium text-[#27221b]">
                      <Leaf className="h-3 w-3" />
                      Leve, fresco, do seu jeito.
                    </span>
                    <p className="mt-3 font-display text-xl text-white">Bowl da estação</p>
                    <p className="mt-1 text-[10px] text-white/70">
                      Foto e porção ilustrativas · 350 g
                    </p>
                  </div>
                </div>
              </div>
            </FadeIn>
            <FadeIn direction="right" delay={0.08}>
              <div className="flux-panel flex h-full flex-col p-7">
                <span className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-[#b8a586]/10 text-[#d5c3a4]">
                  <Box className="h-5 w-5" />
                </span>
                <span className="flux-eyebrow text-muted-foreground">Uma nova perspectiva</span>
                <h3 className="mt-3 font-display text-2xl">
                  O prato pode
                  <br />
                  ganhar a mesa.
                </h3>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Visualização 3D e realidade aumentada para aproximar a escolha da experiência de
                  servir.
                </p>
                <ArPreview />
                <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
                  Disponível para itens com modelos 3D cadastrados e medidas conferidas, em
                  aparelhos compatíveis.
                </p>
              </div>
            </FadeIn>
          </div>
        </section>
        <section id="operation" className="border-y border-border bg-[#171614]">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-20 lg:py-24">
            <FadeIn>
              <p className="flux-eyebrow text-primary">Bastidores em harmonia</p>
              <h2 className="mt-4 font-display text-3xl leading-tight sm:text-5xl">
                O salão acontece.
                <br />
                <span className="text-[#b8a586]">Você acompanha.</span>
              </h2>
              <p className="mt-5 text-sm leading-7 text-muted-foreground">
                Pedidos organizados por etapa. Mesas com status claro. Cozinha e atendimento olhando
                para o mesmo fluxo.
              </p>
              <div className="mt-7 space-y-4">
                {[
                  {
                    icon: ChefHat,
                    title: "Cozinha no ritmo certo",
                    text: "Novos pedidos, preparo e prontos para servir.",
                  },
                  {
                    icon: Users,
                    title: "Equipe com direção",
                    text: "Chamados e lançamentos vinculados às mesas.",
                  },
                  {
                    icon: Command,
                    title: "Menos cliques no caminho",
                    text: "Busca de páginas e atalhos de teclado no painel.",
                  },
                ].map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-border bg-surface p-2">
                      <Icon className="h-4 w-4 text-[#d5c3a4]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold">{title}</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to="/demo"
                search={{ view: "operation" }}
                className="flux-button mt-8 border border-border bg-surface"
              >
                Testar o fluxo de pedidos
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </FadeIn>
            <FadeIn direction="right" delay={0.08}>
              <OperationPreview compact />
            </FadeIn>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                n: "01",
                icon: QrCode,
                title: "Aponte. Explore. Escolha.",
                text: "O cliente abre o cardápio pelo QR Code e encontra o que procura.",
              },
              {
                n: "02",
                icon: ChefHat,
                title: "O pedido encontra o caminho.",
                text: "Os itens chegam organizados à operação, com adicionais e observações.",
              },
              {
                n: "03",
                icon: Heart,
                title: "A hospitalidade continua sua.",
                text: "Sua equipe cuida do que faz diferença: a experiência de estar à mesa.",
              },
            ].map(({ n, icon: Icon, title, text }, index) => (
              <FadeIn key={n} direction={index % 2 ? "right" : "left"} delay={index * 0.06}>
                <div className="flex items-center gap-3">
                  <span className="font-display text-3xl text-[#6b5b43]">{n}</span>
                  <div className="h-px flex-1 bg-border" />
                  <Icon className="h-4 w-4 text-[#d5c3a4]" />
                </div>
                <h3 className="mt-5 font-display text-lg">{title}</h3>
                <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">{text}</p>
              </FadeIn>
            ))}
          </div>
        </section>
        <section id="pricing" className="mx-auto max-w-7xl px-5 pb-20 pt-5 sm:px-8 lg:pb-28">
          <FadeIn>
            <div className="mx-auto mb-10 max-w-xl text-center">
              <p className="flux-eyebrow text-primary">Encontre seu ritmo</p>
              <h2 className="mt-4 font-display text-3xl sm:text-5xl">Seu tamanho. Seu fluxo.</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Do cardápio digital à operação completa do salão. Escolha o que faz sentido para o
                seu restaurante.
              </p>
            </div>
          </FadeIn>
          <div className="grid items-stretch gap-4 md:grid-cols-3">
            {plans
              .filter((plan) => !plan.comingSoon)
              .map((plan, index) => (
                <FadeIn
                  key={plan.name}
                  direction={index % 2 ? "right" : "left"}
                  delay={index * 0.06}
                >
                  <article
                    className={`relative flex h-full flex-col rounded-3xl border p-6 sm:p-8 ${plan.featured ? "border-[#e5dfca] bg-[#eee9d9] text-[#171614]" : "border-border bg-surface"}`}
                  >
                    {plan.featured && (
                      <span className="absolute -top-3 right-6 inline-flex items-center gap-1.5 rounded-full bg-[#b8a586] px-3 py-1 text-[9px] font-semibold text-white">
                        <Sparkles className="h-3 w-3" />
                        Operação completa
                      </span>
                    )}
                    <h3 className="font-display text-lg">{plan.name}</h3>
                    <p
                      className={`mt-3 min-h-10 text-xs leading-5 ${plan.featured ? "text-[#6b5b43]" : "text-muted-foreground"}`}
                    >
                      {plan.description}
                    </p>
                    <div className="my-6">
                      <span className="font-display text-4xl tracking-[-.06em]">{plan.price}</span>
                      <span
                        className={`ml-1 text-xs ${plan.featured ? "text-[#6b5b43]" : "text-muted-foreground"}`}
                      >
                        {plan.period}
                      </span>
                    </div>
                    <Link
                      to="/auth"
                      search={{ mode: "signup", redirect: `/settings?plan=${plan.slug}` }}
                      className={`flux-button w-full ${plan.featured ? "bg-[#27221b] text-[#f7f4ea]" : "border border-border bg-background/40 text-foreground"}`}
                    >
                      Escolher {plan.name}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <div className={`my-6 h-px ${plan.featured ? "bg-[#d4d5c3]" : "bg-border"}`} />
                    <ul className="space-y-3">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className={`flex items-start gap-2 text-xs leading-5 ${plan.featured ? "text-[#6b5b43]" : "text-muted-foreground"}`}
                        >
                          <Check
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${plan.featured ? "text-[#6b5b43]" : "text-[#d5c3a4]"}`}
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </article>
                </FadeIn>
              ))}
          </div>
          <p className="mt-6 text-center text-[10px] text-muted-foreground">
            Escolha do plano e condições de cobrança são confirmadas no checkout. Soluções para
            redes estão em planejamento.
          </p>
        </section>
        <section
          id="faq"
          className="mx-auto grid max-w-7xl gap-8 px-5 pb-20 sm:px-8 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]"
        >
          <FadeIn>
            <p className="flux-eyebrow text-primary">Antes de sentar à mesa</p>
            <h2 className="mt-4 font-display text-3xl">Ficou alguma dúvida?</h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Explore a demonstração para conhecer a experiência antes de configurar seu
              estabelecimento.
            </p>
          </FadeIn>
          <div className="space-y-2">
            {[
              {
                q: "O que significa estar em beta?",
                a: "O Flux está em evolução. Recursos e telas podem mudar e podem ocorrer falhas. Teste o fluxo de pedidos antes de usar no salão e mantenha uma alternativa de atendimento durante interrupções.",
              },
              {
                q: "Posso personalizar o cardápio com a minha marca?",
                a: "Sim. Ajuste cores, fontes, imagens e apresentação dos produtos na personalização. Confira a prévia e salve para publicar as alterações.",
              },
              {
                q: "Como começo no meu restaurante?",
                a: "Crie sua conta, cadastre categorias e produtos, personalize o cardápio e configure mesas e horários. Abra o QR Code em outro celular e faça um pedido de teste antes de disponibilizá-lo aos clientes.",
              },
              {
                q: "É possível pedir fora do restaurante?",
                a: "O QR Code abre o cardápio. O envio respeita os horários configurados e o código temporário da mesa quando exigido. Essas medidas reduzem pedidos indevidos, mas não comprovam a localização física do cliente.",
              },
              {
                q: "Preciso de internet?",
                a: "Sim. Cliente e equipe precisam de conexão para enviar e acompanhar pedidos. Em caso de interrupção, confirme o recebimento com a equipe antes de reenviar.",
              },
              {
                q: "Como funcionam teste e contratação?",
                a: "O prazo de teste aparece na conta. Preços, recursos e condições de renovação são apresentados antes de confirmar a contratação. A demonstração pública pode ser explorada sem contratar.",
              },
              {
                q: "O cliente precisa baixar um aplicativo?",
                a: "O cardápio e o pedido funcionam pelo navegador do celular, a partir do QR Code. Não é necessário instalar um aplicativo próprio do Flux.",
              },
              {
                q: "A realidade aumentada funciona com qualquer foto?",
                a: "A visualização na mesa precisa de um modelo 3D do prato, com medidas conferidas, e de um aparelho compatível. Uma foto comum continua sendo exibida normalmente no cardápio.",
              },
              {
                q: "A demonstração faz pedidos de verdade?",
                a: "Não. Ela usa dados ilustrativos e simula o fluxo localmente. Você pode escolher pratos, calcular uma divisão e avançar o preparo sem enviar pedidos ou realizar cobranças.",
              },
              {
                q: "O Flux substitui meu sistema fiscal?",
                a: "O Flux organiza cardápio, pedidos e atendimento. Emissão de documentos fiscais e integrações com outros sistemas não estão incluídas nesta versão.",
              },
            ].map((item, index) => (
              <FadeIn key={item.q} direction={index % 2 ? "right" : "left"}>
                <details className="group rounded-2xl border border-border bg-surface/60 px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                    <span>{item.q}</span>
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
                  </summary>
                  <p className="mt-3 pr-6 text-sm leading-6 text-muted-foreground">{item.a}</p>
                </details>
              </FadeIn>
            ))}
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-col border-t border-border/70 justify-between gap-6 px-5 py-8 text-[10px] text-muted-foreground sm:px-8 md:flex-row md:items-center">
        <FluxLogo />
        <p>Feito para quem cuida de cada detalhe.</p>
        <nav aria-label="Informações legais" className="flex gap-5">
          <Link to="/privacidade" className="hover:text-foreground">
            Privacidade
          </Link>
          <Link to="/termos" className="hover:text-foreground">
            Termos de uso
          </Link>
        </nav>
      </footer>
      <ScrollToTop />
    </div>
  );
}

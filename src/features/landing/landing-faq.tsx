import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Plus, MessageCircle, Sparkles } from "lucide-react";
import { FAQ_ITEMS } from "./faq-data";
import { ScrollReveal } from "./scroll-reveal";

const categories = ["Primeiros passos", "No salão", "Planos e gestão"];

export function LandingFaq() {
  const [category, setCategory] = useState(0);
  const items = FAQ_ITEMS.filter((item) => item.category === category);
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="mx-auto max-w-7xl px-5 pb-24 pt-8 sm:px-8 lg:pb-28"
    >
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <ScrollReveal>
          <span className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 text-primary">
            <MessageCircle className="h-5 w-5" />
          </span>
          <p className="flux-eyebrow text-primary">Respostas sem complicação</p>
          <h2 id="faq-title" className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
            Mais clareza.
            <br />
            <span className="text-[#d5c3a4]">Menos dúvidas.</span>
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">
            Do primeiro QR Code à rotina do salão. Encontre aqui o que você precisa para começar com
            confiança.
          </p>
          <div className="mt-8 max-w-sm rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-5">
            <span className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Prefere ver na prática?
            </span>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              Explore o cardápio e acompanhe um pedido na demonstração, sem enviar pedidos reais.
            </p>
            <Link
              to="/demo"
              search={{ view: "menu" }}
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-primary"
            >
              Experimentar o Flux <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </ScrollReveal>
        <div className="min-w-0">
          <div
            role="group"
            aria-label="Filtrar perguntas por assunto"
            className="mb-6 flex flex-wrap gap-2"
          >
            {categories.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={category === i}
                onClick={() => setCategory(i)}
                className={`rounded-full border px-4 py-2.5 text-xs font-medium ${category === i ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-3xl border border-border bg-surface/40">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
              <p className="text-[10px] uppercase tracking-[.17em] text-primary">
                {categories[category]}
              </p>
              <span className="text-[10px] text-muted-foreground">{items.length} respostas</span>
            </div>
            {items.map((item, i) => (
              <details
                key={item.q}
                name="flux-faq"
                className="landing-faq group border-b border-border/70 last:border-b-0 open:bg-primary/[.035]"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-5 text-sm font-medium outline-offset-[-4px] focus-visible:outline-2 focus-visible:outline-primary sm:gap-4 sm:px-6 sm:py-6">
                  <span
                    aria-hidden
                    className="text-[10px] font-normal tabular-nums text-primary/60"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 leading-6 group-open:text-primary">{item.q}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground group-open:border-primary/30 group-open:text-primary">
                    <Plus className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-45" />
                  </span>
                </summary>
                <p className="px-5 pb-6 text-sm leading-7 text-muted-foreground sm:pl-14 sm:pr-14">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
          <p className="mt-4 px-1 text-[11px] leading-6 text-muted-foreground">
            Flux em beta · Os recursos disponíveis variam conforme o plano.
          </p>
        </div>
      </div>
    </section>
  );
}

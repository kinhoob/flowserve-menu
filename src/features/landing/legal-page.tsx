import { FluxLogo } from "@/components/brand/logo";
import { BetaBadge } from "@/components/brand/beta-badge";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

export function LegalPage({
  title,
  summary,
  sections,
}: {
  title: string;
  summary: string;
  sections: string[][];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-7 sm:px-8">
        <Link to="/" aria-label="Flux Menu, início">
          <FluxLogo />
        </Link>
        <Link
          to="/"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao início
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8">
        <BetaBadge />
        <h1 className="mt-6 max-w-3xl font-display text-4xl tracking-tight sm:text-6xl">{title}</h1>
        <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">{summary}</p>
        <p className="mt-4 text-xs text-muted-foreground">Versão de 16 de novembro de 2026</p>
        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[230px_1fr] lg:gap-16">
          <nav
            aria-label="Nesta página"
            className="rounded-2xl border border-border bg-surface/50 p-5 lg:sticky lg:top-6"
          >
            <p className="mb-4 text-[10px] uppercase tracking-widest text-primary">Nesta página</p>
            <ol className="space-y-3">
              {sections.map(([heading], i) => (
                <li key={heading}>
                  <a
                    href={`#secao-${i + 1}`}
                    className="text-xs leading-5 text-muted-foreground hover:text-primary"
                  >
                    {String(i + 1).padStart(2, "0")} · {heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="max-w-3xl space-y-9">
            {sections.map(([heading, body], i) => (
              <section
                id={`secao-${i + 1}`}
                key={heading}
                className="scroll-mt-8 border-b border-border/60 pb-9"
              >
                <span className="text-xs text-primary/70">{String(i + 1).padStart(2, "0")}</span>
                <h2 className="mt-2 font-display text-xl sm:text-2xl">{heading}</h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">{body}</p>
              </section>
            ))}
            <div className="flex flex-wrap gap-5 text-xs text-primary">
              <Link to="/termos">
                Termos de uso <ArrowUpRight className="inline h-3 w-3" />
              </Link>
              <Link to="/privacidade">
                Privacidade <ArrowUpRight className="inline h-3 w-3" />
              </Link>
              <a
                href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm"
                target="_blank"
                rel="noreferrer"
              >
                Consultar a LGPD <ArrowUpRight className="inline h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </main>
      <ScrollToTop />
    </div>
  );
}

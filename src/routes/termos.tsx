import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { FluxLogo } from "@/components/brand/logo";
import { ScrollToTop } from "@/components/ui/scroll-to-top";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Flux Menu" },
      {
        name: "description",
        content:
          "Condições gerais de uso da plataforma Flux Menu para bares, restaurantes e seus clientes.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <FluxLogo />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-8">
        <p className="text-xs uppercase tracking-[0.18em] text-primary">Legal</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">Termos de Uso</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Última atualização: {new Date().toLocaleDateString("pt-BR")}
        </p>

        <div className="mt-10 text-sm leading-relaxed text-foreground/85">
          <section className="space-y-3">
            <h2 className="font-display text-2xl tracking-tight">1. Aceitação</h2>
            <p>
              Ao criar uma conta ou utilizar a plataforma Flux Menu, você concorda com estes Termos
              e com nossa Política de Privacidade. Se não concordar, não utilize o serviço.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">2. Serviço</h2>
            <p>
              O Flux Menu oferece cardápio digital, pedidos por QR Code, painel de cozinha, gestão
              de salão e análises. O serviço está em fase Beta — recursos podem evoluir, mudar ou
              ser temporariamente indisponíveis.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">3. Conta e responsabilidades</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Você é responsável por manter suas credenciais seguras e pelo uso feito por sua
                equipe.
              </li>
              <li>
                Você garante que tem direito de cadastrar o cardápio, imagens e informações exibidas
                aos clientes.
              </li>
              <li>
                É proibido usar o Flux Menu para atividades ilícitas, conteúdo ofensivo ou para
                qualquer fim que viole direitos de terceiros.
              </li>
            </ul>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">4. Planos e pagamento</h2>
            <p>
              A assinatura é mensal, sem fidelidade. O cancelamento pode ser feito a qualquer
              momento e encerra a renovação seguinte — não há reembolso proporcional de períodos já
              pagos, salvo determinação legal.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">5. Disponibilidade</h2>
            <p>
              Nos esforçamos para manter o serviço 24/7, mas podem ocorrer paradas para manutenção,
              atualização ou por causas externas. O Flux Menu não se responsabiliza por prejuízos
              decorrentes de indisponibilidade temporária.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">6. Propriedade intelectual</h2>
            <p>
              A marca, o software e o design do Flux Menu são de propriedade da Flux Menu Labs. Os
              dados e conteúdos cadastrados por você permanecem seus.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">
              7. Limitação de responsabilidade
            </h2>
            <p>
              O Flux Menu é fornecido "como está". Não nos responsabilizamos por lucros cessantes,
              erros de operação do estabelecimento ou por conteúdos cadastrados pelo cliente.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">8. Alterações</h2>
            <p>
              Estes Termos podem ser atualizados. Mudanças relevantes são comunicadas por email ou
              no painel administrativo com antecedência razoável.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">9. Foro</h2>
            <p>
              Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da comarca do
              estabelecimento contratante para dirimir quaisquer controvérsias.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">10. Contato</h2>
            <p>
              Dúvidas?{" "}
              <a className="text-primary" href="mailto:contato@flux.app">
                contato@flux.app
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <ScrollToTop />
    </div>
  );
}

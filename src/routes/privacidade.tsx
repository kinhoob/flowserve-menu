import { FluxLogo } from "@/components/brand/logo";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Flux Menu" },
      {
        name: "description",
        content:
          "Como o Flux Menu coleta, usa, armazena e protege os dados de estabelecimentos e clientes finais.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
        <h1 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">
          Política de Privacidade
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Última atualização: {new Date().toLocaleDateString("pt-BR")}
        </p>

        <div className="prose prose-invert mt-10 max-w-none text-sm leading-relaxed text-foreground/85">
          <section className="space-y-3">
            <h2 className="font-display text-2xl tracking-tight">1. Quem somos</h2>
            <p>
              O Flux Menu é uma plataforma de cardápio digital e operação de salão para bares e
              restaurantes. Esta política descreve como tratamos dados pessoais coletados de
              estabelecimentos contratantes e dos clientes finais que interagem com o cardápio
              digital.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">2. Dados que coletamos</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Conta do estabelecimento:</strong> nome, email, telefone, endereço e dados
                de pagamento da assinatura.
              </li>
              <li>
                <strong>Operação:</strong> cardápio, pedidos, mesas, equipe, horários e métricas de
                uso.
              </li>
              <li>
                <strong>Cliente final:</strong> apenas o necessário para o pedido (nome opcional,
                número da mesa e itens escolhidos). Não coletamos CPF nem dados sensíveis no fluxo
                de QR Code.
              </li>
              <li>
                <strong>Dados técnicos:</strong> logs de acesso, IP, dispositivo e cookies
                essenciais para o funcionamento da plataforma.
              </li>
            </ul>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">3. Como usamos</h2>
            <p>
              Usamos os dados para operar a plataforma, processar pedidos, emitir relatórios para o
              estabelecimento, melhorar o produto, prevenir fraudes e cumprir obrigações legais. Não
              vendemos seus dados.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">4. Compartilhamento</h2>
            <p>
              Compartilhamos dados apenas com fornecedores essenciais (hospedagem, processamento de
              pagamento e envio de email), sempre sob contrato e obrigação de confidencialidade.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">5. Seus direitos (LGPD)</h2>
            <p>
              Você pode solicitar acesso, correção, portabilidade, anonimização ou exclusão dos seus
              dados pelo email{" "}
              <a className="text-primary" href="mailto:privacidade@flux.app">
                privacidade@flux.app
              </a>
              . Atendemos no prazo legal.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">6. Segurança</h2>
            <p>
              Adotamos criptografia em trânsito, isolamento multi-tenant por estabelecimento,
              controle de acesso por função e auditoria contínua. Nenhum sistema é 100% seguro — em
              caso de incidente, comunicaremos os titulares e a ANPD na forma da lei.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">7. Retenção</h2>
            <p>
              Mantemos os dados enquanto a conta estiver ativa. Após o cancelamento, os dados
              operacionais ficam disponíveis por 90 dias para exportação e são então eliminados,
              salvo obrigação legal de guarda.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="font-display text-2xl tracking-tight">8. Contato</h2>
            <p>
              Dúvidas sobre privacidade?{" "}
              <a className="text-primary" href="mailto:privacidade@flux.app">
                privacidade@flux.app
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

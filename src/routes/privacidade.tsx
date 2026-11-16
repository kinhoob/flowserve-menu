import { LegalPage } from "@/features/landing/legal-page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Flux Menu" },
      {
        name: "description",
        content: "Entenda quais dados fazem parte do fluxo e como exercer seus direitos.",
      },
    ],
  }),
  component: Page,
});
function Page() {
  return (
    <LegalPage
      title="Política de Privacidade"
      summary="Entenda quais dados fazem parte do fluxo e como exercer seus direitos."
      sections={[
        [
          "A quem esta política se aplica",
          "Esta política abrange visitantes, responsáveis pelos estabelecimentos, equipes e clientes que usam o cardápio. O Flux trata dados de conta, segurança e gestão para prestar seu serviço. No atendimento aos consumidores, o restaurante determina o uso dos dados de seus pedidos e o Flux os processa para viabilizar essa operação, conforme as responsabilidades aplicáveis a cada tratamento.",
        ],
        [
          "Dados tratados",
          "Podem ser tratados nome e e-mail da conta, dados cadastrais fornecidos sobre o estabelecimento, equipe, cardápio, mesas, horários, pedidos e observações. Serviços de infraestrutura podem registrar informações técnicas, como IP, navegador e registros de erro e acesso. Evite incluir documentos, dados de saúde ou outras informações sensíveis em campos livres.",
        ],
        [
          "Finalidades e fundamentos",
          "Usamos dados necessários para criar e autenticar contas, encaminhar pedidos, administrar planos, gerar relatórios, prevenir abuso e atender solicitações. Conforme o caso, o tratamento se apoia na execução do contrato, no cumprimento de obrigações legais ou em interesse legítimo avaliado em relação aos direitos das pessoas. Quando uma finalidade exigir consentimento, ele deve ser solicitado de forma específica e pode ser revogado.",
        ],
        [
          "Pedidos, relatórios e gestão do Flux",
          "O estabelecimento e seus usuários autorizados acessam os dados necessários ao atendimento. A gestão privada do Flux pode consultar cadastros, atividade, planos e progresso de implantação para administrar o serviço e oferecer suporte. Indicadores operacionais não equivalem a comprovantes de pagamento ou apuração fiscal.",
        ],
        [
          "Armazenamento no navegador e câmera",
          "A plataforma usa armazenamento local para sessão, carrinho e preferências, conforme a funcionalidade. Limpar esses dados pode exigir novo login ou remover escolhas locais. A realidade aumentada solicita acesso à câmera apenas ao iniciar a experiência em aparelhos compatíveis. A prévia animada da página inicial não acessa a câmera. Não há funcionalidade de gravação ou envio de vídeo da câmera pelo Flux no fluxo de RA.",
        ],
        [
          "Fornecedores e compartilhamento",
          "Dados necessários podem ser processados por fornecedores de hospedagem e banco de dados, autenticação, arquivos, e-mail e pagamentos. O projeto usa Supabase para banco e autenticação e Stripe na integração de assinaturas. Dados de cartão são tratados pelo processador no checkout; o Flux recebe referências e status da assinatura. Conteúdos externos, como imagens e modelos, podem gerar conexão ao fornecedor ao serem carregados. Não vendemos dados pessoais.",
        ],
        [
          "Transferência internacional e segurança",
          "Os fornecedores podem processar dados fora do Brasil, conforme a infraestrutura utilizada. Transferências devem observar as exigências legais aplicáveis. Empregamos autenticação, controles de acesso e restrições por estabelecimento. Essas medidas reduzem riscos, mas não eliminam a possibilidade de incidentes. Incidentes relevantes devem ser avaliados e comunicados nos casos e prazos exigidos.",
        ],
        [
          "Tempo de conservação",
          "Os dados são mantidos pelo tempo necessário às finalidades informadas, à prestação do serviço e ao cumprimento de obrigações legais e exercício de direitos. O cancelamento da assinatura não implica exclusão imediata de todos os registros. Pedidos de exclusão são avaliados conforme essas necessidades; cópias de segurança podem seguir o ciclo de retenção do fornecedor. Solicitações de exclusão e disponibilização de dados são analisadas individualmente durante o beta.",
        ],
        [
          "Seus direitos e como solicitar",
          "Nos termos da LGPD, você pode solicitar confirmação e acesso, correção, informações sobre compartilhamento e, nas hipóteses legais, portabilidade, bloqueio, anonimização ou eliminação, além de revogação do consentimento e oposição. Podemos verificar sua identidade para proteger os dados. Para pedidos do restaurante, procure primeiro o estabelecimento; para dados de conta e gestão do Flux, utilize o canal confirmado do beta. A análise respeitará os prazos legais e eventuais justificativas de conservação.",
        ],
        [
          "Crianças, mudanças e contato",
          "O painel de gestão é destinado a responsáveis autorizados pelo estabelecimento. Esta política foi atualizada em 16 de novembro de 2026. Alterações relevantes devem ser informadas nos canais da plataforma. Endereço demonstrativo: privacidade@flux.example, fictício e sem recebimento de mensagens. Durante o beta, utilize o contato direto de quem concedeu seu acesso. A identificação do responsável e o canal público válido de privacidade precisam ser confirmados antes da abertura comercial.",
        ],
      ]}
    />
  );
}

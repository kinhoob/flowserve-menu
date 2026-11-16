import { LegalPage } from "@/features/landing/legal-page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Flux Menu" },
      {
        name: "description",
        content:
          "Regras claras para usar o Flux, administrar seu restaurante e participar do beta.",
      },
    ],
  }),
  component: Page,
});
function Page() {
  return (
    <LegalPage
      title="Termos de Uso"
      summary="Regras claras para usar o Flux, administrar seu restaurante e participar do beta."
      sections={[
        [
          "Sobre o Flux e a fase beta",
          "O Flux Menu oferece cardápio digital, pedidos, gestão de mesas e acompanhamento da operação conforme os recursos do plano. A versão beta está em desenvolvimento: telas e funcionalidades podem mudar e podem ocorrer interrupções. Teste as configurações antes de atender e mantenha um procedimento alternativo para a operação. A demonstração pública usa dados ilustrativos e não envia pedidos reais.",
        ],
        [
          "Conta, equipe e uso permitido",
          "Quem cria a conta deve ter autorização para representar o estabelecimento e fornecer informações corretas. Proteja senhas e códigos da equipe, revise os acessos e comunique suspeitas de uso indevido. São proibidos acessos não autorizados, exploração de falhas, fraude e publicação de conteúdo ilícito ou que viole direitos de terceiros.",
        ],
        [
          "Cardápio e atendimento ao consumidor",
          "O restaurante responde por preços, disponibilidade, descrições, alergênicos, segurança alimentar, preparo e entrega. Confirme os pedidos e mantenha os dados atualizados. Fotografias e modelos 3D precisam de autorização de uso. A realidade aumentada depende de modelos cadastrados, medidas conferidas e aparelhos compatíveis; a aparência e escala exibidas podem variar.",
        ],
        [
          "Pedidos, horários e códigos de mesa",
          "O envio de pedidos depende de conexão e das configurações do estabelecimento. Horários da cozinha e do bar e códigos temporários ajudam a controlar os pedidos. O QR Code não comprova presença física. Compartilhe os códigos somente com clientes autorizados e confira o recebimento antes de repetir um pedido. O Flux não substitui emissão fiscal, obrigações tributárias ou controles sanitários.",
        ],
        [
          "Teste, planos e cobrança",
          "O prazo de teste e os recursos disponíveis são exibidos na conta. Preço, periodicidade, renovação e condições aplicáveis devem ser apresentados antes da confirmação da assinatura. Cortesias e extensões de teste não representam pagamento. Alterar o acesso por cortesia não cancela uma assinatura cobrada pelo processador. Consulte a assinatura e o checkout para verificar cobrança e cancelamento.",
        ],
        [
          "Cancelamento e direitos legais",
          "Solicite o cancelamento pelos controles disponíveis da assinatura ou pelo canal de atendimento confirmado na contratação. Confira a confirmação e a data de encerramento do acesso. Condições de estorno devem ser informadas antes da contratação e respeitam a legislação aplicável, inclusive o direito de arrependimento quando cabível. Estes termos não afastam direitos previstos em lei.",
        ],
        [
          "Conteúdo e propriedade intelectual",
          "O conteúdo cadastrado permanece de seus titulares. O estabelecimento autoriza o tratamento e a exibição desse conteúdo apenas para prestar o serviço e apresentar seu cardápio. O software, a identidade visual e demais elementos próprios do Flux pertencem aos respectivos titulares. Não é permitida a reprodução ou exploração sem autorização ou fundamento legal.",
        ],
        [
          "Dados pessoais",
          "O uso de dados pessoais é descrito na Política de Privacidade. O estabelecimento deve informar seus clientes sobre o uso dos dados no atendimento e evitar inserir informações desnecessárias ou sensíveis em observações de pedidos. A administração do Flux acessa dados de gestão conforme permissões para operar a plataforma e prestar suporte.",
        ],
        [
          "Disponibilidade, suspensão e responsabilidade",
          "Conexão, dispositivos, fornecedores e manutenção podem afetar o serviço. Não há garantia de disponibilidade ininterrupta nesta versão beta. Uso abusivo ou risco à segurança pode motivar restrição de acesso, com informação ao responsável quando possível. A responsabilidade de cada parte será apurada conforme sua atuação e a legislação aplicável, sem exclusão de direitos obrigatórios.",
        ],
        [
          "Atualizações e legislação",
          "Esta versão é de 16 de novembro de 2026. Alterações relevantes devem ser informadas na plataforma ou pelos contatos cadastrados antes de produzir efeitos, quando exigido. Aplica-se a legislação brasileira, respeitadas as regras legais de competência e proteção ao consumidor.",
        ],
        [
          "Atendimento durante o beta",
          "Endereço demonstrativo: contato@flux.example. Este endereço é fictício e não recebe solicitações. Durante os testes, utilize o canal direto pelo qual recebeu acesso ao beta. Antes da contratação pública, a identificação do responsável pelo serviço e um canal de atendimento válido devem ser disponibilizados.",
        ],
      ]}
    />
  );
}

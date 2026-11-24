# Implantação das correções do Flux Menu

Consulte também [a migração para integrações diretas](INDEPENDENT-INTEGRATIONS.md) e [o piloto de RA](DISH-AR.md).

Estas alterações precisam de uma implantação coordenada do banco e do aplicativo. Não basta atualizar apenas o frontend.

## Preparação

1. Faça backup do banco e confira o histórico de migrações aplicado. As migrações históricas de reset e de token de debug foram neutralizadas para reconstruções futuras; não reaplique o histórico em produção.
2. Teste as três novas migrações `20261030000100`, `20261030000200` e `20261030000300` em uma cópia isolada do banco. Elas preservam pedidos, clientes e equipe. Chamados com prefixos de diagnóstico são marcados como teste, sem exclusão.
3. Cadastre as variáveis de `.env.example` nos ambientes corretos. Não copie arquivos `.env` para o GitHub. `SUPABASE_SERVICE_ROLE_KEY` e as credenciais Stripe pertencem apenas ao servidor.
4. Defina `VITE_PUBLIC_APP_URL` e `APP_URL` com o domínio HTTPS publicado. Links temporários de prévia não servem como destino de QR Codes impressos. A exportação fica bloqueada quando o domínio não é configurado.
5. Confira no Stripe as lookup keys `basic_monthly`, `essential_monthly` e `pro_monthly` e os valores comerciais mostrados na página. A aplicação só permite esses planos, em BRL e recorrentes.

## Publicação

- Reserve uma janela breve de manutenção para interromper novos pedidos.
- Aplique as três migrações de segurança e a nova migração de RA, quando pendentes, em ordem, e publique o aplicativo desta revisão logo em seguida. A assinatura de `place_order` passa a exigir um token privado. Clientes com a versão antiga precisam recarregar o cardápio.
- Configure o webhook de assinaturas no domínio publicado: `/api/public/payments/webhook?env=live`. Use a chave de assinatura correta. Eventos sandbox são registrados, mas não ativam nem cancelam acesso de produção.
- `PAYMENTS_ENVIRONMENT` no servidor deve combinar com a chave pública de pagamento do frontend. Defina explicitamente o ambiente. Live exige a origem HTTPS pública em `APP_URL`.
- Verifique se o restaurante está no fuso desejado em Configurações → Estabelecimento. Os fusos existentes foram preservados para evitar mudança de horário sem decisão do proprietário.
- Informe à equipe que PINs não podem mais ser consultados. Eles continuam funcionando, são armazenados como hash e podem ser redefinidos. Alterar PIN, perfil ou desativar membro revoga suas sessões.

## Validação depois da publicação

Em navegador sem sessão, abra o QR de uma mesa e confirme que não exige login. Faça um pedido de teste, confirme o preço no servidor, acompanhe cozinha/garçom e finalize a conta. Uma mesa continua ocupada após a entrega até o fechamento da conta. Compare contadores do dashboard, mesas e QR Codes.

Valide também a chamada do garçom, os adicionais obrigatórios, produtos esgotados, cozinha fechada, recuperação de conexão e atualização do status público. Proprietários usam Realtime com proteção por RLS; equipe e acompanhamento público têm consultas periódicas autorizadas.

Teste cobrança exclusivamente no ambiente sandbox. Confirme em produção a configuração do webhook sem fazer uma cobrança real de teste. Eventos de falha devem receber resposta não-2xx e ser reenviados; eventos duplicados não reaplicam a concessão de plano.

## Retorno à versão anterior

Não reverta as proteções de dados para restaurar um frontend antigo. Em caso de falha, mantenha novos pedidos suspensos e publique a correção compatível com as novas RPCs. O backup é a proteção para problemas de migração; nenhuma migração destrutiva de rollback foi criada.

## Regras de operação do beta

A revisão atual exige também `20261123000100_beta_operation_hardening.sql`, disponível como `supabase/fluxqr-melhorias-beta.sql` para o banco existente com as regras anteriores de horários/mesas. O pacote consolidado inclui essa revisão. Faça backup antes de aplicar. Recarregue os aparelhos após a migração: as funções públicas antigas de envio perdem autorização direta para impedir contorno dos limites.

Verifique: ocultar entregues sem liberar mesa; dois funcionários atualizando a mesma etapa; bloqueio de retrocesso; encerrar mesa com pendências; repetir envio após timeout; limites de códigos/chamados com e sem código exigido; comparação das análises pelos mesmos dias da semana. O cliente não garante operação offline e não deve tratar dados em cache como confirmação de envio.

## Beta comercial e Stripe live

- Aplique primeiro as revisões de horários, segurança dos envios e recuperação de atendimentos que estiverem pendentes. Aplique [a migração comercial](../supabase/migrations/20261124063416_commercial_beta_entitlements.sql) uma vez, dentro de uma transação de manutenção, em seguida publique a aplicação compatível. Depois, aplique a migração `20261124065754_commercial_beta_review.sql`, que adiciona o fechamento por identificador e a coordenação de checkout e webhooks. O pacote histórico de atualização é anterior a essas migrações. Um checkout reservado vence em duas horas e conserva preço, retorno e chave de idempotência durante retentativas. Pedidos e chamados legados sem identificador são associados automaticamente apenas quando o nome da mesa é único. Teste a ordem em uma cópia descartável, sem resetar o banco existente.
- No Essential, se houver mais de dez mesas operacionais após o downgrade, a gestão precisa selecionar as mesas em **QR Codes → Selecionar mesas operacionais**. Novos pedidos, chamados, códigos temporários e atendimentos ficam pausados nessa situação. A equipe pode concluir e encerrar os existentes. Mesas pausadas permanecem cadastradas. Basic usa o QR geral para visualização. O limite comercial adicional do Basic segue pendente.
- Confirme domínio HTTPS e destino da build Cloudflare. Use a mesma origem pública em `APP_URL` no servidor e `VITE_PUBLIC_APP_URL` na build. Revise o Site URL e as URLs autorizadas no Supabase. Confira envio SMTP, confirmação de e-mail, login, recuperação de senha, links públicos e leitura de QR impresso no domínio final.
- Antes do piloto, a administração do banco deve marcar `platform_admins.owns_platform=true` para a conta confirmada do proprietário. Identifique a conta autorizada pelo UUID. Os demais administradores mantêm a consulta à gestão e ao histórico. As concessões existentes continuam valendo.
- Configure `PAYMENTS_ENVIRONMENT=live`, `STRIPE_LIVE_SECRET_KEY` e `PAYMENTS_LIVE_WEBHOOK_SECRET` no servidor. Use a chave pública live em `VITE_STRIPE_PUBLISHABLE_KEY` na build. Preserve chaves, preços e webhook próprios no sandbox. Em Stripe live confira preços ativos em BRL, mensais, com as lookup keys `basic_monthly` (R$ 30), `essential_monthly` (R$ 99) e `pro_monthly` (R$ 199). Confira os mesmos produtos no portal.
- No endpoint HTTPS de assinaturas `/api/public/payments/webhook?env=live`, configure eventos snapshot `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.pending_update_applied`, `customer.subscription.pending_update_expired`, `invoice.paid` e `invoice.payment_failed`. Confira entrega, assinatura, retentativas, renovação, falha, cancelamento e troca com fixtures ou sandbox. Verifique configuração live no painel sem efetuar cobrança de teste. [Webhooks do Stripe](https://docs.stripe.com/webhooks)
- Termos exibem `contato@flux.example` e Privacidade exibe `privacidade@flux.example`, ambos fictícios. O link de vendas provisório foi retirado. Antes de abertura comercial, confirme o responsável legal pelo serviço e os contatos reais de suporte, privacidade e vendas.
- Verifique backup e restauração em ambiente descartável, histórico de migrações, alertas de erros do app e do webhook, métricas de disponibilidade e saúde do banco. Registre quem recebe alertas e quem pode restaurar o serviço.
- A validação local usa dados fictícios e Postgres isolado. O piloto externo depende de domínio, hospedagem, configuração Auth/SMTP, migração conferida e ensaio com equipamentos reais. A cobrança depende também das configurações Stripe live e dos contatos comerciais verificados.

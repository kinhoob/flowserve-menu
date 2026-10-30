# Implantação das correções do Flux Menu

Estas alterações precisam de uma implantação coordenada do banco e do aplicativo. Não basta atualizar apenas o frontend.

## Preparação

1. Faça backup do banco e confira o histórico de migrações aplicado. As migrações históricas de reset e de token de debug foram neutralizadas para reconstruções futuras; não reaplique o histórico em produção.
2. Teste as três novas migrações `20261030000100`, `20261030000200` e `20261030000300` em uma cópia isolada do banco. Elas preservam pedidos, clientes e equipe. Chamados com prefixos de diagnóstico são marcados como teste, sem exclusão.
3. Cadastre as variáveis de `.env.example` nos ambientes corretos. Não copie arquivos `.env` para o GitHub. `SUPABASE_SERVICE_ROLE_KEY` e as credenciais Stripe pertencem apenas ao servidor.
4. Defina `VITE_PUBLIC_APP_URL` e `APP_URL` com o domínio HTTPS publicado. Links de prévia Lovable não servem como destino de QR Codes impressos. A exportação fica bloqueada quando o domínio não é configurado.
5. Confira no Stripe as lookup keys `basic_monthly`, `essential_monthly` e `pro_monthly` e os valores comerciais mostrados na página. A aplicação só permite esses planos, em BRL e recorrentes.

## Publicação

- Reserve uma janela breve de manutenção para interromper novos pedidos.
- Aplique as três novas migrações, em ordem, e publique o aplicativo desta revisão logo em seguida. A assinatura de `place_order` passa a exigir um token privado. Clientes com a versão antiga precisam recarregar o cardápio.
- Configure o webhook de assinaturas no domínio publicado: `/api/public/payments/webhook?env=live`. Use a chave de assinatura correta. Eventos sandbox são registrados, mas não ativam nem cancelam acesso de produção.
- `PAYMENTS_ENVIRONMENT` no servidor deve combinar com a chave pública de pagamento do frontend. Sandbox requer configuração explícita; o padrão é live.
- Verifique se o restaurante está no fuso desejado em Configurações → Estabelecimento. Os fusos existentes foram preservados para evitar mudança de horário sem decisão do proprietário.
- Informe à equipe que PINs não podem mais ser consultados. Eles continuam funcionando, são armazenados como hash e podem ser redefinidos. Alterar PIN, perfil ou desativar membro revoga suas sessões.

## Validação depois da publicação

Em navegador sem sessão, abra o QR de uma mesa e confirme que não exige login Lovable. Faça um pedido de teste, confirme o preço no servidor, acompanhe cozinha/garçom e finalize a conta. Uma mesa continua ocupada após a entrega até o fechamento da conta. Compare contadores do dashboard, mesas e QR Codes.

Valide também a chamada do garçom, os adicionais obrigatórios, produtos esgotados, cozinha fechada, recuperação de conexão e atualização do status público. Proprietários usam Realtime com proteção por RLS; equipe e acompanhamento público têm consultas periódicas autorizadas.

Teste cobrança exclusivamente no ambiente sandbox. Confirme em produção a configuração do webhook sem fazer uma cobrança real de teste. Eventos de falha devem receber resposta não-2xx e ser reenviados; eventos duplicados não reaplicam a concessão de plano.

## Retorno à versão anterior

Não reverta as proteções de dados para restaurar um frontend antigo. Em caso de falha, mantenha novos pedidos suspensos e publique a correção compatível com as novas RPCs. O backup é a proteção para problemas de migração; nenhuma migração destrutiva de rollback foi criada.

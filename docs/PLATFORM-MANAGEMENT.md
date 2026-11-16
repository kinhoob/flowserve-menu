# Central de gestão Flux

A rota `/gestao` é exclusiva dos criadores autorizados. O link **Gestão Flux** aparece no menu do restaurante somente para essas contas. A central tem autenticação própria usando a mesma sessão do Flux e não depende do plano ou do trial do restaurante do administrador.

## Ativar

1. As duas pessoas precisam ter contas cadastradas no Flux e e-mails confirmados.
2. Execute o SQL privado de ativação no SQL Editor do Supabase, como `postgres`. O pacote inclui as atualizações anteriores pendentes e a nova migração da gestão numa única transação. Se alguma conta não existir ou não estiver confirmada, nenhuma parte da atualização será aplicada.
3. Use a versão atualizada do aplicativo, entre com uma das contas autorizadas e abra `/gestao`. O SQL não envia convites nem cria senhas.

O gerador `scripts/build-platform-access.mjs` recebe os dois e-mails e um caminho de saída fora do repositório. **Não publique o arquivo privado:** ele contém os e-mails dos criadores. O arquivo público `supabase/fluxqr-atualizacao-beta.sql` instala a estrutura, mas não libera nenhuma conta. Não há um botão público para se tornar administrador.

A associação é feita pelo ID da conta já confirmada, não por metadados editáveis do perfil. Recriar uma conta com o mesmo e-mail não transfere a permissão automaticamente. Para revogar uma conta, o responsável pelo banco pode executar `UPDATE public.platform_admins SET active=false WHERE user_id='ID_DA_CONTA';`. A revogação vale na próxima chamada ao banco, inclusive com a sessão ainda aberta.

## Dados e indicadores

A lista tem busca por nome, endereço do cardápio, responsável e e-mail; filtros de trial ativo, trial encerrado, plano e acesso manual; paginação de 25 restaurantes; indicadores globais; pedidos e vendas entregues dos últimos 30 dias.

A ficha mostra o responsável, telefone quando registrado na autenticação, e-mail, cadastro, último login, endereço do cardápio, fuso, moeda, produtos, categorias, mesas, equipe ativa, resumo de pedidos de todo o histórico, situação das configurações operacionais, assinaturas de produção/teste e as últimas 50 mudanças administrativas da conta. Ela não expõe senhas, PINs, sessões, chaves ou nomes e telefones dos clientes que fizeram pedidos.

“Com plano” representa acesso liberado, incluindo concessões manuais, e não comprova pagamento. Vendas são do restaurante, em sua própria moeda; não são faturamento do Flux. Somente pedidos entregues entram nesse total. O histórico pode conter pedidos de teste feitos pelo próprio estabelecimento.

## Alterar acesso

Toda alteração exige motivo e uma revisão com restaurante, novo acesso, prazo e autor antes de confirmar.

- **Adicionar dias ao trial:** de 1 a 365 dias por alteração. Preserva dias restantes. Para um trial vencido, parte do momento atual. Não muda silenciosamente um cliente com plano para trial.
- **Definir plano de acesso:** Trial, Basic, Essential, Pro ou Enterprise. Trial exige um prazo de 1 a 365 dias; outros planos ficam concedidos até nova alteração ou restauração do acesso padrão.
- **Restaurar acesso padrão / assinatura:** remove a prioridade da concessão manual e volta aos dados atuais da assinatura ou cadastro base. Pode voltar a um trial vencido; confira a revisão.

O plano pertence à conta do responsável e afeta todos os restaurantes dessa conta. A alteração não cria, cancela ou ajusta uma cobrança Stripe. Se uma assinatura estiver ativa, a cobrança continua no provedor até ser ajustada por lá.

Uma concessão manual prevalece sobre atualizações automáticas da cobrança. O webhook continua atualizando o cadastro base; restaurar o acesso padrão usa o estado mais recente. A mesma regra de acesso vale no painel e nas funções do banco que autorizam pedidos. O painel do cliente confere atualizações a cada 30 segundos e ao voltar à janela.

Cada alteração grava o administrador, e-mail do autor naquele momento, conta afetada, restaurante, motivo, horário e estado anterior/novo. O aplicativo não permite editar ou apagar esse histórico. Há controle de versão por conta: alterações concorrentes ou reenvios com a versão antiga são recusados, evitando sobrescrever a ação do sócio ou acrescentar dias duas vezes depois de uma falha de conexão.

## Segurança e verificação

As tabelas de administradores, acessos manuais e histórico têm RLS e não concedem leitura nem escrita direta ao navegador, inclusive aos administradores. As consultas e mudanças passam por funções que conferem a permissão atual no banco. Usuários comuns só consultam o próprio acesso efetivo; não podem escolher outro usuário nem se conceder privilégios pelo perfil.

`npm run test:db` verifica dois administradores confirmados, isolamento de clientes, bloqueio de acesso anônimo, extensão de trials ativos/vencidos, limites e motivos, concorrência, reenvios, auditoria, integração com eventos reais de cobrança simulados localmente, restauração e revogação da permissão. Os testes usam um banco local isolado e não alteram o Supabase real.

# Crescimento e implantação na gestão do dono

Os novos indicadores ficam somente em `/gestao`, com a mesma autorização de administrador da plataforma. Não há link ou componente novo no dashboard dos restaurantes. A busca e os filtros da lista não alteram os indicadores globais acima dela.

## Visão geral

- Total de restaurantes cadastrados.
- Cadastros nos últimos 7, 30 ou 90 dias e comparação com o intervalo anterior de mesma duração.
- Restaurantes com pedidos não cancelados nos últimos 7 e 30 dias.
- Série diária de novos restaurantes, com consulta por mouse e teclado.

Os intervalos de cadastro e o gráfico usam `America/Sao_Paulo`. O período atual começa à meia-noite do primeiro dia e termina no momento da consulta. A comparação anterior termina no mesmo horário local do último dia correspondente; não compara uma fração de hoje com um dia anterior inteiro. Um período anterior sem cadastros aparece como sem base para porcentagem de crescimento.

Atividade operacional significa ter recebido pedido não cancelado; não mede presença online nem confirma venda ou pagamento. Pedidos futuros são ignorados. Cadastros e pedidos usados pelo proprietário para testes também entram quando gravados no banco real, pois o Flux ainda não distingue estabelecimentos internos por uma classificação própria.

## Trial e conversão

Os indicadores mostram acesso Trial ativo, vencimento em até 72 horas e Trial encerrado com prazo definido. Um vencimento zerado usado para bloquear acesso após problema na assinatura não é tratado como um trial comum encerrado.

A conversão é uma medida de **coorte de cadastro**: entre as contas de responsáveis que foram criadas no período e possuem restaurante, quantas têm atualmente uma assinatura de produção (`live`) com status registrado `active`. Contas são deduplicadas: dois restaurantes do mesmo responsável não contam como duas conversões.

Assinaturas sandbox, status `trialing` e plano concedido manualmente sem assinatura ativa não entram no numerador. Acesso manual e assinatura ativa são apresentados separadamente; uma conta pode ter ambos. O painel informa quantas contas da coorte receberam apenas a concessão manual. A ausência de contas na coorte aparece como “Sem coorte”, não como uma taxa medida de zero.

Essa métrica não prova pagamento, não calcula MRR e não reconstrói uma conversão histórica após o cancelamento. Ela reflete o estado registrado das assinaturas no momento da consulta. A cobrança continua sendo atualizada pelo fluxo de integração já existente, sem novas chamadas externas nesta tela.

## Implantação

As quatro etapas são independentes:

1. **Cardápio disponível:** ao menos um produto disponível em uma categoria ativa do restaurante.
2. **Mesas criadas:** ao menos uma mesa cadastrada. Não comprova impressão ou uso do QR Code.
3. **Horários configurados:** agenda semanal salva. Não impede uma operação que optou por pausas manuais.
4. **Primeiro pedido:** ao menos um pedido não cancelado, sem data futura. Um teste registrado pelo restaurante também pode completar a etapa.

A visão geral mostra a cobertura de cada etapa. A lista exibe progresso de 0 a 4 e a ficha de cada restaurante mostra o checklist, descrições e data do primeiro pedido. Esse acompanhamento não muda planos, prazos ou funcionamento das contas.

## Precisa da sua atenção

Cada restaurante aparece uma única vez, com seus motivos agrupados:

- Trial termina nas próximas 72 horas.
- Assinatura de produção com status registrado `past_due`, `unpaid` ou `paused`, sem outra assinatura de produção ativa nessa conta.
- Trial com prazo definido já encerrado.
- Cadastro tem pelo menos dois dias e ainda não completou as quatro etapas.
- Já houve pedido não cancelado, mas o último ocorreu há pelo menos dez dias.

Quem nunca recebeu pedido aparece na implantação incompleta após dois dias, não como um estabelecimento que parou de operar. Os alertas não são mensagens enviadas ao cliente: o dono decide a ação ao abrir a ficha. Não são diagnósticos de falha do sistema nem prova de dívida.

A prévia traz até 20 restaurantes prioritários e mostra o total. Há filtros paginados para consultar todos, além de trials a vencer, implantação, ausência do primeiro pedido, inatividade, cadastros recentes e assinaturas ativas. Cartões que abrem filtros usam o mesmo intervalo dos números mostrados.

## Instalação e segurança

A migração `20261116000800_platform_growth.sql` cria uma visão interna de saúde dos restaurantes, a função dos indicadores e amplia a lista e a ficha da gestão. Não altera restaurantes, pedidos, preços, planos, trials nem administradores.

A visão não concede leitura direta ao navegador, nem para o administrador. Todas as funções expostas verificam a permissão atual de administrador no banco antes de acessar dados. Usuários comuns e visitantes não conseguem consultar os indicadores. A alteração de plano ou trial invalida também o cache dos novos indicadores.

As funções de autorização e gestão mantêm os esquemas confiáveis antes de esquemas temporários. Os testes verificam que uma tabela temporária criada pelo chamador não pode se passar pela lista real de administradores.

O SQL completo de atualização inclui essa migração. O pacote privado de ativação pode ser regenerado para a conta autorizada, fora do Git. Sem a migração, a tela informa que os indicadores novos precisam ser ativados; a lista e as ações anteriores seguem disponíveis. A consulta automática é feita a cada minuto, com horário de atualização visível.

Os testes locais verificam coorte, comparação, concessões manuais, produção/sandbox, várias unidades da mesma conta, implantação, pedidos futuros/cancelados, alertas, paginação, isolamento e reaplicação. Não usam nem alteram o banco real.

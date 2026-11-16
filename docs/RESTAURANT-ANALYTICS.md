# Análises dos restaurantes

Em `/analytics`, o restaurante pode selecionar hoje, 7, 30 ou 90 dias e datas personalizadas de até 93 dias. O relatório compara com o intervalo imediatamente anterior de igual duração. Quando o intervalo inclui o dia de operação atual, o último dia anterior é limitado ao mesmo horário local, evitando comparar parte de hoje com um dia anterior inteiro. Os números usam a data de criação dos pedidos, não a data de pagamento nem a de entrega.

## Filtros

- **Setor e categoria:** selecionam itens dentro de cada pedido. Um pedido misto entra uma vez em cada seleção, mas só o valor dos itens correspondentes é contabilizado. Os totais de pedidos da cozinha e do bar não devem ser somados, porque um mesmo pedido pode conter ambos.
- **Horário:** todos os horários, almoço (11h–17h), noite (17h–00h), madrugada (00h–06h) ou intervalo personalizado. Um intervalo como 18h–02h atravessa a meia-noite; o horário final é exclusivo.
- **Dia de operação:** horários anteriores à virada configurada pertencem ao dia anterior. Com virada às 04h, sábado às 01h aparece na operação de sexta. A sugestão inicial usa o maior fechamento após a meia-noite da agenda atual, ou 00h quando não há fechamento desse tipo. Pode ser ajustada para o relatório, sem mudar a agenda de pedidos. O cálculo usa o calendário local e respeita mudanças de fuso e horário de verão.
- **Meta de fila/preparo:** de 1 a 180 minutos. Serve para identificar amostras e pedidos em andamento acima da meta; não modifica prazos operacionais. Os filtros e essa meta são locais à tela.

## Definições dos valores

**Vendas de itens:** preço histórico multiplicado pela quantidade, incluindo adicionais, apenas em pedidos com status Entregue. Cancelados e pedidos ainda em andamento ficam fora das vendas. Arquivar um pedido que não foi entregue não o transforma em venda.

**Contas encerradas:** itens de pedidos entregues e arquivados. **Entregues com conta aberta:** itens entregues ainda não arquivados. Nenhuma dessas situações comprova recebimento de pagamento.

**Taxas e couvert:** apresentados separadamente para os pedidos entregues, sem somar aos indicadores de itens. São exibidos somente quando não há seleção de setor ou categoria, para evitar ratear ou duplicar taxas de pedidos mistos.

**Ticket por pedido:** valor dos itens entregues selecionados dividido pelo número de pedidos entregues com esses itens. Não é ticket por pessoa nem por conta da mesa.

**Pedidos recebidos:** inclui cancelados. A taxa de cancelamento usa esse total como denominador. Variações de taxas aparecem em pontos percentuais; crescimentos com base anterior igual a zero aparecem como sem base de comparação, sem inventar uma porcentagem.

## Operação, produtos e leituras

O gráfico compara as vendas diárias com o intervalo anterior. Mouse e foco de teclado mostram os valores; clicar numa barra muda o período para aquele dia. O mapa por dia da semana e hora conta pedidos não cancelados; a linha respeita o dia de operação e a coluna usa a hora local.

Fila mede criação até início do preparo. Preparo mede início até pronto. Entrega mede pronto até registro de entrega. São tempos do pedido completo, inclusive em pedidos mistos. Amostras ausentes, invertidas, futuras ou superiores a 24 horas são descartadas. Média, mediana, P90 e quantidade de amostras ficam explícitos. P90 usa o percentil empírico pelo método do posto mais próximo.

O ranking permite ordenar por unidades entregues, valor vendido ou unidades canceladas. A taxa de unidades canceladas por produto usa todas as unidades pedidas daquele produto como base. Produtos com o mesmo nome continuam separados pelo ID preservado. Sem cadastro de custos, o Flux não calcula margem ou lucro.

As leituras do período são regras transparentes sobre os dados filtrados: crescimento, pico de movimento, preparo acima da meta, concentração das vendas e motivos de cancelamento. Amostras pequenas recebem aviso. Essas leituras não são previsões nem atribuem causas que o sistema não registrou.

## Histórico e exportação

O histórico tem páginas de 20 pedidos, filtro de situação que afeta apenas a lista e sua exportação, e detalhes do pedido completo. Indicadores e CSV usam somente os itens da seleção. Há exportação de resumo comparativo, ranking completo e pedidos. Datas de operação exportadas incluem o ano.

As consultas têm limite de período, paginação de leitura no banco e escopo do restaurante autorizado por RLS. O histórico é atualizado por eventos de pedidos e a cada minuto. Se uma página do histórico falhar, a consulta inteira falha: os indicadores e exportações não exibem resultados parcialmente carregados.

## Atualização do banco

A migração `20261116000700_analytics_item_history.sql` preserva ID do produto, ID/nome da categoria e setor ao criar novos itens de pedido. O banco substitui classificações fornecidas pelo cliente pelo cadastro verificado e mantém os dados históricos mesmo após edições ou exclusão no catálogo. Os campos preservados não mudam em atualizações posteriores dos itens. Produtos de outro restaurante são rejeitados.

Itens antigos não recebem uma classificação histórica inventada. Quando possível usam o catálogo atual, com aviso na tela. Itens sem classificação conhecida aparecem no filtro correspondente. Pedidos sem itens históricos são contados e sinalizados, mas não recebem valores estimados a partir do subtotal.

O relatório já funciona antes dessa migração usando o catálogo atual; executar o SQL passa a proteger a classificação dos pedidos seguintes. Não recria tabelas nem altera preços, pedidos anteriores, pagamentos, planos ou permissões administrativas. O instalador inicial e o pacote completo de atualização também incluem essa migração.

## Validação

Os testes cobrem pedidos mistos, valores em centavos, cancelamentos, arquivamento sem entrega, comparação parcial, madrugada, virada exclusiva, horário de verão, classificação antiga/desconhecida, produtos excluídos, filtros de turno e amostras de preparo. Os testes do banco verificam classificação preservada, rejeição de classificações forjadas, isolamento entre restaurantes, exclusão no catálogo e reaplicação da migração.

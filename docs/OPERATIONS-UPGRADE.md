# Gestão, operação e relatórios

A migração incremental `20261116000200_restaurant_operations.sql` deve ser aplicada uma vez no Supabase já instalado. Ela não reseta o projeto. `npm run test:db` verifica importação atômica, edição em lote entre restaurantes, promoções e eventos de preparo, além das verificações anteriores.

## Gestão do cardápio

- Cardápio → Importar planilha CSV: baixe o modelo e exporte o Excel/Google Sheets como CSV UTF-8. Aceita separador ponto e vírgula ou vírgula, campos entre aspas, descrições com quebras de linha e preços como 29,90 ou 29.90. Limites: 2 MB e 500 pratos. Revise a prévia antes de confirmar. Categorias ausentes são criadas; pratos com mesmo nome na mesma categoria são rejeitados. Um erro desfaz toda a importação, incluindo categorias criadas nessa chamada. Não há importação direta de XLSX.
- Edição em lote: selecione pratos, altere disponibilidade/categoria ou ajuste percentual de preço. Até 500 pratos são listados por ordem alfabética. Os limites e o restaurante são validados no banco. Ajustes percentuais são bloqueados em itens promocionais; edite esses preços individualmente.
- Item → Promoção: início e fim opcionais, interpretados no fuso do dispositivo indicado no formulário e enviados em UTC. O período inclui o início e exclui o fim. Fora dele, vale o preço original. Não há recorrência semanal nesta versão. O banco calcula o preço vigente de todos os canais; cardápio público consulta novamente a cada 30 segundos. Preços esperados enviados pelos novos clientes são conferidos, sem substituir o cálculo do servidor.
- QR Codes: cor com contraste mínimo de 7:1 sobre branco, título e chamada personalizados para cartões PNG/PDF. Os ajustes valem para a exportação atual. A margem branca de quatro módulos é preservada. A exportação exige domínio público configurado; não imprime URLs de localhost para clientes.

## Operação

- Cozinha do proprietário: adicionais e observações destacados, teste explícito de som, confirmação de cancelamento com motivo e aviso de falha na atualização dos pedidos.
- Cozinha da equipe: exibe adicionais e observações e oferece ativação/teste do alerta sonoro. Navegadores exigem interação do usuário para liberar áudio; mantenha a tela aberta. O acesso por PIN continua restrito ao restaurante e ao papel autorizado.
- Cancelamentos pela equipe solicitam confirmação. O motivo estruturado é registrado no fluxo de cancelamento do proprietário.
- Avisos de desconexão aparecem no painel, no cardápio e nas telas da equipe. O carrinho permanece na página durante uma queda; não há envio de pedidos offline nem garantia de preservação após recarregar/fechar a página. Alterações de status não ficam em fila para aplicação automática ao reconectar. A reconexão invalida as consultas para atualizar os dados; polling permanece como alternativa ao Realtime.
- `preparing_at`, `ready_at` e `cancelled_at` são registrados no banco. Pedidos entregues/cancelados não podem ser reabertos por uma mudança de status. Pedidos antigos não recebem horários estimados.

## Relatórios

Análises mantém os filtros de 7/30/90 dias e o fuso do restaurante. O ticket médio utiliza apenas pedidos entregues ou finalizados, excluindo cancelados e pedidos em preparação. As tabelas eliminam sobreposição entre resultados ativos e arquivados. O gráfico diário considera os mesmos estados de venda, e o ranking usa os valores dos itens registrados no pedido.

A seção Desempenho mostra média/mediana de preparo, quantidade de pedidos com medição e taxa de cancelamento. Pedidos sem eventos válidos não entram na média. O CSV de pratos exporta quantidade e valor de cada item; a exportação de pedidos permanece disponível com indicação de cancelados. Campos textuais são protegidos contra fórmulas ao abrir no Excel. Se o histórico falhar, a tela avisa e bloqueia exportações incompletas.

Entregue/finalizado não comprova pagamento. O Flux não deduz recebimentos bancários dessas mudanças de status. As análises continuam respeitando os planos que já liberavam esse recurso.

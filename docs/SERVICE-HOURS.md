# Horários, mesas e fechamento

Execute o arquivo completo `supabase/fluxqr-atualizacao-beta.sql` no SQL Editor do projeto existente, como `postgres`. Ele inclui a personalização, os links personalizados ainda pendentes e as novas regras, sem recriar o banco. Pode ser reaplicado. Atualize também o frontend desta branch e recarregue as páginas de atendimento.

O resultado deve mostrar a atualização concluída e `agendador_automatico_ativo = true`. O instalador ativa `pg_cron` quando disponível no servidor e agenda uma verificação por minuto. Se retornar `false`, habilite Cron em Integrations no Supabase e reaplique o arquivo. A abertura do painel também sincroniza avisos pendentes. Não há notificações push do sistema operacional: os avisos ficam no sino do Flux e são guardados para o próximo acesso.

## Preparar o restaurante

1. Em **Configurações → Estabelecimento**, confira o fuso horário.
2. Em **Configurações → Operação**, habilite a agenda semanal. Preencha os sete dias da cozinha e do bar e salve. Dias desmarcados ficam fechados. Os horários sugeridos só entram em vigor ao salvar.
3. Um fechamento menor que a abertura pertence ao dia seguinte: sexta 18:00–01:00 termina no sábado à 01:00. Horários iguais não são aceitos. As pausas manuais prevalecem sobre a agenda.
4. Escolha se deseja exigir **Código temporário por mesa**. É uma proteção opcional durante o expediente. Em **QR Codes** ou **Garçom → selecionar mesa**, consulte o código e entregue-o apenas no salão. Não o imprima no cartão do QR.
5. No cardápio, cada categoria deve estar corretamente marcada como Cozinha ou Bar. O setor determina a autorização para novos pedidos.

Sem agenda, valem as pausas manuais. Restaurantes existentes não recebem horários inventados automaticamente. O código da mesa fica habilitado por padrão ao aplicar a atualização.

## Atendimento

O cliente informa o código no cardápio ou na revisão do carrinho. O código tem quatro dígitos, funciona apenas naquela mesa e tem limite de segurança de 24 horas. É gerado explicitamente pela equipe; consultar não gera outro código. Pode ser trocado pela equipe. Ao confirmar a liberação da mesa, o código é invalidado. Cancelar um pedido não encerra sozinho o acesso da mesa. A equipe deve consultar o código atual para o próximo cliente. O painel atualiza os códigos revelados a cada 15 segundos.

O QR sem código permite consultar o cardápio. O link geral, sem mesa, também é apenas para consulta. Pedidos e chamados do público passam por funções protegidas no banco; clientes antigos não conseguem contornar a proteção pela função anterior. Pedidos da equipe continuam usando suas próprias autorizações. A validação de horários também vale para pedidos registrados pela equipe.

Ter uma foto do QR, sozinha, não autoriza pedidos. Isso não é comprovação por GPS: alguém que receber um código ainda válido também poderá usá-lo até a expiração ou revogação. O proprietário pode desligar a exigência, mas a tela explica que isso permite pedidos remotos durante o atendimento.

No fechamento, o banco bloqueia imediatamente novos itens daquele setor, mesmo com páginas antigas abertas. Pedidos existentes continuam em preparo, entrega e acompanhamento. O cliente com uma conta aberta e código válido pode continuar solicitando atendimento ou a conta.

## Resumo no sino

Cada fechamento programado do bar gera um único aviso, normalmente em até um minuto; o painel recebe a atualização em tempo real e também consulta periodicamente. Não depende de manter o navegador aberto. O histórico busca até sete dias de fechamentos pendentes.

O período vai do fechamento anterior do bar até o atual, incluindo vendas da cozinha antes da abertura do bar. Os intervalos incluem o início e excluem o fim para evitar duplicações. A receita soma subtotal, serviço e couvert de pedidos entregues; cancelados e pedidos em aberto aparecem separados. Não confirma pagamento. Uma entrega posterior atualiza o valor ao consultar o resumo novamente. Uma pausa manual não substitui um fechamento programado para gerar o relatório.

## Tutorial

**Configurações → Operação → Ver tutorial** abre dez etapas nas telas reais. Há instruções, exemplos, anterior/próximo, escolha de etapa e **Ver tela** para recolher o guia enquanto explora. Navegar no tutorial não cadastra mesas, produtos ou pedidos. Alterações reais só acontecem ao usar os respectivos controles das telas.

## Verificação

`npm run test:db` recria um banco local isolado e verifica preços, permissões, horários, meia-noite, códigos por mesa, validade, fechamento de conta, isolamento entre restaurantes e resumo financeiro. Também executa o pacote consolidado no cenário em que os links personalizados ainda estão pendentes e testa sua reaplicação. Não utiliza nem altera os dados do Supabase real. O agendador Cron deve ser confirmado no projeto Supabase após a execução do SQL.

## Atualização da operação do beta

Aplique `supabase/fluxqr-melhorias-beta.sql` depois da atualização de mesas. Recarregue todos os aparelhos para usar os novos RPCs de envio com limite de tentativas. `Ocultar entregues` organiza a cozinha e preserva a conta, a ocupação e o código. `Encerrar atendimento` libera a mesa e exige entregar ou cancelar os pedidos pendentes; não registra pagamento.

Novos pedidos públicos têm orçamento por mesa (20 tentativas/minuto, bloqueio após cinco falhas) e por restaurante (120 ações/minuto). Chamados têm até seis tentativas/minuto e continuam deduplicados enquanto aguardam atendimento. Falhas de validação consomem orçamento mesmo quando o pedido não é criado. Reenvios do mesmo pedido confirmado reutilizam a identificação e não criam outro registro. Os limites são compartilhados pela mesa e não são confirmação de localização física.

# Estado do beta comercial

## Código e banco local

- Basic mantém visão geral, edição e personalização do cardápio e QR geral. Essential acrescenta cozinha, bar, pedidos e até dez QR operacionais. Pro e Trial válido liberam garçom, análises, alertas sonoros e QR operacionais ilimitados. Enterprise segue indisponível para contratação.
- Trial vencido limita o painel a Assinatura e Sair. O SQL completo bloqueia consultas privadas e ações de operação, preserva o histórico e respeita concessões administrativas. A ponte mantém o comportamento do app e do webhook legados.
- Preços mensais de R$ 30, R$ 99 e R$ 199 conferidos no código. A suíte simula assinatura e retentativa do webhook, isolamento do sandbox e reconciliação. O banco também rejeita novo checkout quando existe assinatura pendente no mesmo ambiente.
- O PostgreSQL local usa dados fictícios. A suíte cobre limite de QR em lote e sob concorrência, downgrade, preços calculados no servidor, duplicidade, horários, códigos, fechamento e isolamento de restaurantes. O procedimento de implantação está no [roteiro](DEPLOYMENT.md).

Validação local aprovada em Windows com `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run test:db`, `npm.cmd run build` e `npm.cmd run db:bootstrap`. A suíte de aplicação aprovou 166 testes e pulou 25 casos que exigem Supabase configurado para integração. O banco descartável confirmou a cadeia versionada, a reaplicação do consolidado e a ponte legada com webhook simulado. A revisão cobriu transições do titular, cozinha, garçom e perfil misto no Essential e Pro. O consolidado verifica os predicados de acesso ativo e rejeita alterações mesmo quando os nomes das políticas são preservados.

## Banco instalado e publicação

- O gestor informou que o FluxQr tem histórico vazio, sem seleção de mesas operacionais e ainda com o webhook legado. O código e o SQL desta rodada aguardam revisão e QA. Não houve aplicação remota ou publicação nesta rodada.
- Backup e restauração em cópia descartável, hospedagem Cloudflare e origem HTTPS definitiva, Auth/SMTP, contatos legais verificados e monitoramento do app, banco e webhook seguem sem confirmação. Testes manuais em celular e de QR impresso, áudio, reconexão e fluxo Stripe publicado também aguardam ambiente autorizado. Nenhuma cobrança real foi executada.

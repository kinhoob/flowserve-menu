# Integrações independentes

O aplicativo usa Vite/TanStack Start/Nitro diretamente, Supabase Auth para login e a API oficial do Stripe. Nenhuma credencial ou gateway do Lovable é necessário. O símbolo da marca usa um ícone local do pacote de interface.

## Contas e configuração

1. Use contas de hospedagem, Supabase, Google Cloud e Stripe controladas pelo proprietário do Flux Menu. A mudança de código não transfere automaticamente o banco, usuários, arquivos ou assinaturas de contas gerenciadas anteriormente.
2. Confira se você controla o Supabase atual. Se precisar de outro projeto, faça backup, restaure os dados e usuários com um procedimento apropriado ao Supabase e transfira também os objetos de Storage. Reaplicar migrações em um banco vazio cria o schema, não transfere os dados. Valide RLS, Auth, Storage e Realtime antes de trocar URLs. Não reaplique o histórico inteiro sobre produção existente.
3. Configure as variáveis de `.env.example`. Os valores VITE\_\* são públicos e entram no build; chaves secretas ficam somente no servidor. Configure `APP_URL` e `VITE_PUBLIC_APP_URL` com o domínio final HTTPS.
4. No Google Cloud, configure o cliente OAuth. No Supabase, habilite Google com Client ID/secret e cadastre o callback exibido pelo Supabase como redirect autorizado no Google. Configure Site URL e allowlist de `/dashboard` e `/reset-password` nos domínios permitidos do Supabase. Teste login, confirmação de email e recuperação; o SMTP de produção também precisa ser configurado na sua conta.
5. No Stripe, crie os preços recorrentes BRL com lookup keys `basic_monthly`, `essential_monthly` e `pro_monthly`, conferindo os valores mostrados no site. Configure `STRIPE_SANDBOX_SECRET_KEY=sk_test_...` e chave pública `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...` no ambiente de testes; `PAYMENTS_ENVIRONMENT=sandbox`. Em produção use as chaves live e `PAYMENTS_ENVIRONMENT=live`.
6. Cadastre o webhook `/api/public/payments/webhook?env=live` para os eventos `customer.subscription.created`, `customer.subscription.updated` e `customer.subscription.deleted`. Copie o signing secret para `PAYMENTS_LIVE_WEBHOOK_SECRET`; sandbox usa seu próprio endpoint e secret. Configure também o Billing Portal.
7. Assinaturas existentes precisam continuar na conta Stripe que as possui. IDs de clientes e assinaturas de outra conta não podem simplesmente ser reutilizados. Confirme a propriedade e as lookup keys antes de habilitar cobrança; não crie assinaturas substitutas para clientes já pagantes sem um plano de migração.
8. Faça `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db` e `npm run build`. O build gera a configuração Cloudflare em `.output/server/wrangler.json`; configure os secrets na hospedagem. A atualização de minimatch por override corrige o advisory GHSA-g3hv-75wg-m249 no parser do lint e exige Node 24, já adotado pelo projeto.

## Banco e publicação

Esta branch inclui as correções anteriores e a migração `20261113000100_dish_ar.sql`. Aplique somente as migrações pendentes em ordem. A migração de RA é aditiva e mantém os itens atuais sem modelos. Publique o frontend depois da migração.

A migração de contas, configuração dos provedores, aplicação das migrações em produção e publicação não são executadas por este código. Valide um pedido completo, login real Google, uma assinatura sandbox, eventos duplicados e reenvio do webhook no ambiente conectado antes do go-live.

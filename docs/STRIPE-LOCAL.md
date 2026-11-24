# Stripe no Flux: configuração local de teste

Use as chaves da mesma conta/sandbox. Preencha apenas no arquivo .env.local, ignorado pelo Git:

```env
PAYMENTS_ENVIRONMENT=sandbox
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SANDBOX_SECRET_KEY=sk_test_...
PAYMENTS_SANDBOX_WEBHOOK_SECRET=
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
APP_URL=http://127.0.0.1:5187
```

A variável SUPABASE_SERVICE_ROLE_KEY aceita a Secret key moderna do Supabase; é usada apenas no servidor. As configurações públicas existentes do Supabase são preservadas. A chave whsec é distinta das chaves de API do Stripe e será preenchida pelo listener.

1. Instale a Stripe CLI oficial em .tools/stripe/stripe.exe ou indique o executável com STRIPE_CLI_PATH.
2. Execute npm run stripe:setup. O script aceita apenas sandbox, confere preços existentes e cria somente o que falta: Basic R$30, Essential R$99 e Pro R$199, mensais em BRL. Não cria assinaturas nem faz cobranças.
3. Execute npm run stripe:listen e mantenha o terminal aberto. Ele passa a chave por variável de ambiente, grava o signing secret sem imprimi-lo e encaminha os eventos customer.subscription.created, updated e deleted ao webhook local.
4. Após o listener conectar, inicie/reinicie npm run dev -- --host 127.0.0.1 --port 5187 --strictPort. O comando carrega as variáveis locais também no servidor.
5. Abra Configurações → Cobrança, escolha um plano e conclua o checkout usando somente dados de teste do Stripe. Verifique o retorno e os eventos no listener.

O banco registra eventos sandbox separadamente. Eles não concedem acesso de produção nem substituem concessões manuais da gestão. Uma assinatura de teste aprovada não significa que uma cobrança real foi ativada. O portal de assinaturas também deve estar configurado no ambiente de teste do Stripe.

Em produção, configure as variáveis na hospedagem, o domínio HTTPS e um endpoint público de webhook com seu próprio segredo. Localhost precisa do listener para receber eventos externos. Nunca envie as chaves por chat nem use dados reais de cartão durante esta validação.

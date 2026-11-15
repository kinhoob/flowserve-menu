# Flux Menu

SaaS de cardápio digital e operação de bares e restaurantes com integrações diretas de autenticação e pagamento.

## Implementação atual

React 19, TypeScript, TanStack Start/Router/Query, Vite, Tailwind 4 e shadcn/ui. Supabase oferece autenticação, PostgreSQL, Storage e Realtime. Stripe fornece checkout e assinaturas. O projeto inclui configuração de implantação para Cloudflare.

O código contém cardápio público por restaurante/mesa, produtos e adicionais, pedidos, cozinha/bar, garçom, mesas, QR Codes, análises, equipe por PIN e planos Basic, Essential e Pro. Enterprise aparece como indisponível.

## Desenvolvimento

Use Node.js 24 e npm. Copie `.env.example` para `.env.local` e preencha os valores do seu ambiente de desenvolvimento.

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run test:db` cria um PostgreSQL de teste local em 127.0.0.1:55439, reaplica todas as migrações em um banco vazio e valida preços, isolamento, sessões da equipe e eventos de pagamento. Não acessa o Supabase real. A instância é encerrada no fim, e os arquivos ficam em `.db-tests/`, ignorado pelo Git.

Os testes remotos de integração ficam desativados por padrão. Para executá-los, configure explicitamente `RUN_INTEGRATION_TESTS=1` e as variáveis `TEST_*` em um projeto Supabase descartável, com produto, mesa e equipe de teste. Nunca use credenciais de produção nesses testes.

## Organização

- `src/routes`: páginas e endpoint do webhook.
- `src/features`: consultas e componentes de autenticação, restaurante, cardápio, pedidos, mesas, equipe e cobrança.
- `src/lib`: regras compartilhadas, pagamentos e testes.
- `supabase/migrations`: schema, RLS e funções de banco.
- `scripts/verify-database.mjs`: testes locais das migrações.

## Segurança e implantação

Preços são calculados no banco a partir do catálogo. O cliente envia IDs e quantidades. Adicionais, disponibilidade, restaurante e mesa são validados antes da inserção atômica.

O acompanhamento público usa um token privado e retorna apenas status; não expõe as tabelas de pedidos. Equipe usa sessões com validade e PIN armazenado como hash. O checkout deriva a identidade da sessão autenticada. Eventos de cobrança são aplicados de forma transacional, com deduplicação, ordenação e isolamento entre sandbox/live.

Leia [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) antes de publicar. As migrações novas exigem publicação coordenada com o frontend. Não foram executadas contra o banco de produção.

## Integrações e realidade aumentada

Leia [a migração das integrações](docs/INDEPENDENT-INTEGRATIONS.md), [a produção dos modelos e RA](docs/DISH-AR.md) e [as prioridades de produto](docs/PRODUCT-ROADMAP.md). O código não depende do editor ou gateway Lovable.

## Manutenção do código

As telas de configuração usam componentes próprios de estabelecimento e equipe. O lançamento rápido de pedidos é compartilhado entre dono e funcionários, mantendo RPCs distintos para cada autorização. Formatação monetária, normalização de mesas, sessão de autenticação e regras de planos ficam em módulos compartilhados. TypeScript rejeita variáveis e parâmetros sem uso, e o CI executa lint antes dos testes e do build.

O cadastro de itens aceita modelos GLB/USDZ e descrição de porção. A RA fica disponível somente após confirmação de escala pelo estabelecimento e em aparelhos compatíveis. Ainda é necessário produzir os modelos reais, configurar as contas próprias e homologar em celulares. As migrações históricas permanecem para reconstrução do banco.

## Nova experiência

Abra `/demo` para explorar a operação e o cardápio com dados ilustrativos, sem configurar um banco. A página inicial e a demonstração funcionam mesmo sem credenciais. O uso com dados reais exige o novo Supabase e a configuração de autenticação.

Busca por nome/descrição/categoria, filtros, ordenação e favoritos foram adicionados ao cardápio. O painel tem navegação com Ctrl/Cmd+K e acessos rápidos. As contas têm calculadora de divisão igual com distribuição exata dos centavos, sem registro de pagamento. Leia [o guia de recursos e validação](docs/EXPERIENCE.md).

## Banco Supabase novo

Siga [o guia de conexão e primeira instalação](docs/SUPABASE-SETUP.md). `npm run db:bootstrap` gera um instalador único para um projeto novo e vazio; credenciais e o SQL gerado ficam fora do Git. O script reúne as migrações em uma transação e bloqueia uma reaplicação sobre as tabelas já existentes.

O cadastro usa o link de confirmação do template padrão do Supabase, sem exigir OTP ou personalização do e-mail. SMTP próprio continua necessário para enviar e-mails aos clientes fora da equipe do projeto.

# Flux Menu

SaaS de cardápio digital e operação de bares e restaurantes criado no Lovable.

## Implementação atual

React 19, TypeScript, TanStack Start/Router/Query, Vite, Tailwind 4 e shadcn/ui. Supabase oferece autenticação, PostgreSQL, Storage e Realtime. Stripe fornece checkout e assinaturas. O projeto inclui configuração de implantação para Cloudflare.

O código contém cardápio público por restaurante/mesa, produtos e adicionais, pedidos, cozinha/bar, garçom, mesas, QR Codes, análises, equipe por PIN e planos Basic, Essential e Pro. Enterprise aparece como indisponível.

## Desenvolvimento

Use Node.js 24 e npm. Copie `.env.example` para `.env.local` e preencha os valores do seu ambiente de desenvolvimento.

```sh
npm ci
npm run dev
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

## Lovable

[Editor do projeto](https://lovable.dev/projects/2b7608ef-e90e-4bb7-a850-830dcb920ec8). Mudanças na branch principal podem sincronizar com o editor; revise a implantação do banco antes do merge.

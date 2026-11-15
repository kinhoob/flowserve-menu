# Primeiro acesso ao Supabase FluxQr

## Conexão do aplicativo

Copie `.env.example` para `.env.local` e configure a URL base do projeto (sem `/rest/v1/`) em `VITE_SUPABASE_URL` e `SUPABASE_URL`. Configure a publishable key em `VITE_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_PUBLISHABLE_KEY`. O arquivo local deve permanecer ignorado pelo Git. A chave pública não permite instalar tabelas; o aplicativo depende das regras RLS criadas pelas migrações.

## Instalação em um projeto novo

1. Rode `npm run db:bootstrap` para gerar `supabase/bootstrap.sql` com as migrações ordenadas. O arquivo gerado não é versionado e não contém credenciais.
2. Abra o projeto correto no painel Supabase, entre em SQL Editor e crie uma consulta nova.
3. Copie todo o conteúdo de `supabase/bootstrap.sql` e execute a consulta com o papel administrativo padrão do editor. Não execute em outro banco com dados existentes.
4. Confirme o resultado `FluxQr inicializado com sucesso`. O instalador roda em uma transação e bloqueia a execução se já houver tabelas centrais do Flux. Se ocorrer erro, compartilhe somente a mensagem de erro para análise; não execute um reset.
5. Aguarde a atualização do schema da API e confira as tabelas em Table Editor. Não é preciso cadastrar os produtos manualmente pelo SQL.

Este instalador reconstrói a estrutura, funções, permissões, bucket de imagens e configuração Realtime. Não transfere dados, imagens ou usuários do Lovable. O identificador em `supabase/config.toml` é local; não autoriza nem seleciona automaticamente um projeto remoto.

## Autenticação, após instalar as tabelas

- Em Authentication → URL Configuration, para desenvolvimento configure Site URL `http://localhost:5187` e permita os redirects `http://localhost:5187/dashboard` e `http://localhost:5187/reset-password`. Em produção use o domínio HTTPS publicado.
- O fluxo de cadastro usa um código de confirmação por e-mail. Em Email Templates → Confirm signup, inclua `{{ .Token }}` para o usuário receber o código esperado pela tela; o link `{{ .ConfirmationURL }}` pode continuar disponível. Configure SMTP próprio antes do uso em produção.
- Crie a primeira conta pelo aplicativo somente depois de instalar a estrutura. Os triggers criam o perfil e o restaurante vinculados ao usuário.
- O login Google é separado: habilite o provedor no Supabase e configure o cliente OAuth na sua conta Google Cloud, seguindo `INDEPENDENT-INTEGRATIONS.md`.
- `SUPABASE_SERVICE_ROLE_KEY` continua exclusiva do servidor e será necessária para receber eventos de cobrança. Não é necessária para começar a testar cadastro e operação. Não a compartilhe no chat nem a coloque em variáveis VITE\_\*.

## Migrações futuras

Após usar este instalador, aplique somente as migrações novas. Não rode novamente o instalador nem reaplique o histórico inteiro. Se adotar o Supabase CLI depois da instalação manual, primeiro reconcilie o histórico com `supabase migration repair` após confirmar as versões realmente aplicadas; o instalador não modifica o schema interno de controle do CLI.

O instalador combinado foi validado em PostgreSQL descartável com o mesmo teste de integridade, isolamento, autenticação da equipe, cobrança e RA do projeto. Isso não substitui a verificação no projeto remoto depois da execução pelo proprietário.

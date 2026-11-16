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
- O cadastro usa confirmação por link, compatível com o template padrão do Supabase. Não é necessário editar o e-mail para o primeiro teste. O envio padrão aceita apenas endereços da equipe da organização e tem limites baixos; use o e-mail da sua conta Supabase no teste inicial. Para enviar a clientes e personalizar assunto/conteúdo, configure SMTP próprio. Mantenha `{{ .ConfirmationURL }}` nos templates personalizados de confirmação.
- Crie a primeira conta pelo aplicativo somente depois de instalar a estrutura. Os triggers criam o perfil e o restaurante vinculados ao usuário.
- O login Google é separado: habilite o provedor no Supabase e configure o cliente OAuth na sua conta Google Cloud, seguindo `INDEPENDENT-INTEGRATIONS.md`.
- `SUPABASE_SERVICE_ROLE_KEY` continua exclusiva do servidor e será necessária para receber eventos de cobrança. Não é necessária para começar a testar cadastro e operação. Não a compartilhe no chat nem a coloque em variáveis VITE\_\*.

## Migrações futuras

Após usar este instalador, aplique somente as migrações novas. Não rode novamente o instalador nem reaplique o histórico inteiro. Se adotar o Supabase CLI depois da instalação manual, primeiro reconcilie o histórico com `supabase migration repair` após confirmar as versões realmente aplicadas; o instalador não modifica o schema interno de controle do CLI.

O instalador combinado foi validado em PostgreSQL descartável com o mesmo teste de integridade, isolamento, autenticação da equipe, cobrança e RA do projeto. Isso não substitui a verificação no projeto remoto depois da execução pelo proprietário.

## Confirmação por link

Depois do cadastro, abra o e-mail e clique no link de confirmação. Ele retorna ao aplicativo no endereço permitido. A sessão é reconhecida automaticamente no mesmo navegador. Se o e-mail abrir em outro navegador, use “Já confirmei. Entrar” na tela original e faça login com sua senha. O aplicativo não pede um código de seis dígitos. Reenvios têm espera local de 60 segundos, além dos limites impostos pelo Supabase. Não é preciso desativar a confirmação por e-mail.

## Personalização do cardápio em um banco já instalado

Aplique somente `supabase/migrations/20261115000100_menu_appearance.sql` no SQL Editor do projeto correspondente (ou pelo fluxo de migrações já reconciliado). Não execute novamente o bootstrap. A migração adiciona preferências JSON validadas à tabela de restaurantes, mantém as seis cores existentes e utiliza as mesmas políticas de proprietário. Foram verificados o isolamento entre restaurantes e a rejeição de valores inválidos no PostgreSQL local.

Em Configurações → Personalização, cada restaurante escolhe a própria paleta, fonte, disposição dos pratos, cantos, fotos, enquadramento, alinhamento do cabeçalho, estilo/texto dos botões e exibição de descrições/porções. A prévia utiliza as mesmas regras visuais do cardápio público e os primeiros pratos disponíveis; sem produtos, exibe exemplos identificados. Os contrastes são ajustados para leitura. Nome, descrição, logo e banner permanecem em Estabelecimento. O botão do banner leva ao catálogo.

Alterações são locais à prévia até “Salvar e publicar”; “Descartar” recupera a configuração publicada e “Restaurar padrão na prévia” também exige publicação. O rascunho fica no armazenamento local deste navegador por restaurante, sem credenciais, até publicar ou descartar. As preferências são gravadas junto às cores em uma atualização única sob RLS. Antes da migração, a publicação fica bloqueada e o cardápio continua com as preferências padrão, preservando a paleta já existente. A demonstração `/demo?view=customize` não grava nada no banco.

### Identidade completa do restaurante

Para ampliar o estúdio, aplique apenas `20261116000100_complete_menu_identity.sql`. Essa migração também pode ser aplicada diretamente quando a migração inicial de aparência ainda não foi executada: ela cria a coluna se necessário e substitui a validação mantendo os dados existentes. Não reaplique o bootstrap. O arquivo pode ser executado novamente sem resetar a configuração.

O editor oferece capa por URL HTTPS ou envio de JPG/PNG/WEBP de até 5 MB, altura da capa, chamada, boas-vindas, mensagem do rodapé, visibilidade da assinatura Flux, tamanho/formato do logo, estilos de navegação e títulos das categorias, acabamento dos cartões, escala de texto, espaçamento e textura do fundo. As regras são compartilhadas com o cardápio público. O envio da capa grava um arquivo no armazenamento; sua exibição no cardápio depende de publicar a personalização. Remover a capa da prévia não apaga o arquivo do armazenamento. Nome e logo continuam editáveis em Estabelecimento. As novas opções exigem a migração completa; sem ela, o banco rejeita a publicação e o aplicativo orienta a atualização.

## Gestão, operação e relatórios

A atualização incremental `20261116000200_restaurant_operations.sql` habilita importação CSV atômica, edição em lote, promoções por período e registro de preparo/cancelamento. Execute uma vez no banco existente e consulte `OPERATIONS-UPGRADE.md` para formatos, limites e uso. Não execute o bootstrap para atualizar um projeto com dados.

## Salvamento bloqueado e padrão visual

A atualização de operação não cria a coluna de aparência. Se o editor mostrar “Ativação do salvamento pendente”, aplique a migração completa `20261116000100_complete_menu_identity.sql` e a de padrão `20261116000300_menu_black_gold.sql`. O SQL de reparação entregue reúne as duas numa transação. O teste do banco reproduz a coluna ausente e confirma a reparação sem recriar o restaurante. Depois, clique em “Verificar novamente”.

O padrão é preto, dourado e branco, com vitrine de pratos e 14 paletas editáveis. A migração altera o padrão dos novos restaurantes e corrige apenas o antigo registro inicial dourado sem personalização. Paletas explicitamente configuradas são preservadas. A barra de salvamento fica no topo durante a edição, valida as entradas e atualiza o estado publicado após a confirmação do servidor. A demonstração oferece acesso ao editor real e não simula publicação. O armazenamento local pode estar indisponível em navegadores com restrições de privacidade; isso não bloqueia a publicação no servidor.

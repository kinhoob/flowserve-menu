# Experiência e recursos do Flux Menu

## Visual e componentes

React 19, TanStack Start/Router/Query, Tailwind CSS 4, componentes shadcn/ui com Radix, Motion e Lucide continuam como base. cmdk oferece a navegação por teclado. DM Sans e Manrope são servidas localmente pelo Fontsource. A interface usa uma marca SVG própria, tons de floresta/dourado, cartões responsivos e transições curtas. MotionConfig e CSS respeitam prefers-reduced-motion.

## Recursos disponíveis

- Página inicial redesenhada, com exemplos claramente identificados, acesso à demonstração, planos existentes e navegação móvel.
- `/demo?view=operation`: ambiente demonstrativo público; permite filtrar e avançar pedidos simulados. Os dados são locais e reiniciáveis. Não envia pedidos, realiza cobranças ou consulta dados de um restaurante real.
- `/demo?view=menu`: cardápio demonstrativo com busca sem acentos, filtros, ordenação, favoritos, seleção de itens, alteração de quantidades e envio simulado à aba Operação. Atualizar a página reinicia os pedidos/seleção; favoritos permanecem neste navegador.
- `/m/:slug`: cardápio real com os mesmos controles de descoberta. Busca encontra palavras no nome, descrição e categoria, combinando os filtros. Ordenação por preço/nome aplica-se ao resultado completo; o modo padrão mantém a organização original por categorias. Filtro vegetariano depende das tags cadastradas pelo restaurante.
- Favoritos são armazenados localmente, com chave por restaurante, limite de 500 IDs, recuperação de dados inválidos e atualização entre abas. Falhas de armazenamento mantêm o recurso funcionando em memória. Não há sincronização entre dispositivos ou associação à conta.
- Painel autenticado: busca de páginas com Ctrl/Cmd+K, seleção por setas/Enter e fechamento por Escape; respeita os recursos do plano e abre o aviso de upgrade quando necessário. Dashboard com cartões refinados e acessos rápidos.
- Calculadora de divisão igual de 1 a 20 pessoas nas telas de conta do dono e garçom e na seleção demonstrativa. O total de duas casas decimais é convertido em centavos e o resto é distribuído entre as primeiras pessoas. Não registra pagamentos, não altera o pedido e não realiza cobranças.

Sem configuração do Supabase, página inicial e demonstração continuam disponíveis. A página de acesso mostra um estado orientativo e um caminho para explorar a demonstração. Isso não libera rotas protegidas nem cria sessões fictícias.

## Verificação

- 81 testes aprovados; 25 testes remotos continuam desativados por configuração.
- TypeScript, lint, formatação e build de produção aprovados.
- Todas as migrações reaplicadas em PostgreSQL local; validações existentes de pedidos, isolamento, PINs, cobrança e RA aprovadas.
- Teste no navegador: navegação, avanço do preparo, busca sem acento, favoritos e persistência após recarga, seleção, divisão de R$ 29 em três pessoas e pedido simulado.
- Tela móvel de 390×844 conferida sem rolagem horizontal, incluindo navegação e menu lateral. Sem erros de console observados na demonstração.
- Cadastro/login, consultas do restaurante real, atalhos dentro do painel autenticado e fechamento com dados reais ainda precisam de homologação no novo Supabase. Não houve publicação ou alteração do banco de produção.

## Publicação

Não há novas migrações nesta rodada visual. A branch inclui a migração de integrações/RA anterior; aplique as migrações que ainda estiverem pendentes antes de publicar. Siga `INDEPENDENT-INTEGRATIONS.md` e `DEPLOYMENT.md`.

As fotos de comida são exemplos externos do Unsplash usados somente na apresentação e na demonstração; não representam pratos cadastrados de um restaurante. Modelos 3D reais continuam dependendo da produção dos arquivos e conferência das medidas. As fontes são locais, e a demonstração funciona sem credenciais de backend.

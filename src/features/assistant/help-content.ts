export const HELP = [
  {
    title: "Personalizar o cardápio",
    path: "/settings",
    feature: "menu",
    keywords: "cores paleta logo identidade salvar aparência",
    steps: [
      "Abra as configurações de personalização do cardápio.",
      "Escolha cores, logo e apresentação do restaurante. Confira a prévia.",
      "Salve as alterações antes de sair e abra o cardápio público para conferir.",
    ],
  },
  {
    title: "Cadastrar pratos e bebidas",
    path: "/menu",
    feature: "menu",
    keywords: "produto categoria preço adicionais indisponível",
    steps: [
      "Crie uma categoria para organizar os produtos.",
      "Adicione nome, descrição, preço e foto do item.",
      "Confira os adicionais e a disponibilidade antes de publicar.",
    ],
  },
  {
    title: "Receber e preparar pedidos",
    path: "/kitchen",
    feature: "kitchen",
    keywords: "cozinha bar fila pronto entrega som",
    steps: [
      "Confira novos pedidos e observações na fila.",
      "Filtre Cozinha ou Bar conforme a equipe.",
      "Avance o preparo e marque como pronto somente quando puder entregar.",
    ],
  },
  {
    title: "QR Codes e código temporário",
    path: "/qrcodes",
    keywords: "mesa imprimir acesso longe segurança senha",
    steps: [
      "Associe o QR Code à mesa e confira o endereço público antes de imprimir.",
      "O QR abre o cardápio. Para pedir, o cliente informa o código temporário quando solicitado.",
      "Entregue o código no salão; não imprima o código temporário junto ao QR.",
    ],
  },
  {
    title: "Horários da cozinha e do bar",
    path: "/settings",
    keywords: "fechamento abrir funcionamento pedidos",
    steps: [
      "Abra as configurações de operação.",
      "Defina os horários da cozinha e do bar e confira o fuso do restaurante.",
      "Salve e teste o cardápio para conferir o bloqueio de novos pedidos fora do horário.",
    ],
  },
  {
    title: "Entender as análises",
    path: "/analytics",
    feature: "analytics",
    keywords: "receita vendas faturamento período relatório",
    steps: [
      "Escolha o período e confira os filtros.",
      "Compare pedidos, produtos e movimento nos mesmos períodos.",
      "Receita de pedidos não comprova recebimento de pagamentos. Confira o fechamento financeiro separadamente.",
    ],
  },
  {
    title: "Mesas e atendimento",
    path: "/tables",
    feature: "tables",
    keywords: "ocupação conta histórico salão",
    steps: [
      "Localize a mesa pelo nome ou pela busca.",
      "Abra a mesa para ver pedidos, tempo de atendimento e código, ou iniciar um pedido.",
      "Entregue ou cancele os pedidos pendentes. Depois confira a conta e encerre o atendimento para liberar a mesa.",
    ],
  },
] as const;
export function searchHelp(query: string, pathname: string) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return HELP.filter((article) =>
    terms.every((term) =>
      normalize(article.title + " " + article.keywords + " " + article.steps.join(" ")).includes(
        term,
      ),
    ),
  ).sort((a, b) => Number(b.path === pathname) - Number(a.path === pathname));
}

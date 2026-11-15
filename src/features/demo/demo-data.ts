export type DemoDish = {
  id: string;
  name: string;
  description: string;
  price: number;
  original_price: number | null;
  is_promo: boolean;
  dietary_tags: string[];
  category_id: string;
  category_name: string;
  image_url: string;
  portion: string;
};
export const DEMO_DISHES: DemoDish[] = [
  {
    id: "burger",
    name: "Burger da casa",
    description: "Pão brioche, burger de 180 g, cheddar e cebola caramelizada.",
    price: 36,
    original_price: 42,
    is_promo: true,
    dietary_tags: [],
    category_id: "principais",
    category_name: "Principais",
    image_url:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=640&q=80",
    portion: "Individual · burger de 180 g",
  },
  {
    id: "pizza",
    name: "Pizza Margherita",
    description: "Massa de longa fermentação, mozzarella e manjericão fresco.",
    price: 58,
    original_price: null,
    is_promo: false,
    dietary_tags: ["vegetarian"],
    category_id: "principais",
    category_name: "Principais",
    image_url:
      "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=640&q=80",
    portion: "Serve 2 pessoas · 30 cm",
  },
  {
    id: "bowl",
    name: "Bowl da estação",
    description: "Folhas, grãos, vegetais da estação e molho cítrico.",
    price: 29,
    original_price: null,
    is_promo: false,
    dietary_tags: ["vegan"],
    category_id: "leves",
    category_name: "Leves & frescos",
    image_url:
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=640&q=80",
    portion: "Individual · 350 g",
  },
  {
    id: "salada",
    name: "Salada do jardim",
    description: "Um encontro de texturas, folhas frescas e legumes assados.",
    price: 25,
    original_price: 30,
    is_promo: true,
    dietary_tags: ["vegan"],
    category_id: "leves",
    category_name: "Leves & frescos",
    image_url:
      "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=640&q=80",
    portion: "Individual · 280 g",
  },
];
export type DemoOrder = {
  id: string;
  table: string;
  item: string;
  qty: number;
  itemsSummary?: string;
  amount: number;
  status: "pending" | "preparing" | "ready" | "served";
  time: string;
};
export const DEMO_ORDERS: DemoOrder[] = [
  {
    id: "1042",
    table: "04",
    item: "Burger da casa",
    qty: 2,
    amount: 72,
    status: "pending",
    time: "Agora",
  },
  {
    id: "1041",
    table: "08",
    item: "Pizza Margherita",
    qty: 1,
    amount: 58,
    status: "preparing",
    time: "há 4 min",
  },
  {
    id: "1040",
    table: "02",
    item: "Bowl da estação",
    qty: 2,
    amount: 58,
    status: "ready",
    time: "há 8 min",
  },
  {
    id: "1039",
    table: "06",
    item: "Salada do jardim",
    qty: 1,
    amount: 25,
    status: "served",
    time: "há 12 min",
  },
];
export const DEMO_STATUS = {
  pending: { label: "Novo pedido", action: "Começar preparo", color: "#e9bc67" },
  preparing: { label: "Em preparo", action: "Marcar como pronto", color: "#9fb7eb" },
  ready: { label: "Pronto para servir", action: "Marcar como entregue", color: "#9fc7a9" },
  served: { label: "Entregue", action: "Entregue", color: "#a1aca4" },
};

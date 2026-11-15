export type Plan = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  featured: boolean;
  badge: string | null;
  comingSoon: boolean;
  slug?: "basic" | "essential" | "pro";
};

export const plans: Plan[] = [
  {
    name: "Basic",
    price: "R$ 30",
    period: "/mês",
    description: "Cardápio Digital Essencial. Apenas visualização — sem pedidos ou chamados.",
    features: [
      "Cardápio digital ilimitado",
      "QR Code para o salão",
      "Atualizações em tempo real",
      "Sem pedidos ou chamado de garçom",
    ],
    cta: "Começar agora",
    featured: false,
    badge: null,
    comingSoon: false,
    slug: "basic",
  },
  {
    name: "Essential",
    price: "R$ 99",
    period: "/mês",
    description: "Operação Digital. Pedidos via QR Code e Painel da Cozinha.",
    features: [
      "Pedidos por QR Code",
      "KDS para cozinha e bar",
      "Cardápio digital ilimitado",
      "Até 5 QR Codes",
      "Suporte por email",
    ],
    cta: "Começar grátis",
    featured: false,
    badge: null,
    comingSoon: false,
    slug: "essential",
  },
  {
    name: "Pro",
    price: "R$ 199",
    period: "/mês",
    description: "Gestão Total. Tudo do Essential mais a operação de salão.",
    features: [
      "QR Codes ilimitados",
      "Rota do Garçom (lançamento rápido)",
      "Análises de pico e ticket médio",
      "Alertas sonoros em tempo real",
      "Suporte prioritário",
    ],
    cta: "Iniciar teste grátis",
    featured: true,
    badge: "Mais Popular",
    comingSoon: false,
    slug: "pro",
  },
  {
    name: "Enterprise",
    price: "Personalizado",
    period: "",
    description: "Soluções Customizadas para redes e operações multi-unidade.",
    features: [
      "Multi-unidades centralizado",
      "Integrações sob medida",
      "SLA dedicado e onboarding",
      "Gerente de conta exclusivo",
    ],
    cta: "Entrar na Lista de Espera",
    featured: false,
    badge: "Em breve",
    comingSoon: true,
  },
];

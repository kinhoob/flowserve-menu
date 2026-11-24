import { ESSENTIAL_QR_LIMIT, PAID_PLANS, type PaidPlan } from "@/features/billing/plan-matrix";

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
  slug?: PaidPlan;
};

export const plans: Plan[] = [
  {
    name: PAID_PLANS.basic.name,
    price: `R$ ${PAID_PLANS.basic.amount / 100}`,
    period: "/mês",
    description: "Cardápio Digital Essencial. Apenas visualização — sem pedidos ou chamados.",
    features: [
      "Cardápio digital ilimitado",
      "QR Code geral do restaurante",
      "Personalização e atualizações em tempo real",
      "Sem pedidos ou chamado de garçom",
    ],
    cta: "Começar agora",
    featured: false,
    badge: null,
    comingSoon: false,
    slug: "basic",
  },
  {
    name: PAID_PLANS.essential.name,
    price: `R$ ${PAID_PLANS.essential.amount / 100}`,
    period: "/mês",
    description: "Operação Digital. Pedidos via QR Code e Painel da Cozinha.",
    features: [
      "Pedidos por QR Code",
      "Painel de pedidos para cozinha e bar",
      "Gestão de mesas e atendimentos",
      "Cardápio digital ilimitado",
      `Até ${ESSENTIAL_QR_LIMIT} QR Codes operacionais`,
      "Suporte por email",
    ],
    cta: "Começar grátis",
    featured: false,
    badge: null,
    comingSoon: false,
    slug: "essential",
  },
  {
    name: PAID_PLANS.pro.name,
    price: `R$ ${PAID_PLANS.pro.amount / 100}`,
    period: "/mês",
    description: "Gestão Total. Tudo do Essential mais a operação de salão.",
    features: [
      "Tudo do Essential",
      "QR Codes operacionais ilimitados",
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

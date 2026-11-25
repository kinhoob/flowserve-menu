import type { FeatureKey } from "@/features/billing/trial-status";
import {
  Armchair,
  BarChart3,
  ClipboardList,
  HandPlatter,
  LayoutDashboard,
  QrCode,
  Settings,
  UtensilsCrossed,
} from "lucide-react";
export type NavItem = {
  label: string;
  to:
    | "/dashboard"
    | "/menu"
    | "/qrcodes"
    | "/kitchen"
    | "/analytics"
    | "/waiter"
    | "/settings"
    | "/tables";
  icon: typeof LayoutDashboard;
  soon?: boolean;
  id?: string;
  feature?: FeatureKey;
};

export const NAV: NavItem[] = [
  {
    label: "Visão geral",
    to: "/dashboard",
    icon: LayoutDashboard,
    id: "nav-dashboard",
    feature: "dashboard",
  },
  { label: "Pedidos", to: "/kitchen", icon: ClipboardList, id: "nav-kitchen", feature: "kitchen" },
  { label: "Garçom", to: "/waiter", icon: HandPlatter, id: "nav-waiter", feature: "waiter" },
  { label: "Cardápio", to: "/menu", icon: UtensilsCrossed, id: "nav-menu", feature: "menu" },
  { label: "Mesas", to: "/tables", icon: Armchair, id: "nav-tables", feature: "tables" },
  {
    label: "QR Codes",
    to: "/qrcodes",
    icon: QrCode,
    id: "nav-qrcodes",
    feature: "qrcodes",
  },
  {
    label: "Análises",
    to: "/analytics",
    icon: BarChart3,
    id: "nav-analytics",
    feature: "analytics",
  },
  { label: "Configurações", to: "/settings", icon: Settings, id: "nav-settings" },
];

import { z } from "zod";
import { entitlementSchema } from "@/features/billing/entitlement";
export const healthSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  owner_email: z.string().nullable(),
  created_at: z.string(),
  entitlement: entitlementSchema,
  products: z.number(),
  available_products: z.number(),
  tables: z.number(),
  menu_ready: z.boolean(),
  tables_ready: z.boolean(),
  hours_ready: z.boolean(),
  first_order_ready: z.boolean(),
  completed_steps: z.number().int().min(0).max(4),
  first_order_at: z.string().nullable(),
  last_order_at: z.string().nullable(),
  trial_active: z.boolean(),
  trial_ending: z.boolean(),
  trial_expired: z.boolean(),
  manual_plan: z.boolean(),
  subscription_active: z.boolean(),
  subscription_attention: z.boolean(),
  setup_attention: z.boolean(),
  inactive_attention: z.boolean(),
  needs_attention: z.boolean(),
});
export const growthSchema = z.object({
  generated_at: z.string(),
  timezone: z.string(),
  days: z.number(),
  period_start: z.string(),
  previous_start: z.string(),
  previous_end: z.string(),
  totals: z.object({
    restaurants: z.number(),
    new_restaurants: z.number(),
    previous_new: z.number(),
    active_7d: z.number(),
    active_30d: z.number(),
    ready: z.number(),
    attention: z.number(),
    trial_active: z.number(),
    trial_ending: z.number(),
    trial_expired: z.number(),
    manual_plans: z.number(),
    subscriptions_active: z.number(),
  }),
  cohort: z.object({ accounts: z.number(), converted: z.number(), manual_only: z.number() }),
  onboarding: z.object({
    menu: z.number(),
    tables: z.number(),
    hours: z.number(),
    first_order: z.number(),
  }),
  registrations: z.array(z.object({ date: z.string(), count: z.number() })),
  attention: z.array(healthSchema),
});
export type RestaurantHealth = z.infer<typeof healthSchema>;
export type PlatformGrowth = z.infer<typeof growthSchema>;
export const ONBOARDING_STEPS = [
  {
    key: "menu_ready",
    count: "menu",
    label: "Cardápio disponível",
    description: "Ao menos um produto disponível em uma categoria ativa.",
  },
  {
    key: "tables_ready",
    count: "tables",
    label: "Mesas criadas",
    description: "Ao menos uma mesa cadastrada para receber o QR Code.",
  },
  {
    key: "hours_ready",
    count: "hours",
    label: "Horários configurados",
    description: "Agenda semanal de atendimento salva.",
  },
  {
    key: "first_order_ready",
    count: "first_order",
    label: "Primeiro pedido",
    description: "Ao menos um pedido não cancelado registrado.",
  },
] as const;
export function attentionReasons(health: RestaurantHealth) {
  return [
    health.trial_ending
      ? { key: "ending", label: "Trial vence em até 3 dias", filter: "ending" }
      : null,
    health.subscription_attention
      ? { key: "subscription", label: "Assinatura precisa de revisão", filter: "attention" }
      : null,
    health.trial_expired ? { key: "expired", label: "Trial encerrado", filter: "expired" } : null,
    health.setup_attention
      ? { key: "setup", label: "Implantação incompleta há pelo menos 2 dias", filter: "setup" }
      : null,
    health.inactive_attention
      ? { key: "inactive", label: "Sem pedidos há pelo menos 10 dias", filter: "inactive" }
      : null,
  ].filter((reason): reason is NonNullable<typeof reason> => reason !== null);
}
export function ratioPercent(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}
export function registrationChange(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

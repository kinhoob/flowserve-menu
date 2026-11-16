import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { entitlementSchema } from "@/features/billing/entitlement";
import { healthSchema, growthSchema } from "./platform-health";
export const restaurantListSchema = z.object({
  total: z.number(),
  page: z.number(),
  stats: z.object({
    restaurants: z.number(),
    trial: z.number(),
    expired: z.number(),
    paid: z.number(),
    manual: z.number(),
  }),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      created_at: z.string(),
      currency: z.string(),
      owner_id: z.string(),
      owner_email: z.string().nullable(),
      owner_name: z.string().nullable(),
      entitlement: entitlementSchema,
      orders_30d: z.number(),
      sales_30d: z.number(),
      last_order_at: z.string().nullable(),
      health: healthSchema.optional(),
    }),
  ),
});
export const detailSchema = z.object({
  health: healthSchema.optional(),
  restaurant: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    currency: z.string(),
    timezone: z.string(),
    created_at: z.string(),
    kitchen_open: z.boolean(),
    bar_open: z.boolean().optional(),
    operating_hours: z.unknown().optional(),
    require_table_code: z.boolean().optional(),
  }),
  entitlement: entitlementSchema,
  owner: z.object({
    id: z.string(),
    email: z.string().nullable(),
    name: z.string().nullable(),
    phone: z.string().nullable(),
    created_at: z.string(),
    last_sign_in_at: z.string().nullable(),
    billing_plan: z.string(),
    billing_trial_ends_at: z.string(),
  }),
  counts: z.object({
    restaurants: z.number(),
    products: z.number(),
    available_products: z.number(),
    categories: z.number(),
    tables: z.number(),
    staff: z.number(),
  }),
  orders: z.object({
    total: z.number(),
    open: z.number(),
    cancelled: z.number(),
    delivered: z.number(),
    sales: z.number(),
    last_at: z.string().nullable(),
  }),
  subscriptions: z.array(
    z.object({
      stripe_subscription_id: z.string(),
      status: z.string(),
      plan_type: z.string().nullable(),
      environment: z.string(),
      current_period_end: z.string().nullable(),
      cancel_at_period_end: z.boolean().nullable(),
      created_at: z.string(),
    }),
  ),
  audit: z.array(
    z.object({
      id: z.string(),
      actor_email: z.string(),
      action: z.string(),
      reason: z.string(),
      before_state: entitlementSchema,
      after_state: entitlementSchema,
      created_at: z.string(),
    }),
  ),
});
export type PlatformDetail = z.infer<typeof detailSchema>;
export const PLAN_LABELS: Record<string, string> = {
  trial: "Trial",
  basic: "Basic",
  essential: "Essential",
  pro: "Pro",
  enterprise: "Enterprise",
};
export function usePlatformAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["platform-access", user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    retry: false,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (error) throw error;
      return data === true;
    },
  });
}
export async function listRestaurants(search: string, status: string, page: number) {
  const { data, error } = await supabase.rpc("platform_list_restaurants", {
    p_search: search,
    p_status: status,
    p_page: page,
  });
  if (error) throw error;
  return restaurantListSchema.parse(data);
}
export async function platformGrowth(days: number) {
  const { data, error } = await supabase.rpc("platform_growth_overview", { p_days: days });
  if (error) throw error;
  return growthSchema.parse(data);
}
export async function restaurantDetail(id: string) {
  const { data, error } = await supabase.rpc("platform_restaurant_detail", { p_restaurant_id: id });
  if (error) throw error;
  return detailSchema.parse(data);
}
export function formatPlatformDate(value: string | null) {
  if (!value) return "Não registrado";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
export function platformMoney(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

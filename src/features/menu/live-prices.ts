import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
const pricesSchema = z.record(
  z.string(),
  z.object({ price: z.number().nonnegative(), is_promo: z.boolean() }),
);
export async function withLivePrices<
  T extends { id: string; price: number; is_promo?: boolean; promo_starts_at?: string | null },
>(restaurantId: string, items: T[]): Promise<T[]> {
  if (!items.some((item) => item.promo_starts_at)) return items;
  const { data, error } = await supabase.rpc("menu_live_prices", { p_restaurant_id: restaurantId });
  if (error) throw error;
  const prices = pricesSchema.parse(data);
  return items.map((item) => (prices[item.id] ? { ...item, ...prices[item.id] } : item));
}

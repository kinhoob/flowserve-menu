import { supabase } from "@/integrations/supabase/client";
export async function releaseTable(
  restaurantId: string | null,
  tableLabel: string,
  options: { staffToken?: string; serviceFee?: number; coverCharge?: number } = {},
) {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    throw new Error("Reconecte antes de liberar a mesa");
  const { data, error } = await supabase.rpc("release_table", {
    p_restaurant_id: restaurantId,
    p_table_label: tableLabel,
    p_staff_token: options.staffToken ?? null,
    p_service_fee: options.serviceFee ?? 0,
    p_cover_charge: options.coverCharge ?? 0,
  });
  if (error) throw error;
  return data ?? [];
}

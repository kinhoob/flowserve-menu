import { supabase } from "@/integrations/supabase/client";
export async function releaseTable(
  restaurantId: string | null,
  table: { id: string; active_service_id?: string | null },
  options: { staffToken?: string; serviceFee?: number; coverCharge?: number } = {},
) {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    throw new Error("Reconecte antes de liberar a mesa");
  const { data, error } = await supabase.rpc("release_table_service", {
    p_restaurant_id: restaurantId,
    p_table_id: table.id,
    p_service_id: table.active_service_id ?? null,
    p_staff_token: options.staffToken ?? null,
    p_service_fee: options.serviceFee ?? 0,
    p_cover_charge: options.coverCharge ?? 0,
  });
  if (error) throw error;
  return data ?? [];
}

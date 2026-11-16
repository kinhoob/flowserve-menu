import { supabase } from "@/integrations/supabase/client";
export async function resolveRestaurantSlug(slug: string): Promise<string> {
  const { data, error } = await supabase.rpc("resolve_restaurant_slug", { p_slug: slug });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return slug;
    throw error;
  }
  return typeof data === "string" && data ? data : slug;
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/auth-provider";
import type { Tables } from "@/integrations/supabase/types";

export type Restaurant = Tables<"restaurants">;

function shortSlug(userId: string) {
  return "r-" + userId.replace(/-/g, "").slice(0, 10);
}

export function useRestaurant() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["restaurant", user?.id],
    enabled: !!user,
    retry: false,
    queryFn: async (): Promise<Restaurant | null> => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("owner_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;

      // Safety net: trigger normally creates this on signup. If missing
      // (older account, race condition), auto-create now so the app never
      // gets stuck without a restaurant_id.
      let slug = shortSlug(user!.id);
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: created, error: insertErr } = await supabase
          .from("restaurants")
          .insert({
            owner_id: user!.id,
            name: "Meu Restaurante",
            slug: attempt === 0 ? slug : `${slug}-${Math.floor(Math.random() * 9000) + 1000}`,
            currency: "BRL",
          })
          .select("*")
          .single();
        if (!insertErr && created) return created as Restaurant;
        if (insertErr && !insertErr.message.includes("duplicate")) throw insertErr;
      }
      return null;
    },
  });
}

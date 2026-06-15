import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/auth-provider";
import type { Tables } from "@/integrations/supabase/types";

export type Restaurant = Tables<"restaurants">;

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
      return data;
    },
  });
}

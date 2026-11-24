import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const schema = z.object({
  plan: z.enum(["basic", "essential", "pro", "trial", "enterprise"]),
  role: z.enum(["waiter", "kitchen", "both"]),
  service_wind_down: z.boolean(),
});

export function useStaffEntitlement(token: string | undefined) {
  const query = useQuery({
    queryKey: ["staff-entitlement", token],
    enabled: !!token,
    retry: false,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_staff_entitlement", { p_token: token! });
      if (error) throw error;
      return schema.parse(data);
    },
  });

  return { ...query, data: query.isError ? undefined : query.data };
}

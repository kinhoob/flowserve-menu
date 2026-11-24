import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/operations";
import type { ReportOrder } from "./report";
export function useReportOrders(
  restaurantId: string | undefined,
  start: number,
  end: number,
  enabled: boolean,
) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!restaurantId || !enabled) return;
    const channel = supabase
      .channel(`analytics-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["restaurant-analytics", restaurantId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, enabled, qc]);
  return useQuery({
    queryKey: ["restaurant-analytics", restaurantId, start, end],
    enabled: enabled && !!restaurantId,
    retry: 1,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Conservative UTC bounds cover local civil days, overnight service and all IANA offsets.
      const from = new Date((start - 1) * 86400000).toISOString(),
        until = new Date((end + 3) * 86400000).toISOString();
      return fetchAllPages<ReportOrder>(async (offset) => {
        const { data, error } = await supabase.rpc("get_restaurant_analytics", {
          p_restaurant_id: restaurantId!,
          p_from: from,
          p_until: until,
          p_offset: offset,
        });
        return { data: data as ReportOrder[] | null, error };
      });
    },
  });
}

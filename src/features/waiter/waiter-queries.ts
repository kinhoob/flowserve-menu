import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type WaiterCall = Tables<"waiter_calls">;

export function useWaiterCalls(restaurantId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`waiter-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waiter_calls",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["waiter_calls", restaurantId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, qc]);

  return useQuery({
    queryKey: ["waiter_calls", restaurantId],
    enabled: !!restaurantId,
    queryFn: async (): Promise<WaiterCall[]> => {
      const { data, error } = await supabase
        .from("waiter_calls")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("is_test" as any, false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useResolveWaiterCall(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("waiter_calls")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", id)
        .eq("restaurant_id", restaurantId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["waiter_calls", restaurantId] }),
  });
}

export async function callWaiter(input: {
  restaurant_id: string;
  table_label?: string | null;
  customer_name?: string | null;
  message?: string | null;
  kind?: "call" | "bill";
}) {
  const { error } = await supabase.from("waiter_calls").insert({
    restaurant_id: input.restaurant_id,
    table_label: input.table_label ?? null,
    customer_name: input.customer_name ?? null,
    message: input.message ?? null,
    ...(input.kind ? ({ kind: input.kind } as any) : {}),
  } as any);
  if (error) throw error;
}

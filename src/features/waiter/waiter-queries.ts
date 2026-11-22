import { z } from "zod";
const publicCallSchema = z.object({ ok: z.boolean(), message: z.string().optional() });
import { fetchAllPages } from "@/lib/operations";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export type WaiterCall = Tables<"waiter_calls">;

export function useWaiterCalls(restaurantId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      // The header and page can subscribe concurrently. Never reuse an already-subscribed channel.
      .channel(`waiter-${restaurantId}-${crypto.randomUUID()}`)
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
    refetchInterval: 15000,
    queryFn: async (): Promise<WaiterCall[]> => {
      return fetchAllPages<WaiterCall>((from, to) =>
        supabase
          .from("waiter_calls")
          .select("*")
          .eq("restaurant_id", restaurantId!)
          .eq("is_test", false)
          .eq("resolved", false)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      );
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
  table_code?: string;
}) {
  const { data, error } = await supabase.rpc("submit_public_call", {
    p_restaurant_id: input.restaurant_id,
    p_table_label: input.table_label ?? "",
    p_customer_name: input.customer_name ?? null,
    p_message: input.message ?? null,
    p_kind: input.kind ?? "call",
    p_table_code: input.table_code ?? null,
  });
  if (error) throw error;
  const result = publicCallSchema.parse(data);
  if (!result.ok) throw new Error(result.message ?? "Não foi possível chamar o garçom");
}

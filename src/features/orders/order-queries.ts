import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type Order = Tables<"orders"> & { order_items: Tables<"order_items">[] };

export const STATUS_FLOW: OrderStatus[] = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "served",
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Novos",
  accepted: "Aceitos",
  preparing: "Preparando",
  ready: "Prontos",
  served: "Entregues",
  cancelled: "Cancelados",
};

export function useOrders(restaurantId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ["orders", restaurantId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => qc.invalidateQueries({ queryKey: ["orders", restaurantId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, qc]);

  return useQuery({
    queryKey: ["orders", restaurantId],
    enabled: !!restaurantId,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*, menu_items(category_id, categories(kind)))")
        .eq("restaurant_id", restaurantId!)
        .eq("archived", false as any)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });
}

export function useArchiveServedOrders(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { error, count } = await supabase
        .from("orders")
        .update({ archived: true } as any, { count: "exact" })
        .eq("restaurant_id", restaurantId!)
        .in("status", ["served", "cancelled"])
        .lt("created_at", cutoff)
        .eq("archived", false as any);
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders", restaurantId] }),
  });
}

export function useUpdateOrderStatus(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders", restaurantId] }),
  });
}

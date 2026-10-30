import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { fetchAllPages } from "@/lib/operations";
import { recordRealtimeEvent } from "@/lib/realtime-telemetry";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type OrderItem = Tables<"order_items"> & {
  menu_items?: { category_id: string; categories: { kind: string } | null } | null;
};
export type Order = Tables<"orders"> & { order_items: OrderItem[] };

export const STATUS_FLOW: OrderStatus[] = ["pending", "accepted", "preparing", "ready", "served"];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Novos",
  accepted: "Aceitos",
  preparing: "Preparando",
  ready: "Prontos",
  served: "Entregues",
  cancelled: "Cancelados",
};

export function useOrders(restaurantId: string | undefined, includeRecentArchived = false) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          recordRealtimeEvent("orders", payload);
          qc.invalidateQueries({ queryKey: ["orders", restaurantId] });
          qc.invalidateQueries({ queryKey: ["table-history", restaurantId] });
          qc.invalidateQueries({ queryKey: ["orders-archived", restaurantId] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, (payload) => {
        recordRealtimeEvent("orders", payload);
        qc.invalidateQueries({ queryKey: ["orders", restaurantId] });
        qc.invalidateQueries({ queryKey: ["table-history", restaurantId] });
        qc.invalidateQueries({ queryKey: ["orders-archived", restaurantId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, qc]);

  return useQuery({
    queryKey: ["orders", restaurantId, includeRecentArchived],
    enabled: !!restaurantId,
    refetchInterval: 15000,
    queryFn: async (): Promise<Order[]> => {
      return fetchAllPages<Order>((from, to) =>
        supabase
          .from("orders")
          .select("*, order_items(*, menu_items(category_id, categories(kind)))")
          .eq("restaurant_id", restaurantId!)
          .or(
            includeRecentArchived
              ? `archived.eq.false,created_at.gte.${new Date(Date.now() - 2 * 86400000).toISOString()}`
              : "archived.eq.false",
          )
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      );
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
        .update({ archived: true }, { count: "exact" })
        .eq("restaurant_id", restaurantId!)
        .in("status", ["served", "cancelled"])
        .lt("created_at", cutoff)
        .eq("archived", false);
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
      const { error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", id)
        .eq("restaurant_id", restaurantId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders", restaurantId] }),
  });
}

import { toast } from "sonner";
import { getErrorDetails } from "@/lib/errors";
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
export type Order = Omit<Tables<"orders">, "kitchen_hidden"> & {
  kitchen_hidden?: boolean;
  order_items: OrderItem[];
};

export const STATUS_FLOW: OrderStatus[] = ["pending", "accepted", "preparing", "ready", "served"];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Novos",
  accepted: "Aceitos",
  preparing: "Preparando",
  ready: "Prontos",
  served: "Entregues",
  cancelled: "Cancelados",
};

const streams = new WeakMap<object, Map<string, { users: number; stop: () => void }>>();

export function useOrders(restaurantId: string | undefined, includeRecentArchived = false) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;
    let entries = streams.get(qc);
    if (!entries) {
      entries = new Map();
      streams.set(qc, entries);
    }
    let entry = entries.get(restaurantId);
    if (!entry) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const refresh = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void qc.invalidateQueries({ queryKey: ["orders", restaurantId] });
          void qc.invalidateQueries({ queryKey: ["table-history", restaurantId] });
          void qc.invalidateQueries({ queryKey: ["orders-archived", restaurantId] });
          void qc.invalidateQueries({ queryKey: ["table-access-code"] });
        }, 150);
      };
      const channel = supabase
        .channel("orders-" + restaurantId + "-" + crypto.randomUUID())
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: "restaurant_id=eq." + restaurantId,
          },
          (payload) => {
            recordRealtimeEvent("orders", payload);
            refresh();
          },
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, refresh)
        .subscribe();
      entry = {
        users: 0,
        stop: () => {
          clearTimeout(timer);
          void supabase.removeChannel(channel);
        },
      };
      entries.set(restaurantId, entry);
    }
    entry.users++;
    return () => {
      entry.users--;
      if (entry.users === 0) {
        entry.stop();
        entries.delete(restaurantId);
      }
    };
  }, [restaurantId, qc]);

  return useQuery({
    queryKey: ["orders", restaurantId, includeRecentArchived],
    enabled: !!restaurantId,
    refetchInterval: 60000,
    refetchOnReconnect: "always",
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
    networkMode: "always",
    mutationFn: async () => {
      if (!navigator.onLine) throw new Error("Reconecte antes de organizar a cozinha");
      const { data, error } = await supabase.rpc("hide_completed_orders", {
        p_restaurant_id: restaurantId!,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders", restaurantId] });
      toast.success("Entregues ocultados da cozinha. As mesas e contas continuam abertas.");
    },
    onError: (error) =>
      toast.error(getErrorDetails(error).message ?? "Não foi possível organizar a cozinha"),
  });
}

export function useUpdateOrderStatus(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    networkMode: "always",
    onError: (error) => {
      void qc.invalidateQueries({ queryKey: ["orders", restaurantId] });
      toast.error(getErrorDetails(error).message ?? "Não foi possível alterar o pedido");
    },
    mutationFn: async ({
      id,
      status,
      reason,
      expectedStatus,
      deliveredBy,
    }: {
      id: string;
      status: OrderStatus;
      reason?: string;
      expectedStatus: OrderStatus;
      deliveredBy?: string;
    }) => {
      if (!navigator.onLine) throw new Error("Reconecte antes de alterar o pedido");
      const { error } = await supabase.rpc("transition_order", {
        p_order_id: id,
        p_expected_status: expectedStatus,
        p_next_status: status,
        p_reason: reason ?? null,
        p_delivered_by: deliveredBy ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders", restaurantId] }),
  });
}

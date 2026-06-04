import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StaffMember = {
  id: string;
  restaurant_id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function useStaff(restaurantId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`staff-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "staff_members", filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ["staff", restaurantId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, qc]);

  return useQuery({
    queryKey: ["staff", restaurantId],
    enabled: !!restaurantId,
    queryFn: async (): Promise<StaffMember[]> => {
      const { data, error } = await supabase
        .from("staff_members" as any)
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as StaffMember[];
    },
  });
}

export function useCreateStaff(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!restaurantId) throw new Error("Restaurante inválido");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Informe um nome");
      const { error } = await supabase
        .from("staff_members" as any)
        .insert({ restaurant_id: restaurantId, name: trimmed } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff", restaurantId] }),
  });
}

export function useUpdateStaff(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<StaffMember, "name" | "active">> }) => {
      const { error } = await supabase.from("staff_members" as any).update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff", restaurantId] }),
  });
}

export function useDeleteStaff(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_members" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff", restaurantId] }),
  });
}

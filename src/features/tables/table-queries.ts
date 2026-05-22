import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type VenueTable = Tables<"venue_tables">;

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function useTables(restaurantId: string | undefined) {
  return useQuery({
    queryKey: ["venue_tables", restaurantId],
    enabled: !!restaurantId,
    queryFn: async (): Promise<VenueTable[]> => {
      const { data, error } = await supabase
        .from("venue_tables")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateTable(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label: string }) => {
      if (!restaurantId) throw new Error("Restaurante inválido");
      const payload: TablesInsert<"venue_tables"> = {
        restaurant_id: restaurantId,
        label: input.label,
        short_code: randomCode(),
      };
      const { data, error } = await supabase
        .from("venue_tables")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue_tables", restaurantId] }),
  });
}

export function useCreateManyTables(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { from: number; to: number; prefix?: string }) => {
      if (!restaurantId) throw new Error("Restaurante inválido");
      const prefix = input.prefix?.trim() || "Mesa";
      const rows: TablesInsert<"venue_tables">[] = [];
      for (let i = input.from; i <= input.to; i++) {
        rows.push({
          restaurant_id: restaurantId,
          label: `${prefix} ${i}`,
          short_code: randomCode(),
        });
      }
      const { data, error } = await supabase.from("venue_tables").insert(rows).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue_tables", restaurantId] }),
  });
}

export function useDeleteTable(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("venue_tables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue_tables", restaurantId] }),
  });
}

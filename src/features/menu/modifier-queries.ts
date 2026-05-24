import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ModifierGroup = Tables<"modifier_groups">;
export type ModifierOption = Tables<"modifier_options">;
export type ModifierGroupWithOptions = ModifierGroup & {
  modifier_options: ModifierOption[];
};

export function useItemModifiers(menuItemId: string | undefined) {
  return useQuery({
    queryKey: ["modifier_groups", menuItemId],
    enabled: !!menuItemId,
    queryFn: async (): Promise<ModifierGroupWithOptions[]> => {
      const { data, error } = await supabase
        .from("modifier_groups")
        .select("*, modifier_options(*)")
        .eq("menu_item_id", menuItemId!)
        .order("position", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as ModifierGroupWithOptions[];
      rows.forEach((g) =>
        g.modifier_options.sort((a, b) => a.position - b.position),
      );
      return rows;
    },
  });
}

export function useCreateModifierGroup(menuItemId: string, restaurantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; is_required?: boolean; max_select?: number }) => {
      const { data, error } = await supabase
        .from("modifier_groups")
        .insert({
          menu_item_id: menuItemId,
          restaurant_id: restaurantId,
          name: input.name,
          is_required: input.is_required ?? false,
          max_select: input.max_select ?? 1,
          min_select: input.is_required ? 1 : 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modifier_groups", menuItemId] }),
  });
}

export function useUpdateModifierGroup(menuItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<ModifierGroup> }) => {
      const { error } = await supabase
        .from("modifier_groups")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modifier_groups", menuItemId] }),
  });
}

export function useDeleteModifierGroup(menuItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("modifier_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modifier_groups", menuItemId] }),
  });
}

export function useCreateModifierOption(menuItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { group_id: string; name: string; price_delta?: number }) => {
      const { error } = await supabase.from("modifier_options").insert({
        group_id: input.group_id,
        name: input.name,
        price_delta: input.price_delta ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modifier_groups", menuItemId] }),
  });
}

export function useDeleteModifierOption(menuItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("modifier_options").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modifier_groups", menuItemId] }),
  });
}

// Public fetcher: all groups+options for a list of menu items in one call
export async function fetchModifiersForRestaurant(restaurantId: string) {
  const { data, error } = await supabase
    .from("modifier_groups")
    .select("*, modifier_options(*)")
    .eq("restaurant_id", restaurantId)
    .order("position", { ascending: true });
  if (error) throw error;
  const map = new Map<string, ModifierGroupWithOptions[]>();
  (data ?? []).forEach((g: any) => {
    g.modifier_options?.sort((a: any, b: any) => a.position - b.position);
    const arr = map.get(g.menu_item_id) ?? [];
    arr.push(g);
    map.set(g.menu_item_id, arr);
  });
  return map;
}

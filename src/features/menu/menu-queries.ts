import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Category = Tables<"categories">;
export type MenuItem = Tables<"menu_items">;

export function useCategories(restaurantId: string | undefined) {
  return useQuery({
    queryKey: ["categories", restaurantId],
    enabled: !!restaurantId,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMenuItems(restaurantId: string | undefined, categoryId: string | undefined) {
  return useQuery({
    queryKey: ["menu_items", restaurantId, categoryId],
    enabled: !!restaurantId && !!categoryId,
    queryFn: async (): Promise<MenuItem[]> => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("category_id", categoryId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCategory(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      if (!restaurantId) throw new Error("No restaurant");
      const payload: TablesInsert<"categories"> = {
        restaurant_id: restaurantId,
        name: input.name,
        description: input.description || null,
      };
      const { data, error } = await supabase.from("categories").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories", restaurantId] }),
  });
}

export function useUpdateCategory(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: TablesUpdate<"categories"> }) => {
      const { data, error } = await supabase
        .from("categories")
        .update(input.patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories", restaurantId] }),
  });
}

export function useDeleteCategory(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories", restaurantId] });
      qc.invalidateQueries({ queryKey: ["menu_items"] });
    },
  });
}

export function useUpsertMenuItem(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<MenuItem> & { name: string; price: number; category_id: string },
    ) => {
      if (!restaurantId) throw new Error("No restaurant");
      if (input.id) {
        const { id, ...patch } = input;
        const { data, error } = await supabase
          .from("menu_items")
          .update(patch)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const payload: TablesInsert<"menu_items"> = {
        restaurant_id: restaurantId,
        category_id: input.category_id,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        image_url: input.image_url ?? null,
        is_available: input.is_available ?? true,
        dietary_tags: input.dietary_tags ?? [],
      };
      const { data, error } = await supabase
        .from("menu_items")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu_items"] }),
  });
}

export function useDeleteMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu_items"] }),
  });
}

import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import type { StaffSession } from "./staff-session";

const staffOrderSchema = z.object({
  id: z.string(),
  restaurant_id: z.string(),
  table_label: z.string().nullable(),
  customer_name: z.string().nullable(),
  status: z.enum(["pending", "accepted", "preparing", "ready", "served", "cancelled"]),
  archived: z.boolean(),
  created_at: z.string(),
  currency: z.string(),
  subtotal: z.number(),
  service_fee: z.number().nullable(),
  cover_charge: z.number().nullable(),
  total: z.number(),
  created_by_name: z.string().nullable(),
  delivered_by_name: z.string().nullable(),
  delivered_at: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
      quantity: z.number(),
      notes: z.string().nullable(),
    }),
  ),
});
const staffTableSchema = z.object({
  id: z.string(),
  restaurant_id: z.string(),
  label: z.string(),
  short_code: z.string(),
  position: z.number(),
});
const staffCallSchema = z.object({
  customer_name: z.string().nullable(),
  id: z.string(),
  restaurant_id: z.string(),
  table_label: z.string().nullable(),
  kind: z.string(),
});
export type StaffOrder = z.infer<typeof staffOrderSchema>;

export async function staffLogin(slug: string, pin: string): Promise<StaffSession> {
  const { data, error } = await supabase.rpc("staff_login", { p_slug: slug, p_pin: pin });
  if (error) throw new Error(error.message ?? "PIN inválido");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) throw new Error("PIN inválido");
  return {
    token: row.token,
    staff_id: row.staff_id,
    name: row.name,
    role: z.enum(["waiter", "kitchen", "both"]).parse(row.role),
    restaurant_slug: row.restaurant_slug ?? slug,
    restaurant_name: row.restaurant_name ?? "",
  };
}

export async function staffLogout(token: string) {
  const { error } = await supabase.rpc("staff_logout", { p_token: token });
  if (error) throw error;
}

export async function staffListOrders(token: string) {
  const { data, error } = await supabase.rpc("staff_list_orders", { p_token: token });
  if (error) throw error;
  return z.array(staffOrderSchema).parse(data ?? []);
}

export async function staffUpdateOrderStatus(
  token: string,
  order_id: string,
  status: string,
  staff_name?: string,
) {
  const { error } = await supabase.rpc("staff_update_order_status", {
    p_token: token,
    p_order_id: order_id,
    p_status: status,
    p_staff_name: staff_name ?? null,
  });
  if (error) throw error;
}

export async function staffArchiveOrders(token: string, order_ids: string[]) {
  const { error } = await supabase.rpc("staff_archive_orders", {
    p_token: token,
    p_order_ids: order_ids,
  });
  if (error) throw error;
}

export async function staffListTables(token: string) {
  const { data, error } = await supabase.rpc("staff_list_tables", { p_token: token });
  if (error) throw error;
  return z.array(staffTableSchema).parse(data ?? []);
}

export async function staffListCalls(token: string) {
  const { data, error } = await supabase.rpc("staff_list_calls", { p_token: token });
  if (error) throw error;
  return z.array(staffCallSchema).parse(data ?? []);
}

export async function staffResolveCall(token: string, call_id: string) {
  const { error } = await supabase.rpc("staff_resolve_call", {
    p_token: token,
    p_call_id: call_id,
  });
  if (error) throw error;
}

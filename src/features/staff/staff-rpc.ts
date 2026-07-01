import { supabase } from "@/integrations/supabase/client";
import type { StaffSession } from "./staff-session";

export async function staffLogin(slug: string, pin: string): Promise<StaffSession> {
  const { data, error } = await (supabase as any).rpc("staff_login", { p_slug: slug, p_pin: pin });
  if (error) throw new Error(error.message ?? "PIN inválido");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) throw new Error("PIN inválido");
  return {
    token: row.token,
    staff_id: row.staff_id,
    name: row.name,
    role: row.role,
    restaurant_slug: row.restaurant_slug ?? slug,
    restaurant_name: row.restaurant_name ?? "",
  };
}

export async function staffLogout(token: string) {
  await (supabase as any).rpc("staff_logout", { p_token: token });
}

export async function staffListOrders(token: string): Promise<any[]> {
  const { data, error } = await (supabase as any).rpc("staff_list_orders", { p_token: token });
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function staffUpdateOrderStatus(
  token: string,
  order_id: string,
  status: string,
  staff_name?: string,
) {
  const { error } = await (supabase as any).rpc("staff_update_order_status", {
    p_token: token,
    p_order_id: order_id,
    p_status: status,
    p_staff_name: staff_name ?? null,
  });
  if (error) throw error;
}

export async function staffArchiveOrders(token: string, order_ids: string[]) {
  const { error } = await (supabase as any).rpc("staff_archive_orders", {
    p_token: token,
    p_order_ids: order_ids,
  });
  if (error) throw error;
}

export async function staffListTables(token: string): Promise<any[]> {
  const { data, error } = await (supabase as any).rpc("staff_list_tables", { p_token: token });
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function staffListCalls(token: string): Promise<any[]> {
  const { data, error } = await (supabase as any).rpc("staff_list_calls", { p_token: token });
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function staffResolveCall(token: string, call_id: string) {
  const { error } = await (supabase as any).rpc("staff_resolve_call", {
    p_token: token,
    p_call_id: call_id,
  });
  if (error) throw error;
}

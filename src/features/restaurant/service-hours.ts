import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getErrorDetails } from "@/lib/errors";

export const daySchema = z
  .object({
    enabled: z.boolean(),
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((d) => d.open !== d.close, "Abertura e fechamento devem ser diferentes");
export const hoursSchema = z.object({
  kitchen: z.array(daySchema).length(7),
  bar: z.array(daySchema).length(7),
});
export type ServiceHours = z.infer<typeof hoursSchema>;
export const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export function suggestedHours(): ServiceHours {
  return {
    kitchen: WEEKDAYS.map(() => ({ enabled: true, open: "18:00", close: "23:00" })),
    bar: WEEKDAYS.map(() => ({ enabled: true, open: "18:00", close: "01:00" })),
  };
}
const statusSchema = z.object({
  kitchen_open: z.boolean(),
  bar_open: z.boolean(),
  require_table_code: z.boolean(),
  schedule_configured: z.boolean(),
  timezone: z.string(),
});
export async function getServiceStatus(id: string) {
  const { data, error } = await supabase.rpc("get_service_status", { p_restaurant_id: id });
  if (error) {
    if (["PGRST202", "42883"].includes(getErrorDetails(error).code ?? ""))
      return {
        kitchen_open: false,
        bar_open: false,
        require_table_code: true,
        schedule_configured: false,
        timezone: "America/Sao_Paulo",
        setupPending: true,
      };
    throw error;
  }
  return { ...statusSchema.parse(data), setupPending: false };
}

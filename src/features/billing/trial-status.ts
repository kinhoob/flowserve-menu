import { useAuth } from "@/features/auth/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { entitlementSchema } from "./entitlement";
import { planHasFeature, type FeatureKey } from "./plan-matrix";

export { minimumPlan, type FeatureKey } from "./plan-matrix";

export type TrialInfo = {
  plan_type: string;
  trial_ends_at: string;
  plan_source?: "manual" | "billing";
  service_wind_down?: boolean;
};

export function canAccess(info: TrialInfo | null | undefined, feature: FeatureKey): boolean {
  return !!info && !isTrialExpired(info) && planHasFeature(info.plan_type, feature);
}

export function canContinueService(
  info: TrialInfo | null | undefined,
  feature: FeatureKey,
): boolean {
  return (
    canAccess(info, feature) ||
    (!!info?.service_wind_down && (feature === "tables" || feature === "kitchen"))
  );
}

export function useTrialStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["trial-status", user?.id],
    enabled: !!user?.id,
    retry: false,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<TrialInfo | null> => {
      const { data, error } = await supabase.rpc("get_my_entitlement");
      if (error) throw error;
      return entitlementSchema.nullable().parse(data);
    },
  });
}

export function isTrialExpired(info: TrialInfo | null | undefined): boolean {
  if (info?.plan_type !== "trial") return false;
  const end = Date.parse(info.trial_ends_at);
  return !Number.isFinite(end) || end <= Date.now();
}

export function daysLeft(info: TrialInfo | null | undefined): number {
  const end = Date.parse(info?.trial_ends_at ?? "");
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - Date.now()) / 86400000)) : 0;
}

import { ESSENTIAL_QR_LIMIT } from "./plan-matrix";
import { canAccess, type TrialInfo } from "./trial-status";

export function getTableLimit(info: TrialInfo | null | undefined): number | null {
  if (!canAccess(info, "tables")) return null;
  return info?.plan_type === "essential" ? ESSENTIAL_QR_LIMIT : Number.POSITIVE_INFINITY;
}

// Per produto: Essential = 5 QR Codes, Pro = ilimitado,
// Trial libera o limite do Pro, Enterprise é ilimitado.
export const PLAN_TABLE_LIMITS: Record<string, number> = {
  essential: 5,
  pro: Number.POSITIVE_INFINITY,
  trial: Number.POSITIVE_INFINITY,
  enterprise: Number.POSITIVE_INFINITY,
};

export function getTableLimit(plan: string | null | undefined): number {
  const p = (plan ?? "trial").toLowerCase();
  return PLAN_TABLE_LIMITS[p] ?? PLAN_TABLE_LIMITS.essential;
}

/** One definition of occupancy: delivered orders still occupy the table until checkout. */
export function normalizeTableLabel(label: string | null | undefined): string {
  return (label ?? "")
    .trim()
    .replace(/^(?:Mesa\s*)+/i, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function isOpenOrder(order: { status: string; archived?: boolean | null }): boolean {
  return !order.archived && order.status !== "cancelled";
}

export function restaurantDate(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function restaurantHour(value: Date | string, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value)),
  );
}

export function dateOrdinal(value: Date | string, timeZone: string): number {
  return Date.parse(`${restaurantDate(value, timeZone)}T00:00:00Z`) / 86_400_000;
}

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await fetchPage(from, from + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

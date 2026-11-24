import { normalizeTableLabel } from "@/lib/operations";

export function findTableForRecord<T extends { id: string; label: string }>(
  tables: readonly T[],
  record: { table_id?: string | null; table_label: string | null },
): T | undefined {
  if (record.table_id) return tables.find(({ id }) => id === record.table_id);
  const label = normalizeTableLabel(record.table_label).toLowerCase();
  if (!label) return undefined;
  const matches = tables.filter(
    (table) => normalizeTableLabel(table.label).toLowerCase() === label,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

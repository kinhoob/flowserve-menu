/** Round the displayed two-decimal bill total before distributing its cents. */
export function billTotalCents(total: number): number {
  if (!Number.isFinite(total) || total < 0) throw new Error("Total inválido");
  const decimal = new Intl.NumberFormat("en-US", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(total);
  const cents = Number(decimal.replace(".", ""));
  if (!Number.isSafeInteger(cents)) throw new Error("Total inválido");
  return cents;
}

export function splitBillCents(totalCents: number, people: number): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error("Total inválido");
  if (!Number.isInteger(people) || people < 1 || people > 20)
    throw new Error("Escolha de 1 a 20 pessoas");
  const base = Math.floor(totalCents / people),
    extra = totalCents % people;
  return Array.from({ length: people }, (_, index) => base + (index < extra ? 1 : 0));
}

export type ImportDish = {
  category: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  is_available: boolean;
};
export function parseCatalogCsv(input: string): { rows: ImportDish[]; errors: string[] } {
  if (input.length > 2_000_000) return { rows: [], errors: ["O arquivo deve ter até 2 MB."] };
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = text.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  const table: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") quoted = !quoted;
      else return { rows: [], errors: ["Aspas inválidas no CSV."] };
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) table.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) return { rows: [], errors: ["Uma célula está com aspas abertas."] };
  row.push(cell);
  if (row.some((v) => v.trim())) table.push(row);
  const headers = (table.shift() ?? []).map((v) => v.trim().toLowerCase());
  if (!["categoria", "nome", "preco"].every((h) => headers.includes(h)))
    return {
      rows: [],
      errors: ["Use as colunas categoria, nome e preco. O modelo tem o formato correto."],
    };
  if (table.length < 1 || table.length > 500)
    return { rows: [], errors: ["Importe entre 1 e 500 pratos por arquivo."] };
  const rows: ImportDish[] = [],
    errors: string[] = [],
    seen = new Set<string>();
  table.forEach((cells, index) => {
    const value = (key: string) => (cells[headers.indexOf(key)] ?? "").trim();
    const category = value("categoria"),
      name = value("nome"),
      raw = value("preco"),
      price = Number(raw.replace(",", ".")),
      image = value("imagem"),
      available = value("disponivel").toLowerCase();
    let reason = "";
    if (cells.length !== headers.length) reason = "quantidade de colunas diferente do cabeçalho";
    else if (!category || category.length > 80 || !name || name.length > 80)
      reason = "categoria e nome devem ter entre 1 e 80 caracteres";
    else if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw) || !Number.isFinite(price) || price > 99999)
      reason = "preço inválido; use 29,90 ou 29.90, sem R$";
    else if (value("descricao").length > 280) reason = "descrição acima de 280 caracteres";
    else if (image && (!/^https:\/\//i.test(image) || image.length > 2048))
      reason = "a imagem precisa de URL HTTPS de até 2048 caracteres";
    else if (available && !["sim", "nao", "não", "true", "false", "1", "0"].includes(available))
      reason = "disponivel deve ser sim ou nao";
    const key = `${category.toLocaleLowerCase()}|${name.toLocaleLowerCase()}`;
    if (seen.has(key)) reason = "nome duplicado na mesma categoria";
    seen.add(key);
    if (reason) errors.push(`Linha ${index + 2}: ${reason}.`);
    else
      rows.push({
        category,
        name,
        description: value("descricao"),
        price,
        image_url: image,
        is_available: !["nao", "não", "false", "0"].includes(available),
      });
  });
  return { rows, errors };
}
export function csvText(rows: unknown[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(";"),
      )
      .join("\r\n")
  );
}
export function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

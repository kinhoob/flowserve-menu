import { describe, expect, it } from "vitest";
import { csvText, parseCatalogCsv } from "./catalog-csv";
describe("catalog CSV", () => {
  it("reads Excel decimal commas, quoted separators and multiline descriptions", () => {
    const result = parseCatalogCsv(
      '\uFEFFcategoria;nome;preco;descricao;imagem;disponivel\r\nPratos;"Arroz; feijão";29,90;"Serve 2\nCom salada";;nao',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      name: "Arroz; feijão",
      price: 29.9,
      is_available: false,
      description: "Serve 2\nCom salada",
    });
  });
  it("reads comma separated exports and escaped quotes", () => {
    expect(
      parseCatalogCsv('categoria,nome,preco\nPratos,"Burger ""especial""",15.50').rows[0],
    ).toMatchObject({ name: 'Burger "especial"', price: 15.5 });
  });
  it("rejects invalid prices, missing fields and duplicate products", () => {
    expect(parseCatalogCsv("categoria;nome;preco\nPratos;A;NaN").errors).toHaveLength(1);
    expect(parseCatalogCsv("nome;preco\nA;10").errors).toHaveLength(1);
    expect(parseCatalogCsv("categoria;nome;preco\nPratos;A;10\npratos;a;20").errors).toHaveLength(
      1,
    );
    expect(parseCatalogCsv('categoria;nome;preco\nPratos;"A;10').errors).toHaveLength(1);
  });
  it("protects downloaded CSV from spreadsheet formulas", () => {
    expect(csvText([['=HYPERLINK("x")', "@SUM(A1)", "safe"]])).toContain('"\'=HYPERLINK(""x"")"');
  });
});

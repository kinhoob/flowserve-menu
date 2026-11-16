import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getErrorDetails } from "@/lib/errors";
import { formatPrice } from "@/lib/format";
import { parseCatalogCsv, downloadCsv, type ImportDish } from "./catalog-csv";
import type { Category } from "./menu-queries";

export function CatalogTools({
  restaurantId,
  categories,
  currency,
}: {
  restaurantId: string;
  categories: Category[];
  currency: string;
}) {
  const [mode, setMode] = useState<"import" | "bulk" | null>(null),
    [rows, setRows] = useState<ImportDish[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [availability, setAvailability] = useState(""),
    [category, setCategory] = useState(""),
    [percent, setPercent] = useState("");
  const qc = useQueryClient();
  const {
    data: items = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["catalog-tools", restaurantId],
    enabled: mode === "bulk",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id,name,price,is_available,is_promo")
        .eq("restaurant_id", restaurantId)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
  const filtered = items.filter((i) =>
    i.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const mutation = useMutation({
    mutationFn: async () => {
      const patch: Record<string, string | boolean | number> = {};
      if (availability) patch.is_available = availability === "yes";
      if (category) patch.category_id = category;
      if (percent !== "") {
        const n = Number(percent);
        if (!Number.isFinite(n) || n < -100 || n > 1000)
          throw new Error("Use um percentual entre -100 e 1000");
        patch.price_percent = n;
      }
      const { data, error } = await supabase.rpc("manage_menu_items", {
        p_restaurant_id: restaurantId,
        p_action: mode === "import" ? "import" : "update",
        p_rows: mode === "import" ? rows : selected,
        p_patch: patch,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (count) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["menu_items"] }),
        qc.invalidateQueries({ queryKey: ["categories"] }),
        qc.invalidateQueries({ queryKey: ["catalog-tools"] }),
        qc.invalidateQueries({ queryKey: ["public-menu"] }),
        qc.invalidateQueries({ queryKey: ["waiter-items"] }),
      ]);
      toast.success(`${count} pratos ${mode === "import" ? "importados" : "atualizados"}`);
      setMode(null);
      setRows([]);
      setSelected([]);
    },
    onError: (e) => {
      const detail = getErrorDetails(e);
      toast.error(
        detail.code === "PGRST202" || detail.code === "42883"
          ? "A atualização de gestão precisa ser aplicada no Supabase para ativar esta função."
          : detail.message,
      );
    },
  });
  const button = "rounded-xl border border-border px-3 py-2 text-xs disabled:opacity-40";
  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          className={button}
          onClick={() => {
            setMode("import");
            setErrors([]);
            setRows([]);
          }}
        >
          Importar planilha CSV
        </button>
        <button
          className={button}
          onClick={() => {
            setMode("bulk");
            setSelected([]);
            setAvailability("");
            setCategory("");
            setPercent("");
          }}
        >
          Editar pratos em lote
        </button>
      </div>
      <Dialog
        open={!!mode}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setMode(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "import" ? "Importar pratos do Excel ou Google Sheets" : "Edição em lote"}
            </DialogTitle>
          </DialogHeader>
          {mode === "import" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Exporte sua planilha como CSV UTF-8. Confira a prévia antes de importar até 500
                pratos. Categorias ausentes serão criadas; nomes existentes na mesma categoria
                impedem a importação inteira.
              </p>
              <button
                className={button}
                onClick={() =>
                  downloadCsv("modelo-cardapio-flux.csv", [
                    ["categoria", "nome", "preco", "descricao", "imagem", "disponivel"],
                    ["Principais", "Prato da casa", "29,90", "Serve uma pessoa", "", "sim"],
                  ])
                }
              >
                Baixar modelo de planilha
              </button>
              <label className="block text-sm">
                Escolher arquivo CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={mutation.isPending}
                  className="mt-2 block w-full text-sm"
                  onChange={async (e) => {
                    const file = e.currentTarget.files?.[0];
                    if (!file) return;
                    if (file.size > 2_000_000) {
                      setRows([]);
                      setErrors(["Arquivo acima de 2 MB"]);
                      return;
                    }
                    try {
                      const result = parseCatalogCsv(await file.text());
                      setRows(result.rows);
                      setErrors(result.errors);
                    } catch {
                      setErrors(["Não foi possível ler o arquivo"]);
                      setRows([]);
                    }
                  }}
                />
              </label>
              {errors.length > 0 && (
                <div
                  role="alert"
                  className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive"
                >
                  {errors.slice(0, 15).map((error, i) => (
                    <p key={i}>{error}</p>
                  ))}
                  {errors.length > 15 && (
                    <p>Mais {errors.length - 15} erros. Corrija a planilha para continuar.</p>
                  )}
                </div>
              )}
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th>Prato</th>
                      <th>Preço</th>
                      <th>Disponível</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-2">{r.category}</td>
                        <td>{r.name}</td>
                        <td>{formatPrice(r.price, currency)}</td>
                        <td>{r.is_available ? "Sim" : "Não"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className={button}
                disabled={!rows.length || !!errors.length || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Importando…" : `Importar ${rows.length} pratos`}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Selecione até 500 pratos e revise as alterações. O ajuste percentual é bloqueado
                para produtos em promoção, que devem ser editados individualmente.
              </p>
              <input
                aria-label="Buscar pratos para edição em lote"
                placeholder="Buscar pratos…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field"
              />
              {isLoading ? (
                <p>Carregando…</p>
              ) : isError ? (
                <p role="alert">Não foi possível carregar os pratos.</p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 && filtered.every((i) => selected.includes(i.id))
                      }
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...new Set([...current, ...filtered.map((i) => i.id)])]
                            : current.filter((id) => !filtered.some((i) => i.id === id)),
                        )
                      }
                    />
                    Selecionar resultados ({filtered.length})
                  </label>
                  <div className="max-h-52 space-y-2 overflow-auto">
                    {filtered.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 rounded-lg border border-border p-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={(e) =>
                            setSelected((current) =>
                              e.target.checked
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id),
                            )
                          }
                        />
                        <span className="flex-1">
                          {item.name}
                          {item.is_promo ? " · promoção" : ""}
                        </span>
                        <span>
                          {formatPrice(item.price, currency)} ·{" "}
                          {item.is_available ? "Disponível" : "Pausado"}
                        </span>
                      </label>
                    ))}
                  </div>
                  {items.length === 500 && (
                    <p className="text-xs text-muted-foreground">
                      Exibindo os primeiros 500 pratos, em ordem alfabética.
                    </p>
                  )}
                </>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs">
                  Disponibilidade
                  <select
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                    className="input-field mt-2"
                  >
                    <option value="">Manter</option>
                    <option value="yes">Disponibilizar</option>
                    <option value="no">Pausar</option>
                  </select>
                </label>
                <label className="text-xs">
                  Mover para categoria
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="input-field mt-2"
                  >
                    <option value="">Manter</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Ajuste de preço (%)
                  <input
                    type="number"
                    min={-100}
                    max={1000}
                    value={percent}
                    placeholder="Ex.: 10 ou -5"
                    onChange={(e) => setPercent(e.target.value)}
                    className="input-field mt-2"
                  />
                </label>
              </div>
              <p className="text-sm">
                Revisão: {selected.length} pratos ·{" "}
                {availability
                  ? availability === "yes"
                    ? "disponibilizar"
                    : "pausar"
                  : "disponibilidade mantida"}{" "}
                · {category ? "mover categoria" : "categoria mantida"} ·{" "}
                {percent !== "" ? `${percent}% no preço` : "preço mantido"}.
              </p>
              <button
                className={button}
                disabled={
                  !selected.length ||
                  (!availability && !category && percent === "") ||
                  mutation.isPending
                }
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Salvando…" : "Aplicar alterações selecionadas"}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getErrorDetails } from "@/lib/errors";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  useCreateModifierGroup,
  useCreateModifierOption,
  useDeleteModifierGroup,
  useDeleteModifierOption,
  useItemModifiers,
  useUpdateModifierGroup,
} from "./modifier-queries";

export function ModifiersEditor({
  menuItemId,
  restaurantId,
}: {
  menuItemId: string;
  restaurantId: string;
}) {
  const { data: groups = [], isLoading } = useItemModifiers(menuItemId);
  const createGroup = useCreateModifierGroup(menuItemId, restaurantId);
  const updateGroup = useUpdateModifierGroup(menuItemId);
  const deleteGroup = useDeleteModifierGroup(menuItemId);
  const createOption = useCreateModifierOption(menuItemId);
  const deleteOption = useDeleteModifierOption(menuItemId);

  const [newGroup, setNewGroup] = useState("");
  const [newOption, setNewOption] = useState<Record<string, { name: string; price: string }>>({});

  const addGroup = async () => {
    if (!newGroup.trim()) return;
    try {
      await createGroup.mutateAsync({ name: newGroup.trim() });
      setNewGroup("");
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      toast.error(e.message);
    }
  };

  const addOption = async (groupId: string) => {
    const v = newOption[groupId];
    if (!v?.name?.trim()) return;
    try {
      await createOption.mutateAsync({
        group_id: groupId,
        name: v.name.trim(),
        price_delta: Number(v.price || 0),
      });
      setNewOption((s) => ({ ...s, [groupId]: { name: "", price: "" } }));
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      toast.error(e.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.id} className="rounded-xl border border-border bg-background/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <input
                defaultValue={g.name}
                onBlur={(e) =>
                  e.target.value.trim() !== g.name &&
                  updateGroup.mutate({ id: g.id, patch: { name: e.target.value.trim() } })
                }
                className="flex-1 bg-transparent text-sm font-medium outline-none"
              />
              <button
                onClick={() => deleteGroup.mutate(g.id)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-surface hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-2">
                <Switch
                  checked={g.is_required}
                  onCheckedChange={(v) =>
                    updateGroup.mutate({
                      id: g.id,
                      patch: { is_required: v, min_select: v ? Math.max(1, g.min_select) : 0 },
                    })
                  }
                />
                Obrigatório
              </label>
              <label className="flex items-center gap-2">
                Máx. seleções
                <input
                  type="number"
                  min={1}
                  defaultValue={g.max_select}
                  onBlur={(e) => {
                    const n = Math.max(1, Number(e.target.value) || 1);
                    if (n !== g.max_select)
                      updateGroup.mutate({ id: g.id, patch: { max_select: n } });
                  }}
                  className="w-14 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                />
              </label>
            </div>
            <ul className="mt-3 space-y-1.5">
              {g.modifier_options.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-xs"
                >
                  <span className="flex-1 truncate">{o.name}</span>
                  {Number(o.price_delta) !== 0 && (
                    <span className="text-primary">
                      {Number(o.price_delta) > 0 ? "+" : ""}
                      {Number(o.price_delta).toFixed(2)}
                    </span>
                  )}
                  <button
                    onClick={() => deleteOption.mutate(o.id)}
                    className="rounded p-1 text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-1.5">
              <input
                placeholder="Nova opção"
                value={newOption[g.id]?.name ?? ""}
                onChange={(e) =>
                  setNewOption((s) => ({
                    ...s,
                    [g.id]: { name: e.target.value, price: s[g.id]?.price ?? "" },
                  }))
                }
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption(g.id))}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
              />
              <input
                type="number"
                step="0.01"
                placeholder="+ R$"
                value={newOption[g.id]?.price ?? ""}
                onChange={(e) =>
                  setNewOption((s) => ({
                    ...s,
                    [g.id]: { name: s[g.id]?.name ?? "", price: e.target.value },
                  }))
                }
                className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
              />
              <Button size="sm" variant="secondary" onClick={() => addOption(g.id)}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addGroup())}
          placeholder="Novo grupo (ex.: Ponto da carne)"
          className="input-field h-9"
        />
        <Button onClick={addGroup} disabled={createGroup.isPending} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Grupo
        </Button>
      </div>

      {groups.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Nenhum grupo de opções. Crie grupos como "Ponto da carne" ou "Adicionais".
        </p>
      )}
    </div>
  );
}

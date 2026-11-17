import { useMascotPreferences } from "./use-mascot-preferences";
import { Switch } from "@/components/ui/switch";
export function MascotPreference() {
  const { enabled, update } = useMascotPreferences();
  return (
    <div>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <span>
          <span className="block text-sm font-medium">Campainha flutuante</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            Mostrar o mascote e suas dicas neste navegador.
          </span>
        </span>
        <Switch
          aria-label="Mostrar campainha de ajuda"
          checked={enabled}
          onCheckedChange={(enabled) => update({ enabled })}
        />
      </label>
      <button
        onClick={() => update({ position: null })}
        className="mt-2 min-h-10 px-2 text-xs text-muted-foreground underline underline-offset-4"
      >
        Restaurar posição da campainha
      </button>
    </div>
  );
}

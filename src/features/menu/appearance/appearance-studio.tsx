import { Switch } from "@/components/ui/switch";
import { DEMO_DISHES } from "@/features/demo/demo-data";
import { formatPrice } from "@/lib/format";
import { Check, Palette, Plus, Smartphone, UtensilsCrossed } from "lucide-react";
import { useRef, useState } from "react";
import {
  DEFAULT_COLORS,
  MENU_PRESETS,
  colorsSchema,
  menuButtonStyle,
  menuThemeStyle,
  readAppearance,
  readColors,
  type MenuAppearance,
  type MenuColors,
} from "./appearance";

export type PreviewDish = {
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  portion_description?: string | null;
};
export function AppearanceStudio({
  colors,
  appearance,
  onColors,
  onAppearance,
  name = "Seu restaurante",
  description = "Sabores que contam a nossa história.",
  logo,
  dishes,
  currency = "BRL",
}: {
  colors: MenuColors;
  appearance: MenuAppearance;
  onColors: (value: MenuColors) => void;
  onAppearance: (value: MenuAppearance) => void;
  name?: string;
  description?: string | null;
  logo?: string | null;
  dishes?: PreviewDish[];
  currency?: string;
}) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const jump = (target: HTMLElement | null) =>
    target?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  const safe = readColors(colors);
  const items = dishes?.length
    ? dishes.slice(0, 3)
    : DEMO_DISHES.slice(0, 2).map((d) => ({ ...d, portion_description: d.portion }));
  function option<K extends keyof MenuAppearance>(
    key: K,
    label: string,
    options: { value: MenuAppearance[K]; label: string }[],
  ) {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{label}</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              type="button"
              key={String(o.value)}
              aria-pressed={appearance[key] === o.value}
              onClick={() => onAppearance({ ...appearance, [key]: o.value })}
              className={`min-h-10 rounded-xl border px-3 py-2 text-xs transition ${appearance[key] === o.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
            >
              {appearance[key] === o.value && <Check className="mr-1 inline h-3 w-3" />}
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div className="appearance-studio">
      <div className="appearance-studio-layout">
        <div ref={controlsRef} className="min-w-0 space-y-6 scroll-mt-24">
          <button
            type="button"
            className="appearance-jump rounded-xl border border-border px-4 py-2 text-xs"
            onClick={() => jump(previewRef.current)}
          >
            Ver prévia do cardápio ↓
          </button>
          <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2 text-primary">
              <Palette className="h-4 w-4" />
              <h3 className="font-semibold">A sua identidade, do seu jeito</h3>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Comece com uma inspiração ou crie sua própria paleta. Todas as cores abaixo são
              editáveis.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MENU_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => onColors({ ...p.colors })}
                  className="rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary"
                >
                  <span className="mb-2 flex gap-1">
                    {[p.colors.background, p.colors.header, p.colors.accent, p.colors.button].map(
                      (c, i) => (
                        <span
                          key={i}
                          style={{ background: c }}
                          className="h-5 flex-1 rounded-md border border-black/10"
                        />
                      ),
                    )}
                  </span>
                  <span className="text-xs">{p.name}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                Object.entries({
                  background: "Fundo",
                  text: "Texto",
                  accent: "Destaques e preços",
                  card: "Cartões",
                  header: "Cabeçalho",
                  button: "Botões",
                }) as [keyof MenuColors, string][]
              ).map(([key, label]) => (
                <label key={key} className="block text-xs">
                  <span className="mb-2 block text-muted-foreground">{label}</span>
                  <span className="flex items-center gap-2 rounded-xl border border-border bg-background p-2">
                    <input
                      type="color"
                      aria-label={`Escolher cor: ${label}`}
                      value={safe[key]}
                      onChange={(e) => onColors({ ...colors, [key]: e.target.value })}
                      className="h-8 w-9 cursor-pointer border-0 bg-transparent p-0"
                    />
                    <input
                      aria-label={`Código da cor: ${label}`}
                      value={colors[key]}
                      maxLength={7}
                      spellCheck={false}
                      onChange={(e) => onColors({ ...colors, [key]: e.target.value })}
                      className="w-full min-w-0 bg-transparent font-mono text-xs outline-none"
                    />
                  </span>
                </label>
              ))}
            </div>
            {!colorsSchema.safeParse(colors).success && (
              <p role="alert" className="text-xs text-destructive">
                Complete as cores com # e 3 ou 6 caracteres hexadecimais.
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              O contraste do texto é ajustado automaticamente quando necessário para manter a
              leitura.
            </p>
          </section>
          <section className="space-y-5 rounded-2xl border border-border bg-surface p-5">
            <h3 className="font-semibold">Composição do cardápio</h3>
            {option("font", "Tipografia", [
              { value: "modern", label: "Moderna · Manrope" },
              { value: "clean", label: "Essencial · DM Sans" },
              { value: "classic", label: "Clássica · Georgia" },
            ])}
            {option("layout", "Disposição dos pratos", [
              { value: "list", label: "Lista" },
              { value: "grid", label: "Vitrine" },
              { value: "compact", label: "Compacta" },
            ])}
            {option("corners", "Formato dos cartões", [
              { value: "square", label: "Discreto" },
              { value: "rounded", label: "Arredondado" },
              { value: "soft", label: "Suave" },
            ])}
            {option("photos", "Fotos dos pratos", [
              { value: "square", label: "Quadradas" },
              { value: "cover", label: "Amplas" },
              { value: "hidden", label: "Sem fotos" },
            ])}
            {appearance.photos !== "hidden" &&
              option("imageFit", "Enquadramento", [
                { value: "cover", label: "Preencher" },
                { value: "contain", label: "Mostrar foto inteira" },
              ])}
            {option("headerAlign", "Cabeçalho", [
              { value: "left", label: "À esquerda" },
              { value: "center", label: "Centralizado" },
            ])}
            {option("buttonStyle", "Estilo dos botões", [
              { value: "solid", label: "Preenchido" },
              { value: "outline", label: "Contorno" },
            ])}
            <label className="block text-sm">
              Texto do botão de adicionar
              <input
                value={appearance.buttonLabel}
                maxLength={24}
                onChange={(e) => onAppearance({ ...appearance, buttonLabel: e.target.value })}
                className="mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              />
            </label>
            {(
              [
                ["showDescription", "Exibir descrição dos pratos"],
                ["showPortion", "Exibir tamanho da porção"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 text-sm">
                {label}
                <Switch
                  checked={appearance[key]}
                  onCheckedChange={(checked) => onAppearance({ ...appearance, [key]: checked })}
                />
              </label>
            ))}
          </section>
        </div>
        <aside ref={previewRef} className="appearance-preview min-w-0 scroll-mt-24">
          <button
            type="button"
            className="appearance-jump mb-3 rounded-xl border border-border px-4 py-2 text-xs"
            onClick={() => jump(controlsRef.current)}
          >
            ↑ Voltar aos ajustes
          </button>
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Prévia ao vivo
            </span>
            <span>Visão do cliente</span>
          </div>
          <div className="overflow-hidden rounded-[32px] border-4 border-border shadow-2xl">
            <div
              className="public-menu min-h-[570px]"
              style={menuThemeStyle(safe, appearance)}
              data-layout={appearance.layout}
              data-photos={appearance.photos}
              data-fit={appearance.imageFit}
              data-align={appearance.headerAlign}
            >
              <header className="menu-header p-5">
                <div className="menu-identity flex items-center gap-3">
                  {logo && (
                    <img src={logo} alt="Logo" className="h-12 w-12 rounded-xl object-cover" />
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-primary">
                      Cardápio digital
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold break-words">{name}</h3>
                  </div>
                </div>
                {description && <p className="mt-3 text-xs text-muted-foreground">{description}</p>}
                <span className="mt-4 inline-block rounded-full border border-border px-3 py-1 text-[10px]">
                  Mesa 01
                </span>
              </header>
              <div className="p-4">
                <div className="mb-4 flex gap-2 text-[10px]">
                  <span className="rounded-full border border-border px-3 py-1.5">Destaques</span>
                  <span className="rounded-full border border-border px-3 py-1.5">Pratos</span>
                </div>
                <h4 className="mb-3 text-lg font-semibold">Feitos para você</h4>
                <ul data-menu-grid className="space-y-3">
                  {items.map((item, i) => (
                    <li
                      key={i}
                      className="menu-card flex gap-3 border border-border bg-surface p-3"
                    >
                      <div className="menu-photo h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <UtensilsCrossed className="m-auto h-full w-6" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <h5 className="text-xs font-semibold break-words">{item.name}</h5>
                        <span className="text-xs font-semibold text-primary">
                          {formatPrice(item.price, currency)}
                        </span>
                        {appearance.showDescription && (
                          <p className="line-clamp-2 text-[10px] text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                        {appearance.showPortion && item.portion_description && (
                          <p className="text-[10px] text-primary">{item.portion_description}</p>
                        )}
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label="Botão ilustrativo na prévia"
                          style={menuButtonStyle(safe, appearance)}
                          className="mt-2 inline-flex items-center justify-center gap-1 px-2 py-2 text-[10px]"
                        >
                          <Plus className="h-3 w-3" />
                          {appearance.buttonLabel || "Adicionar"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {dishes?.length
              ? "Prévia com seus pratos. Alterações ainda não publicadas."
              : "Pratos ilustrativos. Alterações ainda não publicadas."}
          </p>
        </aside>
      </div>
    </div>
  );
}

export function AppearanceDemo() {
  const [colors, onColors] = useState({ ...DEFAULT_COLORS });
  const [appearance, onAppearance] = useState(readAppearance({}));
  return (
    <>
      <p className="mb-6 text-sm text-muted-foreground">
        Experimente sua identidade. Esta demonstração não altera nenhum restaurante.
      </p>
      <AppearanceStudio
        colors={colors}
        onColors={onColors}
        appearance={appearance}
        onAppearance={onAppearance}
      />
    </>
  );
}

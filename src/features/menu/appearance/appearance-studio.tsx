import { Link } from "@tanstack/react-router";
import { MenuCover, MenuSignature } from "./menu-identity";
import { Switch } from "@/components/ui/switch";
import { DEMO_DISHES } from "@/features/demo/demo-data";
import { formatPrice } from "@/lib/format";
import { Check, Palette, Plus, Smartphone, UtensilsCrossed } from "lucide-react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  DEFAULT_COLORS,
  MENU_PRESETS,
  colorsSchema,
  menuButtonStyle,
  menuThemeStyle,
  menuAppearanceAttributes,
  isCoverUrl,
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
  onUploadCover,
  uploadingCover = false,
}: {
  onUploadCover?: (file: File) => Promise<void>;
  uploadingCover?: boolean;
  colors: MenuColors;
  appearance: MenuAppearance;
  onColors: Dispatch<SetStateAction<MenuColors>>;
  onAppearance: Dispatch<SetStateAction<MenuAppearance>>;
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
  const activePreset = colorsSchema.safeParse(colors).success
    ? MENU_PRESETS.find((p) =>
        Object.keys(safe).every(
          (key) => safe[key as keyof MenuColors] === p.colors[key as keyof MenuColors],
        ),
      )
    : undefined;
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
              onClick={() => onAppearance((current) => ({ ...current, [key]: o.value }))}
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
              <h3 className="font-semibold">Uma paleta, muitas possibilidades</h3>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Comece com uma inspiração ou crie sua própria paleta. Todas as cores abaixo são
              editáveis. São 14 combinações para começar.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MENU_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  aria-pressed={activePreset?.id === p.id}
                  onClick={() => onColors({ ...p.colors })}
                  className={`menu-preset rounded-xl border bg-background p-3 text-left transition hover:border-primary ${activePreset?.id === p.id ? "border-primary ring-1 ring-primary/30" : "border-border"}`}
                >
                  <span className="mb-2 flex gap-1">
                    {[p.colors.background, p.colors.card, p.colors.text, p.colors.accent].map(
                      (c, i) => (
                        <span
                          key={i}
                          style={{ background: c }}
                          className="h-5 flex-1 rounded-md border border-black/10"
                        />
                      ),
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-xs">
                    {p.name}
                    {activePreset?.id === p.id && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
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
                      onChange={(e) =>
                        onColors((current) => ({ ...current, [key]: e.target.value }))
                      }
                      className="h-8 w-9 cursor-pointer border-0 bg-transparent p-0"
                    />
                    <input
                      aria-label={`Código da cor: ${label}`}
                      value={colors[key]}
                      maxLength={7}
                      spellCheck={false}
                      onChange={(e) =>
                        onColors((current) => ({ ...current, [key]: e.target.value }))
                      }
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
            <h3 className="font-semibold">Identidade e boas-vindas</h3>
            <label className="block text-sm">
              Imagem de capa (URL HTTPS)
              <input
                type="url"
                value={appearance.coverUrl}
                maxLength={2048}
                onChange={(e) =>
                  onAppearance((current) => ({ ...current, coverUrl: e.target.value }))
                }
                placeholder="https://…"
                className="mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              />
            </label>
            {!isCoverUrl(appearance.coverUrl) && (
              <p role="alert" className="text-xs text-destructive">
                Use um endereço HTTPS válido, sem usuário ou senha.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {onUploadCover && (
                <label className="cursor-pointer rounded-xl border border-border px-3 py-2 text-xs">
                  {uploadingCover ? "Enviando capa…" : "Enviar foto de capa"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingCover}
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (file) void onUploadCover(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
              {appearance.coverUrl && (
                <button
                  type="button"
                  className="rounded-xl border border-border px-3 py-2 text-xs"
                  onClick={() => onAppearance((current) => ({ ...current, coverUrl: "" }))}
                >
                  Remover capa da prévia
                </button>
              )}
            </div>
            {option("coverHeight", "Altura da capa", [
              { value: "short", label: "Panorâmica" },
              { value: "tall", label: "Imersiva" },
            ])}
            {(
              [
                ["tagline", "Chamada acima do nome", 60],
                ["welcome", "Mensagem de boas-vindas", 180],
                ["footerText", "Mensagem no rodapé", 180],
              ] as const
            ).map(([key, label, max]) => (
              <label key={key} className="block text-sm">
                {label}
                <textarea
                  rows={key === "tagline" ? 1 : 3}
                  value={appearance[key]}
                  maxLength={max}
                  onChange={(e) =>
                    onAppearance((current) => ({ ...current, [key]: e.target.value }))
                  }
                  className="mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                />
                <span className="mt-1 block text-right text-[10px] text-muted-foreground">
                  {appearance[key].length}/{max}
                </span>
              </label>
            ))}
            {option("logoShape", "Formato do logo", [
              { value: "rounded", label: "Arredondado" },
              { value: "circle", label: "Circular" },
              { value: "square", label: "Quadrado" },
            ])}
            {option("logoSize", "Tamanho do logo", [
              { value: "small", label: "Discreto" },
              { value: "large", label: "Destaque" },
            ])}
            {option("categoryStyle", "Navegação das categorias", [
              { value: "pills", label: "Pílulas" },
              { value: "underline", label: "Sublinhada" },
              { value: "blocks", label: "Blocos" },
            ])}
            {option("headingStyle", "Títulos das categorias", [
              { value: "plain", label: "Simples" },
              { value: "accent", label: "Cor de destaque" },
              { value: "centered", label: "Centralizados" },
            ])}
            {option("cardStyle", "Acabamento dos cartões", [
              { value: "outlined", label: "Borda fina" },
              { value: "flat", label: "Sem borda" },
              { value: "elevated", label: "Com sombra" },
            ])}
            {option("textSize", "Tamanho dos textos dos pratos", [
              { value: "small", label: "Menor" },
              { value: "regular", label: "Padrão" },
              { value: "large", label: "Maior" },
            ])}
            {option("spacing", "Respiro entre os pratos", [
              { value: "comfortable", label: "Confortável" },
              { value: "airy", label: "Espaçoso" },
            ])}
            {option("backgroundPattern", "Textura do fundo", [
              { value: "none", label: "Liso" },
              { value: "dots", label: "Pontos sutis" },
              { value: "lines", label: "Linhas sutis" },
            ])}
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
                onChange={(e) =>
                  onAppearance((current) => ({ ...current, buttonLabel: e.target.value }))
                }
                className="mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              />
            </label>
            {(
              [
                ["showDescription", "Exibir descrição dos pratos"],
                ["showPortion", "Exibir tamanho da porção"],
                ["showFluxBrand", "Exibir assinatura Flux Menu no rodapé"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 text-sm">
                {label}
                <Switch
                  checked={appearance[key]}
                  onCheckedChange={(checked) =>
                    onAppearance((current) => ({ ...current, [key]: checked }))
                  }
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
              className="public-menu menu-preview min-h-[570px]"
              style={menuThemeStyle(safe, appearance)}
              {...menuAppearanceAttributes(appearance)}
            >
              <MenuCover appearance={appearance} />
              <header className="menu-header p-5">
                <div className="menu-identity flex items-center gap-3">
                  {logo ? (
                    <img
                      src={logo}
                      alt="Logo"
                      className="menu-logo h-12 w-12 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      className="menu-logo grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg font-semibold text-primary"
                      aria-label="Iniciais do restaurante"
                    >
                      {name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join("")}
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-primary">
                      {appearance.tagline}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold break-words">{name}</h3>
                  </div>
                </div>
                {description && <p className="mt-3 text-xs text-muted-foreground">{description}</p>}
                {appearance.welcome && (
                  <p className="mt-3 whitespace-pre-line text-sm">{appearance.welcome}</p>
                )}
                <span className="mt-4 inline-block rounded-full border border-border px-3 py-1 text-[10px]">
                  Mesa 01
                </span>
              </header>
              <div className="p-4">
                <nav
                  className="menu-categories mb-4 flex gap-2 text-[10px]"
                  aria-label="Categorias na prévia"
                >
                  <button
                    type="button"
                    aria-current="true"
                    className="rounded-full border border-border px-3 py-1.5"
                  >
                    Destaques
                  </button>
                  <button type="button" className="rounded-full border border-border px-3 py-1.5">
                    Pratos
                  </button>
                </nav>
                <h4 className="menu-section-title mb-3 text-lg font-semibold">Feitos para você</h4>
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
                      <div className="menu-card-content flex min-w-0 flex-1 flex-col gap-1">
                        <h5 className="text-xs font-semibold break-words">{item.name}</h5>
                        <span className="menu-price text-xs font-semibold text-primary">
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
                          className="menu-add-button mt-auto inline-flex items-center justify-center gap-1 px-2 py-2 text-[10px]"
                        >
                          <Plus className="h-3 w-3" />
                          {appearance.buttonLabel || "Adicionar"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <MenuSignature appearance={appearance} name={name} />
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
        Experimente sua identidade. Esta é uma demonstração: para salvar e publicar, use o editor do
        seu restaurante.
      </p>
      <Link
        to="/settings"
        search={{ tab: "appearance" }}
        className="mb-6 inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Abrir editor do meu restaurante →
      </Link>
      <AppearanceStudio
        colors={colors}
        onColors={onColors}
        appearance={appearance}
        onAppearance={onAppearance}
      />
    </>
  );
}

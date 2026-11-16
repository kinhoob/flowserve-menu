import type { CSSProperties } from "react";
import { z } from "zod";

export function isCoverUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      value.length <= 2048
    );
  } catch {
    return false;
  }
}
export const appearanceSchema = z.object({
  layout: z.enum(["list", "grid", "compact"]).catch("grid"),
  font: z.enum(["modern", "clean", "classic"]).catch("modern"),
  corners: z.enum(["square", "rounded", "soft"]).catch("rounded"),
  photos: z.enum(["square", "cover", "hidden"]).catch("square"),
  imageFit: z.enum(["cover", "contain"]).catch("cover"),
  headerAlign: z.enum(["left", "center"]).catch("left"),
  buttonStyle: z.enum(["solid", "outline"]).catch("solid"),
  buttonLabel: z.string().trim().min(1).max(24).catch("Adicionar"),
  showDescription: z.boolean().catch(true),
  showPortion: z.boolean().catch(true),
  coverUrl: z.string().trim().refine(isCoverUrl).catch(""),
  coverHeight: z.enum(["short", "tall"]).catch("short"),
  tagline: z.string().trim().max(60).catch("Cardápio digital"),
  welcome: z.string().trim().max(180).catch(""),
  footerText: z.string().trim().max(180).catch(""),
  showFluxBrand: z.boolean().catch(true),
  categoryStyle: z.enum(["pills", "underline", "blocks"]).catch("pills"),
  cardStyle: z.enum(["outlined", "flat", "elevated"]).catch("outlined"),
  logoShape: z.enum(["rounded", "circle", "square"]).catch("rounded"),
  logoSize: z.enum(["small", "large"]).catch("small"),
  textSize: z.enum(["small", "regular", "large"]).catch("regular"),
  spacing: z.enum(["comfortable", "airy"]).catch("comfortable"),
  headingStyle: z.enum(["plain", "accent", "centered"]).catch("accent"),
  backgroundPattern: z.enum(["none", "dots", "lines"]).catch("none"),
});
export type MenuAppearance = z.infer<typeof appearanceSchema>;
export function readAppearance(value: unknown): MenuAppearance {
  const result = appearanceSchema.safeParse(value);
  return result.success ? result.data : appearanceSchema.parse({});
}
export const DEFAULT_COLORS = {
  background: "#0a0a0a",
  text: "#ffffff",
  accent: "#d7b56d",
  card: "#151515",
  header: "#0d0d0d",
  button: "#d7b56d",
};
export type MenuColors = typeof DEFAULT_COLORS;
export function normalizeHex(value: string): string | null {
  const raw = value.trim();
  if (/^#[\da-f]{3}$/i.test(raw))
    return (
      "#" +
      [...raw.slice(1)]
        .map((part) => part + part)
        .join("")
        .toLowerCase()
    );
  return /^#[\da-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
}
const colorSchema = z
  .string()
  .refine((value) => normalizeHex(value) !== null, "Use uma cor hexadecimal, como #245c39")
  .transform((value) => normalizeHex(value)!);
export const colorsSchema = z.object({
  background: colorSchema,
  text: colorSchema,
  accent: colorSchema,
  card: colorSchema,
  header: colorSchema,
  button: colorSchema,
});
export function readColors(
  value: Partial<Record<keyof MenuColors, string | null | undefined>>,
): MenuColors {
  return Object.fromEntries(
    Object.entries(DEFAULT_COLORS).map(([key, fallback]) => [
      key,
      normalizeHex(value[key as keyof MenuColors] ?? "") ?? fallback,
    ]),
  ) as MenuColors;
}
function rgb(hex: string): number[] {
  const value = normalizeHex(hex);
  if (!value) throw new Error("Cor inválida");
  return [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
}
function luminance(hex: string): number {
  const channels = rgb(hex).map((value) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function readableColor(background: string, preferred?: string): string {
  if (preferred && normalizeHex(preferred) && contrastRatio(background, preferred) >= 4.5)
    return normalizeHex(preferred)!;
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#000000")
    ? "#ffffff"
    : "#000000";
}
function mix(a: string, b: string, weight: number): string {
  const first = rgb(a),
    second = rgb(b);
  return (
    "#" +
    first
      .map((value, index) =>
        Math.round(value * (1 - weight) + second[index] * weight)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function readableAccent(accent: string, background: string): string {
  if (contrastRatio(accent, background) >= 4.5) return accent;
  const target = readableColor(background);
  for (let step = 1; step <= 20; step++) {
    const result = mix(accent, target, step / 20);
    if (contrastRatio(result, background) >= 4.5) return result;
  }
  return target;
}
export const MENU_FONTS = {
  modern: '"Manrope Variable", ui-sans-serif, sans-serif',
  clean: '"DM Sans Variable", ui-sans-serif, sans-serif',
  classic: 'Georgia, "Times New Roman", serif',
};
export function menuThemeStyle(
  raw: MenuColors,
  appearance: MenuAppearance,
): CSSProperties & Record<`--${string}`, string | number> {
  const colors = readColors(raw),
    foreground = readableColor(colors.background, colors.text),
    cardText = readableColor(colors.card, colors.text),
    headerText = readableColor(colors.header, colors.text);
  const accent = readableAccent(colors.accent, colors.background),
    cardAccent = readableAccent(colors.accent, colors.card),
    headerAccent = readableAccent(colors.accent, colors.header);
  const radius = appearance.corners === "square" ? 8 : appearance.corners === "soft" ? 28 : 18;
  return {
    backgroundColor: colors.background,
    color: foreground,
    fontFamily: MENU_FONTS[appearance.font],
    "--background": colors.background,
    "--foreground": foreground,
    "--surface": colors.card,
    "--surface-2": mix(colors.card, cardText, 0.07),
    "--card": colors.card,
    "--card-foreground": cardText,
    "--popover": colors.card,
    "--popover-foreground": cardText,
    "--muted": mix(colors.background, foreground, 0.09),
    "--muted-foreground": readableAccent(
      mix(colors.background, foreground, 0.65),
      colors.background,
    ),
    "--border": mix(colors.background, foreground, 0.2),
    "--input": mix(colors.background, foreground, 0.2),
    "--ring": accent,
    "--primary": accent,
    "--primary-foreground": readableColor(accent),
    "--accent": accent,
    "--accent-foreground": readableColor(accent),
    "--gold-soft": mix(colors.background, colors.accent, 0.12),
    "--menu-card-text": cardText,
    "--menu-card-muted": readableAccent(mix(colors.card, cardText, 0.65), colors.card),
    "--menu-card-accent": cardAccent,
    "--menu-card-primary-foreground": readableColor(cardAccent),
    "--menu-card-border": mix(colors.card, cardText, 0.18),
    "--menu-header": colors.header,
    "--menu-header-text": headerText,
    "--menu-header-muted": readableAccent(mix(colors.header, headerText, 0.65), colors.header),
    "--menu-header-accent": headerAccent,
    "--menu-header-primary-foreground": readableColor(headerAccent),
    "--menu-radius": `${radius}px`,
    "--menu-button-radius": `${Math.min(radius, 14)}px`,
    "--menu-font": MENU_FONTS[appearance.font],
    "--menu-text-scale":
      appearance.textSize === "large" ? 1.15 : appearance.textSize === "small" ? 0.92 : 1,
    "--font-sans": MENU_FONTS[appearance.font],
  };
}
export function menuButtonStyle(
  colors: MenuColors,
  appearance: MenuAppearance,
  background = colors.card,
): CSSProperties {
  const safe = readColors(colors);
  const stroke = readableAccent(safe.button, background);
  return {
    backgroundColor: appearance.buttonStyle === "outline" ? "transparent" : safe.button,
    color: appearance.buttonStyle === "outline" ? stroke : readableColor(safe.button),
    borderColor: appearance.buttonStyle === "outline" ? stroke : safe.button,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: "var(--menu-button-radius, 12px)",
  };
}
export function brandColumns(colors: MenuColors) {
  const safe = colorsSchema.parse(colors);
  return {
    brand_color: safe.background,
    brand_text_color: safe.text,
    brand_accent_color: safe.accent,
    brand_card_color: safe.card,
    brand_header_color: safe.header,
    brand_button_color: safe.button,
  };
}
export const MENU_PRESETS = [
  { id: "signature", name: "Preto & Ouro", colors: DEFAULT_COLORS },
  {
    id: "forest",
    name: "Floresta",
    colors: {
      background: "#101a14",
      text: "#f3f3e9",
      accent: "#d9b66c",
      card: "#1b281f",
      header: "#19291e",
      button: "#d9b66c",
    },
  },
  {
    id: "linen",
    name: "Linho",
    colors: {
      background: "#f7f3ea",
      text: "#26342b",
      accent: "#365c40",
      card: "#ffffff",
      header: "#ece4d5",
      button: "#365c40",
    },
  },
  {
    id: "terracotta",
    name: "Terracota",
    colors: {
      background: "#fff5ed",
      text: "#39261e",
      accent: "#a1442e",
      card: "#fffdf9",
      header: "#f0ddcd",
      button: "#a1442e",
    },
  },
  {
    id: "ocean",
    name: "Oceano",
    colors: {
      background: "#f2f7f9",
      text: "#1d3343",
      accent: "#225c7c",
      card: "#ffffff",
      header: "#dce9ef",
      button: "#225c7c",
    },
  },
  {
    id: "night",
    name: "Noturno",
    colors: {
      background: "#141218",
      text: "#f5f1fa",
      accent: "#c7a4ea",
      card: "#221d2b",
      header: "#1c1625",
      button: "#c7a4ea",
    },
  },
  {
    id: "classic",
    name: "Clássico",
    colors: {
      background: "#101010",
      text: "#f1f1ed",
      accent: "#c6b279",
      card: "#1d1d1b",
      header: "#181817",
      button: "#c6b279",
    },
  },
  {
    id: "burgundy",
    name: "Bordeaux",
    colors: {
      background: "#190d12",
      text: "#fff7ee",
      accent: "#e9ba8d",
      card: "#2b1520",
      header: "#220f18",
      button: "#e9ba8d",
    },
  },
  {
    id: "navy",
    name: "Azul Imperial",
    colors: {
      background: "#0a1423",
      text: "#f8fafc",
      accent: "#d5b875",
      card: "#142238",
      header: "#0e1b2e",
      button: "#d5b875",
    },
  },
  {
    id: "matcha",
    name: "Matcha",
    colors: {
      background: "#f2f3e9",
      text: "#293b2b",
      accent: "#4a6741",
      card: "#fdfdf8",
      header: "#e1e7d3",
      button: "#4a6741",
    },
  },
  {
    id: "espresso",
    name: "Espresso",
    colors: {
      background: "#1b1410",
      text: "#fff8ed",
      accent: "#d9b793",
      card: "#2b211b",
      header: "#211812",
      button: "#d9b793",
    },
  },
  {
    id: "rose",
    name: "Rosa Botânico",
    colors: {
      background: "#fff6f5",
      text: "#502e37",
      accent: "#8a4358",
      card: "#ffffff",
      header: "#f1dfe2",
      button: "#8a4358",
    },
  },
  {
    id: "citrus",
    name: "Cítrico",
    colors: {
      background: "#fffdf1",
      text: "#353318",
      accent: "#69611e",
      card: "#ffffff",
      header: "#f1ecc7",
      button: "#69611e",
    },
  },
  {
    id: "pearl",
    name: "Pérola",
    colors: {
      background: "#f5f5f3",
      text: "#222322",
      accent: "#383d3a",
      card: "#ffffff",
      header: "#e7e8e4",
      button: "#383d3a",
    },
  },
] satisfies { id: string; name: string; colors: MenuColors }[];

export function menuAppearanceAttributes(appearance: MenuAppearance) {
  return {
    "data-layout": appearance.layout,
    "data-photos": appearance.photos,
    "data-fit": appearance.imageFit,
    "data-align": appearance.headerAlign,
    "data-category-style": appearance.categoryStyle,
    "data-card-style": appearance.cardStyle,
    "data-logo-shape": appearance.logoShape,
    "data-logo-size": appearance.logoSize,
    "data-spacing": appearance.spacing,
    "data-heading-style": appearance.headingStyle,
    "data-pattern": appearance.backgroundPattern,
  };
}

export type RestaurantBrand = {
  brand_color?: string | null;
  brand_text_color?: string | null;
  brand_accent_color?: string | null;
  brand_card_color?: string | null;
  brand_header_color?: string | null;
  brand_button_color?: string | null;
};
export function readRestaurantColors(restaurant: RestaurantBrand): MenuColors {
  const others = [
    restaurant.brand_text_color,
    restaurant.brand_accent_color,
    restaurant.brand_card_color,
    restaurant.brand_header_color,
    restaurant.brand_button_color,
  ];
  if (
    normalizeHex(restaurant.brand_color ?? "") === "#d4af37" &&
    others.every((value) => value == null)
  )
    return { ...DEFAULT_COLORS };
  return readColors({
    background: restaurant.brand_color,
    text: restaurant.brand_text_color,
    accent: restaurant.brand_accent_color,
    card: restaurant.brand_card_color,
    header: restaurant.brand_header_color,
    button: restaurant.brand_button_color,
  });
}

import type { CSSProperties } from "react";
import { z } from "zod";

export const appearanceSchema = z.object({
  layout: z.enum(["list", "grid", "compact"]).catch("list"),
  font: z.enum(["modern", "clean", "classic"]).catch("modern"),
  corners: z.enum(["square", "rounded", "soft"]).catch("rounded"),
  photos: z.enum(["square", "cover", "hidden"]).catch("square"),
  imageFit: z.enum(["cover", "contain"]).catch("cover"),
  headerAlign: z.enum(["left", "center"]).catch("left"),
  buttonStyle: z.enum(["solid", "outline"]).catch("solid"),
  buttonLabel: z.string().trim().min(1).max(24).catch("Adicionar"),
  showDescription: z.boolean().catch(true),
  showPortion: z.boolean().catch(true),
});
export type MenuAppearance = z.infer<typeof appearanceSchema>;
export function readAppearance(value: unknown): MenuAppearance {
  const result = appearanceSchema.safeParse(value);
  return result.success ? result.data : appearanceSchema.parse({});
}
export const DEFAULT_COLORS = {
  background: "#101a14",
  text: "#f3f3e9",
  accent: "#d9b66c",
  card: "#1b281f",
  header: "#19291e",
  button: "#d9b66c",
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
  { id: "forest", name: "Floresta", colors: DEFAULT_COLORS },
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
] satisfies { id: string; name: string; colors: MenuColors }[];

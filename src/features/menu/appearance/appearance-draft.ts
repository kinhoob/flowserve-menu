import { colorsSchema, readAppearance, type MenuAppearance, type MenuColors } from "./appearance";
export type AppearanceDraft = { colors: MenuColors; appearance: MenuAppearance };
export function restoreAppearanceDraft(raw: string | null): AppearanceDraft | null {
  if (!raw || raw.length > 20000) return null;
  try {
    const value = JSON.parse(raw);
    const colors = colorsSchema.safeParse(value?.colors);
    if (!colors.success || !value?.appearance || typeof value.appearance !== "object") return null;
    return { colors: colors.data, appearance: readAppearance(value.appearance) };
  } catch {
    return null;
  }
}
export function draftFingerprint(value: AppearanceDraft): string {
  return JSON.stringify(value);
}
export function appearanceStorageKey(restaurantId: string): string {
  return `flux-menu:appearance-draft:v1:${restaurantId}`;
}

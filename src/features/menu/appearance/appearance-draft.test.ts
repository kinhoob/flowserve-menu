import { describe, expect, it } from "vitest";
import { DEFAULT_COLORS, readAppearance, readRestaurantColors } from "./appearance";
import { appearanceStorageKey, draftFingerprint, restoreAppearanceDraft } from "./appearance-draft";
describe("appearance save recovery", () => {
  it("restores every editable preference without losing explicit false values", () => {
    const draft = {
      colors: { ...DEFAULT_COLORS, accent: "#abc" },
      appearance: readAppearance({
        layout: "list",
        showPortion: false,
        showFluxBrand: false,
        welcome: "Bem-vindo",
        coverUrl: "https://cdn.example/menu.jpg",
      }),
    };
    const restored = restoreAppearanceDraft(JSON.stringify(draft));
    expect(restored?.colors.accent).toBe("#aabbcc");
    expect(restored?.appearance).toEqual(draft.appearance);
  });
  it("keeps drafts isolated by restaurant and rejects broken cached values", () => {
    expect(appearanceStorageKey("one")).not.toBe(appearanceStorageKey("two"));
    for (const raw of [
      null,
      "{invalid}",
      JSON.stringify({ colors: { background: "red" }, appearance: {} }),
    ])
      expect(restoreAppearanceDraft(raw)).toBeNull();
  });
  it("detects changes in actual preferences and clears once the published state matches", () => {
    const initial = { colors: { ...DEFAULT_COLORS }, appearance: readAppearance({}) };
    const edited = { ...initial, appearance: { ...initial.appearance, showDescription: false } };
    expect(draftFingerprint(initial)).not.toBe(draftFingerprint(edited));
    expect(draftFingerprint(restoreAppearanceDraft(JSON.stringify(edited))!)).toBe(
      draftFingerprint(edited),
    );
  });
  it("uses black, gold and white for legacy seed data while preserving custom palettes", () => {
    expect(readRestaurantColors({ brand_color: "#D4AF37" })).toEqual(DEFAULT_COLORS);
    expect(
      readRestaurantColors({ brand_color: "#123456", brand_text_color: "#ffffff" }).background,
    ).toBe("#123456");
    expect(
      readRestaurantColors({ brand_color: "#D4AF37", brand_text_color: "#222222" }).background,
    ).toBe("#d4af37");
  });
});

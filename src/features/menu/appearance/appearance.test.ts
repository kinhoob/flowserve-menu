import { describe, expect, it } from "vitest";
import {
  brandColumns,
  colorsSchema,
  contrastRatio,
  MENU_PRESETS,
  menuButtonStyle,
  menuThemeStyle,
  normalizeHex,
  readAppearance,
  readableAccent,
  readableColor,
  readColors,
} from "./appearance";

describe("restaurant appearance", () => {
  it("normalizes hex and rejects CSS payloads", () => {
    expect(normalizeHex(" #AbC ")).toBe("#aabbcc");
    expect(normalizeHex("red;display:none")).toBeNull();
    expect(
      colorsSchema.safeParse({ ...MENU_PRESETS[0].colors, background: "url(x)" }).success,
    ).toBe(false);
    expect(brandColumns({ ...MENU_PRESETS[0].colors, button: "#ABC" }).brand_button_color).toBe(
      "#aabbcc",
    );
  });
  it("preserves explicit false and limits display settings to supported values", () => {
    expect(
      readAppearance({ layout: "grid", showDescription: false, showPortion: false, css: "bad" }),
    ).toMatchObject({ layout: "grid", showDescription: false, showPortion: false });
    expect(readAppearance({ font: "injected", buttonLabel: " ", layout: null })).toMatchObject({
      font: "modern",
      buttonLabel: "Adicionar",
      layout: "list",
    });
    expect(readAppearance(null)).toEqual(readAppearance({}));
    expect(readAppearance({ css: "bad" })).not.toHaveProperty("css");
  });
  it("keeps foregrounds readable across mixed light and dark palettes", () => {
    for (const background of [
      "#ffffff",
      "#000000",
      "#888888",
      "#777777",
      "#757575",
      "#ffff00",
      "#003322",
      "#ff00ff",
    ]) {
      expect(
        contrastRatio(background, readableColor(background, background)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(background, readableAccent(background, background)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("uses shared accessible card, header and button colors in every preset", () => {
    for (const { colors } of MENU_PRESETS) {
      const style = menuThemeStyle(colors, readAppearance({}));
      expect(contrastRatio(colors.card, String(style["--menu-card-text"]))).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrastRatio(colors.header, String(style["--menu-header-text"])),
      ).toBeGreaterThanOrEqual(4.5);
      const button = menuButtonStyle(colors, readAppearance({}));
      expect(
        contrastRatio(String(button.backgroundColor), String(button.color)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("supports unfilled buttons and keeps invalid stored palette values harmless", () => {
    const colors = readColors({ background: "invalid", button: "#fff" });
    const style = menuButtonStyle(colors, readAppearance({ buttonStyle: "outline" }));
    expect(style.backgroundColor).toBe("transparent");
    expect(contrastRatio(colors.card, String(style.color))).toBeGreaterThanOrEqual(4.5);
  });
});

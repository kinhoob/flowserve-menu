import { describe, it, expect } from "vitest";
import { searchHelp } from "./help-content";
describe("assistant help search", () => {
  it("ignores accents and case", () => {
    expect(searchHelp("HORARIOS", "").some((a) => a.title.includes("Horários"))).toBe(true);
  });
  it("requires all search terms", () => {
    expect(searchHelp("código temporário", "").map((a) => a.path)).toEqual(["/qrcodes"]);
  });
  it("prioritizes the current screen without hiding other help", () => {
    const results = searchHelp("", "/analytics");
    expect(results[0].path).toBe("/analytics");
    expect(results.length).toBeGreaterThan(5);
  });
  it("does not invent answers for unsupported questions", () => {
    expect(searchHelp("imposto galáctico", "")).toEqual([]);
  });
});

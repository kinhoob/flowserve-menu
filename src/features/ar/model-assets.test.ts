import { describe, expect, it } from "vitest";
import { isModelAssetUrl } from "./model-assets";
describe("dish model assets", () => {
  it("accepts public HTTPS models with an optional query string", () => {
    expect(isModelAssetUrl("https://cdn.example/prato.glb?v=2", "glb")).toBe(true);
    expect(isModelAssetUrl("https://cdn.example/prato.usdz", "usdz")).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "data:model/gltf-binary;base64,abc",
    "http://cdn.example/prato.glb",
    "https://cdn.example/prato.html",
    "https://user:password@cdn.example/prato.glb",
  ])("rejects an unsafe or unrelated model URL: %s", (url) => {
    expect(isModelAssetUrl(url, "glb")).toBe(false);
  });
});

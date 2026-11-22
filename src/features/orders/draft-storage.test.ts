import { afterEach, describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { readDraft, writeDraft, clearDraft } from "./draft-storage";
const schema = z.object({ attempt: z.string(), cart: z.array(z.string()) });
afterEach(() => vi.unstubAllGlobals());
function storage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  return data;
}
describe("pending draft recovery", () => {
  it("keeps the same request identity and isolates keys", () => {
    storage();
    const draft = { attempt: "same-request", cart: ["item"] };
    expect(writeDraft("table-a", draft)).toBe(true);
    expect(readDraft("table-a", schema)).toEqual(draft);
    expect(readDraft("table-b", schema)).toBeNull();
    clearDraft("table-a");
    expect(readDraft("table-a", schema)).toBeNull();
  });
  it("ignores expired, invalid and future data", () => {
    const data = storage();
    data.set("old", JSON.stringify({ version: 1, savedAt: 0, value: { attempt: "a", cart: [] } }));
    expect(readDraft("old", schema, 86400001)).toBeNull();
    data.set("bad", "not-json");
    expect(readDraft("bad", schema)).toBeNull();
    data.set(
      "future",
      JSON.stringify({
        version: 1,
        savedAt: Date.now() + 120000,
        value: { attempt: "a", cart: [] },
      }),
    );
    expect(readDraft("future", schema)).toBeNull();
  });
  it("survives browsers that deny storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
      removeItem: () => {
        throw Error();
      },
    });
    expect(writeDraft("a", {})).toBe(false);
    expect(readDraft("a", schema)).toBeNull();
    expect(() => clearDraft("a")).not.toThrow();
  });
});

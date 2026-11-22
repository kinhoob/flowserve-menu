import { z } from "zod";
const envelope = z.object({ version: z.literal(1), savedAt: z.number(), value: z.unknown() });
export function readDraft<T>(key: string, schema: z.ZodType<T>, now = Date.now()): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = envelope.parse(JSON.parse(raw));
    if (now - entry.savedAt > 86400000 || entry.savedAt > now + 60000) return null;
    return schema.parse(entry.value);
  } catch {
    return null;
  }
}
export function writeDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), value }));
    return true;
  } catch {
    return false;
  }
}
export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Browser storage may be unavailable. */
  }
}

import { useEffect, useRef, useState } from "react";
import {
  appearanceStorageKey,
  draftFingerprint,
  restoreAppearanceDraft,
  type AppearanceDraft,
} from "./appearance-draft";
export function useAppearanceDraft(restaurantId: string, incoming: AppearanceDraft) {
  const [draft, setDraft] = useState(incoming);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const storageKey = appearanceStorageKey(restaurantId);
  const incomingKey = draftFingerprint(incoming);
  const previousIncoming = useRef(incomingKey);
  useEffect(() => {
    try {
      const saved = restoreAppearanceDraft(localStorage.getItem(storageKey));
      if (saved) setDraft(saved);
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    setLoadedKey(storageKey);
  }, [storageKey]);
  useEffect(() => {
    const previous = previousIncoming.current;
    if (previous === incomingKey) return;
    previousIncoming.current = incomingKey;
    setDraft((current) => (draftFingerprint(current) === previous ? incoming : current));
  }, [incoming, incomingKey]);
  const dirty = draftFingerprint(draft) !== incomingKey;
  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      if (dirty) localStorage.setItem(storageKey, JSON.stringify(draft));
      else localStorage.removeItem(storageKey);
    } catch {
      /* Publishing remains available without local draft storage. */
    }
  }, [draft, dirty, loadedKey, storageKey]);
  return { draft, setDraft, dirty };
}

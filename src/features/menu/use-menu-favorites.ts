import { useEffect, useMemo, useState } from "react";
import { parseFavorites } from "./discovery";
export function useMenuFavorites(restaurantKey: string) {
  const key = `flux:menu-favorites:v1:${restaurantKey}`;
  const [saved, setSaved] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  useEffect(() => {
    try {
      setSaved({ key, ids: parseFavorites(window.localStorage.getItem(key)) });
    } catch {
      setSaved({ key, ids: [] });
    }
    const sync = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        try {
          setSaved({ key, ids: parseFavorites(window.localStorage.getItem(key)) });
        } catch {
          /* keep in-memory choices */
        }
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  const favorites = useMemo(() => new Set(saved.key === key ? saved.ids : []), [saved, key]);
  function toggleFavorite(id: string) {
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id);
    else if (next.size < 500) next.add(id);
    const ids = [...next];
    setSaved({ key, ids });
    try {
      window.localStorage.setItem(key, JSON.stringify(ids));
    } catch {
      /* favorites still work for this visit */
    }
  }
  return { favorites, toggleFavorite };
}

export function publicMenuUrl(slug: string, table: string): string {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  const origin = configured
    ? new URL(configured).origin
    : typeof window !== "undefined"
      ? window.location.origin
      : "";
  return `${origin}/m/${encodeURIComponent(slug)}?table=${encodeURIComponent(table)}`;
}

export function canExportQr(): boolean {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  if (!configured) return false;
  try {
    const url = new URL(configured);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hostname.includes("preview") &&
      url.hostname !== "localhost"
    );
  } catch {
    return false;
  }
}

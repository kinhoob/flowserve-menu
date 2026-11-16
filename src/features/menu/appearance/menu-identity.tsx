import { FluxMark } from "@/components/brand/logo";
import { isCoverUrl, type MenuAppearance } from "./appearance";

export function MenuCover({ appearance }: { appearance: MenuAppearance }) {
  if (!appearance.coverUrl || !isCoverUrl(appearance.coverUrl)) return null;
  return (
    <div className="menu-cover" data-height={appearance.coverHeight}>
      <img
        src={appearance.coverUrl}
        alt="Capa do restaurante"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

export function MenuSignature({ appearance, name }: { appearance: MenuAppearance; name: string }) {
  return (
    <footer className="menu-signature mx-auto max-w-3xl space-y-3 px-5 pb-28 pt-8 text-center text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{name}</p>
      {appearance.footerText && <p className="whitespace-pre-line">{appearance.footerText}</p>}
      {appearance.showFluxBrand && (
        <div className="flex items-center justify-center gap-1.5 text-[11px]">
          <span>Feito no</span>
          <FluxMark />
          <span>Flux Menu</span>
        </div>
      )}
    </footer>
  );
}

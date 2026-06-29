import { cn } from "@/lib/utils";
import logoAsset from "@/assets/fluxqr-logo.png.asset.json";

export function FluxLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-2xl tracking-tight", className)}>
      <img
        src={logoAsset.url}
        alt="FluxQr"
        className="h-12 w-12 object-contain"
      />
      <span>FluxQr</span>
    </span>
  );
}

export function FluxMark({ className }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="FluxQr"
      className={cn("inline-block h-5 w-5 object-contain align-[-2px]", className)}
    />
  );
}

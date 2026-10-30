import logoAsset from "@/assets/fluxqr-logo.png.asset.json";
import { cn } from "@/lib/utils";
import { QrCode } from "lucide-react";
import { useState } from "react";

function BrandImage({ className }: { className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <QrCode aria-hidden className={cn(className, "text-primary")} />;
  return (
    <img
      ref={(image) => {
        if (image?.complete && image.naturalWidth === 0) setFailed(true);
      }}
      src={logoAsset.url}
      alt=""
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function FluxLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display text-2xl tracking-tight",
        className,
      )}
    >
      <BrandImage className="h-10 w-10 object-contain" />
      <span>Flux Menu</span>
    </span>
  );
}

export function FluxMark({ className }: { className?: string }) {
  return (
    <BrandImage className={cn("inline-block h-5 w-5 object-contain align-[-2px]", className)} />
  );
}

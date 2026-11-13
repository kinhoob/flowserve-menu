import { cn } from "@/lib/utils";
import { QrCode } from "lucide-react";
export function FluxLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display text-2xl tracking-tight",
        className,
      )}
    >
      <QrCode aria-hidden className="h-10 w-10 text-primary" />
      <span>Flux Menu</span>
    </span>
  );
}
export function FluxMark({ className }: { className?: string }) {
  return <QrCode aria-hidden className={cn("inline-block h-5 w-5 text-primary", className)} />;
}

import { cn } from "@/lib/utils";

export function FluxLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-2xl tracking-tight", className)}>
      <span
        aria-hidden
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[oklch(0.86_0.12_84)] to-[oklch(0.55_0.1_60)] text-[oklch(0.18_0.02_70)] shadow-[0_8px_24px_-12px_oklch(0.78_0.13_84_/_0.6)]"
      >
        <span className="font-display text-base font-semibold">F</span>
      </span>
      <span>Flux</span>
    </span>
  );
}

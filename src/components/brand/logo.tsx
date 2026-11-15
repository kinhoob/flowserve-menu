import { cn } from "@/lib/utils";
export function FluxMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 36 36" fill="none" className={cn("h-8 w-8 shrink-0", className)}>
      <rect x="1" y="1" width="34" height="34" rx="11" fill="#e7bc70" />
      <path d="M12 11h13v4H16v4h7v4h-7v5h-4V11Z" fill="#18241c" />
      <circle cx="26.5" cy="26.5" r="2.5" fill="#45644a" />
    </svg>
  );
}
export function FluxLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-display text-xl font-bold tracking-tight",
        className,
      )}
    >
      <FluxMark />
      <span>
        flux<span className="ml-1 font-normal text-muted-foreground">menu</span>
        <span className="text-primary">.</span>
      </span>
    </span>
  );
}
